/**
 * 生成 README 所需的本地 SVG 资源（统计卡 / 语言榜 / 贡献热力图 / 项目卡片）。
 * 数据来源：GitHub REST API + 个人主页贡献日历，均为真实数据。
 * 刷新方式：node scripts/generate-assets.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const USER = 'Panlf';
const UA = { 'User-Agent': `${USER}-profile-readme`, Accept: 'application/vnd.github+json' };

const FONT = "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif";
const C = {
  bg: '#14131F', card: '#14131F', border: 'rgba(139,92,246,0.35)',
  title: '#F0F6FC', text: '#C9D1D9', muted: '#9CA3AF', dim: '#6B7280',
  sky: '#0EA5E9', violet: '#8B5CF6', pink: '#EC4899', amber: '#F59E0B', cyan: '#06B6D4',
  track: '#21262D', gold: '#E3B341',
};
const LANG_COLORS = {
  Java: '#b07219', TypeScript: '#3178c6', JavaScript: '#f1e05a', Dart: '#00B4AB',
  Python: '#3572A5', Shell: '#89e051', Svelte: '#ff3e00', Vue: '#41b883',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Kotlin: '#A97BFF', Go: '#00ADD8',
  Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'Jinja': '#a52a22', Dockerfile: '#384d54',
};
const langColor = (n) => LANG_COLORS[n] || '#8B5CF6';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const grad = (id) => `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${C.sky}"/><stop offset="50%" stop-color="${C.violet}"/><stop offset="100%" stop-color="${C.pink}"/></linearGradient>`;

async function getJSON(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); }

/** 中英混排宽度：CJK 记 2，其余记 1 */
const width = (s) => [...s].reduce((w, ch) => w + (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 2 : 1), 0);
/** 按显示宽度截断 */
function truncate(s, max) {
  let out = '', w = 0;
  for (const ch of s) { const cw = width(ch); if (w + cw > max) return out + '…'; out += ch; w += cw; }
  return out;
}
/** 贪心断行，返回最多 maxLines 行 */
function wrap(s, maxPerLine, maxLines) {
  const lines = []; let cur = '', w = 0;
  for (const ch of s) {
    const cw = width(ch);
    if (w + cw > maxPerLine) { lines.push(cur); cur = ''; w = 0; if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, '…'); return lines; } }
    cur += ch; w += cw;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

/* ---------- 数据获取 ---------- */
console.log('Fetching GitHub data ...');
const user = await getJSON(`https://api.github.com/users/${USER}`);
const repos = (await getJSON(`https://api.github.com/users/${USER}/repos?per_page=100`)).filter((r) => !r.fork);
const own = repos.filter((r) => r.name !== USER);

const langBytes = {};
await Promise.all(own.map(async (r) => {
  try {
    const langs = await getJSON(`https://api.github.com/repos/${USER}/${r.name}/languages`);
    for (const [k, v] of Object.entries(langs)) langBytes[k] = (langBytes[k] || 0) + v;
  } catch { /* 单仓库失败不阻塞整体 */ }
}));
const langTotal = Object.values(langBytes).reduce((a, b) => a + b, 0);
const topLangs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6)
  .map(([name, bytes]) => ({ name, pct: (bytes / langTotal) * 100 }));

