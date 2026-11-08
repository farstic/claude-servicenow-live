// Markdown (house subset) -> styled HTML -> PDF with headless Chrome, two passes so the table of contents carries real page numbers.
// Usage: node scripts/bid/md2pdf.js <in.md> <out.pdf> [--brand "text"] [--footer "text"] [--header "text"] [--no-toc] [--landscape] [--map out.json]
// --brand prints a short brand line on the cover (pass the bidder's name per bid; the engine holds no company name).
// Chrome or Edge is found at run time; set CHROME_PATH to use another Chromium browser.
// --map writes {headingId: {text, level, page}} for page references.
// Subset: "# " title (cover) + first paragraph subtitle + optional document-control table; "## Contents" placeholder = TOC;
// ##/###/#### headings (## starts a new page); paragraphs; "- " / "1. " lists (one nesting level by 2+ spaces);
// pipe tables; **bold**, *italic*, `code`, [text](url); "> " callouts; ``` fenced blocks; ![alt](file.png|svg); "---" rule.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');

const CHROME = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('no Chrome or Edge found - set CHROME_PATH'); process.exit(2); }
const args = process.argv.slice(2);
const IN = path.resolve(args[0]), OUT = path.resolve(args[1]);
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const BRAND = opt('--brand', ''), FOOTER = opt('--footer', ''), HEADER = opt('--header', ''), MAP = opt('--map', ''), NOTOC = args.includes('--no-toc'), LANDSCAPE = args.includes('--landscape');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  const code = []; s = s.replace(/`([^`]+)`/g, (m, c) => { code.push(c); return '\u0000' + (code.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, a, f) => `<img alt="${a}" src="${f}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\[\]]*?(?:INPUT REQUIRED FROM [A-Za-z]+|TO BE VALIDATED WITH SERVICENOW|CLARIFICATION REQUIRED FROM [A-Za-z]+|INTERNAL REVIEW REQUIRED|SOURCE CONFLICT - REVIEW REQUIRED|COMMERCIAL VALIDATION REQUIRED|DESIGN VALIDATION REQUIRED|REFERENCE VALIDATION REQUIRED|VERSION VALIDATION REQUIRED|REUSE REQUIRES [A-Za-z]+ VALIDATION|CROSS-DOCUMENT CONFLICT)[^\[\]]*)\]/g, '<span class="ph">[$1]</span>');
  s = s.replace(/\[(PROPOSED [^\]]+)\]/g, '<span class="ph">[$1]</span>');
  s = s.replace(/&lt;br&gt;/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + esc(code[+i]) + '</code>');
}
const slug = (t, used) => { let b = t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'h'; let s = b, n = 2; while (used.has(s)) s = b + '-' + n++; used.add(s); return s; };

