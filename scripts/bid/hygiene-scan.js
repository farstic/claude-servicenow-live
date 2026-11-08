#!/usr/bin/env node
// Pre-submission hygiene scan of bid files (.pptx, .xlsx/.xlsm, .docx). Finds what must not reach a customer:
//   - names from a deny list (other customers, other bids, internal people)
//   - placeholders and drafting labels, broken fields, template residue (on slides, layouts, masters, headers, footers)
//   - speaker notes, hidden slides and sheets, comments, tracked changes, hidden text, highlighting, macros
//   - embedded files (embedded workbooks are opened: their sheets, hidden sheets and names are reported)
//   - external links, document properties, alternative text (file paths, other names)
//   - Cyrillic or Greek text in an English file, probable non-English text
//   - spreadsheet references or errors pasted into prose, stated totals that do not add up
//   - questions addressed to the customer, duplicated table rows, typed page numbers, several dates
//   - text in otherwise numeric spreadsheet columns
// Usage: node scripts/bid/hygiene-scan.js <file> [<file> ...] [--deny <names.txt>] [--allow <names.txt>]
//                                        [--customer-template <file>[,<file>]] [--json out.json]
//   --deny   one name or phrase per line (# comments allowed); keep this list in the git-ignored bidder profile
//   --allow  names that are expected in this bid (the customer, the bidder, partners) and must not be reported
//   --customer-template  files that are the customer's own template returned filled in: their hidden sheets and
//            protection belong to the customer and are reported as INFO (leave them as received)
// Exit code 1 when a HIGH finding exists, else 0.
'use strict';
const fs = require('fs');
const path = require('path');
const { open } = require('./lib/office');
const tc = require('./lib/text-checks');

