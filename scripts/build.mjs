// Draws the profile from data/profile.json (written by fetch.mjs) and profile.config.json:
//   profile/header-*.svg   the last year as a water surface (every day with contributions is a drop), and the same year as a calendar
//   profile/project-N-*.svg one card per project in the config, with its screenshot
//   profile/card-N-*.svg   one card per featured repository: a small pond with one drop per commit
//   profile/repos-*.svg    the next few repositories as a plain list
//   profile/link-N-*.svg   the links from the GitHub profile fields
//   README.md              the page that shows them, dark and light
// No dependencies. Strings come from GitHub, except the description and the project names, which are written in profile.config.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pond, hash } from './lib/pond.mjs';
import { esc, face, width, wrap, fit, assertDrawable } from './lib/text.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'profile');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.config.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'profile.json'), 'utf8'));
const { user, calendar } = data;

const THEMES = {
  dark: { bg: '#09090b', ink: '#f4f4f5', soft: '#c4c4cc', mute: '#8b8b93', line: '#26262b', rest: '#2a2a30' },
  light: { bg: '#ffffff', ink: '#18181b', soft: '#3f3f46', mute: '#71717a', line: '#e4e4e7', rest: '#dcdce0' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
const r2 = (n) => Math.round(n * 100) / 100;
const mono = (t, size = 11) => `font-family="M" font-size="${size}" letter-spacing=".02em" fill="${t.mute}"`;
const drawable = (pairs, where) => { for (const [s, f] of pairs) assertDrawable(s, f, where); };
const svg = (w, h, title, style, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><style>${style}</style>${body}</svg>`;
const dots = (t, p) => `<g fill="none" stroke="${t.ink}" stroke-linecap="round">${p.rest(t.rest)}${p.surface}</g>`;

// ---------- header ----------
const TOTAL = calendar.total.toLocaleString('en-US'), COUNT = `${TOTAL} contributions in the last year`;
const DESCRIPTION = config.description || [];
const HEADLINE = [`${user.name} (@${user.login}).`, ...DESCRIPTION, `${COUNT}.`].join(' ');
function header() {
  const W = 880, FIELD = 248, MONTH_RAIL = 28, DAY = 16, CAL = 7 * DAY, CAL_PAD = 12, CAPTION = 34, MARGIN = 28, NAME_X = 25, X0 = 16;
  const F1 = FIELD, C0 = F1 + MONTH_RAIL, B0 = C0 + CAL + CAL_PAD, H = B0 + CAPTION, Y0 = FIELD / 2 - 3.5 * DAY;
  // one column per week (53 x 16 px, centred) and one row per weekday, in the water and in the calendar below it
  const days = calendar.weeks.flatMap((w, wi) => w.map((d) => ({ x: X0 + wi * DAY + DAY / 2, row: d.weekday, c: d.count, date: d.date })));
  const max = Math.max(1, ...days.map((d) => d.c)), strength = (c) => Math.pow(Math.log1p(c) / Math.log1p(max), 0.8);
  // each day drops at its own moment in the cycle (fixed by its date), so the surface looks rained on rather than struck once
  const drops = days.filter((d) => d.c > 0).map((d) => ({ x: d.x, y: Y0 + d.row * DAY + DAY / 2, s: strength(d.c), ph: 2 * Math.PI * hash(d.date) }));
  const ticks = [];
  calendar.weeks.forEach((w, i) => { const m = +w[0].date.slice(5, 7); if (i && m !== +calendar.weeks[i - 1][0].date.slice(5, 7)) ticks.push([X0 + i * DAY, MONTHS[m - 1]]); });

  // name, handle and description, centred in the field
  const TRACK = -0.04, handle = `@${user.login}`, nameSize = Math.min(74, 74 * 420 / width(user.name, 'sans600', 74, TRACK)), LEAD = 21;
  const lines = DESCRIPTION.flatMap((l) => wrap(l, 'sans400', 15, 420, 2));
  const blockH = nameSize * 0.72 + 27 + (lines.length ? 27 + (lines.length - 1) * LEAD + 4 : 0), top = (FIELD - blockH) / 2;
  const yName = top + nameSize * 0.72, yHandle = yName + 27, yDesc = yHandle + 27;
  const textW = Math.max(width(user.name, 'sans600', nameSize, TRACK) - 3, width(handle, 'mono400', 13, 0.02), ...lines.map((l) => width(l, 'sans400', 15)));
  // still water around the text: the waves fade in over a distance, so the calm has no visible edge
  const box = { x0: NAME_X, x1: MARGIN + textW, y0: top - 2, y1: yHandle + (lines.length ? 27 + (lines.length - 1) * LEAD : 0) + 6 };
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const calm = (x, y) => Math.pow(smooth(0, 230, Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.y0 - y, 0, y - box.y1))), 1.5);
  const p = pond({ x: 0, y: 0, w: W, h: FIELD }, drops, { calm });

  // the calendar: one dot per day, sized like its drop; days without contributions stay at rest
  const D_MIN = 2.2, D_MAX = 9, D_REST = 1.6, sized = new Map(); let resting = '';
  for (const d of days) {
    const at = `M${d.x} ${C0 + d.row * DAY + DAY / 2}h.01`;
    if (!d.c) { resting += at; continue; }
    const size = (D_MIN + strength(d.c) * (D_MAX - D_MIN)).toFixed(1);
    sized.set(size, (sized.get(size) || '') + at);
  }
  const yCap = r2(B0 + CAPTION / 2 + 4), wMore = width('More', 'mono400', 11, 0.02);
  const key = [1, 0.75, 0.5, 0.25, 0].map((s, i) => ({ x: r2(W - MARGIN - wMore - 19 - i * 16), size: s ? r2(D_MIN + s * (D_MAX - D_MIN)) : D_REST, rest: !s }));
  drawable([[user.name, 'sans600'], [handle, 'mono400'], [COUNT, 'mono400'], ['Less More', 'mono400'], [lines.join(' '), 'sans400']], 'the header');
  return (t) => svg(W, H, HEADLINE, face('N', 'sans600') + face('S', 'sans400') + face('M', 'mono400') + p.css,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>${dots(t, p)}` +
    `<g stroke="${t.bg}" stroke-linejoin="round" paint-order="stroke">` +
    `<text x="${NAME_X}" y="${r2(yName)}" font-family="N" font-size="${r2(nameSize)}" letter-spacing="${TRACK}em" fill="${t.ink}" stroke-width="7">${esc(user.name)}</text>` +
    `<text x="${MARGIN}" y="${r2(yHandle)}" font-family="M" font-size="13" letter-spacing=".02em" fill="${t.mute}" stroke-width="5">${esc(handle)}</text>` +
    lines.map((l, i) => `<text x="${MARGIN}" y="${r2(yDesc + i * LEAD)}" font-family="S" font-size="15" fill="${t.soft}" stroke-width="5">${esc(l)}</text>`).join('') + `</g>` +
    `<path d="M0 ${F1}.5H${W}${ticks.map(([x]) => `M${x}.5 ${F1}v5`).join('')}M0 ${B0}.5H${W}" stroke="${t.line}" fill="none"/>` +
    `<g ${mono(t)}>${ticks.map(([x, m]) => `<text x="${x + 5}" y="${F1 + 18}">${m}</text>`).join('')}</g>` +
    `<g fill="none" stroke-linecap="round"><path stroke="${t.rest}" stroke-width="${D_REST}" d="${resting}"/><g stroke="${t.ink}">${[...sized].map(([size, d]) => `<path stroke-width="${size}" d="${d}"/>`).join('')}</g>` +
    key.map((k) => `<path stroke="${k.rest ? t.rest : t.ink}" stroke-width="${k.size}" d="M${k.x} ${yCap - 4}h.01"/>`).join('') + `</g>` +
    `<text x="${MARGIN}" y="${yCap}" ${mono(t)}>${COUNT}</text>` +
    `<text x="${W - MARGIN}" y="${yCap}" ${mono(t)} text-anchor="end">More</text><text x="${r2(key[4].x - 12)}" y="${yCap}" ${mono(t)} text-anchor="end">Less</text>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.line}"/>`);
}

// ---------- project cards ----------
// A screenshot per project, kept as a file in the repository and embedded in the card (an image shown on GitHub cannot load other files).
const PROJECT_TEXT = 436 - 2 * 16, projectLines = (pr) => wrap(pr.description || '', 'sans400', 13.5, PROJECT_TEXT, 2);
const PROJECT_LINES = Math.max(0, ...(config.projects || []).map((pr) => projectLines(pr).length));   // every card leaves room for the longest description
function project(pr, side) {
  const FULL = 440, W = 436, GX = side === 'right' ? 4 : 0, RAIL = 34, PAD = 16, SHOT = 272, S1 = RAIL + SHOT, lines = projectLines(pr);
  const H = S1 + (PROJECT_LINES ? 26 + (PROJECT_LINES - 1) * 20 + 18 : 0);
  const where = pr.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''), label = where.toLowerCase() === pr.name.toLowerCase() ? '' : where;
  const shot = fs.readFileSync(path.join(ROOT, pr.shot)).toString('base64'), type = /\.png$/i.test(pr.shot) ? 'png' : 'jpeg';
  const name = fit(pr.name, 'sans600', 14.5, W - 2 * PAD - width(label, 'mono400', 11, 0.02) - 36, -0.01);
  drawable([[name, 'sans600'], [label, 'mono400'], [lines.join(' '), 'sans400']], pr.name);
  return (t) => svg(FULL, H, pr.description ? `${pr.name}: ${pr.description}` : pr.name, face('S6', 'sans600') + face('S4', 'sans400') + face('M', 'mono400'),
    `<g transform="translate(${GX} 0)"><rect width="${W}" height="${H}" fill="${t.bg}"/>` +
    `<image href="data:image/${type};base64,${shot}" x="0" y="${RAIL}" width="${W}" height="${SHOT}" preserveAspectRatio="xMidYMin slice"/>` +
    `<text x="${PAD}" y="${RAIL / 2 + 5}" font-family="S6" font-size="14.5" letter-spacing="-.01em" fill="${t.ink}">${esc(name)}</text>` +
    `<text x="${W - PAD - 16}" y="${RAIL / 2 + 4}" ${mono(t)} text-anchor="end">${esc(label)}</text>` +
    `<path d="M${W - PAD - 8} ${RAIL / 2 + 4}l8 -8m-6 0h6v6" fill="none" stroke="${t.mute}" stroke-width="1.2"/>` +
    lines.map((l, i) => `<text x="${PAD}" y="${S1 + 26 + i * 20}" font-family="S4" font-size="13.5" fill="${t.soft}">${esc(l)}</text>`).join('') +
    `<path d="M0 ${RAIL}.5H${W}${PROJECT_LINES ? `M0 ${S1}.5H${W}` : ''}" stroke="${t.line}" fill="none"/>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.line}"/></g>`);
}

