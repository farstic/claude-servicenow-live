# ITSM Specialist v2.0 — Examples

Three gold-standard examples of ITSM Specialist gateway output. One per §1.1 verdict (A — fully baseline, B — baseline extension, C — §1.1 halt). Each example shows the input dispatch envelope, the full 5-Part Constraint Envelope produced, and an explanation of why each choice was made.

---

## Example 1 — Verdict A (Fully Baseline)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need to escalate P1 and P2 incidents to the on-call duty manager if they're not acknowledged within 15 minutes. The escalation should email the duty manager and add a work note explaining the escalation."
>
> Module: ITSM
> Volume: ~500K incidents/year, ~50K active concurrent
> Sensitivity: standard ITSM (no PII beyond caller name and email)
> Engagement: Acme — uses baseline `cmn_rota` for on-call, has `Major Incident Management` plugin active, no current state-model customisations.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — P1/P2 incident escalation to on-call duty manager on 15-min no-acknowledgement

## Part 1 — OOB Process Map

This request touches three core baseline ITSM processes: incident lifecycle, on-call coordination, and baseline notifications.

### Incident lifecycle (relevant subset)

- `incident.priority` is set to 1 (Critical) or 2 (High) by Data Lookup Definition keyed on `impact` and `urgency` at insert time.
- `incident.assignment_group` is set by baseline assignment rules, also fired at insert.
- `incident.state` transitions through New (1) → In Progress (2). The "not acknowledged" condition maps to "state remains New and `assigned_to` is not populated, or `assigned_to` is populated and no work_note has been added by the assignee".
- *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*

### On-call coordination

- On-Call Scheduling (`com.snc.on_call_rotation`) is active. The group's Shift [`cmn_rota`] holds Rosters [`cmn_rota_roster`] — one per escalation level (primary, secondary…) — with On-call Members [`cmn_rota_member`].
- An escalation is a series of notifications along the shift's escalation path. Escalation policies define the steps (escalation level, **time to next step**, reminders) and a final **Catch-All** that can notify the group manager, the shift manager or an individual when nobody has acknowledged.
- A **Trigger Rule** [`trigger_rule`] on `incident` (conditions such as priority 1–2 and the assignment group) starts the shipped subflow **On-Call: Assign by Acknowledgement**, which notifies along the escalation path until someone acknowledges and then assigns the incident.
- "Who is on call" is available through the `OnCallRotation` script include (`whoIsOnCall`, `getPrimaryUser`, `getEscalatees`).
- *(citations: `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`, `markdown/it-service-management/on-call-scheduling/create-custom-esc-policy-oncall.md`, `markdown/it-service-management/on-call-scheduling/create-update-schedule-oncall.md`, `markdown/it-service-management/on-call-scheduling/create-trigger-rule-oncall.md`, `markdown/it-service-management/on-call-scheduling/subflows-installed-on-call-scheduling.md`, `markdown/api-reference/server-api-reference/c_OnCallRotationAPI.md`)*

### Notifications

- On-call notifications are sent by the On-Call subflows through the channels set for the roster or member — email, SMS and voice (Notify), Microsoft Teams, Slack, mobile push — with reminders between escalation steps. No separate notification record is needed for the escalation itself.
- *(citations: `markdown/it-service-management/on-call-scheduling/subflows-installed-on-call-scheduling.md`, `markdown/it-service-management/on-call-scheduling/escalation-remind-settings-oncall.md`)*

## Part 2 — Data Model Alignment

| Table | Action | Critical fields |
|---|---|---|
| `incident` | Read only — no extension required | `priority` (1–5), `state`, `assignment_group` (ref to `sys_user_group`), `assigned_to` (ref to `sys_user`; set by the subflow on acknowledgement), `work_notes` (escalation audit) |
| `sys_user_group` | Read only | `manager` (the static manager — used only if the Catch-All targets the group manager) |
| `cmn_rota` | Configuration — pre-existing in engagement | the group's Shift |
| `cmn_rota_roster`, `cmn_rota_member` | Configuration | escalation levels and their members (the duty manager as a later level or as the Catch-All) |
| `trigger_rule` (extends `sysrule_assignment`) | New configuration record | table `incident`, conditions (priority 1–2, assignment group), Run once, subflow On-Call: Assign by Acknowledgement |
| `on_call_escalation` and related `on_call_escalation_*` tables | Written by the platform | baseline record of every escalation, its levels, contact attempts and responses |

