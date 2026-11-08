#!/usr/bin/env node
// Cross-document fact scan for a bid package: collects the facts that must be the same in every document and shows
// where they differ. A red-team aid, not a verdict: the reviewer decides whether two values really conflict.
//   durations  - "2 weeks of hypercare", "six-month pilot", "Hypercare (weeks) | 4" in a workbook
//   effort     - man-days, person-days, FTE
//   counts     - "12 markets", "3 legal entities", "up to 5 reports", "two go-lives"
//   percents   - contingency, PM, discount, OCM
//   money      - amounts with a currency (internal view)
//   dates      - every distinct date
// A group whose values differ is marked CHECK. Subjects come from a built-in list plus --terms (one per line).
// Usage: node scripts/bid/fact-scan.js <file> [<file> ...] [--terms terms.txt] [--notes] [--all] [--md out.md] [--json out.json]
//   --notes  include speaker notes      --all  include hidden sheets and slides
'use strict';
const fs = require('fs');
const path = require('path');
const { open } = require('./lib/office');
const { num, WORDS } = require('./lib/text-checks');

const args = process.argv.slice(2);
const files = [];
let termsFile = '';
let mdOut = '';
let jsonOut = '';
const withNotes = args.includes('--notes');
const withHidden = args.includes('--all');
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--terms') { termsFile = args[++i]; } else if (args[i] === '--md') { mdOut = args[++i]; }
    else if (args[i] === '--json') { jsonOut = args[++i]; } else if (!/^--/.test(args[i])) { files.push(args[i]); }
}
if (!files.length) {
    console.error('usage: node scripts/bid/fact-scan.js <file> [...] [--terms terms.txt] [--notes] [--all] [--md out.md] [--json out.json]');
    process.exit(2);
}

const SUBJECTS = ['hypercare', 'warranty', 'validity', 'pilot', 'mvp', 'phase 1', 'phase 2', 'phase 3', 'release 1', 'release 2', 'wave',
    'go-live', 'go live', 'golive', 'uat', 'sit', 'testing', 'training', 'mobilisation', 'mobilization', 'discovery', 'design', 'build',
    'roll-out', 'rollout', 'implementation', 'project', 'programme', 'program', 'contract', 'payment', 'contingency', 'project management',
    'pm', 'ocm', 'change management', 'support', 'sprint', 'iteration', 'licence', 'license', 'subscription', 'discount', 'travel', 'total',
    'duration', 'timeline', 'kick-off', 'kickoff', 'onboarding', 'migration', 'integration', 'cutover', 'cut-over', 'handover', 'stabilisation']
    .concat(termsFile ? fs.readFileSync(termsFile, 'utf8').split(/\r?\n/).map((t) => t.trim().toLowerCase()).filter((t) => t && !t.startsWith('#')) : []);
const COUNT_NOUNS = [['markets?', 'market'], ['countr(?:y|ies)', 'country'], ['languages?', 'language'], ['sites?', 'site'], ['stores?', 'store'],
    ['locations?', 'location'], ['users?', 'user'], ['agents?', 'agent'], ['fulfill?ers?', 'fulfiller'], ['licen[cs]es?', 'licence'],
    ['integrations?', 'integration'], ['interfaces?', 'interface'], ['case types?', 'case type'], ['templates?', 'template'],
    ['reports?', 'report'], ['dashboards?', 'dashboard'], ['kpis?', 'KPI'], ['phases?', 'phase'], ['waves?', 'wave'], ['releases?', 'release'],
    ['go-lives?', 'go-live'], ['sprints?', 'sprint'], ['workshops?', 'workshop'], ['sessions?', 'session'], ['scenarios?', 'scenario'],
    ['consultants?', 'consultant'], ['personas?', 'persona'], ['playbooks?', 'playbook'], ['use cases?', 'use case'],
    ['catalog(?:ue)? items?', 'catalogue item'], ['record producers?', 'record producer'], ['workflows?', 'workflow'],
    ['notifications?', 'notification'], ['slas?', 'SLA'], ['legal entit(?:y|ies)', 'legal entity'], ['entit(?:y|ies)', 'entity'],
    ['accounts?', 'account'], ['brands?', 'brand'], ['channels?', 'channel'], ['portals?', 'portal'], ['modules?', 'module'],
    ['service lines?', 'service line'], ['products?', 'product'], ['environments?', 'environment'], ['instances?', 'instance'],
    ['ai agents?', 'AI agent'], ['skills?', 'skill'], ['topics?', 'topic'], ['surveys?', 'survey'], ['atf tests?', 'ATF test'],
    ['regions?', 'region'], ['business units?', 'business unit'], ['departments?', 'department'], ['ftes?', 'FTE']];
