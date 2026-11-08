// Office Open XML reader for the bid tools: a dependency-free zip reader plus text extraction for .pptx, .xlsx/.xlsm
// and .docx. Used by extract-office.js, hygiene-scan.js and estimate-check.js. Node only; no npm packages.
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// ---------- zip ----------
// file: a path, or a Buffer holding the zip (an embedded Office file read from its parent)
function openZip(file) {
    const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
    if (Buffer.isBuffer(file)) { file = '(embedded file)'; }
    // an OLE2 compound file: a legacy binary format, or an Office file encrypted by a sensitivity label (rights management)
    if (buf.length > 8 && buf.readUInt32LE(0) === 0xE011CFD0 && buf.readUInt32LE(4) === 0xE11AB1A1) {
        const u16 = (s) => Buffer.from(s, 'utf16le');
        const encrypted = buf.indexOf(u16('EncryptedPackage')) > -1 || buf.indexOf(u16('DRMEncryptedDataSpace')) > -1;
        throw new Error(encrypted ? 'rights-protected (encrypted by a sensitivity label): needs an authorised export, for example a PDF; ' +
            'a customer may not be able to open it either: ' + file : 'legacy binary Office format (OLE2), save it as .pptx/.xlsx/.docx first: ' + file);
    }
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) { throw new Error('not a zip (Office Open XML) file: ' + file); }
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const entries = {};
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(off) !== 0x02014b50) { throw new Error('damaged zip directory: ' + file); }
        const method = buf.readUInt16LE(off + 10);
        const csize = buf.readUInt32LE(off + 20);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commLen = buf.readUInt16LE(off + 32);
        const local = buf.readUInt32LE(off + 42);
        entries[buf.toString('utf8', off + 46, off + 46 + nameLen)] = { method, csize, local };
        off += 46 + nameLen + extraLen + commLen;
    }
    function read(name) {
        const e = entries[name];
        if (!e) { return null; }
        const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
        const data = buf.subarray(start, start + e.csize);
        if (e.method === 0) { return data; }
        if (e.method === 8) { return zlib.inflateRawSync(data); }
        throw new Error('unsupported zip method ' + e.method + ' for ' + name);
    }
    return {
        names: Object.keys(entries),
        has: (name) => Object.prototype.hasOwnProperty.call(entries, name),
        buffer: read,
        text: (name) => { const b = read(name); return b ? b.toString('utf8') : null; }
    };
}