// ---------- repository cards ----------
// Two sit side by side at 50% each, so a card is 440 wide and leaves 4 px clear on its inner side (an 8 px gutter).
const metaLine = (r) => [r.stars > 0 ? `${r.stars} star${r.stars === 1 ? '' : 's'}` : null, `Updated ${shortDay(r.pushedAt)}`].filter(Boolean).join(' · ');
// one drop per commit; when there are many, commits in the same slice of the repository's life share a drop
function commitDrops(dates, box, seed) {
  const BINS = 40, PAD_X = 16, PAD_Y = 14;
  if (!dates.length) return [];
  const t = dates.map((d) => Date.parse(`${d}:00Z`)).sort((a, b) => a - b), span = Math.max(1, t[t.length - 1] - t[0]);
  const bins = new Map();
  for (const v of t) { const b = Math.min(BINS - 1, Math.floor((v - t[0]) / span * BINS)); bins.set(b, (bins.get(b) || 0) + 1); }
  const max = Math.max(...bins.values());
  return [...bins].map(([b, n]) => ({
    x: box.x + PAD_X + (bins.size === 1 ? hash(`${seed}x`) : (b + 0.5) / BINS) * (box.w - 2 * PAD_X),
    y: box.y + PAD_Y + hash(`${seed}#${b}`) * (box.h - 2 * PAD_Y),
    s: max === 1 ? 1 : Math.pow(Math.log1p(n) / Math.log1p(max), 0.8),
    ph: 2 * Math.PI * hash(`${seed}@${b}`),
  }));
}
function card(repo, side) {
  const FULL = 440, W = 436, GX = side === 'right' ? 4 : 0, RAIL = 34, PLATE = 68, PAD = 16, P0 = RAIL, P1 = RAIL + PLATE;
  const H = P1 + 26 + 3 * 20 - 6 + 34;
  const id = `${repo.owner}/${repo.name}`, box = { x: 0, y: P0, w: W, h: PLATE };
  const p = pond(box, commitDrops(repo.commits.dates, box, id), { lambda: 26, gamma: 0.8, buckets: 10, levels: 5, period: 12.8, fps: 12.5 });
  const meta = metaLine(repo), ownerW = width(repo.owner, 'mono400', 11, 0.02);
  const name = fit(repo.name, 'sans600', 14.5, W - 2 * PAD - ownerW - 14, -0.01), lines = wrap(repo.description, 'sans400', 13.5, W - 2 * PAD, 3);
  drawable([[name, 'sans600'], [repo.owner, 'mono400'], [lines.join(' '), 'sans400'], [repo.language, 'mono400'], [meta, 'mono400']], id);
  return (t) => svg(FULL, H, `${repo.name}: ${repo.description}`, face('S6', 'sans600') + face('S4', 'sans400') + face('M', 'mono400') + p.css,
    `<g transform="translate(${GX} 0)"><rect width="${W}" height="${H}" fill="${t.bg}"/>${dots(t, p)}` +
    `<path d="M0 ${P0}.5H${W}M0 ${P1}.5H${W}" stroke="${t.line}" fill="none"/>` +
    `<text x="${PAD}" y="${P0 / 2 + 5}" font-family="S6" font-size="14.5" letter-spacing="-.01em" fill="${t.ink}">${esc(name)}</text>` +
    `<text x="${W - PAD}" y="${P0 / 2 + 4}" ${mono(t)} text-anchor="end">${esc(repo.owner)}</text>` +
    lines.map((l, i) => `<text x="${PAD}" y="${P1 + 27 + i * 20}" font-family="S4" font-size="13.5" fill="${t.soft}">${esc(l)}</text>`).join('') +
    `<text x="${PAD}" y="${H - 15}" ${mono(t)}>${esc(repo.language)}</text>` +
    `<text x="${W - PAD}" y="${H - 15}" ${mono(t)} text-anchor="end">${esc(meta)}</text>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.line}"/></g>`);
}