const NUMBER = '(\\d{1,3}(?:[,\\s]\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?|' + Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|') + ')';
const DUR_UNITS = { day: 1, days: 1, week: 7, weeks: 7, month: 30.4, months: 30.4, year: 365, years: 365, wk: 7, wks: 7, mth: 30.4, mths: 30.4 };
// "2 (two) weeks": a number word in brackets after the figure is skipped
const PAREN = '(?:\\s*\\(\\s*[a-z-]+\\s*\\))?';
const reDuration = new RegExp('\\b' + NUMBER + PAREN + '[\\s-]*(calendar[\\s-]+|working[\\s-]+|business[\\s-]+)?(days?|weeks?|wks?|months?|mths?|years?)\\b', 'gi');
const reEffort = new RegExp('\\b' + NUMBER + PAREN + '\\s*(man[\\s-]?days?|person[\\s-]?days?|md|pd|mds|ftes?)\\b', 'gi');
const rePercent = /(\d+(?:[.,]\d+)?)\s?%/g;
const reMoney = /(?:(€|EUR|USD|US\$|\$|£|GBP|CHF|BGN)\s?(\d[\d.,\s]*\d|\d)(\s?(?:k|m|mn|million|thousand))?|(\d[\d.,\s]*\d|\d)(\s?(?:k|m|mn|million|thousand))?\s?(€|EUR|USD|GBP|CHF|BGN)\b)/gi;
const reDate = /\b(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|Q[1-4]\s?\d{4})\b/g;
const reCount = new RegExp('\\b' + NUMBER + PAREN + '\\s+(?:[A-Za-z][\\w-]*\\s+){0,2}?(' + COUNT_NOUNS.map((n) => n[0]).join('|') + ')\\b', 'gi');