// ---------- shared ----------
function decode(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (a, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#([0-9]+);/g, (a, d) => String.fromCharCode(parseInt(d, 10))).replace(/&amp;/g, '&');
}
function relsOf(zip, part) {
    const p = part.replace(/[^/]+$/, (f) => '_rels/' + f + '.rels');
    const x = zip.text(p);
    const out = {};
    if (!x) { return out; }
    const re = /<Relationship\b([^>]*)\/?>/g;
    let m;
    while ((m = re.exec(x))) {
        const id = (/\bId="([^"]+)"/.exec(m[1]) || [])[1];
        out[id] = { target: (/\bTarget="([^"]+)"/.exec(m[1]) || [])[1] || '',
            type: ((/\bType="([^"]+)"/.exec(m[1]) || [])[1] || '').split('/').pop(),
            external: /TargetMode="External"/.test(m[1]) };
    }
    return out;
}
function resolve(base, target) {
    if (target.startsWith('/')) { return target.slice(1); }
    const parts = base.split('/').slice(0, -1);
    target.split('/').forEach((t) => { if (t === '..') { parts.pop(); } else if (t !== '.') { parts.push(t); } });
    return parts.join('/');
}
function props(zip) {
    const out = {};
    const core = zip.text('docProps/core.xml') || '';
    [['title', 'dc:title'], ['subject', 'dc:subject'], ['creator', 'dc:creator'], ['lastModifiedBy', 'cp:lastModifiedBy'],
        ['keywords', 'cp:keywords'], ['description', 'dc:description']].forEach(([k, tag]) => {
        const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(core);
        if (m && m[1].trim()) { out[k] = decode(m[1].trim()); }
    });
    const app = zip.text('docProps/app.xml') || '';
    ['Company', 'Manager', 'Template'].forEach((t) => {
        const m = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>').exec(app);
        if (m && m[1].trim()) { out[t.toLowerCase()] = decode(m[1].trim()); }
    });
    // sensitivity label name (Microsoft Information Protection custom property)
    const custom = zip.text('docProps/custom.xml') || '';
    const lbl = /name="MSIP_Label_[^"]*_Name"[^>]*>\s*<vt:lpwstr>([^<]*)</.exec(custom);
    if (lbl && lbl[1].trim()) { out.sensitivityLabel = decode(lbl[1].trim()); }
    // local folder of the author, stored by Excel in the workbook part
    const abs = /<x15ac:absPath [^>]*url="([^"]+)"/.exec(zip.text('xl/workbook.xml') || '');
    if (abs) { out.absPath = decode(abs[1]); }
    return out;
}
function paras(x) {
    const out = [];
    const re = /<a:p>([\s\S]*?)<\/a:p>|<a:p [^>]*>([\s\S]*?)<\/a:p>/g;
    let m;
    while ((m = re.exec(x))) {
        const body = m[1] !== undefined ? m[1] : m[2];
        const t = [];
        const rr = /<a:t>([\s\S]*?)<\/a:t>|<a:t [^>]*>([\s\S]*?)<\/a:t>|<a:br\/>/g;
        let n;
        while ((n = rr.exec(body))) { t.push(n[0] === '<a:br/>' ? ' / ' : decode(n[1] !== undefined ? n[1] : n[2])); }
        const s = t.join('').replace(/\s+/g, ' ').trim();
        if (s) { out.push(s); }
    }
    return out;
}
// alternative text of pictures and shapes (descr / title attributes); it often carries file paths or other names
function altText(x) {
    const out = [];
    const re = /<(?:p:cNvPr|wp:docPr|pic:cNvPr)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(x))) {
        ['descr', 'title'].forEach((a) => {
            const v = (new RegExp('\\b' + a + '="([^"]*)"').exec(m[1]) || [])[1];
            if (v && v.trim()) { out.push(decode(v.trim())); }
        });
    }
    return Array.from(new Set(out));
}

// ---------- pptx ----------
function pptx(zip) {
    const pres = zip.text('ppt/presentation.xml') || '';
    const prel = relsOf(zip, 'ppt/presentation.xml');
    const ids = [];
    const re = /<p:sldId [^>]*r:id="([^"]+)"/g;
    let m;
    while ((m = re.exec(pres))) { ids.push(m[1]); }
    const slides = ids.map((rid, i) => {
        const part = resolve('ppt/presentation.xml', prel[rid].target);
        const x = zip.text(part) || '';
        const r = relsOf(zip, part);
        const text = [];
        const tables = [];
        const sre = /<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g;
        let s;
        while ((s = sre.exec(x))) {
            if (/<a:tbl>/.test(s[0])) {
                (s[0].match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || []).forEach((tr) => {
                    tables.push((tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).map((tc) => paras(tc).join(' / ')).join(' | '));
                });
            } else {
                paras(s[0]).forEach((p) => text.push(p));
            }
        }
        let notes = '';
        const smartart = [];
        Object.keys(r).forEach((k) => {
            const t = resolve(part, r[k].target);
            if (r[k].type === 'notesSlide') {
                notes = paras(zip.text(t) || '').filter((p) => !/^\d+$/.test(p)).join(' / ');
            }
            if (r[k].type === 'diagramData') { smartart.push(paras(zip.text(t) || '').join(' ; ')); }
        });
        const comments = Object.keys(r).filter((k) => /comments/i.test(r[k].type)).length;
        return { n: i + 1, part, hidden: /<p:sld [^>]*show="0"/.test(x), text, tables, smartart, notes, comments, alt: altText(x),
            highlights: (x.match(/<a:highlight>/g) || []).length };
    });
    // static (non-placeholder) text on the layouts and masters the slides use: it shows on every slide built on them
    const tpl = {};
    const note = (part, n) => { (tpl[part] = tpl[part] || new Set()).add(n); };
    slides.forEach((s) => {
        const r = relsOf(zip, s.part);
        Object.keys(r).filter((k) => r[k].type === 'slideLayout').forEach((k) => {
            const lp = resolve(s.part, r[k].target);
            note(lp, s.n);
            const lr = relsOf(zip, lp);
            Object.keys(lr).filter((q) => lr[q].type === 'slideMaster').forEach((q) => note(resolve(lp, lr[q].target), s.n));
        });
    });
    const templateText = Object.keys(tpl).map((part) => {
        const t = [];
        ((zip.text(part) || '').match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []).forEach((sp) => {
            if (!/<p:ph\b/.test(sp)) { paras(sp).forEach((q) => t.push(q)); }
        });
        return { part, slides: Array.from(tpl[part]), text: t };
    }).filter((q) => q.text.length);
    return { kind: 'pptx', slides, templateText, props: props(zip),
        embeddings: zip.names.filter((n) => /^ppt\/embeddings\//.test(n)),
        externalLinks: zip.names.filter((n) => /externalLink/i.test(n)) };
}