// ---------- repository list ----------
function list(repos) {
  const W = 880, ROW = 44, PAD = 16, X_DESC = 224, X_LANG = 630, H = repos.length * ROW;
  const rows = repos.map((r) => ({ name: fit(r.name, 'sans600', 14, X_DESC - PAD - 16, -0.01), desc: fit(r.description, 'sans400', 13, X_LANG - X_DESC - 20), lang: r.language, meta: metaLine(r) }));
  rows.forEach((r, i) => drawable([[r.name, 'sans600'], [r.desc, 'sans400'], [r.lang, 'mono400'], [r.meta, 'mono400']], repos[i].name));
  return (t) => svg(W, H, 'Repositories', face('S6', 'sans600') + face('S4', 'sans400') + face('M', 'mono400'),
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>` +
    rows.map((r, i) => { const y = i * ROW + ROW / 2; return (i ? `<path d="M0 ${i * ROW}.5H${W}" stroke="${t.line}"/>` : '') +
      `<text x="${PAD}" y="${y + 5}" font-family="S6" font-size="14" letter-spacing="-.01em" fill="${t.ink}">${esc(r.name)}</text>` +
      `<text x="${X_DESC}" y="${y + 4.5}" font-family="S4" font-size="13" fill="${t.soft}">${esc(r.desc)}</text>` +
      `<text x="${X_LANG}" y="${y + 4}" ${mono(t)}>${esc(r.lang)}</text>` +
      `<text x="${W - PAD}" y="${y + 4}" ${mono(t)} text-anchor="end">${esc(r.meta)}</text>`; }).join('') +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.line}"/>`);
}

