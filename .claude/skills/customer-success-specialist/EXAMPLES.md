# Customer Success Specialist v1.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each example shows the full 5-Part Constraint Envelope output for a realistic dispatch input. Read these alongside `SKILL.md` to understand the gateway's output format and depth. Client names are fictional.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"Our customer success managers need a health score per customer engagement built from CSAT, NPS and the number of P1 support cases, shown red, amber or green. When NPS drops below 30 we want a risk raised automatically and the manager should be able to launch our 'get to green' plan from it."*
**Module:** Customer Success Management (`sn_acct_lc`) on CSM
**Customer model:** B2B accounts and contacts
**Volume:** ~400 active engagements; daily metric collection
**Sensitivity:** Commercial data (no PII beyond contact names)

### Gateway Response

```markdown
# Customer Success Specialist Gateway Response — engagement health score from CSAT, NPS and P1 cases with colour bands, automatic NPS risk and a remediation play

**Domain Expert:** Customer Success Specialist v1.0 (CSM Specialist co-fires: P1 case data comes from CSM cases)
**Release family:** Australia (installed Customer Success version to be confirmed on instance)

---

## Part 1 — OOB Process Map

1. **Metrics** — three Data Context Engine data sources collect the inputs: CSAT and NPS from PA indicators (frequency equal to or greater than the PA collection frequency) and P1 cases from a **Table** data source over the CSM case table (Aggregate Count, Group by sold product or account). Each data source gets a context (Engagement table) and a Context Engine Mapper, then is **published**; data lands in Context Engine Data when the scheduled jobs run.
2. **Health score** — a fourth data source with Source **Calculated**, Breakdown table Engagement, Target table Engagement, Target field *Health score*, Target query field sys_id; one Segment with Segment Configurations weighting the three metrics (weights total 100; P1 cases *Minimize*, CSAT and NPS *Maximize*). The score is published on the engagement page at the next collection.
3. **Colours** — Global colour-band records (0–100) for red, amber and green on the Success landing and Engagement pages.
4. **Automatic risk** — an engagement risk definition of type **Metric** (data source NPS, threshold condition less than 30, applicable engagements), published; the **Customer Success Risk Analyzer** job creates the risk signal, and a repeat breach adds a risk occurrence. The shipped sample *Drop in NPS health* already shows the pattern.
5. **Remediation** — from the risk signal the manager selects **Create success play**; the play created from a risk is tagged as a risk solution. The shipped demo subflow *Get to Green play* is the starting point.

Baseline notifications are not documented for these steps. Role gates: data sources, health score and visualizations `sn_acct_lc.customer_success_application_admin`; context engine mappers, risk definitions and colour bands `sn_acct_lc.customer_success_agent` (as printed in the docs).

(citation: markdown/acct-lifecycle-events/account-lifecycle-define-data-source.md, markdown/acct-lifecycle-events/account-lifecycle-define-data-source-table.md, markdown/acct-lifecycle-events/account-lifecycle-setup-health-defn.md, markdown/acct-lifecycle-events/account-lifecycle-setup-color-banding.md, markdown/acct-lifecycle-events/account-lifecycle-setup-risk-defn.md, markdown/acct-lifecycle-events/account-lifecycle-risk-demo-data.md, markdown/acct-lifecycle-events/account-lifecycle-success-flows.md)

## Part 2 — Data Model Alignment

| Table | Label | Scope | Role in this design |
|---|---|---|---|
| `sn_data_ctx_engine_src` | Data Source | sn_data_ctx_engine | CSAT, NPS, P1 cases, Health score (Calculated) |
| `sn_data_ctx_engine_ctx` / `_map` | Context / Context Engine Mapper | sn_data_ctx_engine | Resolve each metric to the engagement |
| `sn_data_ctx_engine_brkdwn_seg` / `_seg_conf` | Segment / Segment Configuration | sn_data_ctx_engine | Weights and direction of the three metrics |
| `sn_data_ctx_engine_data` | Context Engine Data | sn_data_ctx_engine | Collected values |
| `sn_acct_lc_engagement` | Engagement | sn_acct_lc | Target of the *Health score* |
| `sn_acct_lc_eng_risk_def` | Engagement Risk Definition | sn_acct_lc | NPS < 30 rule |
| `sn_acct_lc_risk_signal_issue` / `sn_acct_lc_risk_occurrence` | Risk Signal and Issue / Risk Occurrence | sn_acct_lc | Generated risks |
| colour banding table (name not documented) | Color Banding | sn_acct_lc | Red / amber / green |

Parent tables and column names are not documented — verify on instance. Do not use the deprecated Engagement Health Definition / Health Metric Configuration tables.

(citation: markdown/acct-lifecycle-events/account-lifecycle-domain-separation.md, markdown/acct-lifecycle-events/account-lifecycle-success-business-rules.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict A — Fully covered by baseline

Every requirement is a configuration record in a shipped table: data sources, contexts, mappers, segments, colour bands, a risk definition and a success-play definition. No new table, field, scope, state value or alias.

(citation: markdown/acct-lifecycle-events/account-lifecycle-setup-health-defn.md, markdown/acct-lifecycle-events/account-lifecycle-setup-risk-defn.md)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.** Configuration order: PA indicators confirmed → three metric data sources + contexts + mappers → publish → Calculated health data source + segment + segment configurations → colour bands → risk definition (publish) → success-play definition for the get-to-green play. **Flow Designer Specialist** only if the get-to-green subflow must differ from the demo subflow.

Co-fire: **CSM Specialist** (P1 cases from the CSM case table). Consults: **Licensing** (Customer Success subscription; PA indicators need Performance Analytics), **Reporting & Analytics** only if the CSAT/NPS PA indicators do not yet exist.

## Part 5 — Anti-Patterns to Block

- Do not build a health table or a scheduled script that computes the score — use the Calculated data source writing the engagement *Health score* (citation: markdown/acct-lifecycle-events/account-lifecycle-setup-health-defn.md).
- Do not configure the deprecated health-definition tables (citation: markdown/acct-lifecycle-events/account-lifecycle-setup-health-defn.md).
- Do not write a business rule that creates risks — use the Metric risk definition run by the Customer Success Risk Analyzer (citation: markdown/acct-lifecycle-events/account-lifecycle-setup-risk-defn.md).
- Do not colour scores in UI scripts — use colour-band records (citation: markdown/acct-lifecycle-events/account-lifecycle-setup-color-banding.md).

## Open Questions

- OQ-1: Do PA indicators for CSAT and NPS exist, and at what collection frequency? (proposed default: daily)
- OQ-2: Weights for the three metrics (proposed default: CSAT 40, NPS 40, P1 cases 20 — the documented example pattern).
- OQ-3: Red/amber/green band boundaries (proposed default: 0–49, 50–69, 70–100).
- OQ-4: The normalisation from raw value to a 0–100 sub-score is not documented — validate on the instance with sample data before go-live.
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"During onboarding our customers send us their sites and their user list in Excel. We want them to upload the files themselves, we validate that every site has a country and that every user's email domain belongs to the customer, and only clean rows are loaded."*
**Module:** Customer Success Management — account onboarding
**Customer model:** B2B accounts and contacts
**Volume:** ~60 onboardings/year; up to 5,000 users per customer
**Sensitivity:** PII (contact names and email addresses)

### Gateway Response

```markdown
# Customer Success Specialist Gateway Response — customer self-upload of sites and users during account onboarding with field- and record-level validation

