# CSM Specialist v2.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each example shows the full 5-Part Constraint Envelope output for a realistic dispatch input. Read these alongside `SKILL.md` to understand the gateway's output format and depth.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need work-notes audit trail on customer cases — every change made to a case should be logged with the agent's name, timestamp, and what changed. Show me how to design this."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~50K cases/year, ~3K active concurrent
**Sensitivity:** PII (customer contact details on cases)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Implement an audit trail on customer cases capturing agent, timestamp, and changed fields.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

ServiceNow CSM cases extend `task`, which inherits the platform's audit history machinery. The OOB audit flow for a `sn_customerservice_case` record is:

1. **User opens case in CSM Configurable Workspace** — case form renders with `work_notes`, `comments`, and activity stream populated from `sys_journal_field` and `sys_history_set`.
2. **Agent makes a change** — any field write fires the dictionary's audit flag (`sys_dictionary.audit = true`) and writes a row to `sys_history_set` + `sys_history_line` capturing old value, new value, who, and when.
3. **Agent adds a work note** — appends to `case.work_notes` journal; the activity stream renders it with agent name, timestamp, and the work-note body.
4. **Activity stream rebuild** — the case form's activity-stream formatter (baseline UI formatter) reads from `sys_journal_field` + `sys_history_set` and renders the chronological audit log.

Baseline notifications fire on key state transitions but are not required for this audit-trail requirement.

(citation: markdown/customer-service-management/csm-case-management.md, markdown/now-platform/index.md for audit history)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task` parent)

**Critical baseline fields:**

| Field | Type | Purpose |
|---|---|---|
| `sn_customerservice_case.work_notes` | Journal | Internal agent notes; appended-only, agent-stamped |
| `sn_customerservice_case.comments` | Journal | Customer-visible communication |
| `task.sys_updated_on` | DateTime | Last update timestamp (inherited) |
| `task.sys_updated_by` | String | Last update user (inherited) |

**Related baseline tables in scope:**

- `sys_history_set` — one row per record-update event
- `sys_history_line` — one row per field change within a `sys_history_set` event
- `sys_journal_field` — `work_notes` and `comments` content
- `sys_audit` — field-level audit when `sys_dictionary.audit = true`

**Baseline reference fields:** no reference qualifiers material to this requirement.

(citation: markdown/now-platform/index.md, markdown/customer-service-management/csm-data-management.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — Fully covered by baseline.**

The audit-trail requirement is fully satisfied by three baseline constructs:

1. **`work_notes` journal field** on `sn_customerservice_case` — captures agent commentary, timestamped, attributed.
2. **`sys_history_set` + `sys_history_line`** — captures field-level changes (old value, new value, who, when) whenever auditing is enabled on the dictionary entry.
3. **Activity stream formatter** on the case form — renders the combined timeline natively in CSM Configurable Workspace.

No custom object needed. No new table. No new field. Pure configuration: ensure `sys_dictionary.audit = true` on the fields the engagement wants to audit (typically all of: `state`, `assigned_to`, `priority`, `category`, `account`, `contact`, `consumer`, `contract`, `entitlement`).

(citation: markdown/now-platform/index.md for audit history)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.**

No Technical Designer dispatch needed. The configuration path:

1. Confirm field-level audit flags in `sys_dictionary` for the fields the engagement wants to track. Typically baseline already audits `state`, `assigned_to`, `priority`; verify and extend as needed.
2. Confirm the activity-stream formatter is enabled on the case form in CSM Configurable Workspace (baseline behaviour; verify it has not been removed in form layout).
3. If a structured *export* of the audit trail is needed (e.g., for compliance reporting), use a report or a Performance Analytics indicator over `sys_history_set`. No custom storage needed.

Consult flags: none fire for this request. PII is present on the case form, but baseline ACLs on `sn_customerservice_case` already enforce read/write rules for agent vs customer roles — no architectural security work needed.

## Part 5 — Anti-Patterns to Block

If Technical Designer or Developer is invoked downstream for unrelated work on this case form, block these:

- **Do not create a custom audit table** (`u_case_audit`, `x_acme_csm_case_audit`, etc.). Baseline `sys_history_set` covers field-level audit; baseline `work_notes` covers commentary. Custom audit table is a §1.1 violation.
- **Do not duplicate audit-write logic in a Business Rule.** Field auditing is handled by the platform when `sys_dictionary.audit = true` — a custom BR that writes audit rows on update is redundant and risks doubled rows.
- **Do not write a custom activity-stream renderer.** Baseline UI formatter handles this. Replacing it loses the platform's evolution path (UI Builder, Next Experience).
- **Do not query `sys_history_set` with deep joins in a Script Include** without indexing review. On high-volume case tables this becomes a performance trap. Use the baseline `GlideRecordHistoryWalker` API or built-in audit reports.

## Open Questions

None. Requirement is fully satisfied by baseline configuration.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need to add a 'customer journey stage' on every customer service case — onboarding, adoption, expansion, renewal, churn. Agents should set it on case create; we want to report on case volume per stage."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~80K cases/year
**Sensitivity:** Internal CRM data, not PII

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Add a "customer journey stage" attribute on customer service cases with five values for reporting.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

`sn_customerservice_case` is the baseline CSM case table. The OOB flow:

1. **Case create** — agent or auto-create from email/chat/portal. Form renders fields from baseline `sn_customerservice_case` and `task` parent.
2. **Case categorisation** — agent sets `category`, `subcategory`, `priority`, `account`, `contact`/`consumer`, `contract`, `entitlement`.
3. **Case work** — state transitions through `1` New → `10` Open → `18` Work in Progress → `3` Awaiting Info → `6` Resolved → `7` Closed.
4. **Reporting** — Performance Analytics indicators and reports run against `sn_customerservice_case` and join to `customer_account` for customer-segment analysis.

The proposed "customer journey stage" is a **dimension** of the case record itself, not a new entity. It belongs on the case, not in a separate table.

(citation: markdown/customer-service-management/csm-case-management.md)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task`)

