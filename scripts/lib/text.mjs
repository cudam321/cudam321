// Text that comes from GitHub is drawn into SVG by this file: escaped, measured with the real font widths,
// and refused if it contains a character the embedded fonts cannot draw.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fonts');
const metrics = JSON.parse(fs.readFileSync(path.join(FONTS, 'metrics.json'), 'utf8'));

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// @font-face rule with the font file embedded
export const face = (family, font) => `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, metrics[font].file)).toString('base64')}) format('woff2')}`;

export function assertDrawable(str, font, where) {
  for (const ch of String(str)) if (!(ch.codePointAt(0) in metrics[font].advance)) throw new Error(`"${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase()}) in ${where} is not in the embedded font ${font}`);
}
export function width(str, font, size, tracking = 0) {
  const m = metrics[font]; let w = 0, n = 0;
  for (const ch of String(str)) { w += (m.advance[ch.codePointAt(0)] ?? m.unitsPerEm * 0.6) / m.unitsPerEm * size; n++; }
  return w + tracking * size * n;
}
// one line, cut at a word boundary with an ellipsis if it does not fit
export function fit(str, font, size, max, tracking = 0) {
  if (width(str, font, size, tracking) <= max) return str;
  const words = String(str).split(' ');
  while (words.length > 1) { words.pop(); const t = words.join(' ').replace(/[\s,;:.—-]+$/, '') + '…'; if (width(t, font, size, tracking) <= max) return t; }
  let t = words[0]; while (t.length > 1 && width(t + '…', font, size, tracking) > max) t = t.slice(0, -1);
  return t + '…';
}
// up to maxLines lines; the last one ends in an ellipsis if text is left over
export function wrap(str, font, size, max, maxLines, tracking = 0) {
  const words = String(str).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (width(next, font, size, tracking) <= max) { line = next; continue; }
    if (lines.length === maxLines - 1) { lines.push(fit(`${line} ${words.slice(i).join(' ')}`, font, size, max, tracking)); return lines; }
    lines.push(line); line = words[i];
  }
  if (line) lines.push(line);
  return lines;
}
