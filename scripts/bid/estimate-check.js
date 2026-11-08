#!/usr/bin/env node
// Arithmetic and consistency check of an estimate workbook (.xlsx/.xlsm), whatever its layout. Sheets and rows are found
// by their content, never by fixed positions. Checks:
//   1. totals     - a row labelled Total / Grand total / Subtotal whose value differs from the sum of the data rows since
//                   the previous total or header row (SUMIF / SUMIFS / SUMPRODUCT subtotals and ratios are skipped)
//   2. text       - a text value in a mostly numeric column, or inside a summed range (SUM ignores it silently)
//   3. pattern    - a constant where the rest of the column is calculated, or a one-off formula that differs from the
//                   column's pattern (input rows referenced with an absolute row, such as rates in $15, are skipped)
//   4. stale      - a SUM whose stored result differs from the stored values it covers
//   5. coverage   - rows of a detail sheet that a summary sheet counts twice or leaves out
//   6. hygiene    - hidden sheets (checked in depth only with --all), formula errors, #REF! inside formulas, broken or
//                   stray defined names, default or copied sheet names
//   7. constants  - factors and percentages typed into formulas (PM %, OCM %, discounts), different working-day constants
//   8. unpriced   - a calculated column (cost, price, total) that leaves out an effort column the other formulas use
//   9. zero rows  - a labelled row with zero effort among rows that have effort (estimate it, or remove it)
//  10. duplicates - the same row twice in a block
//  11. scope      - rows marked as option / reference only / separate agreement that sit above a total
//  12. links      - a payment schedule typed in, with no link to the estimate; totals that ignore an autofilter
//  13. text cells - spreadsheet references, internal notes, unpriced obligations and wrong arithmetic in the scope,
//                   assumption and deliverable text that is pasted into customer documents
//  14. contingency - no contingency or risk-reserve line anywhere in the workbook
// Usage: node scripts/bid/estimate-check.js <workbook.xlsx> [--all] [--json out.json]
'use strict';
const fs = require('fs');
const { open } = require('./lib/office');
const tc = require('./lib/text-checks');

const args = process.argv.slice(2);
if (!args.length) { console.error('usage: node scripts/bid/estimate-check.js <workbook.xlsx> [--all] [--json out.json]'); process.exit(2); }
const file = args[0];
const all = args.includes('--all');
const jsonIx = args.indexOf('--json');
let doc;
try { doc = open(file); } catch (e) { console.error('cannot open: ' + e.message); process.exit(2); }
if (doc.kind !== 'xlsx') { console.error('not a workbook: ' + file); process.exit(2); }

const findings = [];
const add = (sev, where, what, detail) => findings.push({ sev, where, what, detail: String(detail || '') });
const colNum = (c) => { let n = 0; for (let i = 0; i < c.length; i++) { n = n * 26 + (c.charCodeAt(i) - 64); } return n; };
const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const round = (n) => Math.round(n * 100) / 100;
const isTotalLabel = (v) => v.length <= 40 && (/^\s*(grand\s+)?(sub-?)?total\b/i.test(v) || /\b(grand\s+total|sub-?total|total)\s*:?\s*$/i.test(v));
// Greek and Cyrillic, built from code points so the source file itself stays ASCII
const NON_LATIN = new RegExp('[' + String.fromCharCode(0x0370) + '-' + String.fromCharCode(0x03FF) +
    String.fromCharCode(0x0400) + '-' + String.fromCharCode(0x04FF) + ']');
const MONEY = /\b(cost|price|amount|value|revenue|fee|eur|usd|chf|gbp)\b|€|\$|£/i;
const sheetBy = {};
doc.sheets.forEach((sh) => {
    const at = {};
    sh.cells.forEach((c) => { at[c.ref] = c; });
    sheetBy[sh.name] = { sh, at };
});
// formula text without string literals and without references to other sheets
const bareFormula = (f) => f.replace(/"[^"]*"/g, '""').replace(/(?:'[^']+'|[A-Za-z0-9_.]+)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/g, 'X');