function render(md, baseDir, pageMap) {
  const L = md.replace(/\r/g, '').split('\n');
  const out = [], heads = [], used = new Set();
  let i = 0, title = '', coverDone = false, sawContents = false;
  const imgSrc = f => /^(https?:|file:|data:)/.test(f) ? f : 'file:///' + path.resolve(baseDir, f).replace(/\\/g, '/');
  const isTableSep = l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l);
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push('<pre>' + esc(buf.join('\n')) + '</pre>'); continue; }
    if (/^# /.test(l) && !title) {
      title = l.slice(2).trim(); i++;
      while (i < L.length && !L[i].trim()) i++;
      let sub = ''; if (i < L.length && !/^[#|>-]/.test(L[i])) { sub = L[i].trim(); i++; }
      out.push(`<section class="cover">${BRAND ? `<div class="brand">${esc(BRAND)}</div>` : ''}<h1 class="title">${inline(title)}</h1>${sub ? `<p class="subtitle">${inline(sub)}</p>` : ''}`);
      while (i < L.length && !L[i].trim()) i++;
      if (i < L.length && /^\|/.test(L[i])) { const t = []; while (i < L.length && /^\|/.test(L[i])) t.push(L[i++]); out.push(table(t)); }
      out.push('</section>'); coverDone = true; continue;
    }
    const h = l.match(/^(#{2,4}) (.+)$/);
    if (h) {
      const lvl = h[1].length, text = h[2].trim();
      if (lvl === 2 && /^contents$/i.test(text)) { sawContents = true; out.push('@@TOC@@'); i++; continue; }
      const id = slug(text, used); heads.push({ id, text, lvl });
      out.push(`<h${lvl} id="${id}"><span class="mk">QQH${String(heads.length).padStart(4, '0')}QQ</span>${inline(text)}</h${lvl}>`); i++; continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\|/.test(l) && i + 1 < L.length && isTableSep(L[i + 1])) { const t = []; while (i < L.length && /^\|/.test(L[i])) t.push(L[i++]); out.push(table(t)); continue; }
    if (/^> ?/.test(l)) { const buf = []; while (i < L.length && /^> ?/.test(L[i])) buf.push(L[i++].replace(/^> ?/, '')); out.push('<div class="callout">' + buf.map(b => b.trim() ? '<p>' + inline(b) + '</p>' : '').join('') + '</div>'); continue; }
    const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) { out.push(`<figure><img src="${imgSrc(img[2])}" alt="${esc(img[1])}"><figcaption>${inline(img[1])}</figcaption></figure>`); i++; continue; }
    if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l), tag = ordered ? 'ol' : 'ul'; const items = [];
      while (i < L.length && /^\s*([-*]|\d+\.) /.test(L[i])) {
        const m = L[i].match(/^(\s*)([-*]|\d+\.) (.*)$/); const deep = m[1].length >= 2;
        let txt = m[3]; i++;
        while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*]|\d+\.) /.test(L[i])) txt += ' ' + L[i++].trim();
        if (deep && items.length) { (items[items.length - 1].sub = items[items.length - 1].sub || []).push(txt); } else items.push({ txt });
      }
      out.push(`<${tag}>` + items.map(it => '<li>' + inline(it.txt) + (it.sub ? '<ul>' + it.sub.map(s => '<li>' + inline(s) + '</li>').join('') + '</ul>' : '') + '</li>').join('') + `</${tag}>`); continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [l.trim()]; i++;
    while (i < L.length && L[i].trim() && !/^(#{1,4} |\||> |```|---\s*$|\s*([-*]|\d+\.) |!\[)/.test(L[i])) buf.push(L[i++].trim());
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  let toc = '';
  if (!NOTOC && sawContents) {
    toc = '<section class="toc"><h2 class="tochead">Contents</h2><table class="toct">' + heads.filter(x => x.lvl <= 3).map(x =>
      `<tr class="l${x.lvl}"><td><a href="#${x.id}">${inline(x.text)}</a></td><td class="pg">${pageMap && pageMap[x.id] ? pageMap[x.id].page : '000'}</td></tr>`).join('') + '</table></section>';
  }
  function table(rows) {
    const body = rows.filter(r => !isTableSep(r)).map(cells);
    const hdr = body.shift();
    return '<table><thead><tr>' + hdr.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  return { html: out.join('\n').replace('@@TOC@@', toc), heads, title };
}

const CSS = `@page { size: ${LANDSCAPE ? 'A4 landscape' : 'A4'}; margin: 22mm 17mm 20mm 17mm;
  @top-right { content: "${HEADER.replace(/"/g, '\\"')}"; font: 8pt Arial; color: #7f7f7f; }
  @bottom-left { content: "${FOOTER.replace(/"/g, '\\"')}"; font: 8pt Arial; color: #7f7f7f; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial; color: #7f7f7f; } }
@page :first { @top-right { content: ""; } }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.38; color: #222; }
.cover { break-after: page; padding-top: 28mm; }
.mk { font-size: 1px; color: #ffffff; letter-spacing: 0; }
.cover .brand { font-size: 13pt; letter-spacing: 3px; color: #1F3864; font-weight: bold; border-bottom: 3px solid #1F3864; padding-bottom: 6px; width: 60mm; }
.cover .title { font-size: 24pt; color: #1F3864; margin: 24mm 0 6mm; line-height: 1.2; }
.cover .subtitle { font-size: 13pt; color: #404040; margin-bottom: 18mm; }
.toc { break-after: page; } .tochead { break-before: avoid; }
.toct { width: 100%; border: none; } .toct td { border: none; padding: 2px 4px; } .toct a { color: #222; text-decoration: none; }
.toct .l2 td { font-weight: bold; padding-top: 6px; } .toct .l3 td:first-child { padding-left: 18px; } .toct .pg { text-align: right; width: 14mm; }
h2 { break-before: page; font-size: 16pt; color: #1F3864; border-bottom: 2px solid #1F3864; padding-bottom: 4px; margin-top: 0; }
h3 { font-size: 12.5pt; color: #1F3864; margin: 16px 0 6px; break-after: avoid; }
h4 { font-size: 10.5pt; color: #2F5496; margin: 12px 0 4px; break-after: avoid; }
p { margin: 5px 0 7px; text-align: left; } ul, ol { margin: 4px 0 8px 18px; padding-left: 6px; } li { margin: 2px 0; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 8.6pt; break-inside: auto; }
th { background: #1F3864; color: #fff; text-align: left; padding: 4px 5px; border: 1px solid #1F3864; }
td { padding: 3px 5px; border: 1px solid #c9c9c9; vertical-align: top; } tr { break-inside: avoid; } tbody tr:nth-child(even) td { background: #f4f6fa; }
thead { display: table-header-group; }
.callout { border-left: 4px solid #2F5496; background: #eef2f8; padding: 4px 10px; margin: 8px 0; }
.ph { background: #fff2cc; color: #7f4f00; font-weight: bold; }
code { font-family: Consolas, monospace; font-size: 8.8pt; background: #f2f2f2; padding: 0 2px; }
pre { font-family: Consolas, monospace; font-size: 8.4pt; background: #f2f2f2; padding: 6px; white-space: pre-wrap; }
figure { margin: 8px 0 12px; text-align: center; break-inside: avoid; } figure img { max-width: 100%; max-height: 215mm; } figcaption { font-size: 8.6pt; color: #555; margin-top: 3px; }
hr { border: none; border-top: 1px solid #bfbfbf; margin: 10px 0; }
.cover table { width: 120mm; font-size: 9pt; } .cover td:first-child { width: 38mm; font-weight: bold; }`;

function toPdf(html, pdf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pdf-'));
  const htmlFile = path.join(path.dirname(IN), '.~' + path.basename(IN, '.md') + '.render.html');
  fs.writeFileSync(htmlFile, `<!doctype html><html><head><meta charset="utf-8"><title>${esc(path.basename(IN, '.md'))}</title><style>${CSS}</style></head><body>${html}</body></html>`);
  const r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--user-data-dir=' + tmp, '--print-to-pdf=' + pdf, 'file:///' + htmlFile.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 180000 });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  try { fs.unlinkSync(htmlFile); } catch (e) { }
  if (!fs.existsSync(pdf)) throw new Error('Chrome did not write the PDF: ' + (r.stderr || '').slice(-400));
}
const PDFTOTEXT = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';
function pageMapOf(pdf, heads) {
  // pdftotext separates pages with a form feed
  const all = cp.spawnSync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout || '';
  const pages = all.split('\f').map(t => t.replace(/\s+/g, ' '));
  if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  const n = pages.length;
  const norm = t => t.replace(/<[^>]+>/g, '').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  const map = {};
  heads.forEach((h, k) => {
    const mk = 'QQH' + String(k + 1).padStart(4, '0') + 'QQ';
    let found = 0;
    for (let p = 0; p < pages.length; p++) { if (pages[p].includes(mk)) { found = p + 1; break; } }
    map[h.id] = { text: norm(h.text), level: h.lvl, page: found || null };
  });
  return { map, pages: n };
}

const md = fs.readFileSync(IN, 'utf8');
let r = render(md, path.dirname(IN), null);
toPdf(r.html, OUT);
let pm = pageMapOf(OUT, r.heads);
if (!NOTOC && md.match(/^## Contents\s*$/m)) { r = render(md, path.dirname(IN), pm.map); toPdf(r.html, OUT); pm = pageMapOf(OUT, r.heads); }
if (MAP) fs.writeFileSync(MAP, JSON.stringify(pm.map, null, 1));
const missing = Object.values(pm.map).filter(x => !x.page).length;
console.log('PDF ' + OUT + ' pages ' + pm.pages + ' headings ' + r.heads.length + (missing ? ' (' + missing + ' headings not located)' : ''));
