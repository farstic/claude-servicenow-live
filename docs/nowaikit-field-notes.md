# NowAIKit MCP — Known Limitations & Patterns

**Purpose:** Operational field notes for the NowAIKit MCP connection to a live ServiceNow instance — confirmed tool behaviours, bugs, and the workarounds that make them safe to rely on. This is the cross-laptop knowledge base: a `git clone` plus this file restores full operational knowledge.
**Audience:** Architects and developers operating the engine against a live PDI; anyone debugging an MCP write that did not behave as expected.
**Scope:** Generic patterns only — no instance URLs, credentials, emails, or sys_ids. Instance-specific values live in local memory (`memory/MEMORY.md`), never committed.
**Related:** `MCP-OPERATIONS-GUIDE.md` (the playbook these notes support) · `TECHNICAL-ARCHITECTURE.md` (§2.1 write gate, §2.2 Update Set capture).
**Last updated:** 2026-07-24

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

## 11. onChange Client Script With No "Field name" Is Dormant (confirmed 2026-06-30)

A `sys_script_client` of `type=onChange` only fires when its **`field`** column (the form field "Field name" it watches) is populated. If `field` is empty, the script **never executes** — no error, no log, it is simply inert. The script *body* can be flawless and it will still do nothing.

**Symptom:** client-side onChange logic (live calculation, dependent-field display, GlideAjax-driven score writes) silently does nothing on the form. A read-only target field just keeps its prior/default value (e.g. shows "N/A"), tempting you to keep rewriting the *body* — when the real fault is the unbound trigger.

**Diagnosis:** query the script's metadata, not just its script:
`query_records(sys_script_client, <sys_id>)` → check `field` and `type`. Empty `field` + `type=onChange` = dormant.

**Fix:** set `field` to the monitored column name (e.g. `update_record(sys_script_client, <sys_id>, {field: '<column>'})`). One onChange script watches exactly one field; a per-field live-score pattern needs one script per input field, each bound to its own column.

**Provenance:** a live-score build — 11 onChange scripts had identical correct bodies (3-arg `g_form.setValue(scoreField, value, displayLabel)` against an integer/`choice=1` score field) but all had `field=''`, so none fired and the score sat at N/A. The reference build had every equivalent script bound to its input column. Binding the 11 fields resolved it with zero body changes.

---

## 12. Workspace (Configurable/SOW) Field Tooltips Gated by "Show help tips on forms" (confirmed 2026-07-08)

Field help on a **Configurable Workspace** form (e.g. Service Operations Workspace) — the `ⓘ` info icon and its popover, driven by `sys_documentation.help`, plus the field-label/hover help from `sys_documentation.hint` — renders **only when the user's personal preference "Show help tips on forms" is enabled.**

**Symptom that misleads:** with the preference OFF, the workspace form shows the fields but **no `ⓘ` icon and no tooltip at all**, so it looks like the workspace simply doesn't support field help — even though the exact same `sys_documentation` records render fine on the classic/platform (Polaris-themed) form. This wastes time hunting for a data/config fault or building a client-script workaround (`g_form.showFieldMsg`) that isn't needed.

**Exact preference key:** the "Show help tips on forms" toggle (user profile → Preferences → Display) writes the user preference **`glide.ui.accessibility.accessible.tooltips`** (`sys_user_preference`, type **boolean**, value `true`). ServiceNow docs confirm it: *"The accessible tooltips user preference adds a tooltip icon that users can tab to, to view a tooltip for a field"* and it is set per user via **User Administration → User Preferences** (`c_SetUpSect508ComplianceFeature.md`). There is **no separate `glide.ui.polaris.*` help-tips preference** — this one key governs the field tooltip icon.

**Key facts:**
- It is a **per-user** preference. Each agent must enable it to see tooltips in the workspace; it can be off by default (the instance-wide default record — `system=true`, empty `user` — ships `false`).
- The `sys_documentation` **hint** and **help** you set are sufficient for the workspace too — **no extra build** (no client script) is required. The only missing piece was the viewer's preference.
- `sys_user_preference` is **data, not metadata — it does NOT travel in an update set.** To apply it on test/prod you must set it on each instance (a fix script / scheduled job), not promote it.
- Two ways to make it the default for everyone: **(a)** flip the instance-wide default record (`glide.ui.accessibility.accessible.tooltips`, `system=true`, `user` empty) from `false` → `true` — everyone without a personal override then gets tooltips; or **(b)** a **job/fix script** that upserts `glide.ui.accessibility.accessible.tooltips=true` per target user (e.g. all fulfillers / a role / a group) — more targeted and repeatable per instance.
- The classic/platform form does **not** need this preference — it shows the `ⓘ`/hover help regardless.

**Diagnosis when workspace tooltips are "missing":** before suspecting the data or the platform, toggle **"Show help tips on forms"** ON in the workspace user settings and re-check. If the tooltip appears, the `sys_documentation` config was correct all along.

**Provenance:** regulatory-field tooltips — Bulgarian tooltips set in `sys_documentation.hint`/`.help` rendered on the classic form immediately but appeared absent in SOW; the cause was this preference being off, not a workspace limitation. Corrected the earlier "SOW renders no tooltips" conclusion.

---

## 13. Incident Form Uses `state`, Not `incident_state` — Client Logic Binds Silently Dead Otherwise (confirmed 2026-07-20)

The incident form (Default and workspace views) places the **`state`** column; **`incident_state` is on no incident view** (verify per instance via `sys_ui_element`). Any client-side construct keyed to `incident_state` — an onChange client script's *Field name*, or a UI policy condition — **never fires and never errors**: the onChange has no rendered control to watch, and a UI policy condition referencing a field absent from the form does not evaluate true.

**Symptom that misleads:** the script/policy looks perfectly configured and works nowhere; hours go into the script body when the defect is the bound field.
**Rule:** bind incident client logic to `state`. Baseline UI actions (Resolve/Close) set **both** `state` and `incident_state` server-side, so server logic may use either; client logic must use `state`.

---

## 14. UI Policy Conditions With IN Operator Are Load-Only on the Client (confirmed 2026-07-20)

A `sys_ui_policy` whose condition uses **`IN`** (and other complex operators) evaluates **on form load only** — the client engine does not re-evaluate it when a condition field changes. Simple `=` conditions re-evaluate live.

**Symptom:** policy works when the record is opened already-matching, but picking the matching value on the open form does nothing until save/reload.
**Pattern for "react the moment a choice changes":** pair the UI policy (load behaviour) with an **onChange client script** on the driving field for the live transition — and if the rule must be *enforced* (not just shown), add an **onSubmit** script: baseline UI action buttons (e.g. Resolve) set the value and submit **in the same tick**, beating both UI policies and onChange visuals; only onSubmit reliably blocks that path.

---

## 15. Field Changes Show in the Activity Stream Only If Listed in `glide.ui.<table>_activity.fields` (confirmed 2026-07-20)

Setting `sys_dictionary.audit=true` on a column starts writing `sys_audit` rows — but the form's **Activity stream renders "Field changes" only for columns listed in the activity-fields property** (e.g. `glide.ui.incident_activity.fields`).

**Symptom:** audit is provably working (`sys_audit` has old→new/user/time) yet users report "changes are not recorded" because the activity formatter never shows them.
**Fix:** append the columns to the property (comma-separated). It's a normal `sys_properties` update — travels in an update set. ⚠️ It's a **shared single-value property**: if another in-flight update set also carries it, the **last commit wins** — merge the value and order the commits accordingly.

---

## 16. Published `kb_knowledge` Is REST-Locked; Draft Versions Are Writable (confirmed 2026-07-20)

On a knowledge base with a publish workflow, a **published** article rejects every REST write — body updates, and even `workflow_state` changes — with `INSUFFICIENT_PRIVILEGES` (admin included). The UI **Checkout** flow, however, creates a **new draft `kb_knowledge` version record**, and that draft **is REST-writable** (find it: same `number`, `workflow_state=draft`, `latest=true`). **Publish is UI-only** either way (REST publish attempts also fail).

