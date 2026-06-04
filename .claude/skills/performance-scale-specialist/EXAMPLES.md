# Performance & Scale Specialist v1.0 — Worked Examples

Two examples: a routing-time Scale Constraint Note and a post-build audit. Read alongside `SKILL.md`.

---

## Example 1 — Routing-time consult (Scale Constraint Note)

### Context
A Script Include will compute SLA-breach risk per incident from assignment-group history. ~3M historical incidents, ~500k `task_sla`. §3.1 fired (volume >1M + historical aggregation).

```markdown
# Scale Constraint Note — SLA breach-risk scoring from assignment-group history

**Triggers that fired:** >1M records; historical aggregation; runs in incident context

## Volume model
~3M incident, ~500k task_sla; growth ~15%/yr. Score requested at incident open (interactive) and/or nightly.

## Query constraints
- Compute group history with a **single `GlideAggregate`** (count + AVG business_percentage, grouped by assignment_group, windowed to last 90 days) — NOT a GlideRecord loop over 3M rows.
- Window the aggregate by an **indexed** `sys_created_on`/`closed_at`; confirm an index on assignment_group + the date column.

## Async/batch constraints
- Do NOT compute the 90-day aggregate synchronously on every incident open. **Precompute** per-group scores on a **nightly scheduled job** into a cached lookup (a PA indicator or a small keyed cache), and read the cached value at open.

## Data-lifecycle constraints
- 3M+ incidents: confirm Table Rotation/Archive policy so the aggregate window stays fast.

## Reporting-at-scale constraints
- If this feeds a dashboard, use a **PA indicator**, not a live aggregate per page load.

## §1.1 verdict
**Design/config only — PROCEED.** GlideAggregate + scheduled precompute + index. The "cache" is a PA indicator or system-property/keyed store — **not** a new custom table unless approved.

## Validation
Run Performance Analyzer on the scheduled job; load-test the aggregate before go-live.
```

---

## Example 2 — Post-build audit

### Context
Developer's returned Script Include loops `GlideRecord` over `incident` and increments a JS counter to compute the group's breach rate, called synchronously from a `before` Business Rule on incident insert.

```markdown
# Scale Audit: SLABreachRiskCalculator
**Verdict: REWORK**

### [SCALE][block] Synchronous full-table loop on insert
**Issue:** `calculate()` runs a GlideRecord loop over ~3M incidents on every insert, in a before BR.
**Impact:** Each incident insert does a 3M-row scan — interactive transaction will time out / crater throughput at volume.
**Recommendation:** Replace the loop with a single `GlideAggregate` windowed to 90 days; move the computation to a nightly scheduled precompute; read the cached value in the BR. (Per the Scale Constraint Note.)

### [PERF][fix-before-prod] Counting via .next()
**Issue:** Breach count derived by iterating and incrementing.
**Recommendation:** `GlideAggregate` COUNT with `has_breached=true`.

## Verdict rationale
The synchronous 3M-row scan is a hard production blocker — rework to the precompute pattern before merge.
```

---

## Reading these examples
- The consult **quantifies the volume** first, then constrains: aggregate-not-loop, precompute-not-synchronous, index, archival, PA-for-reporting.
- The audit blocks the classic killer (full-table loop in an interactive transaction) and points to the precompute pattern — no new table needed.

---

*End of Performance & Scale Specialist EXAMPLES.md v1.0.*
