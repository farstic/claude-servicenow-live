# SPM Specialist v1.0 — Worked Example

One example. Read alongside `SKILL.md`.

---

## Example — "We want ideas to flow into scored demands and approved ones to become projects, with resource planning."

```markdown
# SPM Specialist Guidance — idea → scored demand → project, with resourcing

## OOB process map
Baseline ideation/demand flow: `idea` → promote to `dmn_demand` → assess via an assessment metric set (scoring) → stakeholder review/approval → on approval, create a `pm_project` (or enhancement/defect). Project runs with phases, `pm_project_task`, milestones, baselines, status reports; resource plans/requests draw against allocations. *(citation: markdown/it-business-management/demand-management/demand-management-reference.md, c_ProjectApplicationOverview.md, rmw-references.md)*

## Data model alignment
`idea`, `dmn_demand` (demand), assessment metric/scoring records, `pm_project` + `pm_project_task`, `pm_program` (if grouping), resource plan/request tables. Configure demand types and scoring criteria; use project templates for repeatable phase structures.

## §1.1 verdict
**A — Fully baseline.** The whole flow (idea → demand → scoring → project → resource plan) is baseline SPM configuration. No custom demand/project/portfolio table needed. Any extra captured fields = field extensions on the baseline tables (Verdict B at most), not new tables.

## Routing & consults
- **Technical Designer** — to spec the demand types, assessment metrics, project template, and any field extensions + the approval flow outline.
- **Reporting & Analytics** — portfolio/demand dashboards (PA indicators over `dmn_demand`/`pm_project`).
- **UI/UX** — if a PMO/portfolio workspace experience is wanted.
- **Performance & Scale** — only if very large portfolios/long history.

## Anti-patterns to block
- Do not build a custom "demand intake" table — use `idea`/`dmn_demand` with configured types/scoring.
- Do not custom-code the scoring — use baseline assessment metrics.
- Do not extend `dmn_demand.state` / `pm_project.state` with custom values without §1.1 review.

## Open questions
1. Waterfall PPM, agile (scrum), or SAFe (Enterprise Agile Planning) delivery for approved demands? (Drives project vs story/epic structure.)
2. Resource allocation model — soft (plan) vs firm (confirmed)?
3. Is investment funding / budget allocation in scope, or delivery only?
```

---

## Reading this example
SPM almost always lands **Verdict A/B** — the baseline demand→project→resource chain is deep. The specialist names the baseline tables, blocks the reflexive custom intake table, and routes config design to Technical Designer and dashboards to Reporting & Analytics.

---

*End of SPM Specialist EXAMPLES.md v1.0.*
