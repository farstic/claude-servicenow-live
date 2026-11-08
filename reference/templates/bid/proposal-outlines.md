# Proposal outlines — template

Default outlines for bid documents. **The customer's own structure always wins.**
- When the RFP gives a template, a numbering, an order or a page limit, map these outlines onto it.
- Never reorder the customer's sections to fit an outline.

Every section lists the requirement IDs it answers (internal version only).

## Rules for every document

- **Lead with the answer.** Each section opens with what the customer gets, in the customer's words, and then explains how.
- **Facts.** Every number comes from the cross-document consistency register:
  - counts;
  - phases;
  - durations;
  - hypercare;
  - warranty;
  - team;
  - totals.
- **Scope wording.** Every capability is in the offer, an option, a later phase or out of scope. Use the same wording in every document.
- **Licence conditions.** A licence, Store app or third-party condition stands next to the capability it affects.
- **One date and one version on the cover.** Header or footer: `<customer> | <classification>`. Page or slide numbers come from fields.
- **Labels stay internal.** No owners or internal notes in a customer file.
- **Commitment level on the cover.** The cover says "budgetary" or "binding offer", and the financial assumptions use one commercial model.
- **Mirror the customer's own artefacts.** Use the customer's:
  - names for phases, gates, waves and swimlanes;
  - personas;
  - capabilities;
  - KPIs.

  An evaluator recognises their own plan.
- **Generate scope tables from the estimate.** Scope, assumption and deliverable tables come from the estimate's text columns, in one direction only. Regenerate them after every estimate change, and never edit them only in the deck.
- **Re-estimate after a re-plan.** A new release split, an earlier go-live or an extra phase re-runs the estimate and the consistency register before any slide changes.

## A. Written response (technical, functional and implementation)

| # | Section | Content |
|---|---|---|
| 0 | Cover and document control | Title, RFP reference, bidder legal entity, date, version, classification |
| 1 | Executive summary | See B |
| 2 | Our understanding | The customer's objectives, scope as understood, success criteria and constraints, in their terms. Clarifications received and how they shaped the offer |
| 3 | Proposed solution | **Overview:** products and modules, with the licence position. **For each capability area:** what the requirement asks, how it is met (out of the box, configuration, extension, option) and the phase. **Also covered:** process and persona journeys, integrations, data, AI and automation (with conditions), reporting, security and data protection, non-functional requirements (availability, performance, accessibility, languages). Architecture and process figures |
| 4 | Implementation approach | **Plan:** method and phases, minimum viable product first, plan and milestones. **Governance:** governance and steering. **Build and test:** environments and release management, testing (SIT, UAT support, regression, automated tests). **Go-live:** data migration, training and organisational change, cutover and go-live, hypercare, warranty |
| 5 | Team and organisation | Roles and responsibilities, locations, the customer's own roles and effort, continuity of key people. CVs in an annex |
| 6 | Experience and references | Comparable references from the bidder profile (approved only), mapped to the evaluation criteria |
| 7 | Commercial offer (when the RFP asks for it in the same document) | Price summary per phase and per module, effort per profile, rates, licence position, payment milestones, validity, travel rule, currency and taxes |
| 8 | Assumptions, dependencies and exclusions | From the assumptions register; customer responsibilities with owners |
| 9 | Risks and mitigations | The customer-facing subset of the risk register |
| 10 | Deviations | Every departure from the RFP's terms or requirements, stated openly |

**Annexes:**
- compliance matrix;
- CVs;
- certifications;
- company information;
- glossary.

## B. Executive summary (one to two pages)

1. **The customer's objective,** in one or two sentences, using their words.
2. **What we propose:** three to five outcomes, each tied to a requirement area.
3. **How:** the solution and the phases, in one figure or a short list. Show the minimum viable product and the later phases.
4. **Why us:** differentiators that can be evidenced (references, certified people, accelerators). No generic claims.
5. **Commercial headline,** if the RFP allows it in the summary: total, phases, validity.
6. **Key conditions:** the assumptions and dependencies that change the offer if they fail.
7. **Next steps.**

