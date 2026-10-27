# IRM & TPRM Specialist v1.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each example shows the full 5-Part Constraint Envelope output for a realistic dispatch input. Read these alongside `SKILL.md` to understand the gateway's output format and depth. Client names are fictional.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"Business units must request onboarding of a new ICT provider through a form. Risk management classifies the provider by an inherent risk questionnaire, sends security and resilience questionnaires to the provider, and two approval levels decide — the risk manager, then the CISO for critical providers. After approval the contract team records the contract outcome."*
**Module:** Third-party Risk Management
**Client:** a payment-services company (fictional "Contoso Payments")
**Volume:** ~60 onboardings and ~300 reassessments per year; ~900 active third parties
**Sensitivity:** Regulated (DORA, EBA outsourcing); provider contact data

### Gateway Response

```markdown
# IRM & TPRM Specialist Gateway Response — ICT provider onboarding with inherent risk questionnaire, provider questionnaires, two-level approval and contract outcome

**Domain Expert:** IRM & TPRM Specialist v1.0 (no gateway co-fires; CSM co-fires only if the company's `core_company` records are also CSM customer accounts)
**Release family:** Australia (TPRM Store-app version to be confirmed on instance)
**Product and licence:** Third-party Risk Management — a separate Store product, metered per engagement with managed activities; not part of the IRM Pro SKU

---

## Part 1 — OOB Process Map

1. **Request** — the requester (role `snc_internal` only) submits *Request due diligence for third-party risk* in Employee Center; the request lands with the group *Due diligence request assigners*, which assigns an owner. Request type *onboard*.
2. **Inherent risk questionnaire (IRQ)** — internal assessment sent to the business owner; answers drive the inherent risk and, on classic assessments, the external questionnaires attached automatically (IRQ-answer → questionnaire mapping). With the Smart Assessment Engine enabled, the auto-attach is not available and the assessor selects the questionnaires.
3. **Due diligence** — external assessments sent through the Third-party portal to the provider's primary contacts; lifecycle Draft → Submitted to third party → Responses received → Generating observations (issue generation rules raise issues) → Finalizing with a third party → Closed.
4. **Approval** — Approver Configurator configuration *Third-party due diligence default configuration*: level 1 risk manager (specific approver group), level 2 CISO with a dynamic condition on the provider's third-party tier; up to ten sequential levels; a rejection stops later levels. Approvers must belong to the TPR manager group.
5. **Contract risk** — the contract negotiator records *Engagement contract executed*, *Not contracted* or a skip; the TPR manager or owner closes the request.
6. **Onboarding licence rule** — activities for a company not yet in `core_company` are not counted as managed activities.

States are documented by name only — numeric values verify on instance.

(citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-workflow-in-workspace.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-ws-request-dd-for-engagement.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-setup-eq-irq.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-external-assessment-lifecycle.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-approving.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-ws-contract-risk-process.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-managed-activity.md)

## Part 2 — Data Model Alignment

| Table | Label | Role in this design |
|---|---|---|
| `core_company` | Company / Third party | Provider record — Vendor flag, Third-party tier, Status |
| `sn_vdr_risk_asmt_vendor_engagement` | Third-party engagement | The service relationship being onboarded |
| `sn_tprm_dd_request` | Third-party due diligence request | The onboarding request |
| `sn_tprm_approval` | Approval | Approval records per level |
| internal assessment (name printed three ways) | Internal assessment / IRQ | Inherent risk questionnaire — verify the table name on instance |
| `sn_vdr_risk_asmt_assessment` | Third-party risk assessment | External questionnaires |
| `sn_vdr_risk_asmt_issue` / `sn_vdr_risk_asmt_task` | Issue / Task | Observations and remediation |
| `sn_grc_appr_approval_configuration` / `_level` / `_rule` | Approver Configurator | Two levels and the critical-provider rule |

Roles: `sn_vdr_risk_asmt.vendor_assessor`, `sn_vdr_risk_asmt.approver`, `sn_vdr_risk_asmt.vendor_risk_manager`, `sn_vdr_risk_asmt.contract_negotiator`, `vendor_contact` (external). TPRM tables are not covered by Entity Based Access.

(citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-data-model.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-roles.md, markdown/governance-risk-compliance/grc-common-functions/tables-that-consume-entity-based-access.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict A — Fully covered by baseline

Every requirement is configuration: IRQ and questionnaire templates, issue generation rules, scoring rules, Approver Configurator levels and rules, groups. No new table, field, scope, state value or alias.

(citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-ongoing-config.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-set-request-approval-levels.md)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.** Decide the Smart Assessment Engine question first (it changes step 2 and cannot be reversed), then templates → scoring → issue generation rules → approval levels → groups. **Flow Designer Specialist** only for notifications beyond the shipped workflow.

Consults: **Licensing** (TPRM engagements per year, portal contacts, Now Assist for TPRM if wanted — TPRM is not covered by an IRM subscription), **Security & GRC** (provider contact data, external portal access), **DevOps / Release** (SAE switch in sub-production first).

## Part 5 — Anti-Patterns to Block

- Do not build an onboarding catalog flow or custom approval tables — use the due diligence request workflow and Approver Configurator (citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-approving.md).
- Do not create a custom supplier portal — use the Third-party portal with `vendor_contact` (citation: markdown/governance-risk-compliance/third-party-risk-management/vendor-portal.md).
- Do not edit a questionnaire template already in use — duplicate it (citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-workflow-in-workspace.md).
- Do not enable the Smart Assessment Engine in production without testing — it cannot be reversed (citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-migrate-asmnt-sae.md).

## Open Questions

- OQ-1: Classic assessments or Smart Assessment Engine? (proposed default: SAE, decided and tested in sub-production; IRQ auto-attach then becomes a manual assessor step)
- OQ-2: Which tier makes a provider "critical" for the CISO level? (proposed default: Third-party tier 1 - Very High and 2 - High)
- OQ-3: Are provider companies also CSM customer accounts on `core_company`? (if yes, CSM co-fires)
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We assess ICT risk per business application: inherent risk on a 5×5 impact × likelihood matrix, control effectiveness, residual risk. The incident count of the last 90 days should feed likelihood automatically. Residual risk must be visible on the business application record, and anything above appetite must raise an issue."*
**Module:** Risk Management with Advanced Risk
**Client:** an insurer (fictional "Fabrikam Insurance")
**Volume:** ~450 business applications; annual assessment, quarterly for critical applications
**Sensitivity:** Regulated, internal

### Gateway Response

```markdown
# IRM & TPRM Specialist Gateway Response — ICT risk assessment per business application with automated incident-driven likelihood, residual risk on the application record and appetite breach issues