const args = process.argv.slice(2);
const files = [];
let denyFile = '';
let allowFile = '';
let jsonOut = '';
let customerTemplates = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--deny') { denyFile = args[++i]; } else if (args[i] === '--allow') { allowFile = args[++i]; }
    else if (args[i] === '--json') { jsonOut = args[++i]; }
    else if (args[i] === '--customer-template') { customerTemplates = customerTemplates.concat(args[++i].split(',').map((f) => path.resolve(f))); }
    else { files.push(args[i]); }
}
if (!files.length) {
    console.error('usage: node scripts/bid/hygiene-scan.js <file> [...] [--deny names.txt] [--allow names.txt] [--customer-template file] [--json out.json]');
    process.exit(2);
}
const readList = (f) => (f ? fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);
const allow = readList(allowFile).map((a) => a.toLowerCase());
const deny = readList(denyFile).filter((d) => !allow.includes(d.toLowerCase()));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const denyRe = deny.length ? new RegExp('(^|[^\\p{L}\\p{N}])(' + deny.map(escape).join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;

// script ranges built from code points, so the source file itself stays ASCII
const range = (a, b) => String.fromCharCode(a) + '-' + String.fromCharCode(b);
const CYRILLIC = new RegExp('[' + range(0x0400, 0x04FF) + ']+', 'g');
const GREEK = new RegExp('[' + range(0x0370, 0x03FF) + ']+', 'g');

const PLACEHOLDERS = [
    [/\bx{2,}\b/i, 'placeholder "xx"'],
    [/\b(TBD|TBC|TBA)\b/, 'TBD/TBC'],
    [/to be (revised|confirmed|completed|defined)/i, 'drafting label'],
    [/\[(INPUT REQUIRED|TO BE VALIDATED|CLARIFICATION REQUIRED|COMMERCIAL VALIDATION|DESIGN VALIDATION|REFERENCE VALIDATION|VALIDATION REQUIRED|PROPOSED|CROSS-DOCUMENT)[^\]]*\]/i, 'bid control label'],
    [/\[(client|customer|company|partner|project) name\]|<\s*(client|customer|company)( name)?\s*>|\[choose[^\]]*\]|\bRef(erence)?[.:]?\s*0{4,}\b/i, 'template placeholder'],
    [/\b(POWERPOINT|WORD|EXCEL) TEMPLATE\b/, 'template residue'],
    [/Classification:\s*\[/i, 'template residue'],
    [/\b[a-z0-9-]+\.service-now\.com\b|\bsys_id\b/i, 'instance address or sys_id'],
    [/\bN\/S\b|\bNA\s?€|\bNot provided\b/, 'placeholder residue'],
    [/\banonymous for now\b|\banatomy of the deal\b/i, 'vendor sales note or anonymisation instruction'],
    [/\bWIP\b/, '"WIP" marker'],
    [/Error! (Bookmark not defined|Reference source not found|No text of specified style)|Erreur ! (Signet non défini|Source du renvoi introuvable)|Fehler! (Textmarke nicht definiert|Verweisquelle konnte nicht gefunden werden)/i, 'broken field or cross-reference'],
    [/lorem ipsum/i, 'lorem ipsum'],
    [/\?\?\?/, '???'],
    [/\((internal|draft)\)/i, '(internal)/(draft) note'],
    [/\b(user[- ]provided|reconstruction of the supplied|created with (microsoft )?copilot|ai-generated content may be incorrect)\b/i, 'production remark'],
    [/\bdo not (send|share|distribute)\b/i, 'internal instruction']
];
const findings = [];
function add(file, sev, where, what, detail) {
    findings.push({ file: path.basename(file), sev, where, what, detail: String(detail || '').slice(0, 220) });
}
// opts.notes: speaker notes (lower severity for placeholders); opts.meta: properties or alt text (no prose checks)
function scanText(file, where, text, opts) {
    if (!text) { return; }
    opts = opts || {};
    if (denyRe) {
        denyRe.lastIndex = 0;
        const hits = new Set();
        let m;
        while ((m = denyRe.exec(text))) { hits.add(m[2]); }
        hits.forEach((h) => add(file, 'HIGH', where, 'name from the deny list', h));
    }
    PLACEHOLDERS.forEach(([re, label]) => {
        const m = re.exec(text);
        if (m) { add(file, opts.notes || opts.meta ? 'MEDIUM' : 'HIGH', where, label, text.substr(Math.max(0, m.index - 40), 120)); }
    });
    const cyr = text.match(CYRILLIC);
    if (cyr) { add(file, 'HIGH', where, 'Cyrillic text', cyr.slice(0, 5).join(' ')); }
    const grk = text.match(GREEK);
    if (grk) { add(file, 'MEDIUM', where, 'Greek text', grk.slice(0, 5).join(' ')); }
    const acc = text.match(/[àâçéèêëîïôûùüÿœæäöß]/gi);
    if (acc && acc.length >= 8 && !opts.notes) {
        add(file, 'MEDIUM', where, 'probably not English (' + acc.length + ' accented letters)', text.slice(0, 120));
    }
    const yr = tc.oldYear(text);
    if (yr) { add(file, 'LOW', where, 'old year', yr); }
    if (opts.meta || opts.notes) { return; }
    const ref = tc.cellReference(text);
    if (ref) { add(file, 'HIGH', where, 'spreadsheet residue in text', ref); }
    const ar = tc.arithmetic(text);
    if (ar) { add(file, 'MEDIUM', where, 'arithmetic', ar); }
    const q = tc.questionToCustomer(text);
    if (q) { add(file, 'MEDIUM', where, 'question to the customer (move it to the clarification log)', q); }
}
function scanAlt(file, where, alts) {
    (alts || []).forEach((a) => {
        if (/[A-Za-z]:\\|\\Users\\|\/Users\/|AppData|\.(png|jpe?g|gif|svg|emf|wmf)\b/i.test(a)) {
            add(file, 'MEDIUM', where + ' alt text', 'file path or file name in alternative text', a);
        }
        if (/\b(generated|description automatically|free logo|logo download)\b/i.test(a)) {
            add(file, 'LOW', where + ' alt text', 'generated or sourced alternative text', a);
        }
        scanText(file, where + ' alt text', a, { meta: true });
    });
}
function duplicates(file, where, rows) {
    const seen = {};
    rows.filter((r) => r && r.replace(/[\s|/]/g, '').length > 12).forEach((r) => { seen[r] = (seen[r] || 0) + 1; });
    Object.keys(seen).filter((r) => seen[r] > 1).forEach((r) => add(file, 'MEDIUM', where, 'duplicated table row (' + seen[r] + 'x)', r));
}
function scanProps(file, props) {
    Object.keys(props).forEach((k) => {
        add(file, 'INFO', 'document properties', k, props[k]);
        scanText(file, 'document properties: ' + k, props[k], { meta: true });
    });
    if (props.absPath) { add(file, 'MEDIUM', 'document properties', 'author folder path stored in the file', props.absPath); }
}
// an Office file embedded in another one travels with it in full, whatever the slide or page shows
function scanEmbedded(file, doc) {
    (doc.embeddings || []).forEach((name) => {
        if (!/\.(xlsx|xlsm|docx|pptx)$/i.test(name)) {
            add(file, 'MEDIUM', 'file', 'embedded object', name);
            return;
        }
        let e;
        try { e = open(doc.part(name)); } catch (err) { add(file, 'MEDIUM', 'file', 'embedded file (not readable)', name); return; }
        const where = 'embedded ' + path.basename(name);
        if (e.kind === 'xlsx') {
            const hidden = e.sheets.filter((s) => s.state !== 'visible').map((s) => s.name);
            add(file, 'HIGH', where, 'embedded workbook travels with the file (' + e.sheets.length + ' sheet(s)' +
                (hidden.length ? ', hidden: ' + hidden.join(', ') : '') + ')', 'sheets: ' + e.sheets.map((s) => s.name).join(', ') +
                ' - paste values or a picture instead');
            e.sheets.forEach((s) => scanText(file, where + ' sheet "' + s.name + '"', s.cells.filter((c) => c.num === null).map((c) => c.v).join('\n'), { meta: true }));
        } else {
            add(file, 'MEDIUM', where, 'embedded ' + e.kind + ' travels with the file', name);
            const t = e.kind === 'docx' ? e.blocks.map((b) => (b.type === 'table' ? b.rows.join('\n') : b.text)).join('\n')
                : e.slides.map((s) => s.text.concat(s.tables).join('\n')).join('\n');
            scanText(file, where, t, { meta: true });
        }
        scanProps(file, e.props);
    });
}

