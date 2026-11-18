// Local preview of README.md inside a stand-in for GitHub's page. Not published (see .gitignore).
//   preview.html        dark, light and phone side by side, each forced to its theme, for looking at
//   preview-real.html   README.md exactly as written, so <picture> switches with the system theme, for testing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
// GitHub puts loose inline HTML into paragraphs; do the same so the spacing between rows matches
const asGitHub = (md) => md.replace(/<!--[\s\S]*?-->/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => (b.startsWith('<p') ? b : `<p>${b}</p>`)).join('\n');
const force = (html, theme) => html.replace(/<picture><source media="[^"]*" srcset="([^"]*)"><img src="([^"]*)"/g, (_, dark, light) => `<picture><img src="${theme === 'dark' ? dark : light}"`);
const body = asGitHub(readme);
const css = `
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .wrap{padding:28px 16px 12px}
  .cap{max-width:896px;margin:0 auto 10px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#7d8590}
  .gh{max-width:896px;margin:0 auto 34px;border:1px solid var(--bd);border-radius:6px;padding:24px;background:var(--bg)}
  .gh .path{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fg);margin-bottom:16px}
  .gh .path span{color:var(--mut)}
  .md{font-size:16px;line-height:1.5;word-wrap:break-word}
  .md p{margin:0 0 16px}.md p:last-child{margin-bottom:0}
  .md img{max-width:100%;box-sizing:content-box;border-style:none;background:transparent}
  .md a{text-decoration:none}
  .dark{--bg:#0d1117;--bd:#3d444d;--fg:#f0f6fc;--mut:#9198a1}
  .light{--bg:#ffffff;--bd:#d1d9e0;--fg:#1f2328;--mut:#59636e}
  .phone{max-width:375px;padding:16px}
  .cap.narrow{max-width:375px}`;
const shell = (cls, inner) => `<div class="gh ${cls}"><div class="path">${'cudam321<span> / </span>README<span>.md</span>'}</div><div class="md">${inner}</div></div>`;
const page = (title, bg, inner, extra = '') => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}${extra}</style></head>\n<body style="background:${bg}"><div class="wrap">\n${inner}\n</div></body></html>\n`;

fs.writeFileSync(path.join(ROOT, 'preview.html'), page('README preview', '#010409',
  `<div class="cap">GitHub dark</div>\n${shell('dark', force(body, 'dark'))}\n<div class="cap">GitHub light</div>\n${shell('light', force(body, 'light'))}\n` +
  `<div class="cap narrow">Phone, dark</div>\n${shell('dark phone', force(body, 'dark'))}\n<div class="cap narrow">Phone, light</div>\n${shell('light phone', force(body, 'light'))}`));
fs.writeFileSync(path.join(ROOT, 'preview-real.html'), page('README as written', '#010409',
  `<div class="gh auto"><div class="path">cudam321<span> / </span>README<span>.md</span></div><div class="md">${body}</div></div>`,
  `.auto{--bg:#ffffff;--bd:#d1d9e0;--fg:#1f2328;--mut:#59636e}@media (prefers-color-scheme:dark){.auto{--bg:#0d1117;--bd:#3d444d;--fg:#f0f6fc;--mut:#9198a1}}`));
console.log('preview.html, preview-real.html');