// ---------- links ----------
function chip(label) {
  const H = 36, PAD = 14, tw = width(label, 'mono400', 12, 0.02), W = Math.ceil(PAD + tw + 10 + 8 + PAD), ax = PAD + tw + 10, ay = 14;
  drawable([[label, 'mono400']], 'a link');
  return (t) => svg(W, H, label, face('M', 'mono400'),
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="${t.bg}" stroke="${t.line}"/>` +
    `<text x="${PAD}" y="22" font-family="M" font-size="12" letter-spacing=".02em" fill="${t.ink}">${esc(label)}</text>` +
    `<path d="M${r2(ax)} ${ay + 8}l8 -8m-6 0h6v6" fill="none" stroke="${t.mute}" stroke-width="1.2"/>`);
}
const links = [];
if (user.websiteUrl) { const u = /^https?:\/\//.test(user.websiteUrl) ? user.websiteUrl : `https://${user.websiteUrl}`; links.push({ label: u.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: u }); }
if (user.twitterUsername) links.push({ label: `x.com/${user.twitterUsername}`, url: `https://x.com/${user.twitterUsername}` });
if (/^@[\w-]+$/.test(user.company.trim())) links.push({ label: `github.com/${user.company.trim().slice(1)}`, url: `https://github.com/${user.company.trim().slice(1)}` });

// ---------- write ----------
const isFeatured = (r) => data.featured.some((f) => f.owner === r.owner && f.name === r.name);
const more = data.repos.filter((r) => !isFeatured(r) && !r.archived && r.name !== user.login && !config.hide.includes(r.name) && !config.hide.includes(`${r.owner}/${r.name}`)).slice(0, config.more);

// Everything is drawn in memory first and written only once all of it has succeeded,
// so a string the fonts cannot draw stops the build without leaving a half-written profile behind.
const files = [];
// draws name-dark.svg and name-light.svg, returns the <picture> that shows the right one
function emit(name, draw, attrs, alt) {
  const src = {};
  for (const [theme, t] of Object.entries(THEMES)) {
    const text = draw(t), file = `${name}-${theme}.svg`;
    files.push([file, text]);
    src[theme] = `./profile/${file}?v=${crypto.createHash('sha1').update(text).digest('hex').slice(0, 10)}`;
  }
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="${src.dark}"><img src="${src.light}" ${attrs} alt="${esc(alt)}"></picture>`;
}
const a = (url, inner) => `<a href="${esc(url)}">${inner}</a>`;
const side = (i) => (i % 2 ? 'right' : 'left'), pairs = (list) => { const rows = []; for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).join('')); return rows; };
const projects = (config.projects || []).map((pr, i) => a(pr.url, emit(`project-${i + 1}`, project(pr, side(i)), 'width="50%"', pr.description ? `${pr.name}: ${pr.description}` : pr.name)));
const cards = data.featured.map((r, i) => a(r.url, emit(`card-${i + 1}`, card(r, side(i)), 'width="50%"', `${r.name}: ${r.description}`)));
const readme = [
  '<!-- Generated by scripts/build.mjs from profile.config.json and data/profile.json. Edit those, not this file. -->',
  `<p align="center">${emit('header', header(), 'width="100%"', HEADLINE)}</p>`,
  '',
  ...(projects.length ? [...pairs(projects), ''] : []),
  ...pairs(cards),
  '',
  ...(more.length ? [a(`https://github.com/${user.login}?tab=repositories`, emit('repos', list(more), 'width="100%"', 'Repositories')), ''] : []),
  ...(links.length ? [`<p align="center">${links.map((l, i) => a(l.url, emit(`link-${i + 1}`, chip(l.label), 'height="36"', l.label))).join(' ')}</p>`] : []),
  '',
].join('\n');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^(header|project-\d+|card-\d+|repos|link-\d+)-(dark|light)\.svg$/.test(f)) fs.unlinkSync(path.join(OUT, f));
for (const [f, text] of files) fs.writeFileSync(path.join(OUT, f), text);
fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
for (const [f, text] of files) console.log(`profile/${f.padEnd(22)} ${(text.length / 1024).toFixed(0).padStart(4)} KB`);
console.log(`README.md: header, ${projects.length} projects, ${cards.length} repository cards, ${more.length} more repositories, ${links.length} links`);