**Domain Expert:** Customer Success Specialist v1.0 (CSM Specialist co-fires: customer contacts and locations are base-layer records)
**Release family:** Australia

---

## Part 1 — OOB Process Map

1. A new customer account fires the flow *Creation of account onboarding case*; the playbook *Account lifecycle onboarding process* runs.
2. In stage *Data capture and validation* the playbook creates a **data import task** (`sn_ti_core_imp_task`, Type `data_capture`) through the activity *Create & View Tech Task Record*. Customer contacts and Location are among the eight default import tables.
3. The customer uploads Excel files on the task, **Process files** loads them to the staging table, **Validate** marks rows *Ready to publish* or *Needs attention*; corrected rows return to *Yet to validate*; **Publish** loads clean rows; the task is closed with close notes.
4. **Data Validation Assist** holds the rules: field level (here *Mandatory* on the country column) and record level (a script returning `validationPassed` and `message`).

Role gates: Import Builder `sn_acct_lc.agent` plus a Playbooks role; import run and Data Validation Assist `admin` as printed (the docs also say the customer uploads — verify the customer-facing access on the instance).

(citation: markdown/acct-lifecycle-events/account-lifecycle-configure.md, markdown/acct-lifecycle-events/account-lifecycle-use-playbook-data-capture.md, markdown/acct-lifecycle-events/account-lifecycle-add-data-import.md, markdown/acct-lifecycle-events/account-lifecycle-import-data.md, markdown/acct-lifecycle-events/account-lifecycle-data-import-valid.md, markdown/acct-lifecycle-events/account-lifecycle-data-valid-assist.md)

## Part 2 — Data Model Alignment