/* 贡献日历：github-contributions-api（官方匿名页面已不内嵌日历数据） */
console.log('Fetching contribution calendar ...');
const calRes = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`, { headers: UA });
if (!calRes.ok) throw new Error(`contribution calendar -> ${calRes.status}`);
const calJson = await calRes.json();
const days = calJson.contributions.map((d) => ({ date: d.date, contributionCount: d.count }));
const firstDow = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
const calendar = {
  weeks: (() => {
    const padded = [...Array(firstDow).fill(null), ...days];
    const weeks = [];
    for (let i = 0; i < padded.length; i += 7) weeks.push({ days: padded.slice(i, i + 7) });
    return weeks;
  })(),
};

const totalContribs = days.reduce((a, d) => a + d.contributionCount, 0);
let longest = 0, cur = 0, run = 0;
for (const d of days) {
  if (d.contributionCount > 0) { run++; longest = Math.max(longest, run); } else run = 0;
}
for (let i = days.length - 1; i >= 0; i--) { if (days[i].contributionCount > 0) cur++; else break; }
const starsTotal = own.reduce((a, r) => a + r.stargazers_count, 0);
const yearsOnGitHub = new Date().getFullYear() - new Date(user.created_at).getFullYear();
console.log(`contribs(1y)=${totalContribs} longest=${longest} current=${cur} stars=${starsTotal} followers=${user.followers} years=${yearsOnGitHub}`);

/* ---------- 统计卡 ---------- */
mkdirSync(ASSETS, { recursive: true });
{
  const W = 500, H = 195;
  const cells = [
    { x: 40, y: 78, v: String(starsTotal), l: 'Total Stars', c: C.pink, g: '★' },
    { x: 275, y: 78, v: String(totalContribs), l: 'Contributions (1y)', c: C.violet, g: '❖' },
    { x: 40, y: 150, v: String(user.public_repos), l: 'Public Repos', c: C.cyan, g: '▣' },
    { x: 275, y: 150, v: String(user.followers), l: 'Followers', c: C.amber, g: '◈' },
  ];
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">
<defs>${grad('g1')}</defs>
<rect width="${W}" height="${H}" rx="14" fill="${C.bg}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="${C.border}"/>
<text x="32" y="42" font-size="16" font-weight="700" fill="${C.title}">Panlf's GitHub Stats</text>
<rect x="32" y="52" width="120" height="3" rx="1.5" fill="url(#g1)"/>
${cells.map((c) => `
<text x="${c.x}" y="${c.y - 26}" font-size="13" fill="${c.c}">${c.g}</text>
<text x="${c.x}" y="${c.y}" font-size="22" font-weight="700" fill="${C.title}">${c.v}</text>
<text x="${c.x}" y="${c.y + 18}" font-size="10.5" fill="${C.muted}">${c.l}</text>`).join('')}
<text x="32" y="${H - 16}" font-size="10" fill="${C.dim}">Coding since ${new Date(user.created_at).getFullYear()} · ${yearsOnGitHub} Years on GitHub · 100% Open Source</text>
</svg>`;
  writeFileSync(join(ASSETS, 'stats.svg'), svg);
}

/* ---------- 语言榜（按字节权重） ---------- */
{
  const W = 340, H = 195, rowH = 21, top = 62, left = 30, right = 30;
  const rows = topLangs.map((l, i) => {
    const y = top + i * rowH;
    const barW = W - left - right - 60;
    return `
<circle cx="${left + 4}" cy="${y - 3}" r="4" fill="${langColor(l.name)}"/>
<text x="${left + 15}" y="${y}" font-size="11" fill="${C.text}">${esc(l.name)}</text>
<text x="${W - right}" y="${y}" font-size="10" fill="${C.muted}" text-anchor="end">${l.pct.toFixed(1)}%</text>
<rect x="${left}" y="${y + 4}" width="${barW}" height="3.5" rx="1.75" fill="${C.track}"/>
<rect x="${left}" y="${y + 4}" width="${(barW * l.pct) / 100}" height="3.5" rx="1.75" fill="${langColor(l.name)}"/>`;
  });
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">
<defs>${grad('g2')}</defs>
<rect width="${W}" height="${H}" rx="14" fill="${C.bg}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="${C.border}"/>
<text x="30" y="38" font-size="14" font-weight="700" fill="${C.title}">Top Languages</text>
<rect x="30" y="47" width="100" height="3" rx="1.5" fill="url(#g2)"/>
${rows.join('')}
</svg>`;
  writeFileSync(join(ASSETS, 'top-langs.svg'), svg);
}

/* ---------- 贡献热力图 ---------- */
{
  const cell = 11, gap = 3, step = cell + gap, left = 34, top = 44;
  const weeks = calendar.weeks;
  const W = left + weeks.length * step + 16, H = top + 7 * step + 22;
  const lv = (n) => (n === 0 ? '#1E1B2E' : n <= 2 ? '#3B2A5D' : n <= 4 ? '#5B3A9E' : n <= 7 ? '#8B5CF6' : '#C4A5FA');
  const cellsSVG = weeks.map((w, wi) => w.days.map((d, di) => {
    if (!d || !d.date) return '';
    return `<rect x="${left + wi * step}" y="${top + di * step}" width="${cell}" height="${cell}" rx="2.5" fill="${lv(d.contributionCount)}"><title>${d.date}: ${d.contributionCount} contributions</title></rect>`;
  }).join('')).join('');
  const months = [];
  weeks.forEach((w, wi) => {
    const first = w.days.find((d) => d && d.date);
    if (!first) return;
    const m = new Date(first.date).getMonth();
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, wi });
  });
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels = months.map(({ m, wi }) => `<text x="${left + wi * step}" y="${top - 8}" font-size="9" fill="${C.dim}">${M[m]}</text>`).join('');
  const wd = [['一', 1], ['三', 3], ['五', 5]].map(([t, i]) => `<text x="${left - 8}" y="${top + i * step + cell - 2}" font-size="8.5" fill="${C.dim}" text-anchor="end">${t}</text>`).join('');
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">
<rect width="${W}" height="${H}" rx="14" fill="${C.bg}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="${C.border}"/>
<text x="34" y="24" font-size="13" font-weight="700" fill="${C.title}">${totalContribs} contributions in the last year</text>
<text x="${W - 34}" y="24" font-size="9.5" fill="${C.muted}" text-anchor="end">Longest streak: ${longest} days · Current: ${cur} days</text>
${monthLabels}${wd}${cellsSVG}
<rect x="${W - 92}" y="${H - 20}" width="${cell}" height="${cell}" rx="2.5" fill="#1E1B2E"/>
<rect x="${W - 78}" y="${H - 20}" width="${cell}" height="${cell}" rx="2.5" fill="#3B2A5D"/>
<rect x="${W - 64}" y="${H - 20}" width="${cell}" height="${cell}" rx="2.5" fill="#5B3A9E"/>
<rect x="${W - 50}" y="${H - 20}" width="${cell}" height="${cell}" rx="2.5" fill="#8B5CF6"/>
<rect x="${W - 36}" y="${H - 20}" width="${cell}" height="${cell}" rx="2.5" fill="#C4A5FA"/>
<text x="${W - 98}" y="${H - 12}" font-size="9" fill="${C.dim}" text-anchor="end">Less</text>
</svg>`;
  writeFileSync(join(ASSETS, 'activity-graph.svg'), svg);
}