// absolute row anchors (C$15) mark input rows such as rates
const anchoredRows = {};
doc.sheets.forEach((sh) => sh.cells.forEach((c) => {
    if (!c.f) { return; }
    const re = /(?:'([^']+)'!|([A-Za-z0-9_]+)!)?\$?[A-Z]{1,3}\$(\d+)/g;
    let m;
    while ((m = re.exec(c.f))) {
        const s = m[1] || m[2] || sh.name;
        (anchoredRows[s] = anchoredRows[s] || {})[Number(m[3])] = true;
    }
}));

// 6. workbook-level hygiene
doc.definedNames.forEach((d) => {
    if (/#REF!/.test(d)) { add('MEDIUM', 'defined name', 'broken defined name (#REF!)', d); }
    else if (/^_(Toc|Hlk|Ref)\d+=/i.test(d)) { add('LOW', 'defined name', 'stray bookmark copied from a Word document', d); }
});
doc.sheets.forEach((sh) => {
    if (/^(Sheet|Feuil|Hoja|Tabelle|Foglio|Planilha)\d+$|\(\d+\)$|^Copy of /i.test(sh.name)) {
        add('LOW', 'sheet "' + sh.name + '"', 'default or copied sheet name: a leftover?', 'name the sheet, or remove it if it is not part of the estimate');
    }
});

const workingDays = {};
let contingencyFound = false;
doc.sheets.forEach((sh) => {
    const name = sh.name;
    if (sh.state !== 'visible') {
        add('HIGH', 'sheet "' + name + '"', sh.state + ' sheet in the estimate', 'remove it from the copy that goes out' + (all ? '' : ' (not checked in depth; use --all)'));
        if (!all) {
            if (sh.cells.some((c) => c.num === null && /contingenc|risk reserve|management reserve/i.test(c.v))) { contingencyFound = true; }
            return;
        }
    }
    const { at } = sheetBy[name];
    sh.cells.filter((c) => c.err).forEach((c) => add('HIGH', name + '!' + c.ref, 'formula error', c.v));
    sh.cells.filter((c) => c.f && /#REF!/.test(c.f)).forEach((c) => add('HIGH', name + '!' + c.ref, 'broken reference inside the formula', c.f));
    if (sh.cells.some((c) => c.num === null && /contingenc|risk reserve|management reserve|risk buffer/i.test(c.v))) { contingencyFound = true; }
    const rows = {};
    sh.cells.forEach((c) => { (rows[c.r] = rows[c.r] || []).push(c); });
    const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const isTotalRow = (r) => (rows[r] || []).some((c) => c.num === null && !c.f && c.c <= 3 && isTotalLabel(c.v));
    const isHeaderRow = (r) => (rows[r] || []).every((c) => c.num === null && !c.f);
    const label = (r) => ((rows[r] || []).filter((c) => c.num === null && !c.f && c.v && c.c <= 4).map((c) => c.v).join(' / ') || '').slice(0, 60);
    const stats = {};
    sh.cells.forEach((c) => {
        if (isHeaderRow(c.r) || isTotalRow(c.r)) { return; }
        stats[c.col] = stats[c.col] || { n: 0, all: 0 };
        stats[c.col].all++;
        if (c.num !== null || c.f) { stats[c.col].n++; }
    });
    const numeric = Object.keys(stats).filter((k) => stats[k].all >= 3 && stats[k].n / stats[k].all >= 0.6);
    // header text of a column: the nearest header row above the given row
    const headerOf = (col, r) => {
        for (let q = r - 1; q >= 1; q--) {
            if (isHeaderRow(q)) { const h = at[col + q]; if (h && h.v) { return h.v; } }
        }
        return '';
    };

    // 2. text in a numeric column: non-Latin text always; short codes (no space, up to 6 characters) as MEDIUM
    sh.cells.filter((c) => numeric.includes(c.col) && c.num === null && !c.f && c.v && !isHeaderRow(c.r) && !isTotalRow(c.r) &&
        !isTotalLabel(c.v)).forEach((c) => {
        if (NON_LATIN.test(c.v)) { add('HIGH', name + '!' + c.ref, 'non-Latin text in a numeric column (counts as 0)', c.v); }
        else if (c.v.length <= 6 && !/\s/.test(c.v)) { add('MEDIUM', name + '!' + c.ref, 'text in a numeric column (counts as 0)', c.v); }
    });

    // blocks of rows: a block ends at a header row or a gap of empty rows
    const blockOf = {};
    let block = 0;
    let prev = -1;
    rowNums.forEach((r) => {
        if (isHeaderRow(r) || (prev > -1 && r - prev > 1)) { block++; }
        blockOf[r] = block;
        prev = r;
    });
    const blockRows = {};
    rowNums.filter((r) => !isHeaderRow(r) && !isTotalRow(r)).forEach((r) => { (blockRows[blockOf[r]] = blockRows[blockOf[r]] || []).push(r); });

    // 3. pattern per numeric column, within each block
    const blocks = {};
    numeric.forEach((col) => sh.cells.filter((c) => c.col === col && !isHeaderRow(c.r) && !isTotalRow(c.r))
        .forEach((c) => { (blocks[col + '|' + blockOf[c.r]] = blocks[col + '|' + blockOf[c.r]] || []).push(c); }));
    Object.keys(blocks).forEach((bk) => {
        const cells = blocks[bk];
        if (cells.length < 3 || cells.some((c) => c.f && c.f.indexOf('[') > -1)) { return; }
        const pats = {};
        cells.forEach((c) => {
            c.pat = c.f ? c.f.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (m, a, abs, r) => a + abs + (abs ? r : (Number(r) === c.r ? '#' : '[' + (Number(r) - c.r) + ']'))) : null;
            if (c.pat) { pats[c.pat] = (pats[c.pat] || 0) + 1; }
        });
        const keys = Object.keys(pats).sort((a, b) => pats[b] - pats[a]);
        if (!keys.length) { return; }
        const main = keys[0];
        if (pats[main] < 3 || cells.filter((c) => c.f).length / cells.length < 0.6) { return; }
        const show = (r) => main.replace(/#/g, String(r)).replace(/\[(-?\d+)\]/g, (m, d) => String(r + Number(d)));
        cells.forEach((c) => {
            if ((anchoredRows[name] || {})[c.r]) { return; }
            if (!c.f && c.num !== null) {
                add('HIGH', name + '!' + c.ref, 'constant where the column is calculated', 'value ' + c.num + '; the other rows use ' + show(c.r));
            } else if (c.pat && c.pat !== main && pats[c.pat] === 1) {
                add('MEDIUM', name + '!' + c.ref, 'one-off formula in the column', c.f + ' (the other rows use ' + show(c.r) + ')');
            }
        });
    });

    // 1. totals vs the rows above them (a block starts after a header row, a total row or an empty row)
    let blockStart = rowNums.length ? rowNums[0] : 1;
    const totalRows = [];
    let prevRow = -1;
    rowNums.forEach((r) => {
        if (prevRow > -1 && r - prevRow > 1) { blockStart = r; }
        prevRow = r;
        if (isHeaderRow(r)) { blockStart = r + 1; return; }
        if (!isTotalRow(r)) { return; }
        totalRows.push(r);
        (rows[r] || []).filter((c) => numeric.includes(c.col) && c.num !== null).forEach((c) => {
            // subtotals by category and ratios (shares, averages) are not additive
            if (c.f && (/SUMIFS?\(|SUMPRODUCT\(|COUNTIF|AVERAGE/i.test(c.f) || c.f.indexOf('/') > -1)) { return; }
            let sum = 0;
            let used = 0;
            for (let q = blockStart; q < r; q++) {
                if (isTotalRow(q) || isHeaderRow(q)) { continue; }
                const d = at[c.col + q];
                if (d && d.num !== null) { sum += d.num; used++; }
            }
            if (used >= 2 && Math.abs(round(sum) - round(c.num)) > 0.01) {
                add('HIGH', name + '!' + c.ref, 'total differs from the sum of its rows', 'shows ' + round(c.num) + ', rows ' + blockStart + '-' + (r - 1) +
                    ' add up to ' + round(sum) + ' (difference ' + round(c.num - sum) + ')' + (c.f ? '; formula ' + c.f : '; typed value'));
            }
        });
        blockStart = r + 1;
    });

    // 4. stale SUMs and text inside summed ranges
    sh.cells.filter((c) => c.f && /^SUM\(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+\)$/i.test(c.f.trim())).forEach((c) => {
        const m = /^SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)$/i.exec(c.f.trim());
        const c1 = colNum(m[1].toUpperCase()), r1 = Number(m[2]), c2 = colNum(m[3].toUpperCase()), r2 = Number(m[4]);
        let sum = 0;
        const texts = [];
        sh.cells.forEach((d) => {
            if (d.c < c1 || d.c > c2 || d.r < r1 || d.r > r2) { return; }
            if (d.num !== null) { sum += d.num; } else if (!d.f && d.v && d.v.length <= 15 && numeric.includes(d.col)) { texts.push(d.ref + '="' + d.v + '"'); }
        });
        if (texts.length) { add('HIGH', name + '!' + c.ref, 'text inside a summed range is ignored', c.f + ': ' + texts.join(', ')); }
        if (c.num !== null && Math.abs(round(sum) - round(c.num)) > 0.01) {
            add('MEDIUM', name + '!' + c.ref, 'stored SUM result differs from its range', 'stored ' + round(c.num) + ', range ' + round(sum));
        }
    });

    // 7. constants typed into formulas
    const factors = {};
    sh.cells.filter((c) => c.f && c.f !== '=shared').forEach((c) => {
        const f = bareFormula(c.f);
        const re = /(?<![A-Za-z$_.\d])(\d+(?:\.\d+)?)(%?)(?![\d.]*[A-Za-z_(])/g;
        let m;
        while ((m = re.exec(f))) {
            const before = f.slice(0, m.index).replace(/\s+$/, '');
            const v = Number(m[1]);
            if (m[2] === '%' || (m[1].indexOf('.') > -1 && v !== 0 && v !== 1)) {
                const k = m[1] + m[2];
                (factors[k] = factors[k] || []).push(c.ref);
            }
            const after = f.slice(m.index + m[0].length);
            if (!m[2] && m[1].indexOf('.') < 0 && v >= 18 && v <= 23 && (/[*/]$/.test(before) || /^\s*[*/]/.test(after))) {
                (workingDays[v] = workingDays[v] || []).push(name + '!' + c.ref);
            }
        }
    });
    Object.keys(factors).forEach((k) => add('MEDIUM', name + ' (' + factors[k].length + ' formula(s))', 'factor typed into formulas: ' + k,
        factors[k].slice(0, 6).join(', ') + (factors[k].length > 6 ? ', ...' : '') + ' - put it in one labelled input cell'));
    sh.cells.filter((c) => c.num !== null && !c.f && c.num >= 18 && c.num <= 23).forEach((c) => {
        const lbl = (rows[c.r] || []).filter((d) => d.num === null && d.v).map((d) => d.v).join(' ');
        if (/working days|days per month|days\/month/i.test(lbl)) { (workingDays[c.num] = workingDays[c.num] || []).push(name + '!' + c.ref); }
    });

    // 8. calculated columns that leave out an effort column the other formulas of the block use
    Object.keys(blockRows).forEach((b) => {
        const rs = blockRows[b];
        if (rs.length < 2) { return; }
        const inputCols = numeric.filter((col) => {
            const cs = rs.map((r) => at[col + r]).filter(Boolean);
            const consts = cs.filter((c) => !c.f && c.num !== null);
            return consts.length >= 1 && consts.length / cs.length >= 0.6 && consts.some((c) => c.num !== 0);
        });
        if (inputCols.length < 3) { return; }
        const used = {};
        rs.forEach((r) => (rows[r] || []).filter((c) => c.f && c.f !== '=shared').forEach((c) => {
            const f = bareFormula(c.f);
            const set = (used[c.col] = used[c.col] || new Set());
            const rr = /\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;
            let m;
            while ((m = rr.exec(f))) {
                const r1 = Number(m[2]);
                const r2 = m[4] ? Number(m[4]) : r1;
                if (r1 !== r || r2 !== r) { continue; }
                const c1 = colNum(m[1]);
                const c2 = m[3] ? colNum(m[3]) : c1;
                for (let k = Math.min(c1, c2); k <= Math.max(c1, c2); k++) { if (inputCols.includes(colName(k))) { set.add(colName(k)); } }
            }
        }));
        const sets = Object.keys(used).filter((k) => used[k].size >= 2);
        if (sets.length < 2) { return; }
        const widest = sets.reduce((a, k) => (used[k].size > used[a].size ? k : a), sets[0]);
        sets.filter((k) => k !== widest && Array.from(used[k]).every((q) => used[widest].has(q)) && used[k].size < used[widest].size).forEach((k) => {
            const missing = Array.from(used[widest]).filter((q) => !used[k].has(q));
            const head = headerOf(k, rs[0]);
            add(MONEY.test(head) ? 'HIGH' : 'MEDIUM', name + '!' + k + rs[0] + ':' + k + rs[rs.length - 1],
                'calculated column "' + (head || k) + '" leaves out ' + missing.map((q) => q + (headerOf(q, rs[0]) ? ' "' + headerOf(q, rs[0]) + '"' : '')).join(', '),
                'column ' + widest + (headerOf(widest, rs[0]) ? ' "' + headerOf(widest, rs[0]) + '"' : '') + ' uses ' + Array.from(used[widest]).join(', ') +
                '; check whether that effort is meant to be left out');
        });
    });

    // 9 and 10. zero rows and duplicated rows
    Object.keys(blockRows).forEach((b) => {
        const rs = blockRows[b];
        const vals = (r) => numeric.map((col) => at[col + r]).filter((c) => c && c.num !== null);
        const withEffort = rs.filter((r) => vals(r).some((c) => c.num !== 0));
        if (withEffort.length >= 2) {
            rs.filter((r) => label(r) && vals(r).length && vals(r).every((c) => c.num === 0)).forEach((r) =>
                add('MEDIUM', name + '!row ' + r, 'labelled row with zero effort', '"' + label(r) + '" - estimate it, mark it excluded, or remove it from customer tables'));
        }
        const sig = {};
        withEffort.forEach((r) => {
            const s = label(r) + '|' + vals(r).map((c) => round(c.num)).join(',');
            (sig[s] = sig[s] || []).push(r);
        });
        Object.keys(sig).filter((s) => sig[s].length > 1 && s.split('|')[0]).forEach((s) =>
            add('MEDIUM', name + '!rows ' + sig[s].join(', '), 'duplicated row', '"' + s.split('|')[0] + '"'));
    });

    // 11. option / reference-only rows above a total
    if (totalRows.length) {
        rowNums.filter((r) => !isHeaderRow(r) && !isTotalRow(r)).forEach((r) => {
            const txt = (rows[r] || []).filter((c) => c.num === null && c.v).map((c) => c.v).join(' ');
            const m = /for reference(?: purposes)?(?: only)?|reference only|subject (?:of|to) a separate (?:agreement|offer)|\boptional\b|\(option\)|indicative only/i.exec(txt);
            if (m && numeric.some((col) => at[col + r] && at[col + r].num)) {
                if (totalRows.some((t) => t > r)) {
                    add('MEDIUM', name + '!row ' + r, 'row marked "' + m[0] + '" has effort above a total', '"' + label(r) + '" - keep options and reference-only effort outside the base total');
                }
            }
        });
    }

    // 12. payment schedule typed in; totals under an autofilter
    if (/payment|milestone|invoic|instal/i.test(name)) {
        const consts = sh.cells.filter((c) => c.num !== null && !c.f && c.num > 31).length;
        const linked = sh.cells.some((c) => c.f && /!/.test(c.f));
        if (consts >= 3 && !linked) { add('MEDIUM', 'sheet "' + name + '"', 'payment schedule typed in, not linked to the estimate', consts + ' typed amounts and no reference to another sheet'); }
    }
    if (sh.autoFilter && totalRows.some((r) => (rows[r] || []).some((c) => c.f && /^SUM\(/i.test(c.f)))) {
        add('LOW', 'sheet "' + name + '"', 'totals use SUM under an autofilter (' + sh.autoFilter + ')', 'a filtered view still shows the full total; use SUBTOTAL(109, ...) or keep totals outside the filter');
    }

    // 13. text cells that are pasted into customer documents
    sh.cells.filter((c) => c.num === null && !c.f && c.v && c.v.length > 3).forEach((c) => {
        const where = name + '!' + c.ref;
        if (/\(internal\)|\binternal (note|only)\b/i.test(c.v)) { add('HIGH', where, 'internal note in a text cell (text columns are pasted into customer documents)', c.v.slice(0, 160)); }
        const ref = tc.cellReference(c.v);
        if (ref) { add('MEDIUM', where, 'spreadsheet residue in text', ref); }
        const ar = tc.arithmetic(c.v);
        if (ar) { add('MEDIUM', where, 'arithmetic in text', ar); }
        if (/\bunquantified\b|\bnot (?:yet )?(?:priced|estimated|quantified)\b/i.test(c.v)) { add('MEDIUM', where, 'obligation mentioned as unpriced', c.v.slice(0, 160)); }
    });
});

const wd = Object.keys(workingDays);
if (wd.length > 1) {
    add('MEDIUM', 'workbook', 'different working-day constants: ' + wd.join(', '), wd.map((k) => k + ' in ' + workingDays[k].slice(0, 3).join(', ')).join('; ') +
        ' - use one planning constant');
}
if (!contingencyFound) { add('MEDIUM', 'workbook', 'no contingency or risk-reserve line', 'required for a fixed price; for time and materials, say so in the assumptions'); }

// 5. coverage of a detail sheet by a summary sheet
const cover = {};
doc.sheets.forEach((sh) => sh.cells.forEach((c) => {
    if (!c.f) { return; }
    const re = /(?:'([^']+)'|([A-Za-z0-9_ ]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?/g;
    let m;
    while ((m = re.exec(c.f))) {
        const target = (m[1] || m[2] || '').trim();
        if (!sheetBy[target] || target === sh.name) { continue; }
        const col = m[3];
        const a = Number(m[4]);
        const b = m[6] ? Number(m[6]) : a;
        const key = sh.name + ' -> ' + target + '!' + col;
        cover[key] = cover[key] || { rows: {}, target, col };
        for (let r = a; r <= b; r++) { (cover[key].rows[r] = cover[key].rows[r] || []).push(c.ref); }
    }
}));
Object.keys(cover).forEach((k) => {
    const e = cover[k];
    const referenced = Object.keys(e.rows).map(Number);
    if (referenced.length < 3) { return; }
    const tgt = sheetBy[e.target];
    const lo = Math.min(...referenced);
    const hi = Math.max(...referenced);
    const lbl = (r) => tgt.sh.cells.filter((c) => c.r === r && c.c <= 3 && c.num === null).map((c) => c.v).join(' ');
    // a summary built on subtotal rows (phase totals, grand total) is checked by the totals check, not row by row
    const subtotal = (r) => { const c = tgt.at[e.col + r]; return (c && c.f && /^(SUM|SUBTOTAL)\(/i.test(c.f.trim())) || isTotalLabel(lbl(r)); };
    if (referenced.filter(subtotal).length * 2 >= referenced.length) { return; }
    const valued = tgt.sh.cells.filter((c) => c.col === e.col && c.num !== null && c.r >= lo && c.r <= hi && !isTotalLabel(lbl(c.r)))
        .map((c) => c.r);
    const twice = referenced.filter((r) => e.rows[r].length > 1);
    const missing = valued.filter((r) => !e.rows[r]);
    if (twice.length) { add('HIGH', k, 'rows counted twice by the summary', twice.map((r) => r + ' (' + e.rows[r].join(' + ') + ')').join(', ')); }
    if (missing.length) { add('HIGH', k, 'rows left out of the summary', missing.join(', ')); }
});

const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev]);
const n = (s) => findings.filter((f) => f.sev === s).length;
console.log('estimate check: ' + file + ' | sheets ' + doc.sheets.map((s) => s.name + (s.state !== 'visible' ? ' (' + s.state + ')' : '')).join(', ') +
    ' | HIGH ' + n('HIGH') + ', MEDIUM ' + n('MEDIUM') + ', LOW ' + n('LOW'));
findings.forEach((f) => console.log(f.sev.padEnd(6) + ' ' + f.where + ' | ' + f.what + (f.detail ? ' | ' + f.detail : '')));
if (jsonIx > -1 && args[jsonIx + 1]) { fs.writeFileSync(args[jsonIx + 1], JSON.stringify(findings, null, 1)); }
process.exit(n('HIGH') ? 1 : 0);