const facts = [];
// the subject nearest to a match: the last keyword before it in the segment, else the first one after it
function subjectOf(seg, index, length) {
    const low = seg.toLowerCase();
    let best = null;
    let bestDist = 1e9;
    SUBJECTS.forEach((s) => {
        const re = new RegExp('(^|[^a-z0-9])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])', 'g');
        let m;
        while ((m = re.exec(low))) {
            const pos = m.index + m[1].length;
            const dist = pos < index ? index - (pos + s.length) : pos - (index + length);
            const weight = pos < index ? dist : dist * 1.5;
            if (dist <= 80 && weight < bestDist) { bestDist = weight; best = s; }
        }
    });
    return best || '(no subject)';
}
function push(type, subject, value, norm, file, where, seg, index) {
    facts.push({ type, subject, value, norm, file: path.basename(file), where,
        context: seg.slice(Math.max(0, index - 50), index + 70).replace(/\s+/g, ' ').trim() });
}
function scanSegment(file, where, seg) {
    if (!seg || seg.length < 3) { return; }
    let m;
    reDuration.lastIndex = 0;
    while ((m = reDuration.exec(seg))) {
        const n = num(m[1]);
        if (n === null || n > 400) { continue; }
        const unit = m[3].toLowerCase();
        const kind = (m[2] || '').trim().toLowerCase();
        const norm = kind.startsWith('working') || kind.startsWith('business') ? n * 7 / 5 : n * (DUR_UNITS[unit] || 1);
        push('duration', subjectOf(seg, m.index, m[0].length), m[0].trim(), Math.round(norm * 10) / 10, file, where, seg, m.index);
    }
    reEffort.lastIndex = 0;
    while ((m = reEffort.exec(seg))) {
        const n = num(m[1].replace(/[,\s](?=\d{3}\b)/g, ''));
        if (n === null) { continue; }
        push(/fte/i.test(m[2]) ? 'FTE' : 'effort', subjectOf(seg, m.index, m[0].length), m[0].trim(), n, file, where, seg, m.index);
    }
    rePercent.lastIndex = 0;
    while ((m = rePercent.exec(seg))) {
        push('percent', subjectOf(seg, m.index, m[0].length), m[0].trim(), Number(m[1].replace(',', '.')), file, where, seg, m.index);
    }
    reMoney.lastIndex = 0;
    while ((m = reMoney.exec(seg))) {
        const raw = (m[2] || m[4] || '').replace(/\s/g, '');
        const scale = /m|mn|million/i.test(m[3] || m[5] || '') ? 1e6 : /k|thousand/i.test(m[3] || m[5] || '') ? 1e3 : 1;
        const n = Number(raw.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')) * scale;
        if (isNaN(n)) { continue; }
        push('money', subjectOf(seg, m.index, m[0].length), m[0].trim(), n, file, where, seg, m.index);
    }
    reDate.lastIndex = 0;
    while ((m = reDate.exec(seg))) { push('date', 'date', m[1], m[1], file, where, seg, m.index); }
    reCount.lastIndex = 0;
    while ((m = reCount.exec(seg))) {
        const n = num(m[1].replace(/[,\s](?=\d{3}\b)/g, ''));
        if (n === null || n > 100000 || (n >= 1900 && n <= 2100)) { continue; }
        const noun = COUNT_NOUNS.find((q) => new RegExp('^(?:' + q[0] + ')$', 'i').test(m[2]));
        push('count', noun ? noun[1] : m[2].toLowerCase(), m[0].trim(), n, file, where, seg, m.index);
    }
}
// a workbook number whose row label or column header names a subject and a unit: "Hypercare | weeks | 4"
function scanCellFacts(file, sh) {
    const rows = {};
    sh.cells.forEach((c) => { (rows[c.r] = rows[c.r] || []).push(c); });
    const isHeader = (r) => (rows[r] || []).every((c) => c.num === null && !c.f);
    const header = (c) => {
        for (let q = c.r - 1; q >= 1; q--) {
            if (isHeader(q)) { const h = (rows[q] || []).find((d) => d.col === c.col); if (h && h.v) { return h.v; } }
        }
        return '';
    };
    // the subject must be in the row label; the unit in the label or the column header; per-role columns are left out
    // (only totals and single-value rows are comparable with what the documents state)
    sh.cells.filter((c) => c.num !== null && !isHeader(c.r)).forEach((c) => {
        const label = (rows[c.r] || []).filter((d) => d.num === null && d.v && d.c < c.c).map((d) => d.v).join(' ').slice(0, 80);
        const low = label.toLowerCase();
        if (!low || /\b(rate|price|cost|amount|value|revenue)\b|€|\$|£/.test(low)) { return; }
        const subj = SUBJECTS.find((s) => new RegExp('(^|[^a-z0-9])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])').test(low));
        if (!subj) { return; }
        const head = header(c).toLowerCase();
        const unitRe = /\b(weeks?|months?|days?|man[\s-]?days?|md|person[\s-]?days?|fte)\b|%/;
        const u = unitRe.exec(low) || (/total|duration|length|overall/.test(head) || !head ? unitRe.exec(head) : null);
        if (!u) { return; }
        const unit = u[0].toLowerCase();
        const v = Math.round(c.num * 100) / 100;
        const where = 'sheet "' + sh.name + '" ' + c.ref;
        const base = { subject: subj, file: path.basename(file), where, context: label };
        if (/man|md|person/.test(unit)) { facts.push(Object.assign({ type: 'effort', value: v + ' md', norm: v }, base)); }
        else if (/fte/.test(unit)) { facts.push(Object.assign({ type: 'FTE', value: v + ' FTE', norm: v }, base)); }
        else if (unit === '%') {
            const pct = c.num <= 1 ? Math.round(c.num * 10000) / 100 : v;
            facts.push(Object.assign({ type: 'percent', value: pct + '%', norm: pct }, base));
        } else {
            const d = c.num * (DUR_UNITS[unit] || 1);
            facts.push(Object.assign({ type: 'duration', value: v + ' ' + unit, norm: Math.round(d * 10) / 10 }, base));
        }
    });
}

files.forEach((file) => {
    let doc;
    try { doc = open(file); } catch (e) { console.error('skipped ' + file + ': ' + e.message); return; }
    if (doc.kind === 'pptx') {
        doc.slides.filter((s) => withHidden || !s.hidden).forEach((s) => {
            const where = 'slide ' + s.n;
            s.text.concat(s.tables, s.smartart).forEach((t) => scanSegment(file, where, t));
            if (withNotes && s.notes) { scanSegment(file, where + ' notes', s.notes); }
        });
    } else if (doc.kind === 'docx') {
        doc.blocks.forEach((b, i) => {
            if (b.type === 'table') { b.rows.forEach((r) => scanSegment(file, 'table at block ' + (i + 1), r)); }
            else { scanSegment(file, 'paragraph ' + (i + 1), b.text); }
        });
        (doc.headerFooter || []).forEach((h) => h.text.forEach((t) => scanSegment(file, path.basename(h.part), t)));
    } else {
        doc.sheets.filter((s) => withHidden || s.state === 'visible').forEach((sh) => {
            sh.cells.filter((c) => c.num === null && c.v && c.v.length > 3).forEach((c) => scanSegment(file, 'sheet "' + sh.name + '" ' + c.ref, c.v));
            scanCellFacts(file, sh);
        });
    }
});

// group and flag
const groups = {};
facts.forEach((f) => {
    const k = f.type + '|' + f.subject;
    (groups[k] = groups[k] || []).push(f);
});
const differs = (fs2) => {
    if (fs2[0].type === 'date') { return new Set(fs2.map((f) => f.norm)).size > 1; }
    const vals = Array.from(new Set(fs2.map((f) => f.norm))).sort((a, b) => a - b);
    return vals.length > 1 && (vals[vals.length - 1] - vals[0]) / Math.max(Math.abs(vals[vals.length - 1]), 1e-9) > 0.05;
};
const TYPES = ['duration', 'effort', 'FTE', 'count', 'percent', 'money', 'date'];
const keys = Object.keys(groups).sort((a, b) => {
    const [ta, sa] = a.split('|');
    const [tb, sb] = b.split('|');
    const ca = differs(groups[a]) ? 0 : 1;
    const cb = differs(groups[b]) ? 0 : 1;
    return TYPES.indexOf(ta) - TYPES.indexOf(tb) || ca - cb || sa.localeCompare(sb);
});
const checks = keys.filter((k) => differs(groups[k]) && !/\(no subject\)/.test(k)).length;
const L = [];
L.push('fact scan: ' + files.length + ' file(s) | ' + facts.length + ' facts in ' + keys.length + ' groups | ' + checks + ' group(s) to CHECK' +
    ' (values differ; "(no subject)" groups are listed but not flagged)');
let lastType = '';
keys.forEach((k) => {
    const [type, subject] = k.split('|');
    if (type !== lastType) { L.push(''); L.push('== ' + type + ' =='); lastType = type; }
    const fs2 = groups[k];
    const byVal = {};
    fs2.forEach((f) => { (byVal[f.value.toLowerCase()] = byVal[f.value.toLowerCase()] || []).push(f.file + ' ' + f.where); });
    const flag = differs(fs2) && subject !== '(no subject)' ? '[CHECK] ' : '        ';
    L.push(flag + subject + ': ' + Object.keys(byVal).map((v) => v + ' (' + byVal[v].slice(0, 4).join('; ') + (byVal[v].length > 4 ? '; +' + (byVal[v].length - 4) : '') + ')').join(' | '));
});
console.log(L.join('\n'));
if (mdOut) {
    const md = ['# Fact scan', '', 'Files: ' + files.map((f) => '`' + path.basename(f) + '`').join(', '), '',
        '| Check | Type | Subject | Value | File | Location | Context |', '|---|---|---|---|---|---|---|'];
    keys.forEach((k) => groups[k].forEach((f) => md.push('| ' + (differs(groups[k]) && f.subject !== '(no subject)' ? 'CHECK' : '') + ' | ' + f.type + ' | ' +
        f.subject + ' | ' + f.value + ' | ' + f.file + ' | ' + f.where + ' | ' + String(f.context).replace(/\|/g, '/') + ' |')));
    fs.writeFileSync(mdOut, md.join('\n') + '\n');
}
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(facts, null, 1)); }
