#!/usr/bin/env node
// Extracts the reviewable text of a .pptx, .xlsx/.xlsm or .docx without Office and without unzipping by hand:
//   pptx - slides in show order (hidden marked), shape text, tables, SmartArt text, speaker notes, alternative text,
//          static text on the layouts and masters in use
//   xlsx - every sheet (hidden marked) as rows of REF=value cells, formulas as {=...}, defined names, autofilters
//   docx - headings, paragraphs, list items and tables in document order, headers and footers, alternative text
// Embedded Office files are listed; a rights-protected (encrypted) file is reported, never opened.
// Usage: node scripts/bid/extract-office.js <file> [--out <file.txt>]
'use strict';
const fs = require('fs');
const { open } = require('./lib/office');

const args = process.argv.slice(2);
if (!args.length) {
    console.error('usage: node scripts/bid/extract-office.js <file.pptx|.xlsx|.xlsm|.docx> [--out out.txt]');
    process.exit(2);
}
const file = args[0];
const outIx = args.indexOf('--out');
let doc;
try { doc = open(file); } catch (e) { console.error('cannot open: ' + e.message); process.exit(2); }
const L = [];
const p = doc.props;
L.push('# ' + file);
L.push('properties: ' + (Object.keys(p).length ? Object.keys(p).map((k) => k + '=' + p[k]).join(' | ') : '(none)'));

if (doc.kind === 'pptx') {
    doc.slides.forEach((s) => {
        L.push('');
        L.push('=== SLIDE ' + s.n + (s.hidden ? ' [HIDDEN]' : '') + (s.comments ? ' [COMMENTS ' + s.comments + ']' : ''));
        s.text.forEach((t) => L.push('  ' + t));
        s.tables.forEach((t) => L.push('  | ' + t));
        s.smartart.forEach((t) => L.push('  [smartart] ' + t));
        (s.alt || []).forEach((t) => L.push('  [alt] ' + t));
        if (s.highlights) { L.push('  [highlighted runs] ' + s.highlights); }
        if (s.notes) { L.push('  [NOTES] ' + s.notes); }
    });
    (doc.templateText || []).forEach((t) => {
        L.push('');
        L.push('=== LAYOUT/MASTER ' + t.part + ' (used by slides ' + t.slides.join(', ') + ')');
        t.text.forEach((q) => L.push('  ' + q));
    });
} else if (doc.kind === 'xlsx') {
    if (doc.definedNames.length) { L.push('defined names: ' + doc.definedNames.join(' ; ')); }
    if (doc.vba) { L.push('macros: yes (vbaProject.bin)'); }
    doc.sheets.forEach((sh) => {
        L.push('');
        L.push('=== SHEET "' + sh.name + '"' + (sh.state !== 'visible' ? ' [' + sh.state.toUpperCase() + ']' : '') +
            (sh.comments ? ' [COMMENTS]' : '') + (sh.protectedSheet ? ' [PROTECTED]' : '') + (sh.autoFilter ? ' [FILTER ' + sh.autoFilter + ']' : ''));
        if (sh.merges.length) { L.push('merged: ' + sh.merges.join(' ')); }
        const rows = {};
        sh.cells.forEach((c) => { (rows[c.r] = rows[c.r] || []).push(c); });
        Object.keys(rows).map(Number).sort((a, b) => a - b).forEach((r) => {
            L.push('R' + r + ': ' + rows[r].map((c) => c.ref + '=' + String(c.v).replace(/\r?\n/g, ' \\n ') +
                (c.f ? ' {=' + c.f + '}' : '')).join(' || '));
        });
    });
} else {
    if (doc.comments || doc.trackedChanges || doc.hiddenText || doc.highlights) {
        L.push('review marks: comments ' + doc.comments + ', tracked changes ' + doc.trackedChanges + ', hidden text runs ' + doc.hiddenText +
            ', highlighted runs ' + doc.highlights);
    }
    (doc.headerFooter || []).forEach((h) => L.push('[' + h.part.replace(/^word\//, '') + '] ' + h.text.join(' / ')));
    doc.blocks.forEach((b) => {
        if (b.type === 'table') { L.push('[table]'); b.rows.forEach((r) => L.push('  | ' + r)); return; }
        L.push((b.type === 'p' ? '' : '[' + b.type.toUpperCase() + '] ') + b.text);
    });
    (doc.alt || []).forEach((t) => L.push('[alt] ' + t));
}
if (doc.embeddings && doc.embeddings.length) {
    L.push('');
    L.push('embedded files: ' + doc.embeddings.join(', '));
}
const text = L.join('\n') + '\n';
if (outIx > -1 && args[outIx + 1]) {
    fs.writeFileSync(args[outIx + 1], text);
    console.log('written ' + args[outIx + 1] + ' (' + text.length + ' chars)');
} else {
    process.stdout.write(text);
}