files.forEach((file) => {
    let doc;
    try { doc = open(file); } catch (e) { add(file, 'HIGH', 'file', 'cannot open', e.message); return; }
    const isCustomerTemplate = customerTemplates.includes(path.resolve(file));
    scanProps(file, doc.props);
    if (doc.kind === 'pptx') {
        const withNotes = doc.slides.filter((s) => s.notes);
        if (withNotes.length) {
            add(file, 'HIGH', 'slides ' + withNotes.map((s) => s.n).join(', '), 'speaker notes travel with the file (' + withNotes.length + ' slides)',
                'remove them or send a PDF');
        }
        doc.slides.forEach((s) => {
            const where = 'slide ' + s.n;
            if (s.hidden) { add(file, 'MEDIUM', where, 'hidden slide', s.text.slice(0, 2).join(' / ')); }
            if (s.comments) { add(file, 'HIGH', where, 'comments', s.comments + ' comment part(s)'); }
            if (s.highlights) { add(file, 'MEDIUM', where, 'highlighted text (' + s.highlights + ' run(s))', 'drafting marks'); }
            scanText(file, where, s.text.concat(s.tables, s.smartart).join('\n'));
            if (s.notes) { scanText(file, where + ' notes', s.notes, { notes: true }); }
            scanAlt(file, where, s.alt);
            duplicates(file, where, s.tables);
            if (s.text.some((t) => /^\?{1,2}$/.test(t))) { add(file, 'MEDIUM', where, 'placeholder "?" in a text box', ''); }
            // a lone number box is a typed page number; "01".."09" are section numbers on divider slides
            const nums = s.text.filter((t) => /^[1-9]\d{0,2}$/.test(t)).map(Number);
            if (nums.length === 1 && nums[0] !== s.n && nums[0] > 3) {
                add(file, 'LOW', where, 'typed page number does not match the slide position', 'shows ' + nums[0]);
            }
        });
        (doc.templateText || []).forEach((t) => scanText(file, 'layout/master ' + path.basename(t.part) + ' (slides ' +
            t.slides.slice(0, 8).join(', ') + (t.slides.length > 8 ? ', ...' : '') + ')', t.text.join('\n')));
        const dates = new Set();
        doc.slides.forEach((s) => s.text.forEach((t) => {
            const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
            if (m) { dates.add(t); }
        }));
        if (dates.size > 1) { add(file, 'LOW', 'deck', 'several different dates on slides', Array.from(dates).join(', ')); }
    } else if (doc.kind === 'xlsx') {
        if (doc.vba) { add(file, 'MEDIUM', 'workbook', 'macros (vbaProject.bin)', 'send an .xlsx without macros unless required'); }
        doc.sheets.forEach((sh) => {
            const where = 'sheet "' + sh.name + '"';
            if (sh.state !== 'visible') {
                if (isCustomerTemplate) { add(file, 'INFO', where, sh.state + ' sheet of the customer template', 'leave it as received'); }
                else { add(file, 'HIGH', where, sh.state + ' sheet', 'delete it; hiding is not removal'); }
            }
            if (sh.comments) { add(file, 'HIGH', where, 'cell comments', 'remove before sending'); }
            sh.cells.filter((c) => c.err).forEach((c) => add(file, 'HIGH', where + ' ' + c.ref, 'formula error', c.v));
            sh.cells.filter((c) => c.num === null && c.v && c.v.length > 3).forEach((c) => scanText(file, where + ' ' + c.ref, c.v));
            // text in a mostly numeric column
            const byCol = {};
            const byRow = {};
            sh.cells.forEach((c) => { (byRow[c.r] = byRow[c.r] || []).push(c); });
            // a header row holds only text: no number and no formula anywhere in it
            const headerRow = (r) => (byRow[r] || []).every((c) => c.num === null && !c.f);
            sh.cells.filter((c) => !headerRow(c.r)).forEach((c) => { (byCol[c.col] = byCol[c.col] || []).push(c); });
            Object.keys(byCol).forEach((col) => {
                const cs = byCol[col].filter((c) => c.r > 1);
                const nums = cs.filter((c) => c.num !== null || c.f).length;
                if (cs.length >= 5 && nums / cs.length >= 0.6) {
                    cs.filter((c) => c.num === null && !c.f && c.v && c.v.length <= 12 && !/total|sum|^[A-Z][a-z]/.test(c.v))
                        .forEach((c) => add(file, 'HIGH', where + ' ' + c.ref, 'text in a numeric column', c.v));
                }
            });
        });
        if (doc.externalLinks.length) { add(file, 'MEDIUM', 'workbook', 'external links', doc.externalLinks.join(', ')); }
    } else {
        if (doc.comments) { add(file, 'HIGH', 'document', 'comments', doc.comments); }
        if (doc.trackedChanges) { add(file, 'HIGH', 'document', 'tracked changes', doc.trackedChanges); }
        if (doc.hiddenText) { add(file, 'MEDIUM', 'document', 'hidden text runs', doc.hiddenText); }
        if (doc.highlights) { add(file, 'MEDIUM', 'document', 'highlighted text (' + doc.highlights + ' run(s))', 'drafting or negotiation marks'); }
        doc.blocks.forEach((b, i) => {
            if (b.type === 'table') {
                scanText(file, 'table at block ' + (i + 1), b.rows.join('\n'));
                duplicates(file, 'table at block ' + (i + 1), b.rows);
            } else {
                scanText(file, 'paragraph ' + (i + 1), b.text);
            }
        });
        (doc.headerFooter || []).forEach((h) => scanText(file, path.basename(h.part), h.text.join('\n')));
        scanAlt(file, 'document', doc.alt);
    }
    scanEmbedded(file, doc);
});

const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
// one line per place and severity: several labels on the same text are joined
const merged = [];
const seen = {};
findings.forEach((f) => {
    const k = f.file + '|' + f.where + '|' + f.sev;
    if (f.sev !== 'INFO' && seen[k]) {
        if (seen[k].what.split('; ').indexOf(f.what) < 0) { seen[k].what += '; ' + f.what; }
        return;
    }
    seen[k] = f;
    merged.push(f);
});
findings.length = 0;
merged.forEach((f) => findings.push(f));
findings.sort((a, b) => order[a.sev] - order[b.sev]);
const count = (s) => findings.filter((f) => f.sev === s).length;
console.log('hygiene scan: ' + files.length + ' file(s) | HIGH ' + count('HIGH') + ', MEDIUM ' + count('MEDIUM') + ', LOW ' + count('LOW') +
    ', INFO ' + count('INFO') + (deny.length ? ' | deny list ' + deny.length + ' name(s)' : ' | no deny list given'));
findings.forEach((f) => console.log(f.sev.padEnd(6) + ' ' + f.file + ' | ' + f.where + ' | ' + f.what + (f.detail ? ' | ' + f.detail : '')));
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(findings, null, 1)); }
process.exit(count('HIGH') ? 1 : 0);
