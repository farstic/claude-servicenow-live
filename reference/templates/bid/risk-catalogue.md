# Bid and delivery risk catalogue — template

Typical risks for ServiceNow bids, with the treatment that belongs in the offer. Copy the ones that apply into the bid's risk register, name an owner and link each one to:
- an assumption;
- a scope decision;
- the contingency line.

A risk that the contingency covers is named in the contingency line; contingency is never silent padding.

## A. Bid-phase risks (decide before G1)

| ID | Risk | Signal in the RFP or discovery | Treatment |
|---|---|---|---|
| BID-01 | Fixed price on an open scope | "Fixed price" plus open capabilities or "to be decided in implementation" | Caps per item, named contingency, phase 2 as indicative ranges, scope-swap rules |
| BID-02 | Format non-compliance | Page or slide caps, mandatory templates, "no additional documents" | Deliverables register; format check in the red team |
| BID-03 | Explicit asks left unanswered | "Vendor must…", "complete, validate and price" | Explicit-ask list from the intake card; one answer block each |
| BID-04 | Evaluation weights unknown or hidden | No weights published; hidden sheets in templates | Inspect templates; derive the implicit model; ask in Q&A |
| BID-05 | Named people unavailable at call-off or start | Frame contract; mobilisation within N weeks; same people long-term | Bench per module, availability statement, like-for-like replacement clause |
| BID-06 | Evidence weaker than the claims | Years, certifications, industry experience required | Staffing matrix with years from CV dates; reference cards with evidence |
| BID-07 | Unlimited liability, penalties, extended warranty | Contract terms in the RFP | Commercial risk register; declared deviations; legal review |
| BID-08 | Deadline too short for a proper baseline | Rapid RFP; holidays in the window | Intake card in 3–5 days; ask questions early; reduce scope of the answer, not of the checks |
| BID-09 | Leakage of another customer's material | Clone-and-tailor from earlier bids | Rewrite, deny-list scan, no embedded workbooks, notes and properties cleaned |

## B. Delivery risks to cover in the offer

| ID | Risk | Treatment in the offer | Contingency? |
|---|---|---|---|
| DLV-01 | Requirements volatility and scope creep | Design sign-off before build; change control; backlog baseline at the end of design | Partly |
| DLV-02 | Customer decisions and availability | Customer-roles table with % allocation; decision-time assumption; delays go through change control | No (assumption) |
| DLV-03 | Data quality and readiness | Data-readiness gate before build; templates; N load cycles; reconciliation | Yes |
| DLV-04 | Third-party and integration readiness | Early interface contracts; documented APIs and test environments as prerequisites; integration owner named | Yes |
| DLV-05 | Licences or product enablement late | Licences as a prerequisite and a plan milestone | No (assumption) |
| DLV-06 | Customisation pressure ("every area needs its own workflow") | Out-of-the-box first; one case type or process first; later types in phase 2 | Partly |
| DLV-07 | AI value below expectations | AI conditions: licence, data and knowledge quality, human review; outcome targets set after a baseline | No (assumption) |
| DLV-08 | Compressed timeline or early go-live | Risk statement; staged releases; each release re-estimated (second UAT, go-live and hypercare) | Yes |
| DLV-09 | Test and acceptance delays | Deemed-acceptance windows; defect thresholds; UAT capacity named | Partly |
| DLV-10 | Adoption and organisational change | OCM scope stated (or customer-owned); champions; training audiences | No (scope) |
| DLV-11 | Environment and release issues | Environment prerequisites (clone before UAT), release runbook, deployment ownership stated once | Partly |
| DLV-12 | Key-person dependency | Pairing, documentation in stories, replacement clause | No |
| DLV-13 | Sensitive data in a shared product (for example HR data in a case product) | Segregation requirement made explicit; Security & GRC consult | No (design) |
| DLV-14 | Multi-country or multi-entity roll-out variations | Template-and-variant approach; local variations capped; roll-out waves priced separately | Yes |
| DLV-15 | Platform upgrade during the project | Release family fixed in assumptions; upgrade as a separate item | No (assumption) |

## C. Commercial risks

| ID | Risk | Treatment |
|---|---|---|
| COMR-01 | Price pressure leads to cutting test, PM or architecture below safe levels | Keep original and offered effort with the reason for each cut; floors for PM, architecture, testing and hypercare |
| COMR-02 | Discount mechanisms stacked (per rate and on the total) | One discount mechanism, recorded in the estimate and the as-sent register |
| COMR-03 | Re-plan not re-priced (extra release, extra hypercare) | Every change of plan re-runs the estimate and the consistency register |
| COMR-04 | Outcome-based fee on KPIs with unknown baselines | Use the customer's own KPIs; baselines set in mobilisation; measurement method, period and cap defined |
| COMR-05 | Billing basis mixed (fixed price wording with time-and-materials units) | One commercial model per offer; financial assumptions checked against it |