**Domain Expert:** IRM & TPRM Specialist v1.0 (CMDB & CSDM Specialist co-fires: entities and the result field on business applications)
**Release family:** Australia (Risk and Advanced Risk Store-app versions to be confirmed)
**Product and licence:** IRM — Risk Management and Advanced Risk (IRM Pro SKU); automated factors need "the Governance, Risk, and Compliance Enterprise license" — tier to verify against the subscription

---

## Part 1 — OOB Process Map

1. **Entities** — entity type *Business application* with an entity filter on `cmdb_ci_business_app` (or a CMDB Query Builder saved query tagged "GRC Scoping"); entities generated by "Update Entities from Filters".
2. **Methodology** — an assessment methodology (RAM) assessing **Risk** for the business-application entity class: inherent (manual factors Impact and Likelihood, rating criteria for the 5×5 matrix), control effectiveness, residual by **lookup matrix**; roll-up and response rules; *auto-issue on breach of appetite or tolerance*.
3. **Automated likelihood** — an automated factor over the incident table filtered by the entity's application and the last 90 days, aggregated as a count and mapped to the likelihood scale; it keeps re-running on assessments in Monitor.
4. **Appetite** — appetite scale and statuses (Within appetite, Outside appetite, Outside tolerance) on risk, statement and entity.
5. **Lifecycle** — risk Draft → Assess → Respond → Monitor; assessment workspace statuses New → In progress → Awaiting approval → Completed; Approver Configurator for second-line approval.
6. **Write-back** — "Update assessment results to source record" maps results only for **object** assessments; for risk-context assessments the residual score stays on the risk. Showing it on the application needs a field on `cmdb_ci_business_app` and a mapping — the extension below.

