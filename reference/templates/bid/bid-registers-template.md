# Bid registers — template

The bid baseline is a set of registers kept in the bid workspace (`clients/<customer>/bid/02-baseline/`). Every customer-facing document is checked against them, and a document that departs from them is flagged `[CROSS-DOCUMENT CONFLICT]` until the register or the document is corrected. Internal only: none of these registers is sent to the customer as is.

## 1. Source inventory

| Code | File | Type | Owner (customer / vendor / bidder / third party) | Date / version | Trust | Purpose | Notes |
|---|---|---|---|---|---|---|---|

- **Type:** RFP, annex, questionnaire, demo script, Q&A, template, price sheet, previous proposal, reference, product documentation.
- **Trust:** authoritative (customer RFP and Q&A), supporting (vendor documentation for the release proposed), internal (bidder's own material), quarantined (another bid's material: never copied without a clean rewrite).
- **Source hierarchy:** customer Q&A answers > RFP body > annexes > templates > meetings or e-mails > earlier drafts.

## 2. Requirements register

See `requirements-register.schema.json`. One obligation per row; IDs stable from the first issue.

- **What becomes a row.** Every "must", "shall", "required" and "mandatory" in the RFP, and every highlighted phrase.
- **Customer input without an RFP.** Answered scoping questionnaires, use-case documents and workshop notes count as requirements, and every item maps to an outcome:
  - every "yes" answer maps to a scope item or a stated exclusion;
  - every unknown ("???", blank, contradictory) maps to an open question with a proposed default;
  - every use-case step maps to a scope item, an assumption or an exclusion.

  Nothing the customer asked for is dropped silently.

## 3. Mandatory and disqualifying requirements

| ID | Requirement | Why it can disqualify | Where it is answered | Status |
|---|---|---|---|---|

## 4. Evaluation criteria and scoring

| Criterion | Weight (if stated) | Evidence the evaluator will look for | Where we show it |
|---|---|---|---|

## 5. Deliverables register (what we must hand in)

| # | Deliverable the RFP asks for | Format / template | Owner | Status | File name |
|---|---|---|---|---|---|

## 6. Submission requirements and deadlines

| Item | Requirement | Date / time and time zone | Channel (portal, e-mail) | Status |
|---|---|---|---|---|

Typical items:
- **Deadlines:** the question deadline, the answer date and the submission deadline.
- **File rules:**
  - the file-naming rule, for example the customer's file name plus the bidder's suffix;
  - whether additional documents are allowed;
  - the language;
  - character or page limits.
- **Customer template, inspected at intake (record what it holds, never change it):**
  - sheet and workbook protection;
  - **hidden sheets** (they often hold the scoring weights);
  - locked cells;
  - dropdown values;
  - mandatory comment columns.
- **Proposal status:** whether the proposal is binding, and whether assumptions must sit inside the response.
- **Contract conditions:** the NDA and the portal terms to accept.

## 7. Clarification questions to the customer

| Q# | Question | Why we ask (impact on scope, effort or price) | Requirement IDs | Sent | Answer | Impact applied |
|---|---|---|---|---|---|---|

## 8. Missing bidder inputs

| # | Input (rates, references, CVs, legal entity, certifications, licence quote) | Needed for | Owner | Due |
|---|---|---|---|---|

## 9. Vendor validation register (product facts to confirm with the vendor)

| # | Claim | Release and documentation page | Question to the vendor | Answer |
|---|---|---|---|---|

## 10. Commercial and contractual risk register

| # | Term (warranty, liability, penalties, payment, validity, IP, data protection) | RFP position | Our position | Deviation declared where | Risk rating |
|---|---|---|---|---|---|

## 11. Assumptions and dependencies

| ID | Assumption or dependency | Owner (customer / vendor / bidder) | Effort or price impact if wrong | Where stated to the customer |
|---|---|---|---|---|

## 12. Solution gaps and design decisions

| # | Gap or decision | Options | Decision and reason | Licence or effort impact | ADR |
|---|---|---|---|---|---|

## 13. Cross-document consistency register

| Fact (scope item, count, duration, phase, price, licence, team role) | Value | Documents that state it | Last checked |
|---|---|---|---|

Typical facts:
- number of markets, sites, case types, templates, KPIs and integrations;
- months to the pilot and to go-live;
- weeks of hypercare;
- warranty;
- what is in each phase;
- total effort and price;
- licences and tiers;
- team roles.

## 14. Document production plan

| Document | Template | Writer | Reviewer | Draft due | Red team | Final due |
|---|---|---|---|---|---|---|

Plan the red team for three working days before the deadline at the latest. Freeze internally one day before it.

## 15. Staffing matrix

One row per consultant offered, kept in the format of `cv-template.md`. It is the single source of truth for:
- slots;
- years of experience;
- CV file names;
- disclosure status.

The questionnaire answers and the CV files must match it.

## 16. As-sent register (version of record)

| Artefact | Version | Date sent | Format | Recipient / channel | As-sent file | Source (workbook, sheet) | Hash | What changed and why |
|---|---|---|---|---|---|---|---|---|

- **What counts as sent.** The file actually sent, usually the PDF, is the version of record. Editable sources are often re-saved later and stop matching it.
- **Archiving.** Archive each package in `08-package/` with its hash and the portal receipt.
- **Negotiation rounds.** A revised offer is a new row that records:
  - what was removed or re-scoped;
  - the effort change by line;
  - the commercial change.

## Labels used in drafts (never in a final customer file)

- `[INPUT REQUIRED FROM BIDDER]`
- `[TO BE VALIDATED WITH VENDOR]`
- `[CLARIFICATION REQUIRED FROM CUSTOMER]`
- `[COMMERCIAL VALIDATION REQUIRED]`
- `[DESIGN VALIDATION REQUIRED]`
- `[REFERENCE VALIDATION REQUIRED]`
- `[CROSS-DOCUMENT CONFLICT]`
- `[PROPOSED <ROLE> - RESOURCE TO BE CONFIRMED]`
