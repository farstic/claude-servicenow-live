# Changelog

All notable changes to the Claude ServiceNow Architecture Engine are documented in this file.

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Last updated:** 3 June 2026

The engine follows a minor-version cadence where the **first digit** signals a major architectural shift, and the **second digit** signals an additive or corrective patch within that architecture.

---

## v2.7.4 — Operational Documentation skill (completes the §6.2 consult chain)

**Released:** June 2026
**Trigger:** The artefact standards and the §6.2 go-live consult referenced `skills/operational-documentation/SKILL.md`, but the file didn't exist — the last referenced-but-missing skill. The §6.2 hook proposed runbook + KBA authoring at go-live with nothing to adopt.

### Added

- **`skills/operational-documentation/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only (no sub-agent), main-thread, fires post-build per §6.2 on a go-live signal (`ready for prod` / `sign-off` / `release` / `go-live` / `cutover` / `deploy`). Produces **runbooks** (operator/on-call: indicators, procedures, alert response, rollback, escalation), **KBAs** (baseline `kb_knowledge` / `kb_knowledge_base` / article templates / versioning / validity / review→publish / KCS create-from-incident), **training material**, and **user guides**. Audience is operators/support/end-users — explicitly bounded against the HLD/LLD Writer (architect audience) per taxonomy §2.4. Grounded in `servicenow-platform/knowledge-management/` (all citations verified). §1.1: KBAs are baseline configuration; a custom documentation/runbook table or custom publish workflow is a halt.

### Fixed / completed

- taxonomy §1 roster #24 marked ✅; CLAUDE.md "Consultants and documentation" entry now points at the skill.
- **The §6.2 post-build consult chain is now fully real:** Code Reviewer ✓, Domain Experts ✓ (5 gateways), ATF Author ✓ (v2.7.3), Operational Documentation ✓. No §6.2 consult proposes a capability the engine can't deliver.
- **No referenced-but-missing skill/agent files remain.** Every skill cited anywhere in the engine now exists with resolving doc citations.

---

## v2.7.3 — ATF Author skill + sub-agent (closes the ATF drift)

**Released:** June 2026
**Trigger:** CLAUDE.md, taxonomy, the artefact standards, and the §6.2 post-build hook all referenced an ATF Author **skill** (`skills/atf-author/SKILL.md`) and **batch sub-agent** (`agents/atf-author.md`) — but neither file existed. The engine *proposed* ATF coverage at sign-off and had nothing to adopt.

### Added

- **`skills/atf-author/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — the ATF Author persona. Two modes: inline single-component (skill, fires post-build §6.2) and full-app batch (sub-agent). Covers the ATF data model (`sys_atf_test` / `_test_suite` / `_step` / `_step_config` / `_test_template` / result tables), the baseline step categories (Server / Form / Catalog / REST / Email / Application Navigation), test-design discipline (one behaviour per test, self-contained created-and-rolled-back data, explicit assertions, reuse via Test Templates, negative paths, spec coverage matrix), and **mandatory deployment notes** (runner placement, sub-prod enablement, scope/update set, `atf_test_designer`/`atf_test_admin` roles, data strategy). Grounded in `application-development/automated-test-framework-atf/` (all citations verified).
- **`agents/atf-author.md`** (mirrored in `.claude/agents/`) — the batch sub-agent: enumerates a scoped app's components, designs a suite (child suites split by runner type), returns a coverage matrix + deployment notes + a §6.2 manifest for any custom step config scripts.

### Fixed

- The "8 sub-agents" roster claim in CLAUDE.md is now **true** (7 + ATF Author). taxonomy §1 ATF Author ✅✅ is now accurate. The §6.2 ATF proposal now has a real skill/sub-agent to adopt.

### §1.1 discipline encoded

ATF tests are baseline configuration; a custom **step type** (`sys_atf_step_config` + config script) is a flagged extension whose script routes to Code Reviewer; a custom **table for test data/results** or a custom **test runner** is a §1.1 halt (use Create-a-Record-and-rollback + baseline result tables).

---

## v2.7.2 — Repo-wide citation-path audit and remediation

**Released:** June 2026
**Trigger:** While grounding the Security & GRC skill, the older skills were found to cite `ServiceNowDocs/` paths that don't exist in the current (Australia) tree — they assumed a `now-platform/` + flat `servicenow-platform/` layout that the docs don't use.

### Fixed

