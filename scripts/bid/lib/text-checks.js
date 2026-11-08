// Text checks shared by the bid tools (hygiene-scan.js, estimate-check.js, fact-scan.js). Each check takes one piece of
// text and returns a short description of the problem, or null. No customer data; patterns only.
'use strict';

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
    twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24,
    thirty: 30, forty: 40, sixty: 60, ninety: 90 };
const num = (s) => {
    const k = String(s).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(WORDS, k)) { return WORDS[k]; }
    const n = Number(k.replace(',', '.'));
    return isNaN(n) ? null : n;
};

// a spreadsheet reference or error value pasted into prose: "=B12", "Sheet1!C5", "#REF!", "#N/A"
function cellReference(s) {
    const m = /(^|[\s(])=\$?[A-Z]{1,3}\$?\d+\b|[A-Za-z0-9_']!\$?[A-Z]{1,3}\$?\d+\b|#REF!|#N\/A\b|#VALUE!|#DIV\/0!|#NAME\?/.exec(s);
    return m ? 'spreadsheet reference or error in text: "' + m[0].trim() + '"' : null;
}

// "6 workshops of 2 hours (18 hours)" or "3 x 4 h = 10 h": stated products that do not add up
function arithmetic(s) {
    const N = '(\\d+(?:[.,]\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)';
    const U = '(hours?|hrs?|h|days?|md|man-days?|person-days?|weeks?)';
    // "<n> <things> of <m> <unit>" then the stated total, introduced by total / in total / = / "(" or followed by "in total"
    const head = N + '\\s+[a-z-]+(?:\\s[a-z-]+)?\\s+(?:of|x|×)\\s+' + N + '\\s*' + U + '\\b[^.;\\n]{0,40}?';
    const reA = new RegExp(head + '(?:in\\s+total|total(?:\\s+of)?|totall?ing|overall|=|\\()\\s*' + N + '\\s*' + U + '\\b', 'id');
    const reB = new RegExp(head + ',\\s*' + N + '\\s*' + U + '\\b\\s*(?:in\\s+)?total', 'id');
    const re2 = new RegExp(N + '\\s*[x×*]\\s*' + N + '\\s*' + U + '?\\s*=\\s*' + N + '\\b', 'i');
    let m = reA.exec(s) || reB.exec(s);
    // "2 workshops of 2 h per service request, 40 h in total": a rate per unit, not a product
    if (m && /^\s*(per|each|for each|a|an)\b/i.test(s.slice(m.indices[3][1]))) { m = null; }
    if (m) {
        const a = num(m[1]), b = num(m[2]), t = num(m[4]);
        const sameUnit = m[3].charAt(0).toLowerCase() === m[5].charAt(0).toLowerCase();
        if (a !== null && b !== null && t !== null && sameUnit && Math.abs(a * b - t) > 0.01) {
            return 'stated total does not add up: "' + m[0].trim() + '" (' + a + ' × ' + b + ' = ' + (a * b) + ')';
        }
    }
    m = re2.exec(s);
    if (m) {
        const a = num(m[1]), b = num(m[2]), t = num(m[4]);
        if (a !== null && b !== null && t !== null && Math.abs(a * b - t) > 0.01) {
            return 'stated product does not add up: "' + m[0].trim() + '" (' + a + ' × ' + b + ' = ' + (a * b) + ')';
        }
    }
    return null;
}

// a question addressed to the customer, which belongs in the clarification log, not in a customer document
function questionToCustomer(s) {
    const m = /\b(please (confirm|advise|provide|clarify|let us know)|can you|could you|would you|do you (have|use|want|need|plan|expect)|is there an?|are there any)\b[^?]{0,160}\?/i.exec(s);
    return m ? 'question addressed to the customer: "' + m[0].slice(0, 100) + '"' : null;
}

// a copyright or template year older than last year
function oldYear(s) {
    const m = /(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/i.exec(s);
    if (!m) { return null; }
    const year = Number(m[1]);
    return year < new Date().getFullYear() - 1 ? 'old copyright year: "' + m[0] + '"' : null;
}

module.exports = { cellReference, arithmetic, questionToCustomer, oldYear, num, WORDS };