**Working split:** UI Checkout → REST edit of the draft (bulk/generated HTML bodies are much easier over REST than pasted) → UI Publish. Also: `kb_knowledge` is **data** — nothing here travels in update sets; repeat per environment.

---

## 17. Compiled UI Page Cache Can Serve a Pre-Edit Version — Touch the Record Again (confirmed 2026-07-20)

After a REST edit of `sys_ui_page.html`, a surface that loads the page as a frame (e.g. a workspace modal via `.do` URL) can keep rendering the **pre-edit compiled version** while the classic path shows the new one. A subsequent update to the same record (any real change) recompiles and clears it; a CSS `!important` rule targeting stable element IDs is a robust belt-and-braces for hide-type edits, surviving both cache staleness and markup drift.

---

## 18. SOW MIM Propose/Promote Modals Are Native Macroponents — the Classic `mim_*` UI Pages Don't Apply (confirmed 2026-07-22)

When the **MIM for Service Operations Workspace** plugin (`sn_sow_mim`) is installed, the SOW propose/promote popups are **native UXF modals**, not iframes of the classic `sn_major_inc_mgmt` UI pages (`mim_propose` / `mim_workbench_promote`). Editing those UI pages fixes Classic UI only. The classic UI action's `client_script_v2` *does* call `g_modal.showFrame()` to the `.do` page — but the `sn_sow_mim` **declarative actions** (`sow_propose_major_incident`, `sow_promote_to_major_incident`) supersede it in SOW.

**Resolution chain to find the real SOW artefact:** `sys_declarative_action_assignment` → its `sys_declarative_action_payload_definition` (`payload_template` carries a `"route"`) → `sys_ux_app_route` (match on `route_type`) → `sys_ux_screen_type` → `sys_ux_screen` → `sys_ux_macroponent` (the modal content; fields are elements in its `composition` JSON).

**⚠️ There can be TWO route registrations per route_type:** one bound to the workspace's `app_config`, and one app_config-less hung on an **extension point** (e.g. "SOW Record page modals") under the shared **"UXR Base Experience Shell"** parent macroponent — and it is the **extension-point one the record page actually resolves** (its `fields` column carries the modal's input params, a good tell). Repointing only the app_config pair changes nothing visible; repoint **both pairs** when swapping the screen_type.

**Protection map (store app):** the macroponents and screens ship `sys_policy=read` (immutable); the DA assignments, payload definitions, **routes and screen types are unprotected**. Customization path that works: **clone the macroponent + its `sys_ux_client_script` children** (remap old→new sys_ids inside `composition`/`data`/`props` and inside each cloned script), create your own `sys_ux_screen_type` + `sys_ux_screen` pointing at the clone, then **repoint the editable route's `screen_type`**. Rollback = point the route back.

**Gotchas confirmed on the way:**
- A bg-script `GlideRecord.update()` against a `sys_policy=read` record **fails silently** — no throw, no false return you'd notice; only a session log line *"This item is read-only based on its protection policy"*. Always re-read `sys_updated_on` to verify the write landed.
- The **"Extract translations from UX Macroponent"** BR re-serializes `composition` (compact JSON) on insert — whitespace-sensitive string patches prepared against the pretty-printed source stop matching. Patch via `JSON.parse` → walk → `JSON.stringify`, never via text tokens.
- To hide a field in a macroponent composition, set its element's `isHidden` to `{ "type": "JSON_LITERAL", "value": true }`.
- A macroponent validation BR can throw `NumberFormatException: Cannot parse null string` **mid-insert** of a clone; it's transient (engine state not yet written) — the record persists and the same validation passes on subsequent updates.
- `sys_update_set.application` cannot be set over REST — ignored on create **and silently ignored on PATCH**. A **bg-script GlideRecord insert CAN create a scoped update set** (self-check `application` after insert). Scoped customizations captured this way promote cleanly, unlike scoped rows stuck inside a Global set.
- **Promotion caveat:** route records whose `parent_macroponent` is a version-specific shell may fail preview on a target running a different plugin version ("Could not find a record in sys_ux_macroponent for column parent_macroponent"). **Skip** those rows if they belong to the non-operative (app_config) pair — the extension-point pair plus the cloned macroponents/screens carry the whole fix. Confirmed: commit with the app_config pair skipped works end-to-end on the target.
- Completing an update set via a direct `state=complete` record update does **not** flip `is_default` — unlike the complete-tool path that had been flipping it (no post-complete cleanup needed).

---

## 19. Reference lookup columns, User-ID type-ahead, and SOW field-hiding (confirmed 2026-07-24)

Configuring what a reference field's **magnifier/lookup** and **type-ahead** show, and hiding a field only in a workspace, touches more places than the obvious one:

**Lookup modal columns render the `sys_ref_list` view list layout — not the Default view.** To change the columns in a reference field's magnifier popup, edit `sys_ui_list` (+`sys_ui_list_element`) for the referenced table in the **`sys_ref_list`** view. The Default-view list layout governs classic *lists*; the `sow` view governs *SOW* lists; the lookup *window* is `sys_ref_list`. Set all the ones your scenario touches. **Personal list layouts** (`sys_ui_list.sys_user` populated) override the table-level default per user — a tester with their own personalized columns will not see your change until they *Reset to column defaults*.

**Type-ahead extra columns (e.g. match Assigned to by User ID) need three attributes together:** `ref_ac_columns=user_name;name;email` + `ref_ac_columns_search=true` + **`ref_auto_completer=AJAXTableCompleter`**. Without the completer the classic type-ahead ignores the extra columns and searches the display field only. Apply on the field's `sys_dictionary_override` **and the base `sys_dictionary`** entry (e.g. `task.assigned_to`) — the completer reads the base dictionary, so the override alone is insufficient. Note the base-dictionary edit is table-wide (all task children get the behaviour).

**Hiding a field in SOW only: there are TWO SOW incident form views.** `sow` renders the existing-record form; **`sow_new_record`** renders the new-record form. Remove the `sys_ui_element` from **both** sections (and re-sequence the survivors) or it reappears on one of the two paths. Both SOW sections are `sn_sow_inc` scope (list layout for the sow view is `sn_sow`) → a Global set carrying them will hit "scope is not global" on commit; Skip + redo on target or use a scope-matched set. After removing, run **`cache.do`** — a browser hard-refresh alone leaves the server compiled form stale (same as §17). Classic keeps the field because its Default-view section is untouched.

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

## 20. Email notification wrapper lives in `sys_email_layout.advanced_layout`, not `layout`

**Symptom:** a branded email wrapper (header/logo/footer) clearly renders in outgoing notification emails, but text searches across `sys_email_layout.layout`, `sysevent_email_template.message_html`, `sysevent_email_action.message_html`, `sysevent_email_style` all return nothing.

**Cause:** `sys_email_layout` has TWO body fields. When `advanced=true`, the platform renders **`advanced_layout`** (a full `<html>` document with `${notification:body}` inside); the `layout` field is the legacy/simple variant and can hold stale, completely different content. The form's "Header content" editor writes into the advanced field. Any content audit that reads only `layout` sees the stale copy and misses the live wrapper entirely.

**Resolution chain for notification emails:** `sysevent_email_action.template` → `sysevent_email_template.email_layout` → `sys_email_layout` (advanced_layout when advanced=true). If the notification has no template, the instance default applies: property `glide.notification.email.default_template_sys_id` → OOTB template "Unsubscribe and Preferences", whose layout appends `${NOTIF_UNSUB} | ${NOTIF_PREFS}`.

**Unsubscribe links:** `${NOTIF_UNSUB}` / `${NOTIF_PREFS}` render into `<a id="snc_notification_unsubscribe">` / `<a id="snc_notification_preference">` anchors at send time. To remove them from a branded wrapper, delete the row containing the variables from `advanced_layout` (an HTML-commented `<!-- ${NOTIF_UNSUB} -->` still renders the anchors *inside the comment* — invisible but present in the source). Notifications outside that wrapper (template-less, or using the OOTB "Unsubscribe and Preferences" template) still get the links via the default-template mechanism.

