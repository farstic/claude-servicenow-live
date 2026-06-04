# Migration Specialist v1.0 — Worked Example

One example. Read alongside `SKILL.md`.

---

## Example — Migrate ~200k legacy incidents from a retiring system into ServiceNow

```markdown
# Migration Design — Legacy ITSM → incident

## Scope
~200k historical tickets + work-notes; last 3 years (agreed). Source export: CSV. One-time load + cutover; no ongoing sync afterwards.

## Target mapping
Legacy tickets → baseline **`incident`** (confirmed with the ITSM gateway — Verdict A, no custom table). Map: legacy_id → `correlation_id`; title → `short_description`; body → `description`; reporter → `caller_id` (resolve to `sys_user`); team → `assignment_group` (resolve to `sys_user_group`); status → `state` (mapped to baseline values); opened/closed → `opened_at`/`closed_at`; notes → `work_notes` journal.

## Pipeline
CSV **data source** → **import set** + auto staging table → **transform map** to `incident`. Reference resolution for caller/group; choice mapping for state; an `onBefore` script normalises dates and skips malformed rows (→ Developer for the script). *(citation: markdown/servicenow-platform/integration-hub-etl/create-etl-transform-map.md)*

## Dependency sequence
1. Ensure users (`sys_user`) and groups (`sys_user_group`) exist (load/confirm first).
2. Then incidents (reference caller/group).
3. Then work-notes (reference the incident).

## Data quality & cleansing
Profile source for missing callers/groups, bad dates, orphan notes. Cleansing rules applied at staging (onBefore); unresolved references routed to an error report, not silently dropped.

## Reconciliation plan
Source count vs `incident` count where `correlation_id` is set; sample 50 records field-by-field; transform error/skip report reviewed and signed off before cutover.

## Cutover & rollback runbook
Rehearse on a sub-prod clone. Cutover: freeze legacy → final delta export → load → reconcile → business sign-off. **Coalesce on `correlation_id`** so a re-run updates (idempotent). Rollback: delete the migrated set by `correlation_id`/import-set marker; rehearsed back-out.

## §1.1 verdict
**Baseline mechanics — PROCEED.** Data source + import set + transform map into baseline `incident`. No custom table, no custom dedup (coalesce handles it). The staging table is the auto-created import-set table, not a custom object.

## Handoffs & consults
ITSM gateway (target confirmed); Developer + Code Reviewer (onBefore script); Performance & Scale (200k load — batch/throughput, run off-hours); Operational Documentation (cutover runbook).

## Open questions
1. Attachments in scope, or notes/metadata only?
2. How are legacy users with no ServiceNow account handled — create, or map to a generic "legacy" user?
3. State mapping for legacy statuses with no clean baseline equivalent?
```

---

## Reading this example
Migration maps to the **baseline target** (`incident`), uses **coalesce** for idempotent re-runs, makes **reconciliation + rollback** mandatory, and explicitly avoids a custom "legacy data" table and a custom dedup engine (§1.1). One-time + cutover = Migration, not Integration.

---

*End of Migration Specialist EXAMPLES.md v1.0.*
