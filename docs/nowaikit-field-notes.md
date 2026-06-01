# NowAIKit MCP — Known Limitations & Patterns

**Purpose:** Operational field notes for the NowAIKit MCP connection to a live ServiceNow instance — confirmed tool behaviours, bugs, and the workarounds that make them safe to rely on. This is the cross-laptop knowledge base: a `git clone` plus this file restores full operational knowledge.
**Audience:** Architects and developers operating the engine against a live PDI; anyone debugging an MCP write that did not behave as expected.
**Scope:** Generic patterns only — no instance URLs, credentials, emails, or sys_ids. Instance-specific values live in local memory (`memory/MEMORY.md`), never committed.
**Related:** `MCP-OPERATIONS-GUIDE.md` (the playbook these notes support) · `TECHNICAL-ARCHITECTURE.md` (§2.1 write gate, §2.2 Update Set capture).
**Last updated:** 2026-05-29

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

## 9. Scripting Table Write Restriction — NOT_FOUND on DELETE/UPDATE (confirmed 2026-06-01)

`delete_record` and `update_record` return `NOT_FOUND` on scripting tables even when `query_records`
confirms the record exists. Affected tables confirmed on PDI:

- `sys_script` (Business Rules)
- `sys_script_include` (Script Includes)
- `sysevent_script_action` (Script Actions)
- `sys_properties` (System Properties)
- `sysevent_register` (Event Registry)

Same behaviour observed with specialized tools: `update_script_include`, `delete_system_property`.

**Root cause:** REST Table API DELETE/PATCH is blocked by ACL on these scripting tables at PDI level,
even for admin credentials. Read (GET) works fine on the same records.

**Workaround:** Delete and update scripting objects via the ServiceNow UI directly:
- Script Includes: System Definition → Script Includes
- Business Rules: System Definition → Business Rules
- Script Actions: System Policy → Events → Script Actions
- Event Registry: System Policy → Events → Registry
- System Properties: sys_properties.list

**Note:** `create_*` tools (create_script_include, create_business_rule, etc.) worked fine — the
restriction appears to affect DELETE and PUT/PATCH but not POST on these tables.

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
