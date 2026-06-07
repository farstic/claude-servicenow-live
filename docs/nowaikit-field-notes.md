# NowAIKit MCP — Known Limitations & Patterns

**Purpose:** Operational field notes for the NowAIKit MCP connection to a live ServiceNow instance — confirmed tool behaviours, bugs, and the workarounds that make them safe to rely on. This is the cross-laptop knowledge base: a `git clone` plus this file restores full operational knowledge.
**Audience:** Architects and developers operating the engine against a live PDI; anyone debugging an MCP write that did not behave as expected.
**Scope:** Generic patterns only — no instance URLs, credentials, emails, or sys_ids. Instance-specific values live in local memory (`memory/MEMORY.md`), never committed.
**Related:** `MCP-OPERATIONS-GUIDE.md` (the playbook these notes support) · `TECHNICAL-ARCHITECTURE.md` (§2.1 write gate, §2.2 Update Set capture).
**Last updated:** 2026-06-08

---

## 1. Update Set Capture — WORKING Pattern (confirmed 2026-05-27)

ServiceNow honors `sys_user_preference` with `name=sys_update_set` for REST API calls.
Setting this preference BEFORE write operations causes automatic capture.

**Step-by-step:**
1. Create Update Set: `create_update_set`
2. Resolve user sys_id: `query_records(sys_user, user_name=<username>)`
3. Check preference: `query_records(sys_user_preference, user=<sys_id>^name=sys_update_set)`
4. Set preference: `update_record(sys_user_preference, <pref_sys_id>, {value: <update_set_sys_id>})`
   - Create if missing: `create_record(sys_user_preference, {user, name:'sys_update_set', value:<sys_id>})`
5. Execute writes — captured automatically
6. Verify: `query_records(sys_update_xml, update_set=<sys_id>)`

**Instance-specific values** (user sys_id, sys_user_preference sys_id) are stored in MEMORY.md — local only, never committed.

**What does NOT work:**
- `switch_update_set` — only sets `is_default:true`, does NOT switch session context
- `sys_update_xml` direct POST — INSUFFICIENT_PRIVILEGES
- `delete_record` on `sys_update_xml` — NOT_FOUND (ACL blocks)

---

## 2. Background Script / Script Execution — BROKEN on PDI

- `execute_background_script` → 404 (endpoint does not exist on PDI)
- `execute_script` → 400 INVALID_REQUEST

**Workaround:** Manual UI — `System Definition > Scripts - Background`

---

## 3. Email Generation on PDI — Working Pattern (confirmed 2026-05-28)

**None of these create a visible sys_email record on PDI:**
- `gs.sendEmail()` in Script Action → direct SMTP, bypasses sys_email
- `GlideEmailOutbound` + `.save()` → doesn't persist on PDI
- `sysevent_email_action` (event-driven notification) with `force_delivery=true` + `mandatory=true` + correct `event_name` → event processes but no sys_email row created

**Working solution — direct GlideRecord insert:**
```javascript
var emailGR = new GlideRecord('sys_email');
emailGR.initialize();
emailGR.setValue('type', 'send-ready');
emailGR.setValue('recipients', agentEmail);
emailGR.setValue('subject', 'Your subject here');
emailGR.setValue('body', '<p>HTML body here</p>');
emailGR.setValue('state', 'ready');
emailGR.insert();
```
This creates a visible, queryable record in `sys_email` with `state=ready`.
`glide.smtp.mock=true` is NOT required for this approach.

**Result on PDI:** record appears with `state=ignored` — PDI suppresses actual sending but the record is created and queryable. This is the expected and correct behaviour for testing.

**Standing rule — always use GlideRecord insert for email in Script Actions and event handlers:**
- `gs.sendEmail()` bypasses `sys_email` on PDI (direct SMTP, not queryable, cannot be verified)
- GlideRecord insert on `sys_email` works on both PDI and production
- Use `recipients` field for the To address; `body` should be HTML (`<p>...</p>`)
- Whenever a Script Action or any server-side handler needs to send an email, default to this pattern — do NOT use `gs.sendEmail()`