**Existing baseline fields that are NOT a fit for "journey stage":**

| Field | Why not |
|---|---|
| `sn_customerservice_case.state` | Lifecycle state, not customer journey |
| `sn_customerservice_case.priority` | Severity, not journey |
| `sn_customerservice_case.category` | Issue type (e.g., billing, technical), not journey |
| `customer_account.customer_lifecycle_stage` (if present in baseline — verify) | This lives on the *account*, not the case. Cases inherit account context but the request is per-case journey, which may differ from account-level stage. |

**Critical baseline fields to respect:** `account`, `contact`, `consumer`, `state`, `priority`, `category` — all already exist and the journey-stage field must not conflict with their semantics.

**Related baseline tables:** `customer_account` for account-level context; `sn_customerservice_contract` for contract-stage context (renewal date, contract state).

(citation: markdown/customer-service-management/configure-csm-accounts-contacts.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: B — Requires baseline extension.**

The smallest viable extension:

**Add a single Choice field on baseline `sn_customerservice_case`.**

- **Field name:** `sn_customerservice_case.u_customer_journey_stage` (engagement scope prefix per engagement convention; field type Choice)
- **Choice values:** `onboarding` / `adoption` / `expansion` / `renewal` / `churn`
- **Mandatory:** No (agent may leave blank on case create if unknown; populate on next-touch)
- **ACL:** Inherits `sn_customerservice_case` field ACL — no new ACLs required.
- **Reporting:** Add to case-list view in CSM Configurable Workspace; Performance Analytics indicator `Cases by Customer Journey Stage` straightforward to define.

(citation: markdown/customer-service-management/csm-data-management.md)

**Why this is Verdict B, not Verdict A:**

The five values map a *new dimension* that does not exist on `sn_customerservice_case` today. Reusing `category` would collide with issue-type semantics and break existing reports. Reusing `state` would collide with case-lifecycle semantics. The smallest possible extension is one Choice field on the baseline table — no new table, no new scoped app, no state-machine change.

**Why this is Verdict B, not Verdict C:**

A new field on a baseline table is the smallest-scope custom object per §1.1's preference hierarchy (top of the list). It is not a new table, not a new scoped app, not a new Connection Alias, not a state extension on a baseline state field. It is the minimum-viable customisation, which §1.1 accepts at routing-time without halting — provided the Chief Architect approves the field name and engagement-scope conventions.

(citation: markdown/customer-service-management/csm-data-management.md — case data model)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer's deliverable should include:

1. **Field definition** — `u_customer_journey_stage` (Choice, 5 values), mandatory=No, default=blank.
2. **Form layout update** — surface the field in CSM Configurable Workspace case form, near `account` / `contract` (customer-context cluster).
3. **List view update** — add column to baseline case list view (engagement default view).
4. **Choice population** — populate `sys_choice` records for the five values.
5. **Reporting note** — direction to Reporting & Analytics for the indicator (not Technical Designer's deliverable).
6. **No new ACLs** — explicitly note that field ACLs inherit from `sn_customerservice_case`.
7. **No code** — this is pure configuration. No Developer dispatch needed unless agents request auto-population logic, in which case a small Business Rule is acceptable and would route through Developer + Code Reviewer.

Consult flags:

- **Reporting & Analytics Specialist** — for the Performance Analytics indicator definition (downstream, not blocking).

## Part 5 — Anti-Patterns to Block

- **Do not create a `u_customer_journey` child table.** One field on the baseline table is enough; a child table is an over-design and a §1.1 escalation.
- **Do not put the journey stage on `customer_account` instead of the case.** Account-level journey is a separate concern; cases within one account can sit at different journey points (a churned customer can still have open support cases).
- **Do not extend `sn_customerservice_case.state` with new state values for journey stages.** State is lifecycle; journey is a dimension. Conflating them breaks SLA definitions and case-flow reports.
- **Do not duplicate journey logic in a Business Rule that writes to a new table.** A Choice field is enough; if auto-population is needed, the BR writes to `u_customer_journey_stage` on the same case record.
- **Do not name the field with a global prefix** if engagement convention uses scope prefix `x_acme_*` — coordinate with App Engine Specialist on naming.

## Open Questions

1. **Engagement field-naming convention** — is `u_customer_journey_stage` correct, or does the engagement use `x_<scope>_customer_journey_stage`? Confirm with Chief Architect before Technical Designer dispatches.
2. **Auto-population** — should the field auto-populate from `customer_account.customer_lifecycle_stage` (if that field exists on baseline `customer_account` in the engagement's release)? Verify baseline field availability before design.
3. **Choice value localisation** — does the engagement need localised choice labels? Affects sys_choice record design.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 3 — Verdict A (custom table requested, baseline already covers it)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need a separate 'case escalation' table for our CSM cases. Each escalation should track from-tier, to-tier, reason code, business-impact summary, and stakeholder list. We need a related list on the case form with full escalation history. Build the table and the Script Include that creates an escalation record when the agent clicks an Escalate button."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~80K cases/year, ~10% escalate at least once (~8K escalation events/year)
**Sensitivity:** Customer escalations include business-impact statements (potentially commercially sensitive)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Custom case-escalation table with structured fields, a related list on the case form, and a Script Include behind an Escalate button.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

Australia ships the baseline **Case and Account Escalation** feature, which is exactly this process:

1. A user with the escalation requester role selects the **Escalate Case** related link on the case form and supplies reason, justification, escalation severity, escalation template and watch list.
2. If the template requires approval, the approval group approves or rejects through the approval subflow.
3. The agent manages the escalation on the Escalation form — trend, work notes, related cases, Task SLAs. Updates replicate to the case activity as work notes.
4. A user with the de-escalation requester role de-escalates when the issue is resolved.

(citation: markdown/customer-service-management/customer-service-case-escalation.md, markdown/customer-service-management/case-escalation-process.md)

## Part 2 — Data Model Alignment

| Requirement | Baseline construct |
|---|---|
| One record per escalation, full history | `sn_customerservice_escalation` (Escalations) — one row per escalation request |
| Reason code, business-impact summary | Reason and justification fields on the Escalation form |
| Severity / tier change | `sn_customerservice_escalation_severity`; assignment-group change audited on the case |
| Stakeholder list | Escalation watch list (form updates notify the watch list) |
| Related list on the case | Escalation records reference the source case |
| Escalate button | Baseline **Escalate Case** related link — no custom UI Action or Script Include |
| Escalation SLAs | Baseline escalation SLA definitions keyed on severity |

"From-tier → to-tier" as two explicit references is the only element without a dedicated field; the assignment-group history on the case covers it. If the business insists on explicit fields, that is a Verdict B field extension on `sn_customerservice_escalation`, not a new table.

(citation: markdown/customer-service-management/case-escalation-components.md, markdown/customer-service-management/case-escalation-form.md, markdown/customer-service-management/administer-case-account-escalation.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — fully covered by baseline.** The requested custom table, Script Include and button are rejected as duplicates of the baseline escalation feature. Configuration path: Escalation Management guided setup (templates, severities, approval groups, escalation SLAs), roles for requesters and de-escalation requesters.

(citation: markdown/customer-service-management/configure-escalation-management.md)

## Part 4 — Routing Recommendation

PROCEED — configuration only. No Technical Designer or Developer dispatch for the table. Security & GRC consult: business-impact text in the justification field is commercially sensitive → review ACLs on `sn_customerservice_escalation` and watch-list membership.

## Part 5 — Anti-Patterns to Block

- **Do not build a custom escalation table or log.** `sn_customerservice_escalation` is the baseline log.
- **Do not build a custom Escalate UI Action / Script Include.** Use the baseline Escalate Case related link and approval subflow.
- **Do not copy escalation updates into case work notes by script.** The feature already replicates them.
- **Do not assume the feature is configured.** Confirm templates, severities and roles on the instance before go-live.

## Open Questions

1. Is Case and Account Escalation already configured on the instance (templates, severities, approval groups)?
2. Are explicit from-tier / to-tier fields required for reporting, or is the case assignment-group history sufficient? (Explicit fields → Verdict B.)

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 4 — Verdict C (§1.1 Halt)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"Agents on the CSM case need to see each customer account's monthly product-usage history from our billing platform — product, metric, quantity, month — going back three years, and we report on it per account. Design the table model and the Script Include that loads it nightly."*
**Module:** CSM
**Volume:** ~4,000 accounts × ~25 metrics × 12 months ≈ 1.2M rows/year
**Sensitivity:** Commercial usage data (no PII)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Persist three years of monthly account-level product-usage history from an external billing platform, shown on the case and reportable per account.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

CSM models the customer (`customer_account`, contacts, consumers), what they own (install base) and their service contracts and entitlements. Usage *history* from an external billing system is not part of the baseline CSM process; the baseline integration options are remote tables (query the external source live) and imported data on baseline tables.

(citation: markdown/customer-service-management/csm-integration-remote-tables.md, markdown/customer-service-management/attributes-and-configuration-of-install-base-management.md)

## Part 2 — Data Model Alignment

| Baseline candidate | Covers | Falls short |
|---|---|---|
| Install base item attributes | Current configuration of what the account owns | One current value per attribute, no monthly time series |
| Remote table over the billing platform | Live display on the case without storing data | Nothing persisted — no three-year reporting on the instance, every view hits the billing API |
| Work notes / attachments on the account | Free-text or file snapshots | Not structured, not reportable |

No baseline table holds a per-account, per-metric, per-month time series.

(citation: markdown/customer-service-management/csm-remote-tables-definition.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: C — requires a custom object. §1.1 HALT.**

```
🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)

1. Baseline options evaluated: install base attributes, remote table, work notes / attachments — see Part 2 (citations above).

2. Custom object proposed (smallest viable scope): one new top-level table holding account × product × metric × month rows, in the engagement's existing scope (no new scoped app), referencing `customer_account`. Field list deferred to Technical Designer after approval.

3. Consequences of approval: ~1.2M rows/year → Performance & Scale consult (indexing, archival after three years); App Engine / custom-table licensing → Licensing consult; nightly import → Integration Specialist owns the load (import set + transform map, not a hand-written loader).

4. Alternatives if rejected:
   - (i) Remote table only — live view on the case, no on-instance history or reporting.
   - (ii) Report in the billing platform and link to it from the account — no data in ServiceNow.
   - (iii) Store only the latest month on install base attributes — current figure, no history.

Decision required from the Chief Architect before any specialist is dispatched.
```

## Part 4 — Routing Recommendation

**HALT.** No Technical Designer, Integration Specialist or Developer dispatch until the proposal is approved, rejected or replaced. If approved → record an ADR, then Technical Designer (table model) → Integration Specialist (import) with Performance & Scale and Licensing consults. If rejected → alternative (i) is the recommended default.

## Part 5 — Anti-Patterns to Block

- **Do not write a custom nightly loader Script Include** — loads go through import sets and transform maps (Integration / Migration patterns).
- **Do not create a new scoped app** for one table.
- **Do not add 36 monthly columns to `customer_account`** — a wide-row workaround is still a custom data model, and a worse one.
- **Do not skip archival design** — the table grows without bound.

## Open Questions

1. Is on-instance reporting a hard requirement, or would a live remote-table view (Alternative A) satisfy agents?
2. Which scope does the engagement use for approved custom tables?

---

*End of CSM Specialist Gateway Response.*
```

---

## Reading these examples

- **Example 1 (Verdict A)** — pattern for the most common request type. The Domain Expert proves baseline covers it and the build chain is short-circuited. PROCEED — baseline configuration only. No Technical Designer dispatch.
- **Example 2 (Verdict B)** — pattern for legitimate baseline extensions. One field on a baseline table. §1.1 accepts this at the smallest scope. PROCEED — Technical Designer dispatch with envelope as constraints.
- **Example 3 (Verdict A, custom table requested)** — the user asks for a custom table that a baseline feature already provides (Case and Account Escalation). The Domain Expert rejects the custom object and routes to configuration. Always check the release's docs before assuming a baseline table is missing.
- **Example 4 (Verdict C)** — pattern for §1.1 halt. No baseline construct holds the data; the Domain Expert evaluates the baseline candidates, proposes the smallest custom object, and halts for a Chief Architect decision.

The §6.2 post-build review fires after Technical Designer returns a spec for Verdict B and Verdict C (approved) cases. The Domain Expert re-validates the spec against the envelope before Developer is dispatched. Post-build review examples are not included in this file — they are short reviews following the four-check structure in `SKILL.md`.

---

*End of CSM Specialist EXAMPLES.md v2.1 — Example 3 corrected (baseline Case and Account Escalation exists in Australia), Example 4 added as the Verdict C pattern.*
