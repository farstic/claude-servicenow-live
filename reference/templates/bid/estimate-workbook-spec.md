# Estimate workbook — specification

This file sets the structure of a bid estimate workbook. The Estimation & Sizing Specialist owns the method and the numbers. The structure exists so that:
- the arithmetic can be checked mechanically (`scripts/bid/estimate-check.js`);
- the estimate can be reconciled with the deck, the response, the plan and the payment schedule (`scripts/bid/fact-scan.js`).

**The customer's pricing template takes precedence.** Fill the customer's sheets from this workbook; never replace them.

## Sheets

| # | Sheet | Content | In the customer copy |
|---|---|---|---|
| 1 | `Control` | Bid ID, version, date, status (draft / review / final), change log, open labels. The customer name is a parameter here, never typed into text | Cover only |
| 2 | `Inputs` | Named cells: hours per day, working days per month, PM %, other uplift %, contingency %, hypercare weeks, rounding rule, currency | Selected |
| 3 | `Drivers` | Quantities that size the work: case types, catalogue items, integrations by type, KPIs and reports, portals, languages, sites, waves. The single source of every count used in rows, calculators and text | Selected |
| 4 | `Estimate` | One row per work package × activity (see columns) | Yes, without internal columns |
| 5 | `Options` | Options, later phases and conditional packages, with the same layout and their own totals | Yes |
| 6 | `Summary` | SUMIFS by scope status × phase × role × workstream; base total, options, contingency line, range | Yes |
| 7 | `Licences` | One list of the entitlements the estimate assumes: product, tier, quantity basis, who provides it. No prices unless the bidder resells | Yes |
| 8 | `Customer effort` | Customer role × phase: days and % FTE | Yes, if asked |
| 9 | `Plan` | Phases with durations in weeks and milestones; must match the deck and the response | Yes |
| 10 | `Rates` → `Price` | Effort × rate per phase and per module, travel rule, currency, taxes. One rate card per delivery-location option | **Internal**, ideally a separate file; the customer sees only what the RFP asks |
| 11 | `Payment schedule` | Linked by formula to the phase or gate totals, including the retention line | Yes, if asked |
| 12 | `Checks` | Reconciliation cells, one per check, PASS / FAIL | No |

## Estimate columns

- **Identity:**
  - work package ID;
  - workstream;
  - activity: design / build / test / deploy / cross-cutting;
  - **scope status**: base / option / later phase / conditional / reference only / excluded.
- **Sizing:**
  - driver reference and quantity;
  - unit effort per role;
  - role days (formula);
  - PM (formula from `Inputs`);
  - total;
  - low / likely / high.
- **Text (pasted into documents):**
  - scope;
  - assumptions and caps;
  - deliverables.
- **Traceability:**
  - requirement IDs;
  - assumption IDs;
  - evidence or estimate basis.
- **Change history:**
  - original days;
  - offered days;
  - reason for any cut.
- **Internal note.** A separate column, removed from the customer copy. Internal remarks never go in the scope or assumption text.

## Rows that must exist

Every functional workstream has design, build and test rows, or an N/A row with a reason. The cross-cutting lines must also exist:

| Line | Note |
|---|---|
| Project management | A percentage from `Inputs` or a bottom-up line. Check the share against the bid's size: on small bids a minimum team cost dominates |
| Architecture and design authority | Usually 5–7% |
| Test strategy, system integration testing, UAT support, regression | Explicit rows; UAT support is often 35–45% of the build of a workstream |
| Data load or migration | Or an exclusion |
| Environments, release and cutover | Including the release runbook |
| Training and knowledge transfer | Sessions × hours per audience |
| Organisational change management | Or a customer-owned assumption |
| Hypercare | One row **per go-live** |
| Warranty | Priced or excluded, never "unquantified" |
| Third-party coordination | When the RFP makes the bidder accountable for it |
| Closure and handover | When the RFP has a closure gate or a retained payment |
| Contingency | Named and tied to risk IDs. Mandatory for a fixed price |

**Zero effort on a line that the RFP makes the bidder accountable for is an error, not a placeholder.** Rows that are out of scope are excluded by their status. They do not appear as empty rows in customer tables.

## Formula rules

- **One formula per column.** Every row of a calculated column uses the same formula. A typed override in a calculated column is an error.
- **No constants in formulas.** Percentages, factors, counts and working days are typed only into labelled `Inputs` or `Drivers` cells:
  - PM %;
  - discount;
  - hours per day;
  - working days per month;
  - KPI counts.

  One planning constant per concept: never 19 working days in one sheet and 20 in another.
- **Cost formulas use every role column.** A cost formula that leaves out a role column leaves that effort unpriced.
- **Totals.**
  - Totals are SUM or SUMIFS over the full block and never typed.
  - Under an autofilter, totals use SUBTOTAL(109, …) or sit outside the filtered range.
- **Text cells.**
  - No text in number cells, and blanks are explicit zeros.
  - No cell references, error values or arithmetic in the text columns. "6 workshops of 2 hours (18 hours)" is caught by the check.
- **Cross-sheet links.** Calculator results feed the estimate by link, never by retyping. The payment schedule is linked to the estimate's totals.
- **Discount.** Use one discount mechanism, in one named cell, recorded in the change log.
- **Options and scenarios.** Use the scope status and a scenario switch, not whole-sheet copies. If copies exist, name them and mark which one was sent.
- **Rounding.** Round only in the presentation cells, using the rounding rule.

## Reconciliation checks (`Checks` sheet)

1. Each row total = its roles + PM. The column totals = the sum of the rows. The `Summary` totals = the `Estimate` totals.
2. The base total includes only rows with status "base". Options, later phases and conditional or reference-only rows are outside it.
3. Every count used anywhere comes from `Drivers`, and the counts agree across sheets.
4. Each phase total = the matching line of the deck table = the payment-schedule amount for that phase or gate (`fact-scan.js` helps here).
5. Each phase duration in `Plan` matches the deck and the response, against the consistency-register ID.
6. Every rate used in `Price` exists in `Rates` for the same profile and location.
7. Every "compliant" item in the compliance matrix has an estimate row. Every estimate row maps to a requirement or a stated assumption.
8. A contingency line exists. Budgetary estimates also carry a range (low / likely / high).
9. Ratio bands hold, or a justification sits next to the ratio:
   - test vs build;
   - design vs build;
   - PM %;
   - hypercare present;
   - training present.

## Before every send

```
node scripts/bid/estimate-check.js <estimate.xlsx> --all
node scripts/bid/fact-scan.js <deck.pptx> <response.docx> <estimate.xlsx>
node scripts/bid/hygiene-scan.js <customer-copy.xlsx> --deny <bidder-profile>/deny-list.txt
```

**The customer copy** is a separate file, produced from this workbook, never by editing it by hand.

| What | Rule |
|---|---|
| Sheets | Customer sheets only, as values and formatting |
| Removed | Internal columns, internal sheets, comments, notes, hidden rows and sheets, defined names pointing at removed sheets |
| Properties | Author, last editor, the stored folder path (absPath) and company scrubbed |
| Into decks and documents | Values or a picture, never an embedded live workbook |