---

## 4. register_event MCP Tool — Bug: event_name Left Empty

`register_event` creates the `sysevent_register` record but leaves `event_name` and `sys_name` blank.
Without `event_name`, the notification engine cannot match the event and Script Actions won't fire.

**Workaround — immediately patch after creation:**
```
update_record(sysevent_register, <sys_id>, {
  event_name: 'your.event.name',
  suffix: 'the.suffix.part'    // everything after first dot segment
})
```
Example for `duplicate.incident.detected`:
- `event_name` = `duplicate.incident.detected`
- `suffix` = `incident.detected`

---

## 5. create_business_rule — action_insert / action_update Not Set

`create_business_rule` creates the record but `action_insert` and `action_update` default to `false`.
The BR will never fire until patched.

**Workaround — immediately after creation:**
```
update_record(sys_script, <sys_id>, {
  action_insert: true,   // if BR should fire on insert
  action_update: true    // if BR should fire on update
})
```

---

## 6. Flow Designer — create_flow / create_flow_action Create Empty Shells

`create_flow` and `create_flow_action` create database records but with no internal step structures.
The flow opens as a white screen in the UI — steps cannot be added via MCP.

**Workaround:** Delete the shells and build the flow entirely from the Flow Designer UI.
MCP cannot wire Flow Designer steps — UI only.

---

## 7. sys_update_xml Cleanup — DELETE Records Are Normal

When objects are deleted from the environment while an Update Set is active, ServiceNow captures
`action=DELETE` entries in `sys_update_xml`. These cannot be removed via `delete_record` (ACL blocks).

This is **acceptable behavior** — DELETE records tell the target environment to also remove those objects
on promote. They do not affect the functioning of the INSERT_OR_UPDATE records in the same Update Set.

---

## 10. Assignment Rules — Correct Table Name: sysrule_assignment (confirmed 2026-06-01)

`create_record(assignment_rule, ...)` → `INVALID_REQUEST`. The correct REST-accessible table is `sysrule_assignment`.

**Working pattern:**
```
create_record(sysrule_assignment, {
  name: "...",
  document: "incident",       // NOT "table" — field is called "document"
  order: "900",
  active: "true",
  condition: "priority=1^assignment_groupISEMPTY",
  group: "<assignment_group_sys_id>"
})
```

Key field differences vs what you might expect:
- `document` = the target table (not `table` or `collection`)
- `group` = assignment_group sys_id (not `assignment_group`)
- `condition` = encoded query string (standard)

The record is captured in the active Update Set automatically.

---

## 9. Deleting Scripting Objects via MCP — Full Behaviour (confirmed 2026-06-01)

This section documents the complete, verified deletion behaviour for scripting tables. The earlier
version of this note contained two significant errors — both corrected here based on direct
empirical testing during a demo-cleanup operation on 2026-06-01.

---

### 9a. delete_record on scripting tables — returns NOT_FOUND but SUCCEEDS

**Critical pattern:** `delete_record` returns `Error: No Record found (Code: NOT_FOUND)` on
scripting tables, which looks like a failure. **It is not a failure — the record IS deleted.**

The MCP tool interprets the HTTP response code from ServiceNow's REST API as an error, but the
underlying DELETE call completes successfully. This was confirmed by:
1. Calling `delete_record` on 6 objects across 3 scripting tables → all returned NOT_FOUND
2. Immediately calling `query_records` on the same tables → all returned count: 0
3. Inspecting `sys_update_xml` for the active Update Set → 6 `action=DELETE` entries present,
   one per deleted object — confirming ServiceNow captured the deletions correctly

**Affected tables (confirmed on PDI):**
- `sys_script` (Business Rules)
- `sys_script_include` (Script Includes)
- `sysevent_script_action` (Script Actions)
- `sys_properties` (System Properties)

**Mandatory protocol — always verify after deletion:**

