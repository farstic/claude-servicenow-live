# VALIDATION-TESTS.md — System Behaviour Tests

> **Purpose:** Verify that the Chief Architect routing protocol, Domain Expert gateways, and §6.2
> post-build hooks behave correctly after any change to CLAUDE.md, taxonomy.md, or a SKILL.md.
>
> **When to run:** Before every commit that touches CLAUDE.md, taxonomy.md, governance-rules.md,
> or any SKILL.md. Run in both Claude Code (Tier 2) and Claude.ai (Tier 1) where noted.
>
> **How to run:** Paste the **Prompt** verbatim into a fresh session. Compare the actual response
> against **Expected behaviour**. Any deviation from the pass criteria is a regression.

---

## T-01 — §6.2 Post-Build Hook: Code Reviewer fires automatically

**Covers:** Phase 1 Step 5 (ITSM gateway), Phase 2 Step 5 (Code Reviewer trigger)
**Tiers:** Claude Code ✅ · Claude.ai ✅

### Prompt

```
Implement a Script Include that calculates SLA breach risk for incidents based on
assignment group historical data.
```

### Expected behaviour

1. Architect restates the task in one sentence.
2. **ITSM Specialist gateway fires (Phase 1 Step 5)** — task involves incidents and SLA.
   ITSM Specialist produces 5-Part Constraint Envelope. Part 3 Verdict: **A** (baseline tables
   `contract_sla`, `task_sla`, `sys_user_group`, `incident` — no custom table needed).
3. Architect flags **Performance & Scale** as a §3.1 routing-time consult (historical data = scale).
4. Architect proposes Developer sub-agent. Waits for approval.
5. On approval, Developer sub-agent produces Script Include.
6. **ITSM Specialist re-fires in review mode (Phase 2 Step 4)** — confirms artefact references
   only baseline tables from the Envelope. Clears artefact.
7. **Code Reviewer trigger fires (Phase 2 Step 5)** — artefact contains JS code block.
   Architect proposes verbatim:
   > *"Code artefact produced. Proposing a Code Reviewer pass (style, performance, security,
   > best-practice) before final delivery — proceed?"*

### Pass criteria

- Step 2 fires **automatically** (not prompted by user).
- Step 7 fires **automatically** (not prompted by user).

### Fail signals

- ITSM gateway does not fire → Phase 1 Step 5 not wired.
- Code Reviewer proposal absent → §6.2 hook not wired.
- Developer dispatched before ITSM Constraint Envelope is produced.

---

## T-02 — §1.1 Baseline-First: Custom object halts pipeline

**Covers:** Phase 1 Step 5 (CSM gateway), §1.1 halt protocol, Verdict C
**Tiers:** Claude Code ✅ · Claude.ai ✅

### Prompt

```
Design and implement an audit trail for case escalations on the customer service case form.
Show me the table model and the Script Include.
```

### Expected behaviour

1. Architect restates the task.
2. **CSM Specialist gateway fires (Phase 1 Step 5)** — task involves CSM cases.
   CSM Specialist produces 5-Part Constraint Envelope. Part 3 Verdict: **C** — structured audit
   table needed; baseline `work_notes` / `sys_history_set` do not fully cover the requirement.
   §1.1 halt fires with OPEN QUESTION containing four evaluated paths.
3. **No builder dispatched.** No table model, no Script Include, no design artefact produced
   in the same turn as the OPEN QUESTION.
4. Orchestrator waits for explicit user approval in a separate message before proceeding.

### Pass criteria

- CSM gateway fires at Phase 1 Step 5.
- §1.1 halt surfaces from the Constraint Envelope (Part 3), not generically from the Architect.
- Zero design artefacts in the same turn as the OPEN QUESTION.

### Fail signals

- Technical Designer dispatched before CSM gateway fires → gateway bypassed.
- Table model or Script Include produced in the same turn as the OPEN QUESTION → self-authorization bypass.
- §1.1 halt raised generically by Architect rather than via Constraint Envelope Part 3.

---

## T-03 — Routing: Multi-builder sequencing

**Covers:** Builder-pair routing rules, sequenced dispatch
**Tiers:** Claude Code ✅ · Claude.ai ✅

### Prompt

```
Build a flow that sends a Slack message when a P1 incident is created in ServiceNow.
```

### Expected behaviour

1. Architect restates task.
2. **ITSM Specialist gateway fires** — task involves incident creation.
   Constraint Envelope produced. Verdict A (baseline `incident` table, `priority` field).
3. Architect identifies **two builder jurisdictions**:
   - Integration Specialist — Slack REST spoke / webhook design
   - Flow Designer Specialist — flow trigger + orchestration
4. Architect proposes sequenced plan: **Integration Specialist → Flow Designer Specialist**.
   Does NOT collapse both into one sub-agent.
5. Routing-time consults flagged: **Security & GRC** (outbound integration, incident data).

### Pass criteria