(citation: markdown/governance-risk-compliance/grc-common-functions/what-is-an-entity-filter.md, markdown/governance-risk-compliance/grc-risk-management-workspace/risk-assessment-methodology-form.md, markdown/governance-risk-compliance/grc-risk-management-workspace/residual-assessment-form.md, markdown/governance-risk-compliance/grc-risk-management-workspace/configure_automated_factor.md, markdown/governance-risk-compliance/grc-risk-management-workspace/configure-risk-appetite.md, markdown/governance-risk-compliance/grc-risk-management-workspace/risk-lifecycle-using-advanced-risk.md, markdown/governance-risk-compliance/grc-risk-management-workspace/any-object-assessment.md)

## Part 2 — Data Model Alignment

| Table | Role |
|---|---|
| `sn_grc_profile` / `sn_grc_profile_type` | Business-application entities and their entity type |
| `sn_risk_risk` (extends `sn_grc_item`) | ICT risks per application |
| `sn_risk_definition` / `sn_risk_framework` | ICT risk statements and framework |
| assessment methodology, factors, assessment instance | Not documented by table name — verify on instance |
| `sn_grc_issue` | Appetite-breach issues |
| `cmdb_ci_business_app` | Source of entities; target of the new residual-score field |

(citation: markdown/governance-risk-compliance/grc-risk-management-workspace/r_TableInsWRisk.md, markdown/governance-risk-compliance/grc-common-functions/tables-installed-with-grc.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict B — Requires baseline extension

Entities, methodology, matrix, automated factor, appetite and breach issues are configuration (Verdict A). Two extensions:
1. **A field on `cmdb_ci_business_app`** for the residual rating, populated either by an object-context methodology with result mapping or by a documented script hook — CMDB & CSDM decides the field placement.
2. If the incident-to-application link is not a simple filter, a **scripted automated factor** (`sn_grc.developer` with `sn_risk.admin`) → Developer + Code Reviewer.

Same record type in several object methodologies → "the latest assessment overwrites the source record" — one methodology per mapped field.

(citation: markdown/governance-risk-compliance/grc-risk-management-workspace/configure-inherent-assessment.md, markdown/governance-risk-compliance/grc-risk-management-workspace/factors.md)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints**, then Developer for any scripted factor. Co-fire **CMDB & CSDM** (entity source, field on business application). Consults: **Licensing** (GRC Enterprise licence for automated factors — verify), **Security & GRC** (second-line review rights), **Performance & Scale** (automated factor over the incident table for 450 entities), **Reporting & Analytics** (heat maps and committee packs).

## Part 5 — Anti-Patterns to Block

- Do not build a scoring table or script outside the methodology — use rating criteria and the residual lookup matrix (citation: markdown/governance-risk-compliance/grc-risk-management-workspace/residual-assessment-form.md).
- Do not edit the published methodology later — copy it and retire the original (citation: markdown/governance-risk-compliance/grc-risk-management-workspace/copy-ram.md).
- Do not create a custom KRI table for incident counts — use the automated factor or GRC Metrics (citation: markdown/governance-risk-compliance/grc-risk-management-workspace/exploring-grc-metrics-in-irm.md).
- Do not switch on "Migrate to Advanced Risk Assessments" in production without a decision record — it cannot be disabled (citation: markdown/governance-risk-compliance/grc-risk-management-workspace/risk-lifecycle-using-advanced-risk.md).

## Open Questions

- OQ-1: Must an approved assessment stay unchanged? Automated factors keep recalculating Monitor assessments (proposed default: snapshot results in reporting; no automated factor on regulated year-end assessments).
- OQ-2: Is the GRC Enterprise licence entitled? If not, likelihood is a manual factor fed by a report.
- OQ-3: Appetite analysis qualitative, quantitative or both? (proposed default: qualitative, 1-point scale)
```

---

## Example 3 — Verdict C (§1.1 Halt — documented extension point), conditional

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We roll TPRM out to four group subsidiaries. Each subsidiary may see only its own vendors, engagements and assessments; the parent company sees everything. Use the same entity-based access we use for risks and controls."*
**Module:** Third-party Risk Management, Entity Based Access
**Client:** an insurance group (fictional "Northwind Group")
**Volume:** ~2,500 third parties across five legal entities
**Sensitivity:** Regulated; confidential commercial data

### Gateway Response

```markdown
# IRM & TPRM Specialist Gateway Response — legal-entity segregation of TPRM records for a group rollout

**Domain Expert:** IRM & TPRM Specialist v1.0
**Release family:** Australia
**Product and licence:** TPRM (separate product) + GRC: Entity Based Access (common layer); Group rollout raises TPRM engagements and operator counts — Licensing

---

## Part 1 — OOB Process Map

1. **Entity Based Access** segregates records by entity through entity, entity-class and entity-type configurations plus the bulk access utility ("Make sure to complete both these steps"); it cannot be combined with user hierarchy or access-group access.
2. **Coverage** — the applicable-record list holds Risk, Advanced Risk, Audit, Compliance and AI governance tables; **no TPRM table is on it**. Australia also removed "Assessments using entities" from TPRM, so TPRM records do not carry a GRC entity to filter on.
3. **Extension procedure** — applying Entity Based Access to further tables is documented only in KB1646304 (new columns, ACL changes) — a documented extension point.
4. **Domain separation** — TPRM support level is Basic and its tables carry `sys_domain`; GRC domain separation separates data, not logic ("separation of logic and process is not fully supported").

(citation: markdown/governance-risk-compliance/grc-common-functions/entity-based-access.md, markdown/governance-risk-compliance/grc-common-functions/using-entity-based-access.md, markdown/governance-risk-compliance/grc-common-functions/tables-that-consume-entity-based-access.md, markdown/release-notes/rn-summary-removed-features.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-domain-separation.md, markdown/governance-risk-compliance/grc-common-functions/grc-domain-separation.md)

## Part 2 — Data Model Alignment

`core_company`, `sn_vdr_risk_asmt_vendor_engagement`, `sn_tprm_dd_request`, `sn_vdr_risk_asmt_assessment`, `sn_vdr_risk_asmt_issue`, `sn_vdr_risk_asmt_task` — none carries an entity restriction field in the docs. The DORA register's legal entities (LEI) are register records, not access entities.

(citation: markdown/governance-risk-compliance/third-party-risk-management/tprm-data-model.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-legal-entity.md)

## Part 3 — §1.1 Baseline-First Verdict

### Verdict C — §1.1 halt protocol (documented extension point), conditional

### OPEN QUESTION — CUSTOM OBJECT PROPOSAL

1. **Baseline option evaluated** — Entity Based Access does not cover TPRM tables; TPRM assessments no longer use entities. Domain separation (Basic) is the only shipped segregation for TPRM data, but it brings instance-wide domain design, global shared configuration and no logic separation (citation: markdown/governance-risk-compliance/grc-common-functions/tables-that-consume-entity-based-access.md, markdown/governance-risk-compliance/third-party-risk-management/tprm-domain-separation.md).
2. **Custom object proposed** — extend Entity Based Access to the six TPRM tables per KB1646304: one restriction column per table plus ACL changes, in the scope the KB prescribes (verify), driven by a legal-entity reference on the engagement.
3. **Consequences of approval** — new columns and ACLs on Store-app tables (upgrade review on every TPRM release), population of the entity on every new record, Performance & Scale review (KB2069935), Security & GRC sign-off on the access model.
4. **Alternatives if rejected** — (a) domain separation for the group, decided as a programme-level design; (b) separate instances per subsidiary; (c) shared visibility with reporting filters only (no segregation — needs the group's compliance agreement).

No design artefact is produced in this turn.

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal required.** After the ruling: Technical Designer (access model), Developer (ACL scripts if any), Code Reviewer. Consults now: **Security & GRC** (access model), **Licensing** (group engagements and operator counts), **Performance & Scale**, **DevOps / Release** (Store-upgrade impact).

## Part 5 — Anti-Patterns to Block

- Do not assume Entity Based Access already protects TPRM records (citation: markdown/governance-risk-compliance/grc-common-functions/tables-that-consume-entity-based-access.md).
- Do not combine Entity Based Access with user hierarchy or access groups (citation: markdown/governance-risk-compliance/grc-common-functions/entity-based-access.md).
- Do not treat a KB procedure as approval for new columns and ACLs (citation: markdown/governance-risk-compliance/grc-common-functions/entity-based-access.md).
- Do not domain-separate to split business logic per subsidiary (citation: markdown/governance-risk-compliance/grc-common-functions/grc-domain-separation.md).

## Open Questions

- OQ-1: Which alternative does the group prefer if the extension is rejected? (proposed default: domain separation evaluated in a separate programme decision)
- OQ-2: May the parent company's second line see all subsidiaries' assessments? (proposed default: yes, read-only)
```