| Table | Label | Role in this design |
|---|---|---|
| `sn_acct_lc_onb_case` | Account onboarding case | Parent of the import task |
| `sn_ti_core_imp_task` | Data import task | Upload, validate, publish |
| `sn_acct_lc_data_validation_assist` | Data Validation Assist | Country mandatory; email-domain script |
| staging tables (e.g. `sn_acct_lc_account_onb_import_locations`) | Import set staging | Shipped for the default imports |
| `cmn_location`, customer contact table | Targets | Existing baseline tables — no new target |

If the shipped default imports for Customer contacts and Location fit the customer's template, no Import Builder run is needed; if the template differs, Import Builder generates a new data source (*Customer Success DS* prefix), an import set staging table, a transform map, two list views and an activity definition into the **existing** target table.

(citation: markdown/acct-lifecycle-events/account-lifecycle-import-builder.md, markdown/acct-lifecycle-events/account-lifecycle-add-data-import.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict B — Requires baseline extension

- The country check is a field-level Data Validation Assist record (configuration).
- The email-domain check is a **record-level validation script** — code, so Developer and Code Reviewer, not a custom object.
- A different Excel template means an **Import Builder** import definition; its staging import set table is part of the documented import mechanism and is recorded here, not treated as a custom business table. The targets stay baseline.

No new business table, scope, state value or alias.

(citation: markdown/acct-lifecycle-events/account-lifecycle-data-valid-assist.md, markdown/acct-lifecycle-events/account-lifecycle-import-builder.md)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints**: template mapping, validation rule list, playbook activity placement. Then **Developer** for the record-level script → **Code Reviewer**. **Flow Designer Specialist** if the playbook activity changes.

Co-fire: **CSM Specialist** (customer contacts). Consults: **Security & GRC** (customer-uploaded PII, who can read the staging table), **Licensing** (Customer Success subscription), **DevOps / Release** (Import Builder artefacts must be captured and promoted together; staging backup job `Scheduled Staging Data Backup Job` is inactive by default).

## Part 5 — Anti-Patterns to Block

- Do not write a custom import script or a custom staging table by hand — use Import Builder (citation: markdown/acct-lifecycle-events/account-lifecycle-import-builder.md).
- Do not import into a new target table — Import Builder targets existing tables (citation: markdown/acct-lifecycle-events/account-lifecycle-import-builder.md).
- Do not copy the record-level sample script as it is — it is an illustration (citation: markdown/acct-lifecycle-events/account-lifecycle-data-valid-assist.md).
- Do not treat this as a one-time migration — legacy bulk loads outside onboarding go to Migration Specialist (citation: markdown/acct-lifecycle-events/account-lifecycle-data-import-valid.md).

## Open Questions

- OQ-1: Which customer-side role uploads the files, and does it see only its own account's task? (customer access is not documented — verify)
- OQ-2: Retention of staging data — the backup job attaches CSVs older than `sn_acct_lc.BackupDays`; is that acceptable for PII? (proposed default: keep the job inactive, purge staging after publish)
- OQ-3: Does the customer's user template match the shipped Customer contacts import? (decides whether Import Builder is needed)
```

---

## Example 3 — Verdict C (§1.1 Halt — documented extension point)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We are a SaaS provider. Product telemetry — active users, licences used, feature usage per customer — sits in our cloud data warehouse. Feed it into Customer Success so adoption scores and health update automatically, and design the tables we need."*
**Module:** Customer Success Management — product adoption, Data Context Engine
**Customer model:** B2B accounts with sold products
**Volume:** ~300 customers × ~15 products; daily telemetry, ~2M warehouse rows/month
**Sensitivity:** Commercial usage data; user-level data must stay aggregated

### Gateway Response

```markdown
# Customer Success Specialist Gateway Response — product telemetry from a cloud data warehouse into adoption and health scores

**Domain Expert:** Customer Success Specialist v1.0 (CSM Specialist co-fires: sold products and install base; CMDB & CSDM co-fires: product models for capability maps)
**Release family:** Australia

---

## Part 1 — OOB Process Map

1. **Usage records** — adding applicable sold products to an engagement auto-creates **Product Usage** and **Product Capability Usage** records; published **product capability maps** per product model add capability usage. Fields already exist for monthly active users, licenses used, transactions, adoption score.
2. **Collection** — the Data Context Engine offers three documented paths for external data: (a) an **External** data source, with data written "using the Table API" into Context Engine Data; (b) a **Table** data source over a **Workflow Data Fabric** table (zero copy, needs a timestamp or date column); (c) a PA indicator.
3. **Scores** — Calculated data sources write the *Adoption score* on Product Usage (Breakdown table Sold Products) and feed the engagement *Health score*.
4. **Display** — DCE Visualizations on the product usage and capability pages.

(citation: markdown/acct-lifecycle-events/account-lifecycle-prod-usage-data-model.md, markdown/acct-lifecycle-events/account-lifecycle-create-prod-cap.md, markdown/acct-lifecycle-events/account-lifecycle-define-data-source.md, markdown/acct-lifecycle-events/account-lifecycle-define-data-source-data-fabric-table.md, markdown/acct-lifecycle-events/account-lifecycle-define-data-source-calculate.md, markdown/acct-lifecycle-events/account-lifecycle-configure-dce-visual.md)

## Part 2 — Data Model Alignment

| Path | Tables | New object? |
|---|---|---|
| (a) External → Table API | `sn_data_ctx_engine_src` (External), `sn_data_ctx_engine_data`, `sn_prod_cap_core_prod_usage`, `sn_prod_cap_core_prod_cap_usage` | No new table — integration writes into shipped tables |
| (b) Table source over Workflow Data Fabric | a **new data fabric table** + the same DCE and usage tables | **Yes** — a new table in a chosen scope |
| Capability model | `sn_prod_cap_core_prod_cap`, `sn_prod_cap_core_prod_cap_map` (product model from the CMDB model list) | No |

The Context Engine Data column list (the External payload contract) is not documented — verify on instance.

(citation: markdown/acct-lifecycle-events/account-lifecycle-domain-separation.md, markdown/integrate-applications/create-data-fabric-table-zcc.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict C — §1.1 halt protocol (documented extension point), conditional

The request asks for tables. Path (a) needs **none** (Verdict B: integration into shipped tables). Path (b) is the docs' own prerequisite for the Table data source — a Workflow Data Fabric table — and is still a new table.

### OPEN QUESTION — CUSTOM OBJECT PROPOSAL

1. **Baseline options evaluated.** Path (a) External data source via the Table API — no new table, but the warehouse data is copied into Context Engine Data and needs an integration job. Path (c) PA indicators — does not reach an external warehouse. (citation: markdown/acct-lifecycle-events/account-lifecycle-define-data-source.md)
2. **Custom object proposed (smallest scope).** One Workflow Data Fabric table over the warehouse's aggregated daily usage view (account, product, metric, date, value), with a primary key so data sources can reference it. Scope: global (admin only) or an existing customer-owned application scope (data steward with delegated-developer roles); whether it may be created inside the `sn_acct_lc` Store-app scope is not documented — verify with DevOps / Release. Documented extension point. (citation: markdown/acct-lifecycle-events/account-lifecycle-define-data-source-data-fabric-table.md, markdown/integrate-applications/create-data-fabric-table-zcc.md)
3. **Consequences of approval.** Workflow Data Fabric / Zero Copy Connector entitlement (Licensing); a warehouse connection and credentials (Integration Specialist, Security & GRC); a resolver script when grouping by account and product (Developer, Code Reviewer); query cost on every collection (Performance & Scale); ADR.
4. **Alternatives if rejected.** Path (a) — the warehouse pushes daily aggregates into Context Engine Data through the Table API (recommended default if Workflow Data Fabric is not entitled). Keep it a push: a ServiceNow-side pull needs a new Connection & Credential Alias, which is its own §1.1 object.

Decision required from the Chief Architect before any specialist is dispatched.

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal required.** After the ruling: ADR → Integration Specialist (connection or Table API feed) → Technical Designer (data sources, contexts, mappers, calculated scores, capability maps) → Developer (resolver script) → Code Reviewer. Consults: Licensing, Security & GRC, Performance & Scale, DevOps / Release.

## Part 5 — Anti-Patterns to Block

- Do not create a custom usage or telemetry table — Product Usage and Product Capability Usage exist (citation: markdown/acct-lifecycle-events/account-lifecycle-prod-usage-data-model.md).
- Do not compute adoption scores in a script — use a Calculated data source writing *Adoption score* (citation: markdown/acct-lifecycle-events/account-lifecycle-define-data-source-calculate.md).
- Do not create usage records by script — they are created when sold products and capability maps change (citation: markdown/acct-lifecycle-events/account-lifecycle-prod-usage-data-model.md).
- Do not load user-level telemetry — aggregate per account, product and day before it reaches the instance (Security & GRC).

## Open Questions

- OQ-1 (blocking): Path (a) or path (b)? Is Workflow Data Fabric entitled?
- OQ-2 (blocking): Are sold products and product models in place for every customer? Usage records hang off them.
- OQ-3: Which metrics drive the adoption score, with which weights?
```

---

*End of Customer Success Specialist EXAMPLES.md v1.0.*
