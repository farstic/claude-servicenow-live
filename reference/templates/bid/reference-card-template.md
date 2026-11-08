# Reference card — template

**One card per engagement, not one per slide.** Every rendering (library slide, success story, PDF, translation) points to the card. Cards live in the git-ignored bidder profile (`clients/_bidder-profile/`). The names of people live in the CRM and never on the card.

## Card

```yaml
id: REF-0000
customer:
  legal_name:                 # internal
  external_name:              # only when consent.naming = named
  anonymised_descriptor:      # e.g. "European rail operator, 200k+ staff"
  renderings: []              # asset IDs of the named, anonymised and translated versions
consent:
  naming: named | anonymised-only | internal-only | unknown
  logo: yes | no | unknown
  quote: approved | not-approved | none
  reference_call: available | on-request | no | unknown
  contact_role:               # role only
  last_confirmed: YYYY-MM-DD
delivery:
  entity:                     # legal entity that delivered (and the heritage brand, if acquired)
  engagement_type: implementation | upgrade | managed-service | platform-management | advisory | assessment | staffing | programme-recovery
  status: won | in-delivery | completed | ongoing-service
  start: YYYY-MM
  end: YYYY-MM | ongoing
  delivery_model: onsite | nearshore | offshore | mixed
  contract_model: t-and-m | fixed-price | managed-service | mixed     # internal
  size_band: S | M | L | XL                                           # internal, by person-days
market:
  industry:                   # one controlled taxonomy
  sub_industry:
  country:
  region:
  languages: []
solution:
  products: []                # current product names, with the release family if known
  integrations: []            # system | direction | method
  custom_objects: none | []   # custom apps, tables, data-model extensions
  scale: {users: , fulfillers: , countries: , sites: , cis: , cases_per_month: }
story:
  headline:
  challenge: []               # three bullets, in the customer's words
  solution: []                # three to five bullets: what the bidder did, not what the product does
  results:                    # at least one for "external-ready"
    - {metric: , baseline: , after: , timeframe: , evidence: }
  proof_of_work: []           # countable outputs: tests run, records remediated, services modelled
  quote: {text: , role: , approved_for: external | internal | none}
  next_phase:
  lessons_learned: []         # internal
governance:
  sensitivity: external-ready | internal-only
  do_not_use: []              # vendor-story | internal-commercial | unverified | consent-missing
  owner_role:
  last_verified: YYYY-MM-DD
  provenance: []              # source and date of every number and claim
```

## Quality gate

A card is **external-ready** only when every condition holds:
- Consent is known.
- The delivering entity is stated.
- Start and end dates are given.
- Product names are normalised.
- It has at least one outcome metric with an evidence source, or an approved quote.
- It has no placeholder residue ("Not provided", "N/S", "XXX").
- It was verified in the last 12 months.

**Strong cards** have:
- outcome metrics with unit and direction;
- proof-of-work counts;
- exact scope and scale;
- a quote attributed by role;
- a follow-on phase;
- visible out-of-the-box-first method.

**Weak cards** have:
- generic benefit bullets;
- product-brochure text;
- "expected benefits" from a deal that is not delivered;
- recycled wording;
- old dates with no "ongoing" marker.

## Selection for a bid

**1. Exclude a reference when any of these applies:**
- It is not the bidder's own delivery, for example a vendor's customer story or another partner's work.
- The consent does not cover the intended use.
- It fails an RFP gate: recency, size, module or engagement type.
- It cannot be verified.
- It is won but not delivered, and the RFP asks for completed references. Use it only if it is labelled "in delivery".
- It would name the prospect's competitor without consent.

**2. Score the remaining references out of 100:**

| Criterion | Points |
|---|---|
| Product and module overlap | 30 |
| Industry | 20 |
| Engagement type | 10 |
| Scale | 10 |
| Recency | 10 |
| Geography, language, regulation | 5 |
| Evidence strength | 10 |
| Reference-call readiness | 5 |

**3. Build the set.**
- Use the number the RFP fixes, otherwise three to five references.
- Cover every major module.
- Include at least one reference each for:
  - the same industry;
  - the same product at scale;
  - the same region.
- Never include two near-identical stories.
- Record the scores in the bid log.

**4. Render each reference for the bid.**
- Use the anonymised descriptor unless naming is consented.
- Remove the internal fields: deal values, competitors, contacts.
- Use the product names of the release proposed.
- Show the date.

**5. Red-team checks.**
- Every number, product, date and entity in the bid matches its card.
- The renderings of one engagement agree.
- No vendor story appears as the bidder's reference.
- Every custom-build claim is framed against the baseline-first position.