## C. Budgetary or proactive offer deck (12–20 slides)

| # | Slide | Message |
|---|---|---|
| 1 | Title | Customer, topic, date, classification |
| 2 | What we heard | The customer's objectives and pains, in their words |
| 3 | Target outcomes | Measurable outcomes and how they will be tracked |
| 4 | Solution overview | A capability map; products and licence position on the slide |
| 5–7 | How it works | One persona or process journey per slide; what is out of the box and what is configured |
| 8 | AI and automation | Each AI capability with its licence and data condition, and the human-in-the-loop point |
| 9 | Architecture and integrations | Systems, direction, method, owner of each third party |
| 10 | Roadmap | Minimum viable product first, later phases, roll-out waves |
| 11 | Delivery approach | Method, governance, testing, training and organisational change, hypercare |
| 12 | Team | Roles, locations, the customer's roles |
| 13 | Effort and budget | Ranges per phase with the confidence level; contingency named; what is not included |
| 14 | Assumptions and dependencies | The few that move the number |
| 15 | Why us | Evidenced differentiators |
| 16 | References | Approved cards only |
| 17 | Next steps | Decisions needed, workshop plan, date of a firm offer |

Add these slides when they apply:
- a **platform-options** slide when the product choice is open, comparing the candidate products on the same criteria;
- a **customer roles and time commitment** table;
- a **risks and mitigations** slide;
- a **configuration-versus-customisation** slide, with definitions and the planned ratio.

## D. Hearing or orals deck

Size the deck to the talk. At about 1.5–2 minutes per slide, a 40-minute slot holds 15–20 core slides; everything else goes in an appendix.

| Minutes (of 40) | Block | Slides |
|---|---|---|
| 2 | Opening: who is in the room, agenda | 1 |
| 5 | Our understanding: the customer's pains and objectives in its own words, and its objectives → capabilities → KPI map | 2 |
| 5 | Solution on a page: layers, authoritative sources, customisation posture, trust and regulatory lens | 2 |
| 6–8 | Proof: a live demo of one journey, mapped to requirement IDs | 0–1 |
| 6 | Plan: the timeline in the customer's own swimlanes; gates with evidence and payment; minimum viable product content | 2–3 |
| 4 | Team and governance, both sides, with time commitment; cadence fitted into the customer's governance | 2 |
| 3 | Adoption and organisational change | 1 |
| 2 | Risks and mitigations | 1 |
| 5 | Commercials: pricing model, price by phase and option, rate card, assumptions | 2–3 |
| 2 | Why us, with references matched to domain and industry | 1–2 |
| Appendix | Compliance heat map, explicit-ask answers, detailed scope packages, method, case studies | — |

- **Brief.** Follow the customer's hearing brief. The agenda mirrors the evaluation criteria and the time slots.
- **Consistency.** Everything matches the submitted documents: scope, phases, counts, team and commercial figures. A change since submission is a revised offer (mode 6), not a slide edit.
- **Demo mapping slide.** Show each use case, then the demo step, then the requirement IDs.
- **Commercial walk-through.** Present the commercial offer as submitted: price per phase and module, licences, rates, customer effort, warranty and validity.
- **Team.** Introduce the people who will deliver, and say who presents what.
- **Q&A sheet (internal, never shown).** For each likely question: the question, the answer and the owner. Cover:
  - scope edges;
  - licence tiers;
  - AI conditions;
  - integration ownership;
  - data migration;
  - timeline risks;
  - warranty;
  - price drivers.

## E. Statement of work