/* ---------- 项目卡片 ---------- */
const PIN_FEATURED = ['prompt-manage', 'SuperCapture', 'Loadout', 'netty-nexus-platform', 'Pebble', 'labs-java'];
for (const name of PIN_FEATURED) {
  const r = own.find((x) => x.name === name);
  if (!r) { console.warn(`repo not found: ${name}`); continue; }
  const W = 400, H = 112, pad = 22, maxChars = 52;
  const lines = wrap(r.description || '', maxChars, 2);
  const lic = r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : '';
  const footerY = H - 14;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">
<defs>${grad('g3')}</defs>
<rect width="${W}" height="${H}" rx="12" fill="${C.card}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="11" fill="none" stroke="${C.border}"/>
<rect x="0" y="0" width="4" height="${H}" rx="2" fill="url(#g3)"/>
<g transform="translate(${pad},26)">
  <path d="M0 3 h10 v9 h-10 z M0 3 l2 -3 h6 l2 3" fill="none" stroke="${C.pink}" stroke-width="1.4" stroke-linejoin="round"/>
  <text x="17" y="11" font-size="13.5" font-weight="700" fill="${C.pink}">${esc(r.name)}</text>
  ${lic ? `<rect x="${W - pad - 34}" y="0" width="34" height="15" rx="7.5" fill="rgba(139,92,246,0.18)"/><text x="${W - pad - 17}" y="11" font-size="9" fill="${C.violet}" text-anchor="middle">${lic}</text>` : ''}
</g>
${lines.map((l, i) => `<text x="${pad}" y="${48 + i * 16}" font-size="11" fill="${C.text}">${esc(l)}</text>`).join('')}
<g font-size="10.5" fill="${C.muted}">
  <circle cx="${pad + 4}" cy="${footerY - 3}" r="4" fill="${langColor(r.language || '')}"/>
  <text x="${pad + 14}" y="${footerY}">${esc(r.language || 'Code')}</text>
  <text x="${W - pad}" y="${footerY}" text-anchor="end" fill="${C.gold}">★ ${r.stargazers_count}</text>
  <text x="${W - pad - 52}" y="${footerY}" text-anchor="end">⑂ ${r.forks_count}</text>
</g>
</svg>`;
  writeFileSync(join(ASSETS, `pin-${name}.svg`), svg);
}

console.log('Generated:', ['stats.svg', 'top-langs.svg', 'activity-graph.svg', ...PIN_FEATURED.map((n) => `pin-${n}.svg`)].join(', '));
console.log('Top langs:', topLangs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(' | '));