```
# Step 1 — call delete_record (will return NOT_FOUND — ignore the error)
delete_record(table, sys_id)

# Step 2 — verify the object is actually gone
query_records(table, query="name=<object_name>", fields="sys_id,name")
# Expected: count: 0 — deletion confirmed

# Step 3 — verify captured in Update Set
query_records(sys_update_xml, query="update_set=<update_set_sys_id>", fields="name,action,type")
# Expected: action=DELETE row for the object
```

**Do NOT:**
- Retry the delete because NOT_FOUND appeared — the record is already gone
- Conclude the deletion failed without running `query_records` to verify
- Fall back to the UI assuming MCP cannot delete — MCP CAN delete these tables

**update_record on scripting tables:** Also returns NOT_FOUND. Whether this similarly succeeds
despite the error code has NOT been verified — treat updates on scripting tables as uncertain
and verify with `query_records` after every `update_record` call on these tables.

**Root cause (inferred):** ServiceNow's REST Table API on PDI returns a non-standard HTTP response
code on DELETE for scripting tables (likely due to ACL or audit hook behaviour), which the MCP
tool surface reports as NOT_FOUND. The database operation itself completes. This is a PDI-specific
quirk — behaviour on production instances may differ.

---

### 9b. sysevent_register (Event Registry) — CAN be deleted from UI; MCP not verified

**Correction from the earlier version of this note:** The earlier §9b stated that
`sysevent_register` records "cannot be deleted anywhere". This was incorrect.

**What is confirmed:**
- `sysevent_register` records **CAN be deleted from the ServiceNow UI** by an admin user
  while a custom Update Set is active. The deletion is captured as `action=DELETE` in
  `sys_update_xml`. Confirmed during the Cleanup — P1AutoAssign operation (2026-06-01).
- `delete_record` via MCP on `sysevent_register` has **not been tested**. Given §9a above
  (MCP deletes on scripting tables return NOT_FOUND but succeed), it may also work — but
  treat as unconfirmed until tested.

**UI navigation:** System Policy → Events → Event Registry (`sysevent_register.list`)

**When to delete vs leave inert:**
- If the event was created as part of a custom demo/implementation and must be fully cleaned
  up → delete from UI with the cleanup Update Set active.
- If the event cannot be deleted or leaving it is acceptable → remove the Script Action and
  Business Rule that reference it. Without handlers, the event fires but is harmlessly
  consumed with no side effects.

**Implication for implementations:** do not assume event registrations are permanent. They can
be removed from the UI. Plan cleanup Update Sets to include the event registration deletion
alongside the handler (Script Action) and trigger (Business Rule) deletions.

---

## 11. MCP Server "Failed to connect" via npx on Windows — Launch Directly with node (confirmed 2026-06-08)

**Symptom:** `claude mcp list` reports the ServiceNow MCP server as `✗ Failed to connect`, and `/mcp` reconnect fails with `-32000` (JSON-RPC connection error). No `mcp__*` tools attach to the session.

**This is NOT an instance or credential problem.** Verify that first to isolate the layer:
```
curl -s -o /dev/null -w "HTTP %{http_code}\n" -u "<user>:<pass>" \
  "https://<instance>.service-now.com/api/now/table/sys_user?sysparm_limit=1"
# HTTP 200 → instance up, creds valid → the fault is the local MCP spawn, not ServiceNow
```

**Root cause:** launching the server through `npx servicenow-mcp start` is unreliable on Windows + Node 24:
- cold `npx` package-resolve (registering ~394 tools) can exceed Claude Code's MCP handshake timeout
- an `npx` "Update available" banner can land on the stream during the handshake
- a Node-24/Windows libuv flake surfaces as `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`

Run directly, the same server comes up clean and fast (`[INFO] ServiceNow MCP Toolkit server running on stdio [394 tools]`).

