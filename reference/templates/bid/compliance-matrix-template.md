# Compliance matrix — template

The compliance matrix answers every requirement in the register. Build it from JSON with
`node scripts/bid/build-compliance.js --register requirements.json --answers answers.json --out matrix.xlsx`
(add `--client` for the customer's copy). When the customer gives its own template, fill that template and keep these
rules.

## Columns

| Column | Internal view | Client view | Content |
|---|---|---|---|
| ID | yes | yes | Requirement ID from the register |
| Source | yes | yes | Document and location (§, page, row) |
| Category / Mandatory | yes | no | From the register |
| Requirement | yes | yes | The customer's words |
| Compliance status | yes | yes | One status from the vocabulary below |
| Response | yes | yes | The answer — capability first, then how it is delivered, then conditions |
| Assumptions / dependencies | yes | yes | IDs from the assumptions register (A-xx, D-xx), explained on a separate sheet |
| Evidence | yes | yes | Product documentation page for the release proposed (title and link), or the bidder's evidence |
| Release / phase | yes | yes | Phase 1 / Phase 2 / roll-out wave / option — must match the plan and the estimate |
| Owner | yes | no | Who answers |
| Internal notes | yes | no | Open questions, risks, alternative wording |

## Status vocabulary

| Status | Use when |
|---|---|
| Fully Compliant | The documented product capability meets the exact wording, with no integration, licence or customer-input condition. When in doubt, use a more conservative status. |
| Compliant subject to configuration | Met by configuration within the proposed effort. |
| Compliant subject to agreed assumption/dependency | Met when a named assumption or dependency holds (licence tier, customer data, third-party access). Name it. |
| Partially Compliant | Part is met; say what is not and how it can be met (phase, option, workaround). |
| Clarification Required | The answer depends on a customer answer or a missing input; say whose. |
| Gap Identified | Not met in the proposed scope; say whether an option exists and what it costs to close. |
| Not Compliant | Will not be met. Say so plainly. |

## Writing rules

- **Answer the requirement first.** The first sentence says whether and how it is met. Product promotion and background come after, if at all.
- **Keep every status defensible.**
  - Phase 2 items are not shown as compliant in Phase 1.
  - Licence-dependent capabilities name the licence condition.
- **Use the product names of the release proposed, and check them against the documentation of both the release the customer runs and the release proposed.** A name that is current in one release and renamed in the other is a consistency note, not an error.
- **Keep the release or phase consistent with the plan, the estimate and the presentation.** Check it against the cross-document consistency register.
- **Keep the client view clean.**
  - No internal labels, owners, internal notes, or other customers' names.
  - `build-compliance.js --client` refuses a matrix that still carries an internal label.
- **Respect the customer's template.**
  - Answer every question, even with "Fully compliant" when the RFP requires an answer per row.
  - Keep within the character limits. Do not change question text, numbering or protection.
  - When a Yes/No column is locked, start the comment with "Yes", "No" or "Partly", and raise the lock as a clarification.
- **Link every compliant answer to the estimate.** A "compliant" claim for an item with no estimate row is a defect.

## Answer patterns

| Pattern | Wording shape |
|---|---|
| Out of the box first | Name the native object or feature, say how it is configured, and mark any extension as custom and priced. |
| Bounded scope | "Up to N items, configuration-driven variants by these dimensions, no per-customer templates; more through change request at the rate card." |
| System-of-record boundary | Name the external system that stays authoritative, what the platform consumes and how often, what it hands back, and the closed-loop status. |
| AI with a human in the loop | Grounded on approved sources, with evidence links and confidence shown. Rules are kept apart from predictive models. A human approves any change that affects a customer. Prompts and outputs are logged. State the licence condition. |
| Rules first, predictive at a gate | Transparent thresholds first. A predictive model is added at a named gate, once data readiness and governance approval are in place. |
| Data responsibility split | The bidder owns the quality of the data it integrates. The source owner remediates source data. A reconciliation queue shows the exceptions. |
| Gate evidence | "Accepted when this evidence list is complete; payment is released on acceptance." |
| Honest partial | "Partially met: this part now, this part in phase N, or this alternative." |
| Explicit-ask block | One mini-section per explicit ask, delivering the artefact asked for (object model, mapping, interface matrix, NFR table). If it is deferred, say so and attach a sample. |
| Cross-cutting principles | Answer the recurring quality attributes once (evidence, approval, audit, versioning, explainability) and reference that page from each row. |

For a rapid RFP or a short pack, add two things:
- a one-page **compliance heat map** (area × covered / partial / gap), generated from the register;
- an appendix with the answers to the explicit asks.

The full matrix stays internal.
