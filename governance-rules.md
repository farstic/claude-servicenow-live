# Global Architecture Rules

**Authoritative source. All other governance references in the architecture engine — CLAUDE.md, Master Project Instructions, individual SKILL.md anti-patterns, sub-agent termination conditions — must reference this file by section number. If language drifts between this file and a downstream reference, this file wins.**

---

## §1.1 — Baseline-First / Zero Custom Objects Without Explicit Approval

No specialist — skill or sub-agent — may propose, design, or create **custom tables**, **custom scoped applications**, **custom state-model extensions**, **custom Connection & Credential Aliases**, or any other **major custom architectural object** without the Chief Architect's explicit, prior approval captured in the routing-time dispatch envelope.

### Baseline-first is the standing default

For every component, the specialist must first identify whether a baseline ServiceNow construct can serve the requirement. Baseline candidates include:

- An existing baseline table (`incident`, `sn_customerservice_case`, `sn_hr_core_case`, `task`, `sys_user_group`, `change_request`, etc.).
- The baseline scope of the relevant module (`sn_customerservice`, `sn_hr_core`, `global` where appropriate).
- The `work_notes` or `comments` journal field for audit trail or commentary needs.
- Baseline audit history (`sys_history_set`) for record-level audit.
- Baseline state values and field choices.
- System properties for instance-wide configuration.
- Existing baseline business rules, flows, or Script Includes (extend or call, do not duplicate).
- Configuration options (UI policies, dictionary defaults, ACL conditions) over custom code.

**Baseline solutions are accepted without further approval and are always preferred over custom equivalents.**

### Halt protocol when a custom object appears necessary

If a specialist concludes — after honest baseline evaluation — that a custom object is genuinely the only viable technical path, the specialist **must halt before designing it** and return a blocking `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` to the Chief Architect, structured as:

1. **Baseline option evaluated** — what baseline construct was considered, and why it falls short for this specific requirement. "I didn't think of one" is not an acceptable answer; evaluation is mandatory.
2. **Custom object proposed** — the smallest possible scope. The hierarchy of preference, from least to most invasive:
   - A new field on a baseline table (preferred).
   - A new table extending a baseline table, in the baseline scope (acceptable).
   - A new table extending a baseline table, in a pre-existing scoped app (acceptable if scoped app already approved).
   - A new top-level table in a pre-existing scoped app (requires justification).
   - A new top-level table in a new scoped app (requires strong justification).
   - A new scoped app (requires strongest justification — separate deployment cadence, App Repository distribution intent, or genuine domain separation).
3. **Consequences of approval** — data model impact, deployment dependency, support cost, platform-upgrade risk, App Repository implications.
4. **Alternatives if rejected** — degraded design, deferred functionality, manual workaround, baseline-only path with documented gaps.

### The Chief Architect's response

On receiving a `CUSTOM OBJECT PROPOSAL`, the Chief Architect:

- **Approves** the custom object with documented rationale (the approval becomes part of the dispatch envelope for downstream builders).
- **Rejects** the custom object and instructs the specialist to redesign with baseline only.
- **Proposes a baseline alternative** the specialist had not considered, and returns control to the specialist to evaluate it.

The Chief Architect must not silently approve a custom-object proposal without explicit confirmation from the user when the user is available. If the user is asynchronous, the Chief Architect approves only the smallest-possible-scope variant from item 2's hierarchy, and surfaces the decision for user ratification at the next interaction.

### Violation handling

**A specialist that silently defaults to a custom object — without surfacing the decision for approval — is in violation of §1.1, and the artefact must be reworked.** Detection signals include:

- A design spec or implementation that references a new table name (`x_*_*`, or any non-baseline `<scope>_<table>`) not present in the dispatch envelope.
- A design spec or implementation that references a new scoped app prefix not present in the dispatch envelope.
- A design spec or implementation that defines new Connection & Credential Aliases, new state values, or new sys_user_group structures not present in the dispatch envelope.

When detected, the Chief Architect halts the post-build §6.2 flow and re-dispatches the specialist with the §1.1 halt protocol as the rework brief.

### Scope of application

This rule applies to all 24 specialists at all tiers — builders, reviewers, domain experts, consultants, documentation specialists. It overrides any prior "default to scoped app" or "create a dedicated table" language that may exist in earlier-phase SKILL.md files. Where conflict exists, §1.1 wins.