**Fix — point `.mcp.json` at the local entrypoint instead of npx:**
```jsonc
"snow-mcp": {
  "command": "node",
  "args": ["dist/cli/index.js", "start"],   // was: "npx", ["servicenow-mcp","start"]
  "cwd": "<path-to-local-servicenow-mcp-checkout>",
  "env": { /* unchanged */ }
}
```
The CLI bin is `dist/cli/index.js` (from the package's `bin.servicenow-mcp`). `cwd` must be the local checkout so the relative path and `.env`/env resolve. After editing, **restart the session** — a `/mcp` reconnect alone may not pick up a changed `command`.

**Correction (confirmed 2026-06-08) — use an ABSOLUTE entrypoint path; do NOT rely on `cwd` for a relative `args` path.** The relative-path + `cwd` form above is unreliable on Claude Code/Windows: Claude Code does **not** apply the configured `cwd` to Node's module resolution. With `args: ["dist/cli/index.js", "start"]` + `cwd: "<checkout>"`, the spawned `node` resolves the relative path against the **project directory** (the session's cwd), not the configured `cwd`, and dies instantly:
```
Error: Cannot find module 'C:\...\claude-servicenow-live\dist\cli\index.js'  (code: MODULE_NOT_FOUND)
→ MCP error -32000: Connection closed
```
This presents identically to the §11 flake (`Failed to connect`, `-32000` on `/mcp` reconnect, no `mcp__*` tools) but is deterministic, not intermittent — the giveaway is in the MCP log under `mcp-logs-snow-mcp` (`%LOCALAPPDATA%\claude-cli-nodejs\Cache\<project>\mcp-logs-snow-mcp\*.jsonl`): a `MODULE_NOT_FOUND` for a path rooted at the *project* dir rather than the checkout. The server still launches fine standalone (`cd <checkout> && node dist/cli/index.js start`), which masks the cause.

**Fix — make the entrypoint absolute in `args` (then `cwd` only matters for `.env`/relative env resolution):**
```jsonc
"snow-mcp": {
  "command": "node",
  "args": ["C:\\Users\\<user>\\snow-mcp\\dist\\cli\\index.js", "start"],  // ABSOLUTE, not "dist/cli/index.js"
  "cwd": "C:\\Users\\<user>\\snow-mcp",
  "env": { /* unchanged */ }
}
```
Verify before restarting: `cd <project-dir> && node "<absolute-entrypoint>" start` must print `running on stdio [394 tools]` from the project dir (not just from the checkout). Then restart the session.

**Diagnostic checklist when `snow-mcp` shows `Failed to connect`:** (1) instance + creds — `curl -u user:pass <instance>/api/now/table/sys_user?sysparm_limit=1` → expect HTTP 200; (2) entrypoint exists; (3) standalone launch from checkout; (4) **read the MCP log** — `MODULE_NOT_FOUND` rooted at the project dir ⇒ this absolute-path bug; an `UV_HANDLE_CLOSING` libuv assert ⇒ the §11 intermittent flake (retry/restart).

**General principle:** for any stdio MCP server that flakes on connect under `npx`, prefer a direct `node <entrypoint>` launch. It removes the cold-resolve latency, the update-check banner, and the npx wrapper from the handshake path. It also pins you to *your* checkout rather than whatever `npx` resolves from the registry — important here because the server is a maintained fork, not the npm release.

**Source of truth:** the MCP server is a local clone, not the npm package. The package name `servicenow-mcp` (and the legacy "nowaikit" name in these docs) is incidental — the running code is the fork `github.com/RobertBH17/snow-mcp` (upstream `github.com/farstic/snow-mcp`), checked out locally and built to `dist/`. Server name in `.mcp.json` here is `snow-mcp`. Do NOT "update" it via `npx servicenow-mcp@latest` — pull/rebuild the fork instead (`git pull && npm run build`). Keep the launch pointed at the local `dist/` so version is whatever the checkout is built to.

---

## 8. MCP Config Reference

Required env vars in `claude_desktop_config.json` (instance URL stored locally in MEMORY.md):

```
SERVICENOW_INSTANCE_URL: <your-instance>.service-now.com
WRITE_ENABLED: true
SCRIPTING_ENABLED: true   (correct even on PDI — script endpoints are unavailable at PDI level)
CMDB_WRITE_ENABLED: false
ATF_ENABLED: false
MCP_TOOL_PACKAGE: full
```