No new tables. No new scoped app. No new state values. No new Connection Aliases. No new sys_user_group structures.

*(citations: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`, `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`)*

## Part 3 — §1.1 Baseline-First Verdict

**Verdict A — Fully covered by baseline.**

The escalation requirement is fully satisfied by On-Call Scheduling configuration:

1. **An escalation policy on the group's shift** — step 1 notifies the primary roster; **time to next step = 15 minutes**; the next step (or the **Catch-All**) is the duty manager — the shift manager, the group manager or a duty-manager roster. *(citations: `markdown/it-service-management/on-call-scheduling/create-custom-esc-policy-oncall.md`, `markdown/it-service-management/on-call-scheduling/create-update-schedule-oncall.md`)*
2. **A trigger rule on `incident`** — conditions priority 1–2 and the assignment group, Run once, action = subflow **On-Call: Assign by Acknowledgement**, which notifies along the path until someone acknowledges and then assigns the incident. *(citations: `markdown/it-service-management/on-call-scheduling/create-trigger-rule-oncall.md`, `markdown/it-service-management/on-call-scheduling/subflows-installed-on-call-scheduling.md`)*
3. **Audit** — work notes plus the `on_call_escalation*` records; the escalation tracking icon on the Assignment group field (property `com.snc.on_call_rotation.log_escalations`). *(citations: `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`, `markdown/it-service-management/on-call-scheduling/track-escalation-progress-oncall.md`)*

No scheduled job, custom event or custom notification is needed. No custom tables. No new scope. No state-machine changes.

If the engagement defines "acknowledged" differently from an on-call acknowledgement (for example, a state change or a work note — Open Question 2), the shipped subflow no longer covers it and the gap goes to Technical Designer as a design decision.

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer receives this envelope and produces a configuration spec:
- The escalation policy (steps, 15-minute time to next step, reminders, Catch-All = duty manager).
- The rosters and members (primary, duty-manager level) if they do not exist yet.
- The trigger rule (table, conditions, Run once, subflow).
- The notification channels per roster or member.

No Developer work is expected; Code Reviewer fires only if a script is introduced. Licensing & Entitlement is consulted if SMS or voice (Notify) is chosen. Post-build, ITSM Specialist re-fires for the §6.2 review.

## Part 5 — Anti-Patterns to Block

The following are explicitly blocked in any downstream design:

- **Do not create a custom escalation table per priority tier.** Escalation policies on the shift (one per priority if needed) handle tiers, and the `on_call_escalation*` records are the audit. *(citations: `markdown/it-service-management/on-call-scheduling/create-custom-esc-policy-oncall.md`, `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`)*
- **Do not poll incidents with a scheduled job to detect "no acknowledgement".** On-Call: Assign by Acknowledgement with the policy's time to next step and reminders already does this. *(citations: `markdown/it-service-management/on-call-scheduling/subflows-installed-on-call-scheduling.md`, `markdown/it-service-management/on-call-scheduling/escalation-remind-settings-oncall.md`)*
- **Do not extend `incident.state` with a new "Escalated" value.** Escalation is an event, not a state — the incident remains in New or In Progress. *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*
- **Do not use `OnCallRotation.startEscalations` or a custom paging script.** It is a legacy scripted path (event + escalation business rule); use the trigger rule and the shipped subflow. *(citation: `markdown/api-reference/server-api-reference/c_OnCallRotationAPI.md`)*
- **Do not hardcode shift or roster sys_ids.** If a script ever needs the on-call person, resolve it at runtime with `OnCallRotation.whoIsOnCall()`. *(citation: `markdown/api-reference/server-api-reference/c_OnCallRotationAPI.md`)*
- **Do not write the escalation audit to a custom table** — use `incident.work_notes` and the `on_call_escalation*` records. This is a §1.1 hot spot. *(citation: `markdown/it-service-management/on-call-scheduling/tables-oob-oncall.md`)*
- **If SLA tracking is added, do not detect breaches through the `task_sla` stage** — on the 2011 engine a breach sets Has breached and leaves the stage unchanged. *(citation: `markdown/it-service-management/service-level-management/r_TaskSLATable.md`)*

## Open Questions

1. **Duty manager resolution.** Is the duty manager the shift manager, the group manager, a dedicated duty-manager roster configured as a later escalation level, or an individual set as the Catch-All?
2. **Acknowledgement definition.** Is "acknowledged" the on-call acknowledgement through the notification channel (covered by On-Call: Assign by Acknowledgement), or a state change / work note on the incident (not covered by the shipped subflow — a design decision)?
3. **Channels.** Email only, or SMS and voice (needs Notify), Microsoft Teams, Slack, mobile push?
4. **Re-escalation and reminders.** How many reminders before the next step (default interval 15 minutes), and who follows the duty manager if nobody responds?
5. **Coverage.** Do the shift hours cover the P1/P2 expectation (for example 24×7)?
```

### Explanation

Verdict A is the most common verdict for ITSM requests — ITSM has unusually rich baseline coverage and most "escalation", "routing", "priority matrix" requests are configuration tasks, not custom-development tasks. The envelope demonstrates:

- **Part 1's rigorous coverage** of three baseline processes (incident, on-call, notifications) so Technical Designer knows what's already there.
- **Part 2's explicit "no new tables, no new scope"** — the §1.1 enforcement statement is upfront, not hidden.
- **Part 3's Verdict A rationale** decomposes the request into baseline On-Call configuration — escalation policy, trigger rule with a shipped subflow, baseline audit — with citations for each, and rejects the custom scheduled-job / event / notification build.
- **Part 4's routing** sends to Technical Designer (because the design has multiple moving parts) but flags that the design itself is configuration-shaped.
- **Part 5's anti-pattern list** includes the "do not create a custom escalation table" pattern explicitly — even though Technical Designer hasn't started yet, the constraint is documented so the §6.2 post-build review can flag violations cleanly.

The Open Questions are real — the request as written has ambiguity in three places. Surfacing them upstream prevents Technical Designer from making silent default choices that the user might disagree with later.

---

## Example 2 — Verdict B (Baseline Extension)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need to track 'business severity' separately from technical severity on incidents. Business severity is set by the Service Owner and reflects revenue/customer impact. It should drive escalation timing, not technical priority."
>
> Module: ITSM
> Volume: ~200K incidents/year
> Sensitivity: standard ITSM
> Engagement: BankCo — Service Owners are a defined role (`sn_incident.service_owner`), Service Owners are already mapped to `cmdb_ci_service` records via a custom group structure. No current customisations to `incident.priority` or `incident.impact`.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — Business severity tracking on incidents, distinct from technical priority

## Part 1 — OOB Process Map

This request touches incident lifecycle, priority/impact handling, and Service-Owner role gating. It does **not** touch on-call or SLA directly (though business severity could feed into SLA design downstream — that's a separate consideration).

### Incident priority handling (baseline)

- Baseline `incident.priority` is a 1–5 derived field, calculated from `incident.impact` (1–3) and `incident.urgency` (1–3) via the baseline Data Lookup Definition `Priority Lookup` (which can be reconfigured per engagement).
- Both `impact` and `urgency` are choice fields with baseline labels: Impact = High/Medium/Low, Urgency = High/Medium/Low.
- *(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md`)*
- *(citation: `markdown/it-service-management/incident-management/def-prio-lookup-rules.md`)*

The request introduces a new dimension — "business severity" — that is conceptually adjacent to `impact` but driven by a different role (Service Owner) and a different signal (revenue/customer impact rather than technical impact). This does **not** map cleanly to `impact` or `urgency`.

### Service Owner role and `cmdb_ci_service` linkage

- Baseline `incident.cmdb_ci` references the configuration item the incident is logged against.
- The engagement has Service Owners mapped to `cmdb_ci_service` records via an existing group structure (per dispatch envelope) — so the resolution path "incident → cmdb_ci → service → Service Owner" is already in place.

## Part 2 — Data Model Alignment

| Table | Action | Reasoning |
|---|---|---|
| `incident` | **Add one new field** — `u_business_severity` (Integer or Choice) | Smallest possible scope per §1.1 hierarchy. A new field on a baseline table is the preferred extension. |
| `cmdb_ci_service` | Read only — no extension needed | Service Owner resolution path is already in place. |
| `sys_user_grmember` | Read only | Service Owner group membership lookup. |
| Baseline business rule on `incident` | New record (configuration, not extension) | To restrict who can update `u_business_severity` to Service Owners. |
| ACL rule on `incident.u_business_severity` | New record (configuration, not extension) | Same role-gating intent — UI-level enforcement complements server-side BR. |

**Field design (Verdict B proposal):**

```
Field name:      u_business_severity
Field label:     Business Severity
Type:            Choice (Integer 1–4)
Choices:         1 - Critical (Revenue stoppage)
                 2 - High (Major customer impact)
                 3 - Medium (Single-tenant degradation)
                 4 - Low (Cosmetic or no customer impact)
Default value:   4
Mandatory:       false (not all incidents need business severity assessment)
```

The `u_` prefix is the engagement's convention for non-scoped custom fields on baseline tables. The dispatch envelope didn't specify scoped app vs. global; given this is a single field on a baseline table without complex logic attached, baseline scope + `u_` prefix is the standing pattern — confirm with engagement standards in Open Questions.

*(citation: `markdown/it-service-management/incident-management/reference-section-for-incident-management.md` for the incident data model that we are extending)*

## Part 3 — §1.1 Baseline-First Verdict

**Verdict B — Requires baseline extension.**

### Baseline option evaluated and why it falls short

| Baseline option | Why it falls short |
|---|---|
| **Reuse `incident.impact`** | `impact` is technical impact (system availability), not business impact (revenue). Mixing them blurs reporting and confuses ITIL practitioners. |
| **Reuse `incident.urgency`** | `urgency` is "how quickly does this need to be resolved" — a technical-process concept. Business severity is not about resolution speed, it's about revenue/customer-impact assessment. |
| **Compound priority field** | The baseline `Priority Lookup` already takes two dimensions. Adding a third dimension to the lookup would force every existing `impact`/`urgency` combination to be re-evaluated with a third axis — not a minor change, and changes baseline `priority` semantics globally. |
| **Use `incident.business_impact` (Australia release family note)** | This field **does not exist** as a baseline integer on `incident` in Australia. The MIM workbench has a separate `incident.business_impact` field but it's a string narrative, not a structured severity. Not suitable for driving escalation timing logic. *Citation availability: limited — verify against engagement's instance.* |
| **Use a related Service Owner attestation table** | This would be a new table, which is a more invasive extension than a single field. Violates the §1.1 preference hierarchy. |

The smallest viable extension is **a new integer/choice field on the baseline `incident` table**.

### Custom object proposed (smallest possible scope)

- **One new field on `incident`:** `u_business_severity` (Choice, 1–4).
- **One new ACL** restricting write to Service Owners.
- **One new Business Rule** (server-side enforcement, complements ACL).
- **Escalation timing driven by the field** — with On-Call Scheduling, one escalation policy per business severity on the shift (policy conditions on `u_business_severity`), as in Example 1; otherwise a Data Lookup Definition mapping `u_business_severity` to an escalation timing parameter.

No new tables. No new scoped app. No new state values. The "extension" is a column addition on a baseline table.

### Consequences of approval

- **Data model:** `+1 field` on `incident`. Backfill consideration — existing ~200K incidents will have `u_business_severity` = NULL until a backfill script or accept-NULL-as-implicit-Low policy is decided.
- **Deployment:** No new update set or scoped app required. Goes in the engagement's existing customisation update set.
- **Support cost:** Service Owners need training on the field and its meaning. Minor.
- **Platform-upgrade risk:** Low. `u_` prefix isolates from baseline-field naming. Upgrade-safe.

### Alternatives if rejected

- **Degraded design:** Use `incident.urgency` for business severity, document the semantic deviation in operational documentation, accept that ITIL purists will object. (Not recommended — creates reporting confusion.)
- **Deferred functionality:** Document business severity in `work_notes` only ("Business severity: Critical — revenue stoppage observed"), no structured field. Loses queryability and reporting.
- **Out-of-band tracking:** Track business severity in a spreadsheet or external system, reconcile manually. Loses tight coupling to incident lifecycle.

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer receives this envelope and produces:
- The full field-extension spec for `incident.u_business_severity` (type, label, choices, default, mandatory).
- The ACL rule (target table=`incident`, field=`u_business_severity`, operation=write, role=Service Owner role, condition=Service Owner is mapped to this incident's `cmdb_ci`).
- The Business Rule (server-side enforcement, same logic as ACL but as a defensive layer).
- The Data Lookup Definition (`u_business_severity` → escalation timing parameter).
- The escalation timing: On-Call escalation policies conditioned on `u_business_severity` (the Example 1 pattern).

## Part 5 — Anti-Patterns to Block

- **Do not create a custom `business_severity_log` table** to track changes to the field. `sys_history_set` baseline audit captures field-level changes on `incident` automatically when field auditing is enabled in the dictionary. *(citation: `markdown/platform-security/audit-mgmt-console.md`)*
- **Do not reuse `incident.impact` or `incident.urgency`** for business severity. The two ITIL dimensions are well-defined; conflating them with revenue-impact causes long-term reporting confusion.
- **Do not extend `incident.priority` directly** — `priority` is derived. Extending it would require modifying the Data Lookup Definition globally and risk breaking baseline reports and Performance Analytics indicators.
- **Do not hardcode the Service Owner role name** in the ACL condition — reference the role via name lookup or sys_id with a comment explaining why.
- **Do not implement Service Owner resolution as a custom Script Include** if the engagement already has a working "incident → cmdb_ci → service → Service Owner" path. Reuse it.
- **Do not skip backfill consideration** — Technical Designer must decide the strategy (NULL = implicit Low, vs explicit backfill script).

## Open Questions

1. **Scope convention.** The proposal uses `u_` prefix on a baseline-scope field. Confirm whether the engagement has a standing rule for `u_` vs scoped-app custom fields. If a scoped app is preferred, the field becomes `<scope>.u_business_severity` and ACL/BR records move into the scoped app.
2. **Service Owner role identity.** The dispatch envelope mentions `sn_incident.service_owner` as the role. Confirm this is the engagement's actual role name and that it's already populated for the relevant CIs.
3. **Backfill strategy.** NULL = implicit Low, or explicit Service-Owner-driven backfill exercise? Recommend defaulting to NULL with a future backfill story if reporting needs require it.
4. **Read access.** Should `u_business_severity` be visible to all `itil` users (read-only) or restricted to Service Owners? Recommend read-visible-to-itil, write-restricted-to-Service-Owner.
5. **Escalation-timing linkage.** The request says business severity "drives escalation timing". Confirm whether escalation timing is per-incident (the Example 1 pattern reads `u_business_severity` and adjusts the 15-minute timer) or per-CI (the timer is on the cmdb_ci_service record).
```

### Explanation

Verdict B is the second most common verdict — the request genuinely needs *something* beyond baseline, but the smallest possible something. The envelope demonstrates:

- **Part 3's structured baseline evaluation** — five alternatives considered, each with explicit "why it falls short" before proposing the extension. This is the §1.1 halt-protocol structure for an approved-rather-than-rejected extension.
- **Part 3's note on `incident.business_impact`** — flagged as "limited citation availability; verify against engagement's instance" because the field exists in newer release families but behaves differently in Australia. This is the release-family precision the citation discipline requires.
- **Part 4's hand-off to Technical Designer** — Technical Designer now has a clear spec to design against. The envelope did not design the ACL matrix or write the BR; that's Technical Designer's job downstream.
- **Part 5's anti-patterns** include "do not create a custom `business_severity_log` table" — pre-empting the most likely §1.1 violation a builder might introduce when implementing this.

The Open Questions are real and specific. Each one is the kind of decision that, if left ambiguous, leads to rework downstream.

---

## Example 3 — Verdict C (§1.1 Halt)

### Input dispatch envelope

> **Domain Expert dispatch — ITSM Specialist gateway**
>
> **Request:** "We need a multi-tier change-approval matrix that considers: (1) change risk score, (2) the business unit owning the affected service, (3) whether the change touches PCI-scoped systems, (4) whether the change window overlaps a frozen period, and (5) the change requester's seniority level. The matrix should return: which approval groups are required, in what order, with what SLA per approval step. Today we have ~50 different approval scenarios documented in spreadsheets that change quarterly."
>
> Module: ITSM (Change Management)
> Volume: ~10K change requests/year
> Sensitivity: PCI-scope flag is sensitive (regulated)
> Engagement: GlobalCo — uses baseline `change_request`, has CAB process active, PCI compliance is audited, no current custom change tables. Service-Owner-to-BU mapping exists in CMDB.
> Release family: Australia

### Expected gateway output

```markdown
# ITSM Specialist Gateway Response — Multi-dimensional change-approval matrix with ~50 quarterly-changing scenarios

## Part 1 — OOB Process Map

This request touches change management approval orchestration, change risk scoring, CAB workflow, and approval SLA tracking.

### Baseline change-approval pattern

- Baseline `change_request` has a state machine: New → Assess → Authorize → Scheduled → Implement → Review → Closed.
- Approvals happen in the `Authorize` state, driven by baseline `sysapproval_approver` records.
- Approver resolution in baseline: a Flow Designer flow or a Business Rule generates `sysapproval_approver` records, one per required approver. Approval rules can be table-driven (via `approval_rule` table) or flow-driven (via Flow Designer with approval action).
- Baseline `change_request.risk` is a 0–100 score, typically calculated by a Risk Assessment questionnaire (the `assessment_metric` / `assessment_metric_type` baseline pattern). *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)*
- Baseline `change_request.type` distinguishes Standard (pre-approved, no CAB), Normal (CAB review), Emergency (expedited CAB).
- *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)*

### Frozen periods / change windows

- Baseline supports `cmn_schedule` records with blackout windows. The baseline `Change Schedule` script include can check whether a proposed `start_date`/`end_date` overlaps a blackout window.
- *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)*

### PCI scope tracking

- PCI scope is typically tracked on the CI via a `cmdb_ci.compliance_scope` or similar custom field; baseline `cmdb_ci` does not carry a PCI flag. The engagement is expected to have implemented this if PCI is audited.

### Business Unit / Service Owner / requester seniority

- BU is typically `cmdb_ci.business_unit` or via service hierarchy. Baseline.
- Requester seniority is typically `sys_user.title` or a `sys_user.<level>` custom field. Not in baseline ITSM scope per se — comes from HR/Identity.

## Part 2 — Data Model Alignment

The request implies orchestrating a matrix decision across **five dimensions** with **~50 scenarios that change quarterly**. The baseline tables involved:

| Table | Role in this request |
|---|---|
| `change_request` | The record being approved |
| `sysapproval_approver` | Where the resolved approvers are written |
| `approval_rule` | Baseline approval-rule definition table |
| `assessment_metric` | Baseline risk-scoring questionnaire definition |
| `cmn_schedule` | Frozen period definition |
| `cmdb_ci` | CI being changed (carries PCI flag if implemented) |
| `sys_user` | Requester seniority lookup |

The baseline `approval_rule` table handles **single-dimensional** approval routing well. It is **not designed for** five-dimensional matrices with ~50 scenarios changing quarterly.

Two baseline-extension paths exist:

- **Path X — Multiple `approval_rule` records, layered.** One rule per scenario combination. With 5 dimensions and ~50 scenarios, this means ~50 `approval_rule` records, each with a complex `condition` script. Maintenance burden: each quarterly change requires editing multiple records, hard to validate exhaustively, hard to audit.
- **Path Y — Data Lookup Definitions, chained.** Multiple Data Lookups, each handling one dimension, chained in a Script Include orchestrator that resolves the final approver list. Same data complexity, similar maintenance burden, slightly better auditability.

Both baseline paths struggle at the scale described (~50 scenarios, quarterly change cadence).

## Part 3 — §1.1 Baseline-First Verdict

**Verdict C — Requires custom object — §1.1 halt protocol fires.**

### OPEN QUESTION — CUSTOM OBJECT PROPOSAL

A custom decision-matrix table appears genuinely necessary. Surfacing for explicit Chief Architect approval before any further dispatch.

#### 1. Baseline option evaluated and why it falls short

| Baseline option | Why it falls short for this specific requirement |
|---|---|
| **Single `approval_rule` records, one per scenario** | At ~50 scenarios with complex multi-dimensional conditions, each record's `condition` script becomes a mini-ruleset. Maintenance is error-prone — adding a new dimension means editing all 50. *(citation: `markdown/it-service-management/change-management/reference-change-management.md`)* |
| **Chained Data Lookup Definitions** | Better auditability than `approval_rule` records, but still requires ~50 lookup table entries plus orchestrator Script Include. The orchestrator becomes complex; quarterly changes still mean editing multiple data structures in lockstep. |
| **Flow Designer-based approval orchestrator** | A single flow can evaluate the five dimensions and branch to one of ~50 approval paths via decision tables. Decision Tables (`sys_decision`) are baseline. **This is actually viable** — but at 50 scenarios it pushes the decision-table pattern past its readable scale, and quarterly changes mean editing a complex flow definition. *(citation: `markdown/build-workflows/index.md`)* |
| **External rule engine integration** | Out of scope — would route to Integration Specialist, not in scope here. |

The viable baseline path is **chained Data Lookups + Flow Designer with Decision Tables**. This is "Verdict B with effort" — possible, but operationally fragile at the described scale and change cadence.

A **custom table** would be a dedicated `<scope>_change_approval_matrix` with fields for the five input dimensions and structured approver-output. This trades a quarterly maintenance burden (multiple `approval_rule` + Data Lookup + flow edits, lockstep) for a single-table maintenance burden (50 rows, queryable, auditable, change-log-trackable via baseline `sys_history_set`).

#### 2. Custom object proposed (smallest possible scope)

**Preferred:** Extend baseline `approval_rule` with several new fields to carry the multi-dimensional matrix conditions, without a new table. **Evaluated and rejected** — `approval_rule` is keyed on `condition` script, not declarative dimensions; adding fields doesn't change how the rule engine reads it.

**Proposed:** **A new table extending `approval_rule` in baseline scope:**

```
Table name:      u_approval_matrix (extending approval_rule, baseline scope)
Parent:          approval_rule
New fields:      u_risk_min, u_risk_max (range)
                 u_business_unit (ref to business_unit)
                 u_pci_scope_required (boolean)
                 u_change_window_check (boolean)
                 u_requester_seniority_min (integer)
                 u_approval_chain (list of approval groups in order, JSON)
                 u_approval_sla_per_step (JSON: {step: minutes})
Scope:           baseline (not a new scoped app)
```

**Smaller alternative (also viable):** A new table at top level in baseline scope, not extending `approval_rule`. This severs the connection to the baseline rule engine; you build your own orchestrator Script Include that reads this table. Slightly more code, slightly cleaner data model. Pick based on how much baseline approval-rule behaviour you want to inherit.

**Even smaller alternative:** Decide if all 5 dimensions are truly orthogonal. If "BU" + "PCI scope" can be derived from `cmdb_ci`, the effective dimensions drop to 3 (risk, change-window, requester seniority), and ~50 scenarios likely drop to ~10–15. At that scale, the baseline chained-Data-Lookup path becomes viable. **Recommend the user evaluate dimension reduction before approving a new table.**

#### 3. Consequences of approval

- **Data model:** One new table, one new structured maintenance surface. ~50 rows, quarterly updates.
- **Deployment:** Goes in the engagement's existing customisation update set or a new "Change Governance" scoped app — recommend NOT a new scoped app (single table is too small to justify scope separation per §1.1 hierarchy).
- **Support cost:** Change Manager / CAB owner needs UI for managing the 50 rows. Recommend a list view + form on the new table; no special UI needed.
- **Platform-upgrade risk:** Low. The table extends `approval_rule` so it inherits baseline upgrade semantics. As long as ServiceNow doesn't drop `approval_rule` (it won't — it's foundational to change management), this is upgrade-safe.
- **Audit and PCI implications:** `u_pci_scope_required` field carries regulatory weight. Field-level audit must be enabled on this field; the field-edit history must survive audit retention requirements. **Security & GRC Specialist consult is required** if this proposal is approved.

#### 4. Alternatives if rejected

- **Degraded design 1 (recommended):** Reduce dimensions to 3 (drop BU + PCI as derived from CI), implement with chained Data Lookups + Flow Designer Decision Tables. Maintenance burden manageable at ~10–15 effective scenarios.
- **Degraded design 2:** Use baseline `approval_rule` records with the engagement accepting ~50 rules and a quarterly review process. Brittle but baseline-only.
- **Deferred functionality:** Phase 1 — implement for the highest-frequency 10 scenarios using baseline Decision Tables. Phase 2 — evaluate scaling after 6 months of operational data.
- **Manual workaround:** Change Manager continues to use the spreadsheets, with a Service Catalog item that captures the inputs and creates a `change_request` plus a manual approval-routing task. No automation. Status quo.

### Recommendation to the Chief Architect

The dimension-reduction option (degraded design 1) is genuinely worth evaluating with the user before approving the custom table. ~50 scenarios at the described complexity is at the limit of what baseline can manage cleanly — but if dimension reduction brings it to ~15, baseline wins.

If dimensions cannot be reduced and the operational reality is genuinely 50 scenarios changing quarterly, **the custom table is the right answer** under §1.1 — but it must be approved explicitly, and the Security & GRC Specialist consult must fire before downstream dispatch.

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal required.**

Do not dispatch Technical Designer until the Chief Architect resolves the proposal above. Options:

- **Approve as proposed.** Chief Architect approves the new `u_approval_matrix` table extending `approval_rule` in baseline scope. Re-dispatch ITSM Specialist with the approval in the envelope, then proceed to Technical Designer. **Fire Security & GRC Specialist consult before Developer dispatch.**
- **Approve a smaller variant.** Chief Architect approves a top-level table in baseline scope (not extending `approval_rule`), or extends a different baseline structure.
- **Reject and force dimension reduction.** Chief Architect rejects the custom-table proposal and asks the user to evaluate whether 5 dimensions are genuinely orthogonal. Re-dispatch only after dimension-reduction analysis.
- **Reject and force degraded design.** Chief Architect rejects and instructs the user to live with chained Data Lookups + Decision Tables at the cost of maintenance burden.

## Part 5 — Anti-Patterns to Block (applied if proposal is approved)

If the Chief Architect approves the custom-table proposal, the following are explicitly blocked in downstream design:

- **Do not create a separate scoped app** for this table. One table in baseline scope (or in an existing scoped app) is sufficient. *(citation: `governance-rules.md` §1.1 hierarchy)*
- **Do not duplicate `change_request.risk`** in the matrix table — reference the existing field.
- **Do not duplicate baseline blackout-window checks** — call the baseline `ChangeSchedule` Script Include.
- **Do not write the approver chain as a series of `sysapproval_approver` records pre-created** — generate them at the moment of approval-state entry, the baseline pattern.
- **Do not store PCI scope on the matrix table** — read it from `cmdb_ci`. The matrix only conditions on it.
- **Do not skip field-level audit** on `u_pci_scope_required` and `u_approval_chain`. Enable in the dictionary record.

## Open Questions

1. **Dimension orthogonality.** Are all 5 dimensions genuinely independent, or can BU and PCI be derived from `cmdb_ci`? Most important question before approval.
2. **Quarterly cadence ownership.** Who owns the quarterly review and update of the matrix? Change Manager? CAB? Service Owners? Affects ACL design.
3. **Audit retention.** PCI audit typically requires 7 years of change history. Confirm the engagement's audit retention covers `u_approval_matrix` history.
4. **Cross-engagement reuse.** Is this matrix specific to GlobalCo, or is it intended to be reusable across other engagements? Affects scoped-app-vs-baseline-scope decision.
5. **Standard changes.** Does the matrix apply to Standard changes (pre-approved by definition) or only Normal and Emergency? Standard changes typically bypass approval entirely; confirm scope.
```

### Explanation

Verdict C is the rarest verdict and the most carefully structured. The envelope demonstrates:

- **Part 3's halt protocol** is the most rigorous part of the document. Three baseline options evaluated with explicit citations, three custom-object scope alternatives (preferred / smallest / "even smaller"), explicit consequences, and four alternatives if rejected. The Chief Architect can make an informed decision.
- **The "evaluate dimension reduction" recommendation** is a Domain Expert acting as a *gateway* in the truest sense — pushing back on the request before approving the custom object. This is the §1.1 enforcement value: the custom-object path is the last resort, not the first response.
- **Part 4's HALT recommendation** with four options (approve / approve smaller / reject + reduce / reject + degrade) gives the Chief Architect a structured decision. No silent default.
- **Part 5's anti-patterns** are conditional on approval — "applied if proposal is approved" — and pre-empt the most common implementation drift. Includes the "do not create a separate scoped app" pattern specifically because the proposal explicitly chose baseline scope.

The Open Questions surface the strategic decisions the Chief Architect needs to consider (dimension reduction, audit retention, cross-engagement reuse). These are not implementation details — they are pre-approval gate questions.

---

*End of ITSM Specialist EXAMPLES.md v2.0.*
