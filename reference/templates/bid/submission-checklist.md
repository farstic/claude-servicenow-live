# Submission checklist — template

Run the checklist before anything leaves the bid team: the written response, the price workbook, the presentation for the hearing, a revised offer. Every "no" is either fixed or declared to the customer as a deviation. The two scripts at the end do the mechanical part.

## A. What the customer asked for

- [ ] **Required documents.** Every document in the deliverables register exists, in the format and template the RFP asks for.
- [ ] **Order and naming.** The order, file names and language are as instructed (for example: "The quotation shall be submitted in English").
- [ ] **Mandatory requirements.** Every mandatory and disqualifying requirement is answered, and the answer can be found where the evaluator will look.
- [ ] **Explicit asks.** Every explicit ask on the intake card ("vendor must…", "complete, validate and price") has its own answer with the artefact requested.
- [ ] **Format and size.** Format, page or slide count and language are within the RFP's limits. A pitch deck fits the talk time, at about 1.5–2 minutes per core slide.
- [ ] **Questionnaires.** Every questionnaire (supplier, functional, technical, legal and security, commercial) is completed. Not-applicable rows say so.
- [ ] **Pricing.** Pricing follows the customer's commercial template:
  - currency;
  - taxes excluded or included as asked;
  - travel and expenses rule;
  - every module shown or demonstrated has its licence cost or licence position.
- [ ] **Effort per profile.** Effort is given per profile, with the rate card and the phasing, where asked.
- [ ] **Customer effort.** The customer's own effort is given per role, per phase and as % FTE, where asked.
- [ ] **Commercial terms.** Warranty, validity, payment terms, change control, acceptance and quality management are stated in the form the RFP asks for (for example "milestone X + N months").
- [ ] **References.**
  - The required references or reference call are named, comparable and approved.
  - Results are measurable where the RFP asks.
- [ ] **Hearing.** For a hearing or orals, the deck presents what the RFP lists for the presentation: approach, timeline, commercial offer and demo mapping. It is consistent with what was uploaded.

## B. One bid, one set of facts

- [ ] **Same facts everywhere.** Scope, phase contents, counts, durations, hypercare, warranty, team roles and totals are the same in every document. Check against the cross-document consistency register.
- [ ] **Every promise is priced or excluded.** Every capability the presentation or the response promises is either in the estimate, or openly marked as an option, a later phase or out of scope.
- [ ] **Assumptions match the scope.** Assumptions do not exclude something another document promises.
- [ ] **The estimate adds up:**
  - totals equal their rows;
  - no text in number cells;
  - no typed values where formulas are expected;
  - a named contingency.
- [ ] **Licences are consistent.** The licence position is the same everywhere and matches the commercial model: who provides the subscriptions, which tiers and which add-ons.

## C. Product truth

- [ ] **Product names.** Names are those of the release proposed and of the customer's current release; renamed products are written consistently.
- [ ] **Out-of-the-box claims.** Every "out of the box" claim is checked in the product documentation. Store apps, third-party connectors and separate subscriptions are named as such.
- [ ] **Licence and tier conditions.** These stand next to the capability on the slide or in the answer, not only in the notes.

## D. Confidentiality and file hygiene

- [ ] **No other customer's material.** No name, project term, persona, slide, number or file name from another customer or another bid, in the slides, notes, comments, document properties or embedded files.
- [ ] **No internal material.** No speaker notes, comments, tracked changes, hidden slides, hidden sheets, hidden text, highlighting, macros, embedded workbooks or external links, unless they are intended for the customer.
- [ ] **No embedded live files.** An embedded workbook or document travels in full, with every sheet including hidden ones, whatever the slide shows. Use values or a picture.
- [ ] **Hidden places are clean.** These hold no other names, file paths or template residue:
  - alternative text of pictures;
  - layouts and masters;
  - headers and footers;
  - the stored folder path of a workbook.
- [ ] **Customer templates untouched.** A customer template returned filled in keeps its own protection, hidden sheets and sensitivity label. Only the answer cells change.
- [ ] **Readable by the customer.** No file is encrypted by the bidder's sensitivity label, so the customer can open everything sent.
- [ ] **No drafting leftovers.** No placeholders or drafting labels: xx, TBD, "To be revised", `[INPUT REQUIRED ...]`, "(internal)", "user-provided", "created with Copilot".
- [ ] **One language and one date.** One language throughout and one date (the submission or hearing date). Slide numbers come from the slide-number field, not typed by hand.
- [ ] **Document properties.** Title, subject, author and company are correct for this bid.
- [ ] **Format sent.** The PDF goes out for reading. Editable files go out only where the customer needs them, and only cleaned.

## E. Commercial protection

- [ ] **No uncontrolled commitments.** No commitment beyond the priced scope, such as "all markets", "any language" or "real-time integration with all systems".
- [ ] **Customer responsibilities stated.** Customer and third-party responsibilities are stated as dependencies and have an owner.
- [ ] **Deviations declared.** Deviations from the RFP's terms are declared openly in the place the RFP asks for, not hidden in an assumption cell.
- [ ] **Validity understood.** The bid validity is stated, and it is understood that the commitments become binding.

## F. Packaging and version of record

- [ ] **File names.** Use the customer's file name or naming rule plus the bidder's suffix. No person suffixes. No unsuffixed file that is older than a suffixed one.
- [ ] **PDFs regenerated.** PDFs are regenerated from the final sources after the last change, and the editable and PDF versions match.
- [ ] **Internal files excluded.** The package holds no staffing lists, working copies, registers or review reports.
- [ ] **Package archived.** The package is zipped, hashed and archived in `08-package/`, with the portal receipt.
- [ ] **As-sent register.** The as-sent register has a row for this submission (`bid-registers-template.md` §16).

## Mechanical checks

```
node scripts/bid/hygiene-scan.js <every file to send> --deny <bidder-profile>/deny-list.txt --allow <bid>/allow-list.txt [--customer-template <returned customer template>]
node scripts/bid/estimate-check.js <estimate.xlsx> --all
node scripts/bid/fact-scan.js <every file to send> --md <bid>/07-review/fact-scan.md
```

- **hygiene-scan.js:** any HIGH finding blocks the submission.
- **estimate-check.js:** every HIGH finding is either corrected or explained in the bid team's notes.
- **fact-scan.js:** every CHECK group is reviewed. Values that genuinely differ are fixed or explained in the consistency register.