**Update-set caveat:** OOTB-cloned email layouts often belong to a scoped app (e.g. the Employee Center scope). Capturing an edit into a *global* update set produces a scoped `sys_update_xml` row that errors "scope is not global" on commit — package it in a scope-matched set (bg script; a REST-created `sys_update_set` ignores `application`).

**Related:** in-email image sizing — email clients on the Word rendering engine ignore CSS `max-width`/`object-fit`/`height:auto`; only the HTML `width`/`height` *attributes* are honoured everywhere. A `db_image` referenced by bare filename must have a space-free name; spaces break the URL in most clients while the authenticated form preview still renders fine.

## CMDB: exact-name class exclusions miss subclasses; GlideTableHierarchy may be absent

Querying `cmdb_ci` with `sys_class_name NOT IN 'cmdb_ci_network_adapter,cmdb_ci_ip_address'` does NOT exclude their subclasses (e.g. `cmdb_ci_vmware_nic`) — such records match both the "device" query and the adapter query, so the same thing surfaces twice (once as itself, once resolved to its owning CI). Two fixes: (a) build a hierarchy-aware exclusion list, or (b) dedup in code — when an adapter resolves to its owner, delete the adapter's own entry from the result set.

Note on (a): `GlideTableHierarchy` can be entirely unavailable (`ReferenceError: "GlideTableHierarchy" is not defined`) even in a global-scope background script on some instances, despite being documented. Verify it exists before relying on it; the pure-GlideRecord dedup (b) has no API dependency and behaves identically for the common case.

## Catalog variables: labelled dynamic links; task visibility; portal setValue trap

- The **URL variable type** renders its value as both href and link text — no label support. For "text with the URL behind it", use a **read-only HTML variable**: it renders its stored HTML like KB-article content (portal form, RITM and catalog-task variable editors alike), so a catalog client script can set `<a href="...">label</a>` into it for a dynamic labelled link.
- The Flow Designer **Create Catalog Task** action's Variables picker is a whitelist: variables added to the item later never show on the task until added there too. The RITM shows everything; the task only shows the picked set.
- In the portal, `g_form.setValue()` against a variable name that does not exist on the form throws and kills the whole client script — the symptom is that everything else the script populates silently goes blank as well.

## Rhino: Java strings break === identity checks (indexOf) while join()/queries keep working

A list returned by a Java-backed API or another script include may hold Java strings. In Rhino, `javaString === jsString` is false, so `Array.indexOf(jsString)` silently returns -1 — while `list.join(',')` (string coercion) still produces a perfectly valid encoded query. Symptom pattern: the *display* query built with join() works, but the *permission/identity* check on the same list always fails, with no error anywhere. Fix: coerce every element with `+ ''` when building arrays used for comparisons.

## Flow stages execute on pass-through; Yes/No variable labels are global messages

- A Flow Designer **stage element fires when execution passes it** — it is not a label for a branch. A "cancelled"-type stage placed on the main path poisons every successful run (stage→state logic can close the record, and closing an RITM cancels its flow context, so later steps never run). Side-exit stages belong as a **field on the branch's Update Record action**, never as a stage element on the main path.
- A **Yes/No catalog variable** has no per-variable choices — its labels are the global "Yes"/"No" messages, translatable only via the language plugin/session language. On instances that hardcode labels in the local language instead of running the language plugin, convert the variable to a **Select Box** with two choices, keeping the values `yes`/`no` so dependent scripts and conditions survive unchanged.

## addQuery(field, 'LIKE', value) can match exact-only; encoded LIKE is contains

On at least one estate, server-side `gr.addQuery('field', 'LIKE', 'text')` matched only exact values (no implicit wildcards): a field holding "Acme User management" returned 0 rows for LIKE 'Acme'. The same filter written as `gr.addEncodedQuery('fieldLIKEtext')` behaves as *contains* and matches. When a LIKE filter mysteriously returns nothing while the data plainly contains the text, switch to the encoded-query form (works for dot-walked fields too).

## Resolving catalog variable display values by hand (sc_item_option walk)