| # | Section | Content |
|---|---|---|
| 1 | Purpose and background | Why the work is done |
| 2 | Scope | In scope and out of scope, by capability and by phase |
| 3 | Deliverables | Each deliverable with its acceptance criteria |
| 4 | Plan | Phases, milestones, dependencies |
| 5 | Roles and responsibilities | RACI for both parties; the customer's obligations and their timing |
| 6 | Assumptions | From the assumptions register |
| 7 | Governance | Steering, reporting, escalation |
| 8 | Change control | How a change is requested, assessed, priced and approved |
| 9 | Acceptance | Procedure, period and what counts as acceptance |
| 10 | Commercials | Price, payment milestones, expenses, invoicing entity |
| 11 | Term and signatures | Start, end, signatories (`[INPUT REQUIRED FROM BIDDER]` until named) |
| 12 | Appendices | Scope objects; plan; deliverable examples (design template, UAT scenario document, release runbook). Never embed live workbooks |

**Work-package card.** Use one card per work package. The estimate's text columns feed these rows:
- Scope → Activities and Limitations;
- Assumptions → Specific assumptions and Out of scope;
- Deliverables → Deliverables.

| Row | Content |
|---|---|
| Short description | One or two sentences |
| Activities | Numbered list |
| Deliverables | Each marked as a document, configuration, or recording |
| Limitations | The quantified caps: objects, workshop hours, sessions |
| Specific assumptions | Including complexity definitions |
| Prerequisites | Including sign-off of the previous work package |
| Customer responsibilities | Including sign-off windows and deemed approval |
| Out of scope | Closed with a catch-all clause |
| Duration | Weeks |

**Acceptance clauses that work:**
- **Two tiers.** Story-level technical acceptance by the bidder; solution-level functional acceptance executed by the customer.
- **Defect thresholds.** Zero critical and zero high; medium with an action plan; enhancements through change request.
- **Deemed acceptance.** After N business days, with a reminder, named exceptions and an escalation contact.
- **Revision limit.** A revision limit per document, stated once.
- **Effective date.** Acceptance takes effect on whichever comes first: written confirmation or productive use.

**Under time and materials, add these clauses:**
- an effort cap;
- notice at 80% consumption;
- acceptance of advisory work on execution;
- change control for changes that the agile cadence cannot absorb.

**SOW consistency.** The SOW is rebuilt from the offer's registers. Before signature, compare its:
- scope;
- duration;
- work packages;
- hypercare;
- total.

Compare them with the as-sent offer. A SOW copied from an earlier engagement keeps that engagement's facts unless every section is rewritten.

## F. Cover letter

- **Addressee.** As the RFP names them.
- **Reference.** The RFP reference, title and date.
- **Submission statement.** What is submitted and its validity.
- **Bidder.** Legal entity, registered address and contact person.
- **Signature.** By an authorised signatory: `[INPUT REQUIRED FROM BIDDER]` until named.
- **Length.** One page. No marketing.

## G. Commercial assumptions document

- Pricing basis: fixed price, time and materials, or capped.
- Currency and taxes.
- Travel and expenses rule.
- Payment schedule.
- Validity.
- Licence position: who provides the subscriptions, which tiers and add-ons.
- Rates per profile and location.
- Customer effort.
- Warranty and hypercare.
- Change control.
- Deviations from the RFP's commercial terms.

## H. Reusable solution blocks

- **Platform-options matrix.** Compare the candidate constructs on purpose, user, data segregation, business model, what the record represents, automation and licence. For example: ITSM request, Universal Request, CSM case, and HR case when HR data is involved. Close with the choice and its reason.
- **Operating-model mapping.** Map each element of the customer's target operating model to a platform construct, a phase, and a gap or assumption, in that order. Every element gets a row, so nothing is dropped silently.
- **Timeline options.** Offer the options standard, compressed and staged releases. A compressed or staged option carries:
  - a risk statement;
  - its own estimate (second UAT, go-live and hypercare);
  - an assumption that turns a delay caused by the customer into a change request.
- **Product-wave template.** A repeatable set of rows per wave. Later waves are estimated as a share of the first wave, with the reuse stated.

## I. Pre-qualification or questionnaire

For every question, give:
- the answer, starting with yes, no or partly;
- the evidence: certificate, reference or policy, with its annex number.

Only the bidder profile is a source. Never answer a qualification question from memory.