- **Audited every `markdown/…md` citation across all 13 skills (SKILL.md + EXAMPLES.md) — 70 distinct paths.** Found ~50 dead across **Developer (7/7), Code Reviewer (9/9), Integration Specialist (6/6), Flow Designer (7/7), ITSM (~14), ITOM/Discovery (6), CSM (4)**. HRSD, CMDB & CSDM, and Security & GRC were already clean. Agents carry no citations.
- **Remapped every dead path to a verified-existing target**, by real tree:
  - scripting/coding → `application-development/` + `api-reference/`
  - ACLs → `platform-security/access-control/`
  - ITSM processes → `it-service-management/<process>/` subdirs (the flat `…/incident-management.md` etc. never existed; real docs are in the subdirectories)
  - notifications/system-properties → `platform-administration/`; system-events → `build-workflows/system-events/`
  - Flow Designer → `build-workflows/workflow-studio/`
  - CMDB/IRE → `servicenow-platform/configuration-management-database-cmdb/`
  - IntegrationHub/MID/credentials → `integrate-applications/` + `it-operations-management/`; OAuth/mTLS → `platform-security/authentication/`
- **Verification gate:** after remediation, re-extracted and existence-tested all 70 citations → **0 missing**. Source/mirror sync confirmed.

### Known residual (cosmetic, non-blocking)