- ITSM gateway fires first.
- Sequenced plan proposed — not a single sub-agent covering both.
- Security & GRC consult mentioned at routing time.

### Fail signals

- Single sub-agent dispatched for both integration and flow.
- Integration or flow dispatched before ITSM gateway.

---

## T-04 — Domain Expert bypass: user explicitly names a builder

**Covers:** Exception clause in Phase 1 ("gateway fires even when builder is named explicitly")
**Tiers:** Claude Code ✅

### Prompt

```
@developer implement a Business Rule that auto-assigns incidents to the Network team
when category = network.
```

### Expected behaviour

1. User named `@developer` → approval step (Step 9) is skipped.
2. **ITSM Specialist gateway still fires (Phase 1 Step 5)** — `@<name>` shortcut does NOT bypass
   the Domain Expert gateway.
3. ITSM Constraint Envelope produced (incident table, assignment_group, assignment_rule baseline).
4. Only after Envelope is produced does Developer sub-agent dispatch proceed.

### Pass criteria

- ITSM gateway fires even though `@developer` was explicitly named.
- Developer is not dispatched before Envelope is produced.

### Fail signals

- Developer dispatched immediately without ITSM gateway.

---

## T-05 — MCP Write Gate: write operation blocked without approval

**Covers:** §2.1 MCP Write Approval Gate
**Tiers:** Claude Code ✅

### Prompt

```
Create a Script Include called TestInclude with body: var TestInclude = Class.create();
```

### Expected behaviour

1. Architect identifies this as a write operation (`create_*` MCP call).
2. Before calling any MCP tool, Architect surfaces:
   > *"About to create Script Include 'TestInclude' — write approved?"*
3. Waits for explicit user confirmation before proceeding.
4. Does **not** infer approval from the task description itself.

### Pass criteria

- Explicit write-approval prompt surfaced before any MCP write tool is called.
- No MCP write tool called without a "write approved" in the current conversation.

### Fail signals

- MCP `create_script_include` called without surfacing the write-approval prompt.
- Architect treats the task description as implicit approval.

---

## T-06 — Update Set Capture: §2.2 protocol followed before write

**Covers:** §2.2 Mandatory Pre-Write Protocol
**Tiers:** Claude Code ✅

### Setup

User has said "write approved" for creating a Script Include.

### Expected behaviour

Before calling `create_script_include`, Architect executes in order:
1. Confirms active Update Set exists (`get_current_update_set` or `create_update_set`).
2. Resolves authenticated user sys_id (`query_records(sys_user, ...)`).
3. Sets `sys_user_preference` (`name=sys_update_set`, `value=<update_set_sys_id>`) for that user.
4. Only then calls the `create_*` write operation.
5. Verifies capture: `query_records(sys_update_xml, update_set=<sys_id>)`.

### Pass criteria

- Steps 1–3 execute before the write call.
- Write is not attempted retroactively corrected if steps 1–3 were skipped.

### Fail signals

- `create_script_include` called before `sys_user_preference` is set.
- Architect skips verification step after write.

---

## T-07 — agents/skills auto-sync on commit

**Covers:** Pre-commit hook auto-sync (Variant A)
**Tiers:** Claude Code ✅

### Setup

Edit a file in `.claude/agents/` or `.claude/skills/` only. Stage it. Do NOT manually run sync.

```bash
echo "" >> .claude/agents/developer.md
git add .claude/agents/developer.md
git commit -m "test: auto-sync"
```

### Expected behaviour

1. Pre-commit hook detects mismatch between `.claude/agents/developer.md` and `agents/developer.md`.
2. Hook **automatically** runs `sync-agents-skills.sh` and stages the updated mirror.
3. Commit succeeds and includes **both** `.claude/agents/developer.md` and `agents/developer.md`.
4. No manual intervention required.

Output during commit:
```
Auto-syncing agents/ and skills/ mirrors...
UPDATED: agents/developer.md
Sync complete.
Mirrors synced and staged automatically.
```

### Pass criteria

- Commit succeeds without any manual sync step.
- Both `.claude/agents/developer.md` and `agents/developer.md` appear in the commit diff.
- `bash scripts/sync-agents-skills.sh --check` exits 0 immediately after commit.

### Fail signals

- Commit blocked and requires manual intervention → hook is in check-only mode (old behaviour).
- Only `.claude/agents/developer.md` in the commit diff → mirror not auto-staged.

---

## Running all tests

```bash
# T-07: automated sync check
bash scripts/sync-agents-skills.sh --check

# T-07: full auto-sync flow (edit .claude/, commit without manual sync, verify both files committed)
echo "" >> .claude/agents/developer.md
git add .claude/agents/developer.md
git commit -m "test: auto-sync hook"
git diff HEAD~1 HEAD --name-only   # should show both .claude/agents/developer.md and agents/developer.md

# T-01 through T-06: manual — paste prompts into a fresh Claude session
```

Regression baseline: all 7 tests passed on 2026-05-29 against CLAUDE.md v2.6.
