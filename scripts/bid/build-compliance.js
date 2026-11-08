#!/usr/bin/env node
// Builds a compliance matrix workbook from a requirements register and the bid's answers, and checks them:
// every requirement answered, statuses from the agreed vocabulary, no internal label or other customer name left in a
// client-facing answer. The internal view keeps owner and notes; --client drops them.
// Usage: node scripts/bid/build-compliance.js --register requirements.json --answers answers.json --out matrix.xlsx
//          [--client] [--title "..."] [--deny names.txt]
//   requirements.json: [{ "id", "loc", "cat", "mand", "text", "src"?, "grp"? }]   (reference/templates/bid/requirements-register.schema.json)
//   answers.json:      [{ "id", "status", "response", "assumptions"?, "evidence"?, "release"?, "owner"?, "notes"? }] or { id: {...} }
// Exit code 1 when a requirement has no answer, a status is unknown, or the client view would carry an internal label.
'use strict';
const fs = require('fs');
const path = require('path');
const { writeWorkbook } = require('./lib/xlsx-writer');

const STATUSES = ['Fully Compliant', 'Partially Compliant', 'Compliant subject to configuration',
    'Compliant subject to agreed assumption/dependency', 'Clarification Required', 'Gap Identified', 'Not Compliant'];
const INTERNAL = /\[(INPUT REQUIRED|TO BE VALIDATED|CLARIFICATION REQUIRED|INTERNAL REVIEW|SOURCE CONFLICT|COMMERCIAL VALIDATION|DESIGN VALIDATION|REFERENCE VALIDATION|CROSS-DOCUMENT CONFLICT)[^\]]*\]/i;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const regFile = opt('--register');
const ansFile = opt('--answers');
const out = opt('--out');
const client = args.includes('--client');
const title = opt('--title', 'Compliance matrix');
const denyFile = opt('--deny');
if (!regFile || !ansFile || !out) {
    console.error('usage: node scripts/bid/build-compliance.js --register requirements.json --answers answers.json --out matrix.xlsx [--client] [--title ...] [--deny names.txt]');
    process.exit(2);
}
const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
const rawAns = JSON.parse(fs.readFileSync(ansFile, 'utf8'));
const ans = Array.isArray(rawAns) ? Object.fromEntries(rawAns.map((a) => [a.id, a])) : rawAns;
const deny = denyFile ? fs.readFileSync(denyFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];

const problems = [];
const ids = new Set();
reg.forEach((r) => {
    if (!r.id || !r.text) { problems.push('register row without id or text: ' + JSON.stringify(r).slice(0, 80)); return; }
    if (ids.has(r.id)) { problems.push('duplicate requirement id ' + r.id); }
    ids.add(r.id);
    const a = ans[r.id];
    if (!a) { problems.push(r.id + ': no answer'); return; }
    if (!STATUSES.includes(a.status)) { problems.push(r.id + ': status "' + a.status + '" is not in the vocabulary'); }
    if (!a.response || !String(a.response).trim()) { problems.push(r.id + ': empty response'); }
    if (client && INTERNAL.test(String(a.response) + ' ' + String(a.assumptions || ''))) { problems.push(r.id + ': internal label in the client view'); }
    deny.forEach((d) => {
        if (new RegExp('\\b' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(String(a.response))) {
            problems.push(r.id + ': name from the deny list in the answer: ' + d);
        }
    });
});
Object.keys(ans).filter((k) => !ids.has(k)).forEach((k) => problems.push('answer for an unknown requirement ' + k));

const T = (v, s) => ({ v: v === undefined || v === null ? '' : String(v), s: s || 'txt' });
const hdr = (cols) => ({ cells: cols.map((c) => ({ v: c, s: 'hdr' })), style: 'hdr', height: 30 });
const counts = {};
reg.forEach((r) => { const s = (ans[r.id] || {}).status || '(none)'; counts[s] = (counts[s] || 0) + 1; });

const S = { name: 'Summary', widths: [48, 14], rows: [], freezeRow: 0, landscape: false };
S.rows.push({ cells: [{ v: title, s: 'title' }], style: 'def', height: 22 });
S.rows.push({ cells: [{ v: reg.length + ' requirements', s: 'note' }], style: 'def' });
S.rows.push(hdr(['Status', 'Requirements']));
STATUSES.concat(counts['(none)'] ? ['(none)'] : []).forEach((s) => S.rows.push({ cells: [T(s), { v: counts[s] || 0, s: 'num' }], style: 'txt' }));

const cols = client ? ['ID', 'Source', 'Requirement', 'Compliance status', 'Response', 'Assumptions / dependencies', 'Evidence', 'Release']
    : ['ID', 'Source', 'Category', 'Mandatory', 'Requirement', 'Compliance status', 'Response', 'Assumptions / dependencies', 'Evidence', 'Release', 'Owner', 'Internal notes'];
const M = { name: 'Compliance matrix', widths: client ? [9, 18, 60, 24, 70, 36, 40, 9] : [9, 18, 18, 9, 56, 22, 64, 32, 36, 9, 14, 40], rows: [], freezeRow: 1 };
M.rows.push(hdr(cols));
reg.forEach((r) => {
    const a = ans[r.id] || {};
    const src = (r.src ? r.src + ' ' : '') + (r.loc || '');
    const ev = Array.isArray(a.evidence) ? a.evidence.join('\n') : (a.evidence || '');
    const assume = Array.isArray(a.assumptions) ? a.assumptions.join(', ') : (a.assumptions || '');
    const row = client ? [r.id, src, r.text, a.status, a.response, assume, ev, a.release]
        : [r.id, src, r.cat, r.mand, r.text, a.status, a.response, assume, ev, a.release, a.owner, a.notes];
    M.rows.push({ cells: row.map((v, i) => T(v, i === 0 ? 'bold' : 'txt')), style: 'txt' });
});
writeWorkbook(out, [S, M], { title, author: '', date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
console.log('compliance matrix: ' + out + ' | ' + reg.length + ' requirements | ' + Object.keys(counts).map((k) => k + ' ' + counts[k]).join(', ') +
    ' | ' + (client ? 'client view' : 'internal view'));
problems.forEach((p) => console.log('!! ' + p));
process.exit(problems.length ? 1 : 0);