// ---------- xlsx ----------
function colToNum(c) { let n = 0; for (let i = 0; i < c.length; i++) { n = n * 26 + (c.charCodeAt(i) - 64); } return n; }
function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
// formula of a shared-formula follower: the master's formula with its relative references moved by (dr, dc)
function shiftFormula(f, dr, dc) {
    return f.replace(/(^|[^A-Za-z0-9_.'!])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g, (m, pre, cAbs, col, rAbs, row) =>
        pre + cAbs + (cAbs ? col : numToCol(colToNum(col) + dc)) + rAbs + (rAbs ? row : String(Number(row) + dr)));
}
function xlsx(zip) {
    const shared = [];
    const sst = zip.text('xl/sharedStrings.xml');
    if (sst) {
        const re = /<si>([\s\S]*?)<\/si>/g;
        let m;
        while ((m = re.exec(sst))) {
            const t = [];
            const tr = /<t(?: [^>]*)?>([\s\S]*?)<\/t>/g;
            let n;
            while ((n = tr.exec(m[1]))) { t.push(decode(n[1])); }
            shared.push(t.join(''));
        }
    }
    const wb = zip.text('xl/workbook.xml') || '';
    const wrel = relsOf(zip, 'xl/workbook.xml');
    const sheets = [];
    const shre = /<sheet\b([^>]*)\/>/g;
    let s;
    while ((s = shre.exec(wb))) {
        const a = s[1];
        const name = decode((/name="([^"]+)"/.exec(a) || [])[1] || '');
        const state = (/state="([^"]+)"/.exec(a) || [])[1] || 'visible';
        const rid = (/r:id="([^"]+)"/.exec(a) || [])[1];
        const part = resolve('xl/workbook.xml', wrel[rid].target);
        const x = zip.text(part) || '';
        const cells = [];
        const masters = {};
        const rowRe = /<row [^>]*r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
        let r;
        while ((r = rowRe.exec(x))) {
            if (!r[2]) { continue; }
            const cre = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
            let c;
            while ((c = cre.exec(r[2]))) {
                const ref = (/r="([A-Z]+)(\d+)"/.exec(c[1]) || []);
                const t = (/t="([^"]+)"/.exec(c[1]) || [])[1] || '';
                const body = c[2] || '';
                let f = (/<f[^>]*>([\s\S]*?)<\/f>/.exec(body) || [])[1];
                const fShared = /<f [^>]*t="shared"/.test(body);
                const si = (/<f [^>]*si="(\d+)"/.exec(body) || [])[1];
                if (fShared && si !== undefined) {
                    if (f !== undefined) {
                        masters[si] = { f: decode(f), c: colToNum(ref[1]), r: parseInt(ref[2], 10) };
                    } else if (masters[si]) {
                        f = shiftFormula(masters[si].f, parseInt(ref[2], 10) - masters[si].r, colToNum(ref[1]) - masters[si].c);
                    }
                }
                let v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
                if (t === 's' && v !== undefined) { v = shared[parseInt(v, 10)]; }
                if (t === 'inlineStr') { v = ((body.match(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g) || []).map((q) => q.replace(/<[^>]+>/g, '')).join('')); }
                if (v !== undefined) { v = decode(v); }
                if ((v === undefined || v === '') && f === undefined && !fShared) { continue; }
                const isNum = t !== 's' && t !== 'str' && t !== 'inlineStr' && t !== 'b' && t !== 'e' && v !== undefined && v !== '' && !isNaN(Number(v));
                cells.push({ ref: ref[1] + ref[2], col: ref[1], c: colToNum(ref[1]), r: parseInt(ref[2], 10),
                    v: v === undefined ? '' : v, num: isNum ? Number(v) : null, f: f !== undefined ? decode(f) : (fShared ? '=shared' : null),
                    err: t === 'e' });
            }
        }
        const merges = (x.match(/<mergeCell ref="([^"]+)"/g) || []).map((q) => q.replace(/.*ref="|"$/g, ''));
        const commentsRel = relsOf(zip, part);
        const comments = Object.keys(commentsRel).filter((k) => /comments/i.test(commentsRel[k].type)).length;
        const autoFilter = (/<autoFilter ref="([^"]+)"/.exec(x) || [])[1] || null;
        const protectedSheet = /<sheetProtection\b/.test(x);
        sheets.push({ name, state, part, cells, merges, comments, autoFilter, protectedSheet });
    }
    // "name=reference" for every defined name
    const definedNames = (wb.match(/<definedName [^>]*>[\s\S]*?<\/definedName>/g) || []).map((d) =>
        decode((/name="([^"]+)"/.exec(d) || [])[1] || '') + '=' + decode(d.replace(/<[^>]+>/g, '')));
    return { kind: 'xlsx', sheets, definedNames, props: props(zip),
        externalLinks: zip.names.filter((n) => /^xl\/externalLinks\//.test(n)), vba: zip.has('xl/vbaProject.bin') };
}

// ---------- docx ----------
function docx(zip) {
    const x = zip.text('word/document.xml') || '';
    const body = (/<w:body>([\s\S]*)<\/w:body>/.exec(x) || [])[1] || x;
    const ptext = (p) => {
        const t = [];
        const re = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
        let m;
        while ((m = re.exec(p))) { t.push(m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? ' / ' : decode(m[1])); }
        return t.join('').replace(/[ \t]+/g, ' ').trim();
    };
    const blocks = [];
    const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
    let m;
    while ((m = re.exec(body))) {
        const blk = m[0];
        if (blk.startsWith('<w:tbl>')) {
            const rows = (blk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])
                .map((tc) => (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(ptext).filter(Boolean).join(' / ')).join(' | '));
            blocks.push({ type: 'table', rows });
            continue;
        }
        const t = ptext(blk);
        if (!t) { continue; }
        const st = (/<w:pStyle w:val="([^"]+)"/.exec(blk) || [])[1] || '';
        const lvl = (/(?:Heading|Titre|berschrift)\s?(\d)$/i.exec(st) || [])[1];
        blocks.push({ type: lvl ? 'h' + lvl : (/<w:numPr>/.test(blk) ? 'li' : 'p'), text: t });
    }
    return { kind: 'docx', blocks, props: props(zip),
        comments: zip.has('word/comments.xml') ? ((zip.text('word/comments.xml').match(/<w:comment /g) || []).length) : 0,
        trackedChanges: (x.match(/<w:(ins|del) /g) || []).length,
        hiddenText: (x.match(/<w:vanish\/>/g) || []).length,
        highlights: (x.match(/<w:highlight w:val="(?!none)/g) || []).length,
        headerFooter: zip.names.filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).map((n) => ({ part: n,
            text: ((zip.text(n) || '').match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(ptext).filter(Boolean) }))
            .filter((h) => h.text.length),
        alt: altText(x),
        embeddings: zip.names.filter((n) => /^word\/embeddings\//.test(n)) };
}

// file: a path or a Buffer. doc.part(name) returns the raw bytes of a package part (for example an embedded file).
function open(file) {
    const zip = openZip(file);
    let doc;
    if (zip.has('ppt/presentation.xml')) { doc = pptx(zip); }
    else if (zip.has('xl/workbook.xml')) { doc = xlsx(zip); }
    else if (zip.has('word/document.xml')) { doc = docx(zip); }
    else { throw new Error('not a .pptx, .xlsx/.xlsm or .docx file: ' + (Buffer.isBuffer(file) ? '(embedded file)' : file)); }
    Object.defineProperty(doc, 'part', { value: zip.buffer, enumerable: false });
    return doc;
}

module.exports = { open, openZip, decode, colToNum, numToCol };