### Routing-time vs post-build enforcement

- **Routing-time (§6.1):** the Chief Architect surfaces the §1.1 evaluation as part of Phase 1 assumptions. If the user's request implies a custom object, the Chief Architect must explicitly raise the proposal as a blocking OPEN QUESTION at Phase 1 — not after dispatch.
- **Post-build (§6.2):** the Chief Architect inspects every returned artefact for §1.1 violations as part of the post-build evaluation. A detected violation triggers a rework dispatch before any other consult proposals (Code Reviewer, ATF Author, Operational Documentation) are surfaced.

---

## §2.1 — MCP Write Operations Explicit Approval Gate

Every MCP write operation against a live ServiceNow instance requires an explicit **"write approved"** from the user in the current conversation before the tool is called. This gate applies to any `create_*`, `update_*`, `delete_*`, `execute_*`, and any other MCP tool that mutates instance state.

**What counts as "write approved":**
- A clear, explicit user message in the current conversation that authorises the specific write action about to be taken (e.g., "да, качи", "да, създай", "да, изпълни", "write approved", "go ahead and create").

**What does NOT count as "write approved":**
- A previous "yes" to a read-only operation (approving a routing proposal, approving a Code Reviewer pass).
- A general go-ahead earlier in the conversation that did not name the specific write action.
- The user's original task description, however detailed.
- A tier or permission upgrade.

**Halt protocol:** If a write operation is about to be executed without a "write approved" in the current conversation, stop and surface: *"About to [describe action] — write approved?"* Wait for explicit confirmation before proceeding.

**Self-approval is prohibited.** Claude may not infer write approval from context, urgency, or logical flow. Approval must be a discrete user message.

---

## §2.2 — MCP Update Set Capture Mandatory Pre-Write Protocol

Before executing any `create_*` or `update_*` MCP write operation that produces a ServiceNow configuration object (Script Include, Business Rule, Client Script, UI Policy, Flow, etc.), the active `sys_user_preference` for `sys_update_set` **must** be set to the target Update Set for the authenticated user.

**Why:** ServiceNow REST API calls honour the `sys_user_preference` record with `name=sys_update_set` for the authenticated user. Setting this preference before write operations causes automatic capture of created/updated objects into the target Update Set. Without this step, objects land on the instance but are not captured in any Update Set and cannot be promoted or migrated.

**Mandatory steps before any configuration write:**

1. Identify or create the target Update Set — `create_update_set` or confirm an existing one is `in progress`.
2. Resolve the authenticated user's sys_id — `query_records(sys_user, user_name=<username>)`.
3. Set the user preference — `query_records(sys_user_preference, user=<sys_id>^name=sys_update_set)`:
   - If exists → `update_record(sys_user_preference, <pref_sys_id>, {value: <update_set_sys_id>})`
   - If not exists → `create_record(sys_user_preference, {user: <sys_id>, name: 'sys_update_set', value: <update_set_sys_id>, type: 'string'})`
4. Execute the write operation — object is now captured automatically.
5. Verify capture — `query_records(sys_update_xml, update_set=<update_set_sys_id>)`.

**What does NOT work (confirmed non-functional on ServiceNow REST API):**
- `switch_update_set` — only sets `is_default: true` on the record; does NOT switch session context.
- Direct POST to `sys_update_xml` — blocked by `INSUFFICIENT_PRIVILEGES` even for admin users.
- `execute_script` / `execute_background_script` — call non-existent ServiceNow endpoints; fail with 400/404.

**Halt protocol:** If steps 1–3 have not been completed before a configuration write, stop and complete them first. Retroactive capture via REST is not possible.

---

## Maintenance

This file is the canonical source for global architecture rules. Updates committed with message: `governance: <rule-id> <change-summary>`.

When a new rule is added (§1.2, §1.3, etc.):
1. Author the rule here first.
2. Update `taxonomy.md` to reference the new rule by §-number.
3. Patch CLAUDE.md and Master Project Instructions with the routing-time enforcement reference.
4. Patch every SKILL.md anti-patterns section with the skill-level reinforcement.
5. Patch every agent definition's termination conditions with the agent-level reinforcement.

Drift between this file and downstream references is a maintenance bug. Resolve in favour of this file.

---

*End of governance-rules.md v1.2.*
