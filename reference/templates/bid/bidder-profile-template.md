# Bidder profile — template

The bidder profile holds the company's own bid facts. It lives in a **git-ignored** folder, by default `clients/_bidder-profile/`, never in the engine files. The Bid & Proposal Manager reads it. Nothing in it is copied into a skill, a template or a script.

## Files

| File | Content | Used for |
|---|---|---|
| `company.md` | Legal entity and registered address per country; headcount; revenue year; ServiceNow partner level and specialisations; certified consultants and certifications count; offices and delivery centres (onshore, nearshore, offshore); industries; differentiators that can be evidenced. | Company presentation, cover letter, qualification questionnaires |
| `certifications.md` | ISO 9001, 14001, 27001, SA8000 or equivalents, with certificate number, scope, issuer and expiry; ServiceNow partner certificates. | "Provide information about the norms for which you are certified" |
| `rate-card.md` | Profiles (for example PM, SA, BPC, STC, TC, QA, OCM, developer, AI specialist) with day rates per delivery location and currency, validity, travel rule and minimum daily hours. | Estimate pricing; never pasted into a skill or a shared template |
| `commercial-terms.md` | Standard payment terms, validity, warranty position, liability cap, change control, acceptance procedure, subcontracting, local billing and invoicing entity. | Commercial assumptions; deviations list |
| `reference-catalogue.md` | One row per engagement: customer, industry, country, products, scope, year, quantified results, approved quote yes/no, reference-call readiness, approval date, source deck. Vendor customer stories are kept apart and marked do-not-cite. | Reference selection |
| `reference-cards/` | One card per engagement in the format of `reference-card-template.md`, with consent and evidence. | References in a bid |
| `cv-library/` | Approved CVs in the format of `cv-template.md`, with certifications, expiry and the person's consent. | Team section, CV annex, staffing matrix |
| `answer-library/` | Approved answers to recurring pre-qualification and questionnaire questions (schema below). | Pre-qualification, supplier, security and data-protection questionnaires |
| `boilerplate/` | Approved company, method, governance and OCM slides and texts, in English, with no customer content. | Building decks without recycling another bid |
| `deny-list.txt` | One name per line: every other customer, project code name, product nickname or persona from other bids that must never appear in a new bid. | `scripts/bid/hygiene-scan.js --deny` |
| `assumptions-library.md` | Standard assumptions and exclusions the company accepts, by area. | Assumption registers |

## Answer library entry

One file per entry, grouped by category:
1. company identity;
2. financial standing;
3. footprint and delivery model;
4. practice size;
5. customers and references;
6. partnership and certifications;
7. contractual positions;
8. information security;
9. data protection;
10. resource profile;
11. module capability statements.

```yaml
id: PQ-SEC-ISO-01
category: information-security
question_patterns:            # wordings seen in past questionnaires, for matching
  - "Does your company hold an ISO 27001 certificate?"
answer_type: yes_no_comment   # open | closed_dropdown | yes_no_comment | numeric | list | name_plus_cv
basis: "<legal entity | group | delivery location>"   # always stated in the answer
yes_no: Partial               # Yes | No | Partial - put it first in the comment when the Yes/No cell is locked
short_answer: "<= 300 characters"
long_answer: "<= 1,600 characters"
evidence: ["<certificate or policy reference, scope, validity>"]
attach_allowed: depends-on-rfp # if extra documents are forbidden, cite the evidence in the text
owner_role: "<security officer | finance | practice lead>"
last_verified: YYYY-MM-DD
refresh: annual               # annual | quarterly | per-bid
must_agree_with: []           # IDs of answers that must say the same thing
do_not_say: []                # wordings that failed before, e.g. an evasive "varies by country"
```

Answer rules:
- **Basis.** Every figure states its basis: entity or group, year, region.
- **Consistency.** Answers that must agree are checked together, for example a "named clients" answer against a "not allowed to name clients" answer.
- **Comments.** No bare "Yes" where a comment is required. "N/A" always carries its reason.

## Rules

- **Approval:** an item in the profile is used only if it is approved.
  - References and quotes need approval to be named.
  - CVs need the person's consent.
- **Rates and terms:** rates and commercial terms stay in the profile and in the priced workbook. Drafts and presentations show them only where the RFP asks for them.
- **Review:** the profile is reviewed every quarter. Certificates and references expire.