A few grounding-path *lists* in Developer/Code Reviewer/Integration/Flow now point multiple distinct concepts at the same correct file (the docs don't split those concepts into separate pages), so a description may not perfectly match its target. Paths resolve and are on-topic; tightening the prose/dedup is optional polish, tracked for a later pass.

---

## v2.7.1 — Security & GRC Specialist skill (consult + architectural-security review)

**Released:** June 2026
**Trigger:** Security & GRC was a §3.1 routing-time consult with an active persona but no SKILL.md — so the consult fired with nothing to adopt. The upcoming CSM ↔ ITSM ↔ CSDM work will hit it immediately (PII/ACL across the CSM boundary).

### Added

- **`skills/security-grc-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only, **not a gateway** (deliberate: security is cross-cutting, not a single domain; its analog is Code Reviewer, not the Domain Expert gateways). Two modes: a **routing-time Constraint Note** (§3.1) that sets ACL/RBAC/data-classification/audit constraints *before* builders run, and a **post-build architectural-security review** (verdict block / fix-before-prod / consider). Seven checklists: ACL strategy & evaluation order, RBAC/SoD, field-level security, PII/sensitive-data handling, audit & logging, secure integration, GRC control mapping. Grounded in the real Australia paths (`platform-security/access-control/`, `platform-security/`, `governance-risk-compliance/`) — note the baseline Code Reviewer skill cites a stale `servicenow-platform/security/` path; the new skill uses the correct tree. §1.1 nuance encoded: ACLs/roles/security-attributes are baseline configuration (not a §1.1 trigger), but new security tables/scopes/group-structures are.

### Changed

- **`CLAUDE.md`** — added to the Phase 2.1 skills registry; removed from the persona-only "planned" line; §3.1 consult row now points at the skill and notes the two modes.
- **`taxonomy.md`** — roster #16 marked ✅ (consult/review skill). Existing §2.2 boundary (vs Code Reviewer), §4.4 trigger map, and §5 anti-route already described it correctly — unchanged.

### Notes

Distinct from a Domain Expert gateway: it does **not** auto-fire at Phase 1 Step 5 or produce a 5-Part Constraint Envelope. The five gateways remain ITSM / CSM / HRSD / ITOM / CMDB & CSDM. The §3.1 consult firing is already covered by validation test T-03; a dedicated test for the review mode is a candidate follow-up.

---

## v2.7 — CMDB & CSDM promoted to 5th Domain Expert gateway

**Released:** June 2026
**Trigger:** CMDB & CSDM was a planned routing-time consult with no SKILL.md. For CMDB/CSDM-central work (notably CSM ↔ ITSM ↔ CSDM integrations), it needed to be a first-class auto-firing gateway with its own 5-Part Constraint Envelope and §1.1 enforcement.

### Added

- **`skills/cmdb-csdm-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — new v2.0 Domain Expert gateway. Grounded in the Australia branch **CSDM v5** corpus (`servicenow-platform/common-service-data-model-csdm/`, `.../configuration-management-database-cmdb/`, plus the CSM install-base and ITSM-incident CSDM touchpoints). Uses v5 table names (`cmdb_ci_service_technical`, `cmdb_ci_service_auto`, `cmdb_ci_service_business`, `cmdb_ci_business_app`) and flags pre-v5 names as a self-violation. EXAMPLES Example 1 is the canonical CSM ↔ ITSM ↔ CSDM shared-service-layer pattern.
- **`VALIDATION-TESTS.md`** — T-11 (CMDB & CSDM gateway fires for a data-model request) and T-12 (CSM ↔ ITSM ↔ CSDM multi-gateway co-fire, bridging-table blocked). Marked PENDING re-run.

### Changed

- **`CLAUDE.md` → v2.7** — added CMDB & CSDM to the Phase 1 Step 5 gateway-trigger table, the gateway registry, the Domain Expert v2.0 list, and the Status roster; added a multi-gateway **co-fire** rule with the ITOM (population) ↔ CMDB & CSDM (model) boundary; removed CMDB & CSDM from the §3.1 routing-time consult list and Step 7 (it now fires at Step 5).
- **`taxonomy.md` → v1.2** — roster marked ✅ (v2.0 gateway); §3.1 consult row retired with a promotion note; §3.2 post-build Domain Expert row and §6.1 Step 7 gateway list updated; ITOM↔CMDB&CSDM co-fire boundary documented.
- **`skills/itom-discovery-specialist/`** — "when v2.0 exists" conditionals replaced with the live population-vs-model boundary now that the gateway exists.
- **`docs/ADVANCED-WEB-SETUP.md`** — Tier 1 upload loop and verification steps updated from four skills to five.
- **`docs/TECHNICAL-ARCHITECTURE.md`, `docs/BUSINESS-OVERVIEW.md`, `README.md`** — Domain Expert roster updated from four to five.

### Notes

Per the maintenance rule, the full validation suite (T-01–T-12) must be re-run in both Claude Code and Claude.ai, and the five gateway skills re-uploaded to Tier 1, before v2.7 is considered fully landed.

---

## v2.6.1 — Documentation Suite refresh (MCP era)

**Released:** May 2026
**Trigger:** The `docs/` suite still described the pre-MCP, design-only engine (stamped v2.3). It needed to be brought in line with the live-instance architecture.

### Added

- **`docs/MCP-OPERATIONS-GUIDE.md`** — the live-instance playbook: connection, permission tiers, the §2.1 write-approval gate, the §2.2 Update Set capture protocol, read/write tool patterns, and the operator checklist.
- **`docs/LIVE-ARTEFACTS-CATALOGUE.md`** — register of the three deployed artefacts (SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign), each Verdict A / baseline-only.

### Changed

- **`docs/TECHNICAL-ARCHITECTURE.md`** — rewritten: added the live-instance execution layer (§5), gate ordering, the 10-test validation suite (§8), and the pre-commit auto-sync hook (§9).
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — rewritten: added Scenario 4 (live deployment through both write gates).
- **`docs/BUSINESS-OVERVIEW.md`** — added the design-to-delivery value section and the two write gates in plain English.
- **`docs/INSTALLATION-GUIDE.md`** — added the optional NowAIKit MCP connection step.
- **`docs/ADVANCED-WEB-SETUP.md`** — clarified the web Master Project is design-only; live deployment is CLI-only.
- **`docs/nowaikit-field-notes.md`** — purpose/audience header added; existing content untouched.
- All docs: repository renamed `claude-servicenow-engine` → `claude-servicenow-live`; example scoped-app prefix neutralised to `x_acme_*`; version stamps updated to v2.6.

### Notes

Documentation-only release. No change to `CLAUDE.md`, governance rules, taxonomy, or specialist skills.

---

## v2.6 — docs/ knowledge base + auto-sync hook

**Released:** May 2026
**Trigger:** Operational knowledge about the MCP connection (confirmed behaviours, bugs, workarounds) was being lost between sessions and laptops; agent/skill mirrors were drifting from their `.claude/` copies.

### Added

- **`docs/nowaikit-field-notes.md`** — committed, cross-laptop knowledge base of confirmed NowAIKit MCP behaviours and workarounds (Update Set capture, broken script endpoints, email-via-GlideRecord pattern, `register_event` and `create_business_rule` patch-after-create gotchas, Flow Designer shells).
- **Standing Rule** — every solved MCP problem is recorded in the field notes (generic only) and pushed; instance-specific values stay in local memory.
- **Pre-commit auto-sync hook** (`.githooks/pre-commit` → `scripts/sync-agents-skills.sh`) — keeps the root `agents/`/`skills/` folders and the `.claude/` mirror aligned automatically, staging both sides on commit.
- **Three live artefacts deployed** to the connected instance — SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign — all Verdict A.
- Validation suite expanded to **10 tests**, adding **T-05** (write gate), **T-06** (Update Set capture), and **T-07** (agents/skills auto-sync).

### Files updated

- `CLAUDE.md` → v2.6 (docs/ knowledge base, artefact standards paths, field-notes Standing Rule, repo map).

---

## v2.5 — Live write governance (§2.1 + §2.2)

**Released:** May 2026
**Trigger:** With the MCP connection able to mutate a live instance, writes needed hard human-control and change-tracking guarantees.

### Added

- **§2.1 — MCP Write Approval Gate.** Every write requires an explicit, specific "write approved" in the current conversation. A tier upgrade, a prior read-only "yes", a general go-ahead, or the original task description do not count. Self-approval is prohibited. Halt protocol defined.
- **§2.2 — Update Set Capture Protocol.** Before any config write, the authenticated user's `sys_update_set` preference must point at the target Update Set, so ServiceNow captures the object automatically. Documented the confirmed-non-functional alternatives (`switch_update_set`, direct `sys_update_xml` POST, the script-execution endpoints).

### Files updated

- `CLAUDE.md` → v2.5 (§2.1 Write Gate + §2.2 Update Set Capture).

---

## v2.4 — NowAIKit MCP integration

**Released:** May 2026
**Trigger:** The engine could reason about ServiceNow but not touch it. A live MCP connection turned it from a design engine into a design-and-delivery engine.

### Added

- **NowAIKit MCP connection** to a live ServiceNow instance, at a declared permission tier (read-only / read-write).
- **Live §1.1 validation** — Baseline-First verdicts are now confirmed against the live schema, not only `ServiceNowDocs/`.
- Live read tooling (schema discovery, record queries, config audit) and live write tooling (Script Includes, Business Rules, Script Actions, Update Sets, Reports).

### Notes

Write governance arrived in v2.5; v2.4 established the connection and read-side validation.

---

## v2.3.1 — Documentation Suite

**Released:** May 2026
**Trigger:** Adoption readiness — the engine needed a complete, audience-segmented documentation suite before broader team rollout.

### Added

- **Root `README.md`** — repository landing page with badges, hero diagram, 3-step quick install, and links into `docs/`.
- **`docs/README.md`** — documentation hub indexing the five sibling files and the editable diagrams folder.
- **`docs/INSTALLATION-GUIDE.md`** — radically simplified plug-and-play install. Three steps, two minutes. The `.claude/` folder ships pre-synced in the repository.
- **`docs/ADVANCED-WEB-SETUP.md`** — separate optional guide for the Claude.ai Master Project setup (skill ZIP uploads, Project Instructions paste). Isolated from the core install path.
- **`docs/BUSINESS-OVERVIEW.md`** — non-technical view of the engine as a virtual implementation team, with the §1.1 rule explained in plain English.
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — three worked scenarios (BA stories, integration design, §1.1 halt) with verbatim prompts and expected behaviour.
- **`docs/TECHNICAL-ARCHITECTURE.md`** — developer reference for the §1.1 rule, the 5-Part Constraint Envelope, the Phase 1 / Phase 2 protocol, and the agent input/output contracts.
- **`docs/CHANGELOG.md`** — this file.
- **`docs/diagrams/`** — five native `.drawio` files (engine overview, virtual team org chart, full request lifecycle, §1.1 halt protocol, architecture wall diagram) plus Lucidchart import notes.

### Notes

This is a documentation-only release. No changes to `CLAUDE.md`, the orchestrator protocol, governance rules, or specialist skills.

---

## v2.3 — Self-Authorization Prohibition

**Released:** May 2026
**Trigger:** CSM-C validation revealed the model producing a complete table model in the same turn as the §1.1 OPEN QUESTION, rationalising that the user's specific request constituted authorization.

### Changed

- **§1.1 Baseline-First rule** — added explicit prohibition language. The user's original request does not constitute Chief Architect approval of a custom object. Approval must arrive as an explicit, separate user message responding to the OPEN QUESTION.
- **Phase 1 Step 5 (Domain Expert gateway), Verdict C clause** — rewritten as a hard stop. *"Surface the blocking OPEN QUESTION and stop. Do not produce any design artefact, table model, code, or specification in the same turn."*
- **§1.1 Validation Test, wrong-behaviour signals** — converted to enumerated list with the self-authorization bypass as a fourth named failure mode.

### Files updated

- `CLAUDE.md` → v2.3
- `claude-ai-projects/master-project-instructions.md` → v2.3

### Validation

- CSM-C validation re-run in both Claude Code and Claude.ai Master Project. Both environments now produce the OPEN QUESTION and halt, with no table model emitted in the same turn.

---

## v2.2 — Domain Expert Gateway

**Released:** May 2026
**Trigger:** v2.1 introduced the orchestrator delta in concept; v2.2 wired it into `CLAUDE.md` against the actual file structure.

### Added

- **Phase 1 Step 5** in `CLAUDE.md` — mandatory Domain Expert gateway with trigger-keyword table (ITSM / CSM / HRSD / ITOM) and Verdict A/B/C routing logic.
- **Phase 2 Step 4** in `CLAUDE.md` — Domain Expert re-fires in review mode post-build, validating builder artefacts against the original 5-Part Constraint Envelope.
- Multi-builder example rewritten to show the two-phase Domain Expert pattern.
- §6.2 and §1.1 Validation Tests updated to include the gateway routing chain.

### Changed

- `CLAUDE.md` Phase 1 step numbering: 11 → 12 steps.
- `CLAUDE.md` Phase 2 step numbering: 8 → 9 steps.
- Exception clause strengthened — Domain Expert gateway fires even on explicit `@<builder-name>` invocation.

### Files updated

- `CLAUDE.md` → v2.2
- `master-project-instructions-v2.2.md`

---

## v2.1 — Orchestrator Delta (definition phase)

**Released:** May 2026
**Trigger:** v2.0 installed the Domain Expert skills but they only fired on explicit invocation. v2.1 defined the orchestrator-level changes needed to wire them into Phase 1 routing.

### Added

- `ORCHESTRATOR-DELTA.md` — six annotated replacement blocks for `CLAUDE.md` and the Master Project Instructions.
- `VALIDATION-TESTS.md` — 12 canonical test scenarios exercising Verdict A, B, and C paths.

---

## v2.0 — Domain Expert Skills

**Released:** May 2026
**Trigger:** v1.0 Domain Expert skills lacked the structured Constraint Envelope output, citation discipline, and §1.1 halt protocol needed to enforce baseline-first design at scale.

### Added

- **`itsm-specialist` v2.0** — mandatory upstream gateway skill for ITSM.
- **`csm-specialist` v2.0** — mandatory upstream gateway skill for CSM. Includes explicit Australia-release flag on `sn_customerservice_escalation`.
- **`hrsd-specialist` v2.0** — mandatory upstream gateway skill for HRSD.
- **`itom-discovery-specialist` v2.0** — mandatory upstream gateway skill for ITOM and Discovery.
- Each skill paired with an EXAMPLES.md demonstrating canonical Verdict A, B, and C scenarios.
- All four skills enforce §1.1 with citation discipline against `ServiceNowDocs/markdown/` Australia branch.

### Replaced

- v1.0 Domain Expert skills — superseded but kept in `.backups/` as rollback safety.

### Distribution

- `domain-experts-v2.0.zip` (76 KB, 8 files, 3,505 lines).

---

## Earlier — Phase 2.1 Code Reviewer hook

- Added Code Reviewer skill (skill-only, no sub-agent).
- Added §6.2 post-build hook — automatic Code Reviewer proposal on any JavaScript artefact.
- Added Developer, Flow Designer Specialist, Integration Specialist as paired skill + sub-agent specialists.

---

## Earlier — Initial release

- Chief Architect persona defined.
- Four functional groups: Builders, Reviewers and Quality, Domain Experts, Consultants and Documentation.
- `governance-rules.md` §1.1 Baseline-First rule established as authoritative.
- `taxonomy.md` two-phase resolution algorithm defined.
- `prompt-patterns.md` PP-01 through PP-18 templates published.

---

## Pending — next batch

| Item | Notes |
|---|---|
| **`atf-author` v2.0** | Agent + skill pair. Adds batch-mode test-suite generation across a whole scoped app. The current roster references `agents/atf-author.md` but the file does not yet exist on disk — this is the known gap. |
| **`security-grc-specialist`** | Clean create — skill only, no v1.0 predecessor. Will be invoked as a routing-time consult per taxonomy §3.1. |

---

## Versioning policy

- **First digit (v2.x → v3.x):** major architectural shift. Examples: new tier of specialists, breaking change to the routing protocol.
- **Second digit (v2.2 → v2.3):** additive or corrective patch within the current architecture.
- **Patch suffix (v2.3.1):** documentation or maintenance change with no functional impact on the engine.

---

*Maintained by the Enterprise Architecture Team. Repository: [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live).*