When rendering RITM variables manually (mtom → sc_item_option → item_option_new), the stored value resolves to a display value differently per type: **Reference (8)** → the `reference` field names the table; **List Collector (21)** → the table is in **`list_table`**, NOT `reference` (a null reference here is normal); **Lookup Select Box (18) / Lookup Multiple Choice (22)** → `lookup_table` + `lookup_value` (the stored value is the lookup_value field's value, `sys_id` when empty); **choice types (3/5)** → `question_choice` by question+value; **Yes/No & Checkbox (1/7)** → boolean-ish strings. A pragmatic last resort for a bare 32-hex value: try whichever of reference/lookup_table/list_table is set.

## Scheduled Jobs: entered_time drives the schedule; sysauto_script is not update-set tracked

- Inserting a `sysauto_script` (Scheduled Script Execution) by script without **`entered_time`** is ABORTED by the OOB business rule "Adjust Time Based on Time Zone" — the schedule is entered via `entered_time` (+ `time_zone`) and the BR computes `run_time` from them. Set `entered_time` (e.g. `1970-01-01 06:00:00`), never just `run_time`. The abort happens after your log line prints the would-be sys_id, so the script output can claim "created" for a record that does not exist.
- `sysauto_script` records are data, NOT tracked by update sets — force-capture with `GlideUpdateManager2().saveRecord()` or the job silently stays behind on promotion (and watch for duplicates on the target if the job was ever created there by hand under a different sys_id).

## Process Flow bar on any task table: sys_process_flow + the OOB formatter (UI macro formatters are a dead end)

- The "flow formatter" bar on the change form is **not** a UI macro. It is the OOB **Process Flow** engine: step rows in **`sys_process_flow`** (one per step, keyed to a `table`, ordered, each with a condition) rendered by the generic **`process_flow_formatter.xml`** `sys_ui_formatter`. To put the same bar on `incident` / `sc_req_item`, insert the step rows for that table and add the same formatter to the form via Form Layout — no new UI macro, no client-side injection.
- Hand-rolled alternatives that fail on a modern (Polaris) estate, in the order they were tried: a custom `sys_ui_macro` + `sys_ui_formatter` renders a trivial literal but prints a full HTML body as **escaped text**; the `g2`/`$[]` phase-2 Jelly variant renders nothing; an onLoad client script doing `document.querySelector('form').insertBefore(...)` runs without error and injects nothing (client-script isolation leaves `document` undefined). Do not spend rounds on these — use the native engine.
- Restyling the rendered bar: the markup is `ol.process-breadcrumb > li[.active|.completed|.disabled][data-state=current|past|future] > a`, and colours come from `RGB(var(--now-color_selection--primary-1|2))`. Setting `background-color` on the `a` recolours the step body reliably, **but the chevron arrow tip resists every repaint** — it is drawn by a pseudo-element through a channel that survives `background-color`, all four `border-*-color`, and per-`li` overrides of the Now colour vars, so the just-completed step keeps a grey tip. Working fix: switch the pseudos off (`content: none` on `li::before/::after` and any descendant `*::before/*::after`) and cut the chevron out of the `a` itself with `clip-path: polygon(...)`, overlapping consecutive `li`s with a negative margin. The arrow is then part of the step's own coloured box, so it can never differ in colour.
- Delivery vehicle for such CSS: a **global `sys_ui_script`** that appends a `<style>` element. Global UI Scripts load on every classic page including the form iframe and are not subject to client-script isolation, and pure CSS has no timing dependency on when Angular compiles the formatter.

## Rhino: `value + ''` prints the string "null" for every empty field

- The common `gr.getDisplayValue(field) + ''` / `gr.ref.getDisplayValue() + ''` idiom coerces a **Java null** to the literal string `"null"`, which then renders in the UI ("Waiting for null" in a list column whose field is simply empty). `getValue()` has the same trap.
- Always guard: `(gr.getDisplayValue(field) || '') + ''`. When a value can also be a dangling reference sys_id, add a scrub for the literal strings `'null'` / `'undefined'` after coercion.
- Worth sweeping an estate for once rather than fixing per symptom — a single Service Portal widget set held 21 unguarded call sites, each a future "null" waiting for the first empty field.

## Event names over 40 characters silently break notifications

- `gs.eventQueue()` writes `sysevent.name`, a **100**-character column, so a long event name is stored in full. But **`sysevent_register.event_name` and `sysevent_email_action.event_name` are both 40 characters** (the latter is type `sysevent_name`). Register or bind a notification with a longer name and the platform truncates it **without any error** — the record saves, the form looks right, and the name shown is simply two characters shorter than what you typed.
- The event queue matches a notification by **exact name**. A 42-character event therefore fires, is processed, and reaches nothing: `sysevent` rows accumulate in state `processed` with correct `parm1`/`parm2`, no notification runs, no `sys_email` row is created, and no error is logged anywhere. Every symptom points at the notification or the data; the cause is the column width.
- **Keep every event name at 40 characters or fewer**, and verify after saving by reading the value back rather than trusting the form. When diagnosing a "notification never fires" case, search the registry and notification tables with `LIKE` on a distinctive fragment, never with an exact match on the name your script fires — an exact-match query returns nothing and reads as "it was never created", which is a false negative that sends the investigation the wrong way.
- Renaming afterwards means three places at once: the registry row, every notification bound to it, and the constant in the script that fires it. Historic `sysevent` rows keep the old name and can be left alone; a same-day duplicate guard that matches on the new name will not see them, which conveniently frees an immediate re-test.

## Scripted notifications default to "Record inserted or updated" — set `generation_type = 'event'` or they never fire

- The notification form's **Send when** dropdown is backed by `sysevent_email_action.generation_type` with choices `engine` (*Record inserted or updated*), `event` (*Event is fired*) and `triggered`. The column **defaults to `engine`**. Picking "Event is fired" on the form flips it; **`GlideRecord.insert()` does not** — a scripted notification with `event_name` set but `generation_type` left on `engine` is a record-based notification with no insert/update trigger, so it fires on nothing.
- Signature: the event is queued and reaches state `processed` in ~2–4 ms, no `sys_email` row, no `sys_email_log` row, nothing in `syslog`. Every field on the notification looks correct. Compare against a working OOB event notification (Approval Request, `approval.inserted`) — it carries `generation_type = event`.
- Rule for every notification created by script: `setValue('generation_type', 'event')` alongside `event_name`. An OOB business rule ("Reject changes condition when not engine") already keys on this value, which is how the column was found.
- Read this together with the 40-character event-name note above: on the same engagement both defects were present at once, and fixing the name alone changed nothing visible — after the rename the event matched and *still* produced no mail. When a fix produces no change in symptoms, re-diagnose from data rather than assuming the fix was applied wrongly.
- Audit query to find other victims on an instance: `sysevent_email_action` where `event_name != ''` AND `generation_type = engine` AND `action_insert = false` AND `action_update = false` AND `active = true`. On this estate it surfaced a second, older notification from a different story that had never fired either.

## True/False columns inside ACL scripts: normalise the value, name every deny path (2026-08-26)

A Deny-Unless `sys_attachment` read ACL backed by a Script Include denied every non-admin — no error, no log — after the driving column on the parent record was recreated as a True/False field. The script keyed a property map on the field value and treated an unknown key as "deny" without logging it. Rebuilding the script so that `'1'`/`'true'` and `'0'`/`'false'` are normalised before the lookup, the row guard uses `getUniqueValue()` instead of `isValidRecord()`, and every return names its step and reason (behind a debug property) made the control work. Lessons:

- Do not assume `GlideRecord.getValue()` on a True/False column yields `'true'`/`'false'` on every path — handle `'1'`/`'0'` too. The REST Table API shows `"true"`, which says nothing about what the ACL context hands the script.
- A fail-closed script must never have a silent deny path. Every `return false` gets a reason, and a debug property (`<app>.debug = true`) that logs `ALLOW/DENY <row> reader=<user> | <step> <reason>` turns a "nothing works and the log is empty" afternoon into one page refresh.
- `Slow ACL` rows in syslog (source `AccessTerm`) only prove a rule ran once and took >5 ms; their absence proves nothing.

## A stage or choice label on a portal screen may be translated as a UI message, not as a choice (2026-08-28)

Translating the request-item stage into a second language looked straightforward: add `sys_choice` rows for the language, and — because `sc_req_item.stage` is a workflow-type field whose stage names are a `translated_field` — add `sys_translated` rows for `wf_stage.name`. Both were written, the cache was flushed, and the screen stayed in English.

The instance gave the answer without any further guessing. One stage already displayed in the target language while the rest did not, so the question became *where does that one translation live?* Searching every translation table for the string that was actually on screen found it in `sys_ui_message`, keyed on the **English label** of the stage — written months earlier by someone else. The freshly written choice and stage-name translations used different wording, and none of that wording appeared anywhere on screen. That mismatch is the proof: the surface renders the UI message, not the choice label and not the workflow stage name.

Lessons worth keeping:

- **When one value of a set is already translated and the others are not, do not start from the mechanism you expect — find where that one working translation is stored and copy it.** It is a two-minute lookup and it settles the question that hours of correct-but-irrelevant configuration will not.
- Deliberately using **different wording** in each candidate table turns the screen into a probe: whichever phrasing appears tells you which table is in the render path.
- The four translation tables answer different questions and are not interchangeable: `sys_choice` (choice labels, one row per language for the same table/element/value), `sys_translated` (values of fields whose dictionary type is `translated_field`, e.g. workflow stage names), `sys_translated_text` (`translated_text`/`translated_html` fields such as catalogue descriptions), `sys_ui_message` (strings passed through the message API, keyed by the source text). A portal widget that renders a label through the message API bypasses the first three entirely.
- Rows written into the first three are not wasted when the fourth turns out to be the live path — they still cover the classic form, lists, and the workflow editor. Leave them.
- Every one of these needs a cache flush before it renders; an unflushed cache and a wrong table look identical from the browser.

## Flow Designer: replacing an Action call drops the row's stage annotation

Stages in a Flow Designer flow are attached to specific rows (the Stage column in the editor).
Deleting an Action call and inserting a replacement — the standard way to swap one Action for
another — leaves the new row with NO stage assigned, so at runtime the record's stage skips the
annotation the old row carried (e.g. a RITM mid-approval showing the post-approval stage while
the approval is still pending). The flow otherwise behaves correctly — approvals raise, waits
hold — so the defect looks like a state-model bug but is pure annotation loss.

Fix: open the flow's previous published version from its version history, note which row carried
which stage, and reattach the stage to the replacement row before publishing. Add "stage column
matches the previous version" to the checklist of any Action-swap change.

## Employee Center To-dos hides catalog approvals from users without approver_user

The EC To-dos page (sp page `hrm_todos_page`, widget HRM Todos Summary) builds its approvals feed
in `sn_hr_sp.todoPageUtils`. For users holding NEITHER `approver_user` NOR `business_stakeholder`,
the util appends `sysapproval.sys_class_name!=sc_request^sysapproval.sys_class_name!=sc_req_item`
to the approval query (~line 1423; again in the record-watcher path ~2093, and the same gate exists
in `sn_me_todos.todoUtils` for mobile). Net effect: a user can hold a personal `sysapproval_approver`
row in `requested`, have full READ on the RITM (itil, `sn_request_approver_read`), see everything in
the backend — and the portal still shows an empty "My tasks" while assignment notifications keep
arriving, because notifications never pass through this gate. It presents exactly like a data or ACL
bug and is neither.

Fix pattern: grant `approver_user` (free, requester-level) to the approver population — NOT
`business_stakeholder`, which passes the same check but consumes a licensed role. Pair it with
`sn_request_approver_read` so the card can also resolve the request behind the approval. Roles apply
on the next session.

Diagnostic order that found it: personal-row/state/read diagnostic (all clean) → impersonate proves
backend-visible/portal-invisible → dump the page's widget server scripts → grep the scoped util for
the table name. When a list is empty despite clean data, read the feed's query builder.

## Portal string won't translate? Identify its storage class first — there are four

A "translate this label" task on Service Portal / Employee Center has four distinct render paths,
and writes to the wrong table do nothing:

1. **sys_ui_message** (key = the English text) — widget-template `${...}` expressions and
   gs.getMessage calls. Caveats: the KEY is the ENTIRE `${}` content including any angular
   bindings inside (`${Approval request for {{::task.number}}}` → the key contains `{{::…}}`
   verbatim — a row for just the prefix never matches); parameterised code uses `{0}` keys; and
   the column is `language`, not `lang`.
2. **sys_choice** (per-language rows) — state/choice labels.
3. **sys_translated / sys_translated_text** — fields whose dictionary type is translated_field /
   translated_text. Config-record titles (e.g. Employee Center task-configuration `title_custom`)
   are translated_text: no ui_message row can ever affect them.
4. **Notification / push-message records** — bell and email texts.

The killer gotcha for class 3: **activating a language copies the untranslated source values into
that language's rows.** The bg row then EXISTS and contains English — the engine serves it happily,
and adding "missing" translations elsewhere changes nothing. Fix = UPDATE the existing language row.

Triage that avoids blind fixes: find one sibling string that IS translated and locate where its
translation lives (sys_ui_message? translated_text?) — that names the render path for the whole
family. Check the field's dictionary type (`internal_type`) before assuming ui_message. And write
guards: an invalid column name in addQuery/setValue is dropped SILENTLY on write paths too — a
language-less query can match and overwrite baseline rows of other languages.

## Catalog client scripts with Isolate script = true run in a crippled interpreter

Isolated client scripts (isolate_script=true, the default, and inherited when cloning) do not run
in the browser's JS engine on the portal — they go through ServiceNow's sandboxed interpreter,
which lacks pieces of ordinary JavaScript: regex literals and RegExp, isNaN, and other globals
fail at runtime with "not supported" console errors, not at save time. Symptoms look like broken
code ("/x/.test is not supported", "isNaN is not supported") while the same body is perfectly
valid ES5.

Fix: set Isolate script = false on the client script record (add the field to the form via Form
Layout if hidden) — restores the full browser JS context. When creating client scripts by script,
set isolate_script=false explicitly; cloning field defaults from an existing record silently
inherits isolation.

Related portal gotcha in the same family: g_form.setValue() re-renders the field and wipes a
message just shown with showFieldMsg — always setValue FIRST, showFieldMsg after (the re-triggered
onChange with the empty value must early-return before any hideFieldMsg call).

## GlideRecord.setValue() is a silent no-op on journal fields

Writing a comment or a work note server-side with `gr.setValue("comments", text)` does nothing:
no `sys_journal_field` row is created, `sys_mod_count` does not move, and `gr.update()` still
returns the sys_id, so the calling code sees success. A propagation rule built this way logs a
clean run for months while the target record stays empty.

Measured on a Requested Item to Catalog Task comment mirror, seven write methods on the same
`sc_task` record in one background script, counting `sys_journal_field` rows before and after:

| Method | sys_mod_count | journal row |
|---|---|---|
| `gr.setValue("comments", t)` | 4 -> 4 | no |
| `gr.comments = t` | 4 -> 5 | yes |
| `gr.comments.setJournalEntry(t)` | 5 -> 6 | yes |
| `gr.setValue("work_notes", t)` | 6 -> 6 | no |
| `gr.setValue(<non-journal field>, t)` | 6 -> 7 | n/a |

Use direct assignment (`gr.comments = text`) or `setJournalEntry()`. `setValue()` works for every
ordinary field, which is what makes the failure so easy to miss in review.

Diagnostic that separates the two failure modes when a propagation rule "does not work": count
the journal rows before and after the write AND read `sys_mod_count`. Row count unchanged with
mod_count unchanged means the write never happened; row count unchanged with mod_count bumped
means the record was written and only the journal entry was refused. Compare a plain-field write
in the same run to prove the record is writable at all.

Related: `setWorkflow(false)` disables business rules, script engines AND audit, so verify a
silent journal write on each instance rather than assuming the entry survives.

Pasting-related corollary for hand-built server scripts: declare helper functions BEFORE the
main block and end the file with an explicit end-of-script marker comment. A paste that loses its
tail then fails to parse — loud and obvious — instead of hoisting most of the file and throwing
`ReferenceError: "x" is not defined` from a helper that happened to sit at the bottom. Verify a
saved script by comparing `sys_script.script.length` against the source; a mismatch is truncation,
not a platform quirk.

## addQuery() does not accept LIKE — it silently returns nothing

`gr.addQuery("name", "LIKE", "some text")` compiles and runs but matches zero rows, while the same
record is found by an exact-value query. `LIKE` is an ENCODED-QUERY operator; the operators
`addQuery()` documents are `=`, `!=`, `>`, `>=`, `<`, `<=`, `IN`, `NOT IN`, `STARTSWITH`,
`ENDSWITH`, `CONTAINS`, `DOES NOT CONTAIN`, `INSTANCEOF`. Use `CONTAINS` with `addQuery()`, and
keep `LIKE` for `addEncodedQuery()`.

Same failure family as an invalid column name in addQuery: no error, no log line, just an empty
result that reads as "the data is not there". When a query returns 0 rows and you expected some,
reproduce it with an exact-match query on one known record before concluding anything about the
data.

## gs.getProperty() returns a Java String — `=== "literal"` is always false

A property read compared with `===` or `!==` against a JavaScript string literal never matches,
because the value is a `java.lang.String` and strict comparison also compares type. The code runs,
logs nothing, and silently takes the wrong branch. Same family as comparing a GlideElement with
`===`, but easier to miss because a property looks like plain configuration.

Found in a licence clean-up Script Include, five instances, all silent:

| Expression | Actual result | Consequence |
|---|---|---|
| `tz !== this.p.timeZone` (property vs coerced session zone) | always true | every scheduled run aborted on a time-zone mismatch that did not exist |
| `this.p.mode === "enforce"` | always false | enforce mode could never engage |
| `this.p.lastBucket === key` | always false | the repeat-run guard never fired |
| `gs.getProperty("...force","false") === "true"` | always false | flag unusable |
| `gs.getProperty("...debug","false") === "true"` | always false | debug logging never switched on |

Fix at the source rather than at each comparison: coerce once where the properties are read,
`gs.getProperty(name, def) + ""`, and coerce inside any helper that does string work on them
(`((v || "") + "").split(",")`). Then every downstream `===` behaves.

Cheap detector before you trust a class: instantiate it in a background script, call its pure
read method, and print each resolved value ALONGSIDE a strict comparison against what you expect.
Two identical-looking strings that compare false is the signature.

## A scheduled job with a Time zone needs `entered_time`, not `run_time`

On `sysauto` the before insert/update rule **Adjust Time Based on Time Zone** owns `run_time`. When
`time_zone` is set and is not `floating`, it converts `entered_time` (the LOCAL time you want) into
`run_time` (UTC) and aborts the write when `entered_time` is empty:

```javascript
if (current == null || current.time_zone == "" || current.time_zone.equals("-- None --")) return;
if (current.run_type == "periodically") return;
if (!current.entered_time.getValue()) { gs.addErrorMessage("... without Time (entered_time)"); }
// floating: run_time = entered_time; otherwise run_time = toGlideTime(entered_time, time_zone)
```

So creating a job by script with `run_time` + `time_zone` and no `entered_time` fails with
"Record inserted or updated in table sysauto_script with name X without Time (entered_time)" and
`insert()` returns null. Set `entered_time` and `time_zone`, leave `run_time` alone. Verify on an
existing job: one seen with `entered_time` 00:00 + `US/Pacific` carries `run_time` 08:00.

Neighbouring rules on the same table that also abort, worth knowing before scripting a job:
`Ensure Valid Schedule` (next occurrence must be valid), `Restrict non-admin on Run-As field`
(a non-admin cannot point Run as at an admin), `Ensure required date fields present` (run_month /
run_weekinmonth for the year- and week-based trigger types), `Validate Start and End Dates`.

## Name columns silently truncate at 40 characters

`sysevent_email_action.name` and `sys_script.name` store only the first 40 characters and give no
warning. A longer name is cut mid-word, sometimes leaving a trailing space, and the record then
never matches a lookup by its intended name. Check `sys_dictionary.max_length` before naming
anything from a script, and prefer a short prefix plus a distinct suffix over a descriptive
sentence. Functional impact is usually nil (notifications fire on the event, update sets match on
sys_id) but a by-name query for the record will silently find nothing.

## A dangling Angular-provider link blanks the whole Service Portal widget

`m2m_sp_ng_pro_sp_widget` joins a widget to its Angular providers (`sp_angular_provider`). A
widget cloned from a header/footer that uses a provider from an optional application (for example
Content Publishing's surge-event modal) carries that link into the update set. On a target where
the application is not installed the provider record does not exist, the link is dangling, and
the widget renders as nothing at all — no error on the page, no obvious syslog entry, the template
and scripts byte-identical to the source. A rollback of the set does not remove the row either
("Record purge failed" on the m2m row). Diagnose by listing the widget's provider links and
resolving each `sp_angular_provider`; fix by deleting the dangling row and clearing the cache.
Compare a cloned widget against its baseline by its provider and dependency links, not only by
its script fields.

## Flow Designer action inputs are stored gzip+base64 in `sys_hub_action_instance_v2.values`

The input values of every action in a published flow sit in `sys_hub_action_instance_v2.values`
(and `sys_hub_flow_logic_instance_v2` for If/End steps) as a gzip stream encoded in base64
(`H4sI…`), not as readable JSON — a regex or `CONTAINS` query for a sys_id inside a flow finds
nothing. `sys_hub_flow.latest_snapshot` / `master_snapshot` are plain strings pointing at
`sys_hub_flow_snapshot`, whose longest text field is only a label cache. The legacy
`sys_hub_action_instance` table exists but is empty for flows built on recent releases. To audit
which group a Create Catalog Task or Ask For Approval points at on a target instance, print the
`values` field in full from a background script and decode it locally
(`zlib.gunzipSync(Buffer.from(b64, 'base64'))`); reference inputs then show as
`assignment_group={"display":…,"value":<sys_id>}` inside the `ah_fields` template value, and
approval groups as `{{static.<sys_id>}}` inside `approval_conditions`. Data pills appear as
`{{<uuid>.<field>}}` and need no cross-instance check.

## Two update sets carrying the same list-valued system property — the last commit wins

A `sys_properties` record that several features append to (a comma-separated list of catalog item
sys_ids gating a business rule, for example) is captured by every update set in which it was
touched, each with the full value as it was at that moment. On the target the sets are committed
one after another and the last one's value replaces the merged one — a feature committed earlier
silently loses its entry, and nothing in the preview warns (no collision: the record simply gets
updated again). Symptom: the gated logic works on the source and stays silent on the target. Before
promoting, check every shared property with `sys_update_xml` rows in more than one set, and either
put the final merged value into the last set to be committed or reset the value by hand after the
last commit. A related trap: when the value is pasted by hand, a trailing newline survives in the
property and defeats an exact match after `split(',')` — trim it.

## Ask For Approval with a computed group: the pill goes inside the rule, and it must be a Group reference

Two silent failure modes when the approval group comes from a script in Flow Designer. (1) Dropping
the data pill straight into the *Rules* input of Ask For Approval is accepted but yields no
approvers: the step completes at once as if approved and the flow moves on with zero
`sysapproval_approver` rows. The pill belongs inside the rule — choose "Anyone approves", add an
approver of type Group and drop the pill into that Group field. (2) That Group field only accepts a
pill of reference type; a String flow variable holding a sys_id cannot be dropped there. Declare the
flow variable as Reference → Group [sys_user_group] — the fx script can still return the sys_id. Also,
`fd_data.<...>` paths inside fx scripts are UUID-based; typing one by hand fails at save with "Failed
to find UUID for script reference" — insert the pill through the data picker in the script editor.

## A JavaScript number written to a choice-backed integer field is stored as "9.0"

Rhino keeps the result of `parseInt()` (and any arithmetic) as a double; `gr.setValue('type', parseInt(v, 10))`
on `item_option_new.type` stores the string "9.0", which matches no choice value — the list shows the raw "9.0" and
the variable renders as an unknown type. Integer literals happen to survive, which hides the problem until the first
computed value. Always pass such codes as strings (`'9'`, or `gr.getValue('value') + ''`) and never as numbers.

## Catalog variable labels and choice texts are translated_field — translate the VALUE in sys_translated, not the record

`question.question_text` and `question_choice.text` are dictionary type **translated_field**, not translated_text. Their
translation is looked up by value: a row in `sys_translated` with `name` = the table that owns the field (`question`,
`question_choice`), `element` = the field, `value` = the English text, `language`, `label` = the translation. Rows in
`sys_translated_text` keyed by the variable's sys_id are simply ignored for these fields — which is why an item can show
Bulgarian labels with zero `sys_translated_text` rows (the value was translated once for another item) and why a fresh
item with a full set of `sys_translated_text` rows still renders English. Editing the label in a non-English session
creates the `sys_translated` row silently. Consequences: one row translates every variable/choice with the same English
text on the instance (so an existing row with a different wording is a shared decision, not a per-item fix); the item's
own name/short description ARE translated_text and stay in `sys_translated_text`. Check `sys_dictionary.internal_type`
before choosing the table.

## catalog_script_client.name is 40 characters — a longer name is silently truncated on insert

- Symptom: a catalog client script created by script with a 49-character name is later "missing" when looked up by that name; the record exists as `Example Item - long descriptive script na` (40 chars). No error, no warning — GlideRecord.insert() truncates to the column length.
- Rule: keep catalog client script names ≤ 40 characters (`sys_script_client.name` is 100, `catalog_script_client.name` is 40). Check `sys_dictionary.max_length` before naming any record by script, and look objects up by sys_id (kept from the insert log), not by name.
- Observed at the same time (cause not verified): two catalog client scripts inserted with `isolate_script = false` read `1` afterwards. Verify the flag after every scripted insert/update and set it by hand when the body needs regex/isNaN (see the isolate note above).

## Get Catalog Variables: a Reference variable pill is a record object in scripts — use `.sys_id`

- In a Flow Designer script (Set Flow Variables fx, action input script), `fd_data.<get_catalog_variables>.<reference_variable>` is a record object, not a string. `+ ''` yields the DISPLAY value (e.g. the department name), so a map keyed by sys_id returns nothing and every request falls into the "no approval group" branch.
- Use `fd_data.<step>.<variable>.sys_id + ''` (or pick the pill's *sys_id* child in the data picker). Select Box variables whose choice value is a sys_id are plain strings — `+ ''` is right there.
- Seen twice on the same estate — once fixed by hand in the picker, once repeated from a written flow guide. The working expression is the `.sys_id` form; put it in the guide, not only in the flow.

## 21. Outbound REST — Basic-Auth `Authorization` header leaks into `sys_outbound_http_log` at verbose log levels (confirmed 2026-06-08)

**Symptom / risk:** when an outbound REST call uses Basic Authentication, the `Authorization` header (base64 username:password) can be written **in clear** into the outbound HTTP log table `sys_outbound_http_log` — i.e. credentials end up queryable in a platform table, defeating "no hard-coded / securely-stored credentials" requirements.

**Trigger condition:** verbose request logging is on — the system property `glide.outbound_http_log.override = true` **and** the log level is `all` or `elevated` (instance-wide, or raised per call). At the default/`basic` level the request headers (including `Authorization`) are not logged.

**Working pattern (keep credentials out of the log):**
- In `RESTMessageV2` / `RESTMessageV2` scripted calls, set the per-message level explicitly: `r.setLogLevel('basic');` — never `'all'`/`'elevated'` for a call that carries an auth header.
- Leave `glide.outbound_http_log.override` **off** (default) instance-wide; only raise it transiently for a specific non-auth debugging session, then revert.
- Hold credentials in a **Connection & Credential Alias** (referenced by the REST Message), not in the script, a system property, a log line, or a work note.
- This applies to ANY outbound auth scheme whose secret rides in a header (Basic, Bearer/OAuth token, API key header).

**Doc grounding (Australia branch):** `markdown/platform-security/instance-security-hardening-settings/sc-prevent-verbose-http-request-logging.md` (the override + level behaviour) and `markdown/api-reference/web-services/outbound-logging-configure.md` (per-call log level).

**General principle:** for outbound integrations, treat the HTTP log level as a security control, not just a debugging knob. Default to `basic`, gate any `all`/`elevated` raise behind a change, and verify post-deploy that no `Authorization`/token value appears in `sys_outbound_http_log`.

## 22. Styled Word `.docx` on macOS/Linux + diagrams must be rendered draw.io, not Mermaid (confirmed 2026-06-09)

**Problem:** the house Word converter `scripts/md-to-docx.ps1` is Windows/PowerShell-only — on a Mac there was no way to produce the styled `.docx`. Separately, embedding a diagram as a ` ```mermaid ` block makes it render as raw monospace **text** in Word, not as a diagram.

**Working pattern (cross-platform, no Pandoc / Word / python-docx):**
- **`.md` → styled `.docx` on Mac/Linux:** `scripts/md-to-docx.py` — a faithful pure-Python-stdlib port of the PowerShell converter (builds the Open XML parts and zips them). Identical house style (navy title banner, blue-header zebra tables, inline code, shaded callouts, embedded PNGs, page-numbered footer). Run: `python3 scripts/md-to-docx.py --src X.md --out X.docx --footer-text "<Client> | Commercial in confidence"`. Nothing to pip-install beyond Python 3.
- **Diagrams in a `.docx` = rendered draw.io PNG, never Mermaid:** author the figure as `.drawio` (Diagramming Specialist), rasterise **locally** with `scripts/render-drawio.sh` (needs draw.io Desktop — `brew install --cask drawio`; CLI at `/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -s 3 -o out.png in.drawio`), then reference the PNG `![](diagrams/figure-N.png)`. `md-to-docx.py` now also refuses to dump a `mermaid`/`mmd` fence as code (it emits a muted placeholder), so Mermaid source can never leak into Word.
- **Visual QA on Mac:** `scripts/render-pdf.sh file.docx` → PDF via LibreOffice headless (`brew install --cask libreoffice`). `soffice --headless --convert-to png` renders page 1 to an image for a quick eyeball.
- **Confidentiality:** draw.io Desktop and the Mermaid CLI render **locally** — never an online service.

**Gotchas:**
- macOS has no `timeout` (use `gtimeout` from coreutils, or omit).
- `.drawio` XML emitted by an LLM may contain `&nbsp;` — not a predefined XML entity, so strict parsers reject it. Replace with `&#160;` to make it well-formed before a VSDX/Lucid export.
- draw.io PNG at `-s 3` gives crisp text; `md-to-docx` caps embedded image width at ~6.2 in, so very wide diagrams shrink — use a landscape appendix if a client needs them larger.

**Prerequisites by OS + the full pipeline:** `scripts/README.md`. Rule also recorded in `CLAUDE.md` Artefact standards (Diagrams + Word/PDF export rows).

---

## 23. Incident state → 6 (Resolved) — `close_code` must be a valid instance choice (confirmed 2026-06-26)

**Symptom:** `update_incident({state: "6", close_code: "Solved (Permanently)", ...})` returns `INSUFFICIENT_PRIVILEGES`. The same call with a valid `close_code` value succeeds immediately.

**Root cause:** `close_code` is a mandatory field for state=6 on this instance. When the supplied value is not in the instance's `sys_choice` list for `incident.close_code`, ServiceNow rejects the update. The MCP tool maps this validation failure to `INSUFFICIENT_PRIVILEGES` instead of a meaningful validation error — making it look like an ACL or role problem when it is actually a bad field value.

**The standard OOB value `"Solved (Permanently)"` does NOT exist on this instance.** This instance has a custom choice list. Always query `sys_choice` before resolving:

```
query_records(sys_choice, name=incident^element=close_code^language=en^inactive=false)
```

**Working pattern — resolve an incident via REST:**
1. Query valid `close_code` choices (above)
2. Send in a single call:
```
update_incident(sys_id, {
  state: "6",
  close_code: "<valid choice value from sys_choice>",
  close_notes: "..."
})
```
`resolved_by` and `resolved_at` are auto-populated by the `mark_resolved` Business Rule.

**What does NOT work:**
- `resolve_incident` MCP tool — parameter mismatch (`incident_id` vs `sys_id`)
- `natural_language_update` — not implemented on this instance
- Any `close_code` value not present in `sys_choice` for this instance

**Lesson:** `INSUFFICIENT_PRIVILEGES` from the MCP tool does not always mean an ACL failure. It can mask validation errors (invalid choice value, missing mandatory field). When a field update fails with this code, first verify field values are valid for the instance before investigating ACLs.

---

## 24. `sys_script_fix.name` truncates silently at 40 characters (confirmed 2026-08-28)

**Symptom:** A Fix Script created via the REST Table API with a 44-character `name` was stored as
40 characters, with the tail cut off mid-word. The API returned HTTP success and echoed the
truncated value in the response — no error, no warning.

```
sent:      "UserManagerUtils - Manager Lookup Smoke Test"   (44 chars)
stored:    "UserManagerUtils - Manager Lookup Smoke "       (40 chars, trailing space)
```

`sys_name` is truncated identically, so the record's display value is wrong everywhere it appears
(list view, update-set preview, the `sys_update_xml.target_name` of the captured update).

**Why it matters:** the truncated name is what travels through the update set. On the target
instance the artefact arrives under a mangled name, and a name-based lookup or a promotion
checklist that greps for the intended name will not match.

**Working pattern:** keep `sys_script_fix.name` at **40 characters or fewer**, and read the
`name` field back from the create response rather than assuming the sent value was stored.
The same check is worth applying to any short platform label field written over REST — the API
does not reject over-length input, it silently trims it.

**Detection:** compare sent vs returned `name` in the create response, or query
`sys_update_xml.target_name` after capture. A trailing space in the stored value is the tell.

## 25. A flow written row-by-row over the Table API stays `version=1` — Flow Designer ignores its `_v2` rows (confirmed 2026-09-24, Australia P5)

- The Table API accepts client-supplied `sys_id`s on `sys_hub_flow`, `sys_hub_trigger_instance_v2`, `sys_hub_action_instance_v2` and `sys_hub_flow_logic_instance_v2` — every row lands with the planned id, `ui_id` and `parent_ui_id`.
- But `sys_hub_flow.version` cannot be set over REST: an ACL `sys_hub_flow_base.version` (write, **admin_overrides = false**) silently drops the field on insert and on update — the row is created with `version = 1` and a PATCH to `2` returns 200 with `sys_mod_count` unchanged. UI-built flows are `version = 2`.
- With `version = 1` the platform treats the flow as the legacy model: its update-set serializer captures one `sys_hub_flow_<id>` row (type Flow) whose payload carries only the flow record plus `delete_multiple` for the **legacy** tables (`sys_hub_trigger_instance`, `sys_hub_action_instance`, `sys_hub_flow_logic`) — the `_v2` children are never captured, and touching the flow row again re-serializes it the same way.
- The flow row insert also auto-creates a `sys_flow_cat_variable_model` row and a `version_record` (after-insert business rules).
- Rule: a Flow Designer flow cannot be built by Table-API writes. Deliver it through an import path that applies the full `<record_update>` payload (flow row with `version = 2` + the `_v2` children): Import Update Set from XML → Preview → Commit, or an instance-side loader. Update-set capture of a flow is one `sys_hub_flow_<id>` row containing the whole flow — never expect per-child `sys_update_xml` rows.
- Side trap seen in the same test: a UI session logged in as the same user rewrites the `sys_update_set` user preference (the record was deleted and re-created a minute after the REST write, pointing back at the user's own set). Check the preference immediately before every scripted write when the account is also used interactively.

### The working path: the instance-side loader, then activation (confirmed 2026-09-24, Australia P5, ServiceNow IDE 4.4.4)

- **Loader.** `POST api/fluent/load/<scope>?targetUpdateSetId=<update set sys_id>` (`<scope>` = `global` or the `sys_scope` sys_id), `multipart/form-data` with one part named `files` carrying the flow as a `<record_update>` XML document (flow row + every `_v2` child, SDK-shaped). This is the endpoint the ServiceNow IDE uses to install application metadata, and it **accepts plain HTTP Basic authentication** — no session cookie or user token needed.
- The loader applies the document with platform rights: the flow row comes out `version = 2` (which the Table API can never set) and the target update set receives **one** `sys_update_xml` row `sys_hub_flow_<id>` whose payload holds the flow and every `_v2` child. Capture goes by `targetUpdateSetId` — no `sys_user_preference` is read or written for the load.
- The document's `delete_multiple` elements (`flow=<id>^sys_idNOT IN…`, `model=<id>…`) are applied by the loader too — they delete existing child rows the document does not carry. Count them before a reload.
- **Activation.** `POST api/now/wfa_fluent/activate_flows?sysparm_transaction_scope=global` with the flow's sys_id publishes it: `status = published`, `active = true`, `latest_snapshot` / `master_snapshot` set. A real record meeting the trigger condition then ran it — `sys_flow_context` `COMPLETE` in under two seconds, the Update Record step's work note written with its data pill resolved.
- **Activation capture is NOT by `targetUpdateSetId`.** The call runs in the user's session and follows the user's `sys_update_set` preference **for the global scope**. In the test it re-pointed that preference to another in-progress global update set belonging to a different user and captured there: a second `sys_update_xml` row `sys_hub_flow_<id>` (the published state; its payload now also carries `sys_hub_flow_input` rows) and two `sys_documentation` rows named `sys_documentation_var__m_sys_hub_flow_input_<flow id>_<element>_en`. They had to be moved to the target set (update `sys_update_xml.update_set`) and the preference restored. Rule: set the preference to the target set immediately before activating, check every set for rows of the flow afterwards, restore the preference.
- **Platform-managed flow inputs.** For a record-triggered flow the platform creates `sys_hub_flow_input` rows itself (`model` = the flow, `model_table = sys_hub_flow`, `name = var__m_sys_hub_flow_input_<flow id>`): element `current` (internal type `document_id`, label *Record*, mandatory, `use_dependent_field = true`, `dependent_on_field = table_name`, order 100, attributes `element_mapping_provider=com.glide.flow_design.action.data.FlowDesignVariableMapper,uiType=document_id`) and element `table_name` (internal type `table_name`, label *Table Name*, order 101, max length 200, attributes `…FlowDesignVariableMapper,test_input_hidden=true,uiType=table_name`), each with a `sys_documentation` row, random sys_ids, **re-created on activation if deleted**. A reloaded document whose `delete_multiple` covers `sys_hub_flow_input model=<flow>` deletes them — expected; re-activate afterwards.
- Table API reads: a column named in `sysparm_fields` that does not exist on the table is simply omitted from the response (no error) — e.g. `active` on `sys_hub_action_instance_v2`. Treat a missing column in a read-back as "no such column", not as an empty value.
- A complex loader-built flow (error handler, stages, flow variables, If / Else If / Else, Look Up Record(s), For Each, Try/Catch around Create Record, Ask For Approval on a group from a lookup pill, a final If on `approval_state`) ran end to end: group approval requested for every group member, the flow waited, one approval completed it and the approved branch wrote its note. Proof that the loader path covers real process logic, not only a smoke test.
- **Update Multiple Records does not write journal fields.** With `work_notes` in its field values the action completes without error and adds no note; ordinary fields (e.g. `description`) are updated on every matching record. Write journal entries per record with Update Record inside a For Each instead.
- A second load of an identical flow definition is safe: the loader re-serializes the flow's `sys_update_xml` row (new payload hash) and re-activation republishes into the same master snapshot. Loader-built subflows (inputs/outputs) and a flow calling them with `wait_for_completion`, Do In Parallel, For Each with Skip Iteration / Exit Loop, Do Until with an inline-script counter, and a 5-second explicit Wait all ran as designed.
- **Run-once scheduled trigger: `run_in` is read in the instance's system time zone** (`glide.sys.default.tz`, applied when the user has no time zone of their own), not in UTC. A value that is already past in that zone fires the flow immediately on activation (via `sys_flow_timer_trigger`). Convert the intended moment to the instance's zone before loading, and check it is still in the future.
- **Activation normalises the flow's step values:** after `activate_flows`, each `sys_hub_action_instance_v2.values` is rewritten into the full Flow Designer form (every input with its complete `parameter` metadata — choices, defaults, attributes), `compiled_snapshot` is set, and `label_cache` entries gain display fields such as `reference_display`. A minimal but correct loaded definition is therefore enough — the platform fills in the rest when it compiles.
- **Delete Record on a record that no longer exists does not fail** — the step completes and the flow continues, so it cannot be used to exercise an error handler. A step that reliably fails: Look Up Record with "If multiple records are found" = Fail the step and a condition matching several rows. The flow's error handler then runs, `{{error.message}}` carries the step's message, the remaining steps are skipped and the context ends `COMPLETE` (handled).
- Loader-built catalog steps ran on a real RITM of an existing item: Get Catalog Variables exposed the item's variables as pills (`{{<step>.<variable_name>}}` resolved to the submitted values), Create Catalog Task created the task with those values and the given assignment group, Send Email produced a `sys_email` record, and Wait For Condition with a timeout resumed after the timeout with its state output set.
- Record Updated trigger with a `CHANGESTO` condition fired once on the state change (not on insert), with the changed field's display value available as a pill.
- **Creating an update set over REST:** `sys_update_set.application` is taken from the creating user's current application (`apps.current_app`), not from the `application` value in the POST body, and a later PATCH of `application` is silently ignored. To create a global set, make sure the user's current application is Global first — otherwise the set lands in whatever scoped app the user last worked in.
- **Do not verify a flow run by searching `syslog` for its message.** A `message STARTSWITH …` query with no time bound ran past the two-minute REST timeout on a busy instance. Check `sys_flow_context` (`flow=<id>`, state `COMPLETE` / `ERROR`) and the records the flow wrote; when the log line itself is needed, bound the query with `sys_created_on>=` the run window.

## 26. A problem cannot be cancelled or closed over the Table API (confirmed 2026-09-25, Australia P5, Problem state model active)

- `problem.resolution_code` is **read-only in the dictionary**. The Table API drops it without an error: the PATCH returns 200 and the field stays empty.
- The Problem model has no New → Closed transition. Assess, Root Cause Analysis and Fix in Progress → Closed each require `resolution_code = canceled` with `close_notes`, or `resolution_code = duplicate` with `duplicate_of`. Because the code is dropped, the *Problem Model: Check State Transition* business rule aborts the state change. The response is still 200 and the state is unchanged.
- New → Assess does work over REST once `assigned_to` is set.
- Rule: cancel or close problems in the UI (**Cancel** / **Mark Duplicate**). Never script a problem closure over REST. After any REST state change, read the state back: a 200 does not mean the transition happened.
