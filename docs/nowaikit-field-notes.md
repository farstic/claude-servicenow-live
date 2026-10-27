# NowAIKit MCP — Known Limitations & Patterns

**Purpose:** Operational field notes for the NowAIKit MCP connection to a live ServiceNow instance — confirmed tool behaviours, bugs, and the workarounds that make them safe to rely on. This is the cross-laptop knowledge base: a `git clone` plus this file restores full operational knowledge.
**Audience:** Architects and developers operating the engine against a live PDI; anyone debugging an MCP write that did not behave as expected.
**Scope:** Generic patterns only — no instance URLs, credentials, emails, or sys_ids. Instance-specific values live in local memory (`memory/MEMORY.md`), never committed.
**Related:** `MCP-OPERATIONS-GUIDE.md` (the playbook these notes support) · `TECHNICAL-ARCHITECTURE.md` (§2.1 write gate, §2.2 Update Set capture).
**Last updated:** 2026-10-27

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

**The value match ignores case (confirmed 2026-10-09 on a Postgres-backed instance).** `sys_translated` has a unique index on
(`name`, `element`, `value`, `language`) that ignores case, and so does a GlideRecord query on `value`. An existing row for
`Requested By` therefore *is* the row for `Requested by`. A script that keeps only exact-case matches decides the row is
missing and inserts a second one, which fails with `duplicate key value violates unique constraint` (the script carries on).
If it then calls `GlideUpdateManager2().saveRecord()` on that never-inserted record, it can leave an update record for a row
that does not exist. Treat any row the query returns as the existing row (compare its label), check the result of
`insert()` before pushing, and expect a variable to pick up the wording of a case-variant row already on the instance.

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

## 27. Notification text can live in the e-mail template's plain `message` field, not in `message_html` (confirmed 2026-10-01, customer prod)

- **Symptom:** after removing `${mailto:mailto.approval}` / `${mailto:mailto.rejection}` from every approval notification's `message_html`, the "Approval Request" e-mail still showed "Click here to approve / reject".
- **Cause:** that notification has an empty body and renders its **e-mail template** (`sysevent_email_template`, here `change.itil.approve.role`); older OOB templates keep their HTML in the `message` field, and `request.itil.approve.role` / `request.itil.approver.reject` carry the same links.
- **Find the source first:** `sys_email_log` for the e-mail gives the notification; the notification's `template` gives the template. Search `message`, `message_html` and `message_text` on both tables, plus `sys_script_email` and `sys_translated_text`, before changing anything.
- When removing a block that sat between separators, collapse the separators left back to back, or the e-mail shows two or three lines in a row.

## 28. A child table closed by ACL can still be read through its base table (confirmed 2026-10-05, PDI, FSO Store apps)

- **Symptom:** `GET /api/now/table/sn_bom_service_definition` returns `INSUFFICIENT_PRIVILEGES` for an integration user that can read almost everything else in the FSO scope.
- **Cause:** the scoped app's ACLs are written on the child table; the base table it extends (`sn_case_type_selection`, global CSM) has its own, wider read ACL. Table-API reads are evaluated on the table named in the URL.
- **Working pattern:** query the base table and filter on `sys_class_name` (e.g. `sys_class_nameSTARTSWITHsn_` or `sys_class_name=sn_bom_service_definition`). The polymorphic read returns the child rows with every base-table column (`name`, `id`, `table`, `case_type`, `order`, `active`, `template`, `playbook_record_generator` …); only columns that exist solely on the child are missing — in this case none (the child adds no columns).
- **Use it for:** verifying which service definitions, incident configurations and related party configurations an FSO instance really has, without asking for an ACL change. The same trick applies to any extended table whose child ACL is tighter than its parent's.
- **Dictionary checks that go with it:** own columns of a table = `sys_dictionary` with `name=<table>^elementISNOTEMPTY^elementNOT LIKEsys_^internal_type!=collection`; inherited columns do not appear — list the parent chain from `sys_db_object.super_class` first. Choice lists = `sys_choice` with `name=<table>^element=<field>^inactive=false^language=en`; a choice field defined on a parent (e.g. `sn_bom_task.state`) lists under the parent's name, not the child's.

## 29. FSO Insurance Claims Core: claim coverage and policy-participant lookups resolve against the policy SNAPSHOT copies (confirmed 2026-10-06, PDI Brazil P0, Insurance Claims Core 4.1.5 / FSO Core 13.1.3)

- `sn_ins_claim_coverage.fso_claim_coverage` (→ `sn_bom_policy_coverage`) is qualified by `sn_ins_claim.FinancialClaimCoverage.claimCoverageRefrenceQualifier()` = `policy_snapshot=<case.policy_snapshot>`; `sn_ins_claim_profile.claim_profile` ("select from policy participants") by `ClaimProfile.policyParticipantReferenceQualifier()` = the same. Only the snapshot copies are selectable — a snapshot header without child copies makes claim coverage, reserve and payment impossible to create in the UI. Any integration that builds the snapshot from an external policy system must create the child copies too.
- `sn_bom.PolicySnapshotGenerator.generatePolicySnapshot` (called by the generic claims flow "Generate Policy Snapshot for Claim Case" → action "Generate Policy Snapshot") reads `case.sold_product` only and copies the records **as they are now**: header → `sn_ins_claim_policy_snapshot`; each `sn_bom_policy_participant` → a copy with `policy_snapshot` + one `sn_ins_claim_profile` (name / phone taken from consumer, contact or account); each `sn_bom_insured_property` → a **new `sn_bom_vehicle` row** (`case` set) + an insured-property copy (`policy_snapshot` set, `insurance_policy` empty); `sn_bom_policy_participant_insured_property` rows re-mapped; `sn_bom_policy_coverage` copies with `policy_snapshot` set and `sold_product` cleared (a dictionary-mandatory field written empty by script — mandatory is UI-only). The docs say to modify this script for as-of-date or external policies; the class is `access: public`, so `Object.extendsObject(sn_bom.PolicySnapshotGenerator)` from another scope plus a replacement flow gives the same result without editing the Store record (which would be skipped on every app upgrade).
- Consequence for master-data queries and integrations: `sn_bom_vehicle`, `sn_bom_insured_property`, `sn_bom_policy_coverage` and `sn_bom_policy_participant` hold snapshot copies next to the masters. Filter masters with `case ISEMPTY` / `policy_snapshot ISEMPTY` / `sold_product ISNOTEMPTY`; plate numbers and VINs are not unique.
- Payments and reserves: `sn_ins_claim_payment.claim_reserve` qualifier = `case=<case>^reserve_status=approved`; `ClaimPayment._isValidPaymentAmount` rejects Σ payments > reserve amount; `ClaimReserve._isValidReserveAmount` rejects a reserve below its payments; BR "Set reserve status if amount is changing" resets an approved reserve to pending when the amount rises. `payment_status` / `reserve_status` have exactly four values (pending, submit_for_approval, approved, rejected) driven by the subflows `claim_reserve_approval_flow` / `claim_payment_approval_flow` and the decision table "Claim reserve and payment approval rules" — do not add values.
- `case` and `case_record` both exist on `sn_ins_claim_profile` and `sn_ins_claim_coverage`; `save()` copies `case` into `case_record`, and the participant queries and UI policies read `case_record`. Integrations must set both.
- Policy participant roles → claim participants: `createClaimParticipantsFromPolicyParticipantsWithRole(snapshot, role)` finds the related party configuration by `applies_to=<claim case table>` AND `name=<role string>` (`sn_bom_policy_participant_insured_property.role` is a free string, no choice list) and silently stops when none matches — role strings must equal configuration names. `sn_ins_claim_participant.party_config` is qualified by `applies_to=<case sys_class_name>`, so configurations shipped for one claims application (e.g. the ten auto roles of Personal Lines Claims) are invisible to another application's case table — create new configuration records per case table.
- `sn_ins_claim_property.loss_type` ships with no `sys_choice` rows; the BR "Set display name for claim incident" derives `display_name` from it, so an unconfigured list means empty incident display names.
- Dictionary vs documentation on this release: `sn_bom_ins_policy_transaction` is a root table (docs: "extends sn_bom_transaction"); `number` on `sn_install_base_sold_product` is neither unique nor the display value (`name` is); `sys_id` is the only `primary=true` column on every task and sold-product table — never draw `number` as the key.

## 30. SOW List page spins forever for one user: a broken "My Lists" entry (`sys_ux_my_list`) (confirmed 2026-10-07, customer instance, Zurich)

- **Symptom:** in Service Operations Workspace the List page opens with an empty left panel and a spinner that never stops — no categories, no lists — for **one user only**. Other users are fine; impersonating the affected user reproduces it, so it is server-side data, not the browser.
- **Why the usual checks find nothing:** personal lists created under **My Lists** ("Add new list" — own columns, view, condition) are stored as **data** in `sys_ux_my_list` (fields `table`, `columns`, `view`, `condition`, `active`, `shared_users`, `shared_groups`, `order`). They are not update-tracked, so `sys_update_version` filtered by the user shows nothing; deleting the user's personal list layouts (`sys_ui_list` with `sys_user`) and recent `sys_user_preference` rows does not help either.
- **Fix:** open `sys_ux_my_list` filtered on `sys_created_by` / `sys_updated_by` = the user, OR `shared_users` LIKE the user's sys_id (lists shared with them through `shared_groups` count too); deactivate or delete the broken entry, then reload the workspace. To find the culprit among several, deactivate all and re-enable one by one.
- **Diagnostic order for a workspace list problem that affects one user:** (1) another user / impersonation — browser vs server; (2) personal list layouts and preferences; (3) `sys_ux_my_list` entries owned by or shared with the user; (4) F12 → Network (graphql / api calls) for the failing request.

## 31. FSO Personal Lines Servicing as an offer / quote case; claims-app fit for company-held policies; configuration scope (confirmed 2026-10-07, PDI Brazil P0, FSO Core 13.1.3 / Personal Lines Servicing 3.1.0 / Insurance Claims Core 4.1.5)

- **FSO has no offer / quote table.** The platform's construct for a request before the customer owns a product is a **Pre-sale** service definition (`sn_case_type_selection.service_type`); the shipped Personal Lines definitions (change coverage, update policy, send policy documents) are all Post-sale. A new-business offer can run on the Auto Policy Case (`sn_ins_policy_b2c_service`) through its own Pre-sale definition — but `consumer` and `sold_product` are mandatory there by **dictionary override on `sn_ins_policy_b2c_base`**, so release them with child-level overrides on `sn_ins_policy_b2c_service` (created in the Personal Lines Servicing scope) and enforce the right combination per service definition with **data policies** (also apply to REST). Do not create a placeholder policy in Sold Product state "In Preparation": that state means an ordered product with a future start, the Auto Policy Case qualifier does not filter on status, and every offer version would leave a policy record behind.
- **State value 20 "Awaiting Acceptance".** The shipped Personal Lines code writes `state = 20` when the processor approves a quote for the customer and locks the case and its Info lines in that state (`PolicyBaseDAO.canUpdateCase`), but Personal Lines ships no active English choice row for 20 (Commercial Lines Servicing ships it active on `sn_ins_policy_b2b_base`). Add a table-level state list on `sn_ins_policy_b2c_base` with the inherited values plus 20, instead of relabelling Awaiting Info (18), which carries CSM behaviour (customer comments move the case back to Open, first response time).
- **Case header totals.** `AutoPolicyServiceActionUtil.processorMarkComplete` overwrites the case `new_premium` / `net_premium` with the sums of the coverage Info lines; when an external rating engine returns totals that include fees and its own rounding, keep the playbook from calling it and let the integration be the only writer.
- **Claims application fit.** Personal Lines Claims makes `consumer` mandatory on its auto claim case and its policy qualifier returns consumer-held auto policies only; Commercial Lines Claims selects only `sn_bom_ca_ins_policy` by account. Policies of companies held on the personal auto policy class can only be claimed through the generic Insurance claims app (`sn_ins_gen_claim_case`), which selects by product × consumer **or** account. The shipped claim approval engine (decision table "Claim reserve and payment approval rules": Activity, Product, Amount → Title, then the `sys_user.manager` chain, fallback group "Claim approval exception handling group") has no location or group input.
- **No re-open, no "signal".** Claim cases have no re-open action and no pre-claim notification object; a separate service definition on the claim case (converted into a real claim by a new case that re-points participants, incidents and documents and sets `origin_table` / `origin_id`) keeps the claim KPIs clean.
- **Configuration scope.** `sys_db_object.configuration_access = false` on `sn_bom_case`, `sn_customerservice_case`, `sn_ins_policy_b2c_service`, `sn_ins_gen_claim_case`, `sn_ins_claim_coverage`, `sn_bom_product_coverage_type`, `csm_consumer` and `customer_account`: business rules, fields and overrides on them cannot be created from a custom application scope — create them additively in the owning scope (global for the CSM customer tables).
- **Channel values.** The CSM `contact_type` list on `sn_customerservice_case` ships `in_person` "In Person" **inactive** — activate and relabel it in a table-level list for walk-in channels instead of adding a new value.
- **Portal record producers.** With `use_service_catalog_item = false` the Workspace service selector opens the definition's playbook and ignores linked record producers, while the portal "Services" widget (Product Catalog Mapping) still lists the producers of the Catalog Service Relationships — one service definition can serve both channels.

## 32. Outbound REST Message by script: Variable Substitutions live in `sys_rest_message_fn_parameters`, not `sys_rest_message_fn_param_defs` (confirmed 2026-10-15, customer dev instance + PDI dictionary)

- **Symptom:** an HTTP method with endpoint `${base_endpoint}/rest/api/2/myself`, built by script, fails on **Test** with `Request not sent to uri= /_edge/tenant_info?base_endpoint=https%3A%2F%2F… : java.lang.IllegalArgumentException: host parameter is null` (status 0, error code 1). The variable was not substituted; it was appended as a query string.
- **Cause:** the two child tables of `sys_rest_message_fn` look alike (name, value, rest_message_function) but mean different things:
  - `sys_rest_message_fn_parameters` = **Variable Substitutions** (`value` label "Test value", `type` = Escape type: `string` = No escaping, `xml` = Escape XML). Feeds `${…}` in the endpoint, headers, query values and content, and the Test related link.
  - `sys_rest_message_fn_param_defs` = **HTTP Query Parameters** (`name`, `value`, `order`). Every row becomes `?name=value` on the request.
- **Fix:** write the test values to `sys_rest_message_fn_parameters`; delete the stray `sys_rest_message_fn_param_defs` rows.
- Related facts:
  - A method's **Endpoint** is a full URL. The REST Message endpoint is copied into a method only when the method is created; later changes do not propagate (`api-reference/web-services/t_DefineAnHTTPMethod.md`). To keep a base URL in one place, use `${base_endpoint}` in each method and set it with `setStringParameterNoEscape` in scripts.
  - Inserting a `sys_rest_message` creates a "Default GET" method automatically. Rename or reuse it in an idempotent script.
  - Use `newRecord()`, not `initialize()`, when inserting `sys_ws_definition` / `sys_ws_operation` by script, so dictionary defaults (namespace, consumes / produces) apply.
  - A Scripted REST resource has `requires_snc_internal_role` = true by default: an integration user calling it needs `snc_internal`. The default ACL "Scripted REST External Default" (`!gs.hasRole('snc_external')`) only blocks external users.

## 33. English field labels can only be changed from an English session

- Updating a `sys_documentation` row with language `en` (the English label of a dictionary field) from a session whose language is not English is aborted by the platform business rule **Sync with Dictionary and DB Object**, with the message "Can not change an English language label in the current language. To change the label, switch to the English language." Rows in the session's own language update normally, so a script that writes both languages changes one and silently keeps the other.
- `GlideRecord.update()` returns null on the abort and the script carries on — check the return value, otherwise the log reports a label that was never written.
- Practice for any script that writes English labels (new fields, relabelling): abort unless `gs.getSession().getLanguage()` is `en`; the user switches the language to English (user menu > Preferences > Language), runs the script, then switches back. A field created with `sys_dictionary.column_label` gets its English row on insert, so the problem appears on the relabel of an existing field.
- Provenance: a background script relabelling two new request-item fields from a Bulgarian session; the Bulgarian labels changed, the English ones were aborted while the script printed "set".

## 34. A silent record write still re-indexes the record

- A `GlideRecord` update with `setWorkflow(false)` + `autoSysFields(false)` (business rules, engines and audit off; Updated, Updated by and the update count unchanged) sends no notification and raises no business event, but the platform still queues `text_index` and `ais_index` events for the record, so the new values become searchable in text search and AI Search. They are not notifications and change nothing on the record.
- When proving that a backfill or a sync rule is silent, check `sys_email` (target table + instance), `sysevent` excluding `text_index`, `ais_index` and `user.view`, `sys_updated_on` and `sys_audit` for the written fields: all should be empty for the window.
- Provenance: backfill of two hidden request-item fields from their catalog tasks and the rule that keeps them in sync — 0 e-mails, 0 audit rows, 0 Updated changes; only index events (and page views) appeared.

## 35. A "missing group notification" report: read the record's e-mails before the notification setup (confirmed 2026-10-19, customer prod)

- **A group without a Group email mails its members.** A record-based notification addressed to a group (recipient field `assignment_group`) goes to every active member with an e-mail address when the group's **Group email** is empty — **Include members** off makes no difference. Include members matters only when a Group email is set. The note in `platform-administration/t_CreateANotification.md` ("Group members receive individual notifications only if Include members is selected") reads as if members are never mailed without the flag; on a live instance, groups with an empty Group email and Include members off received "Email assigned to group (sc_task)" with all their active members as recipients (3 of 3, 7 of 7). `servicenow-platform/knowledge-management/create-edit-ownership-group.md` states it directly: "If no group email is defined, emails are sent to individual group member emails."
- The Flow Designer **Send Email** action is different: to reach group members it needs Include members (`build-workflows/workflow-studio/send-email-action.md`).
- **Diagnose from the e-mails, not from the configuration.** For the reported records read `sys_email` (`instance` = the record's sys_id): `type`, the recipients counted against the group's active members (no need to print addresses) and `sys_email_log.notification` (which notification sent it). Then:
  - no row: the notification did not fire (trigger, condition, assignee already set);
  - `send-ready` older than a few minutes: the outbox is not being sent. The SMTP Sender job runs every minute (`platform-administration/r_MailDiagnostics.md`); open System Diagnostics > Email Diagnostics (Email in Queue, Last Sent Mail, SMTP Sender State, Default SMTP Status). Every notification on the instance is affected, not only the reported one;
  - `sent` with all members as recipients: the platform delivered it; look at the mail side or at the report.
  - A second notification fired in the same transaction to the same recipients ("Catalog task worknoted (unassigned)" next to "Email assigned to group (sc_task)") was marked `send-ignored` while the other was sent.
- **Check the named records first.** Record numbers in a report can come from another instance (test numbering differs from prod): confirm the item and group of each named record before analysing it.
- Provenance: a report of "no notification to the group" for one catalog item. The group setup was suspected first (empty Group email, Include members off) — wrongly: all 16 groups in use had the same setup and all reached their members; the two numbers in the report were unrelated tasks of other groups; the item's own tasks had been mailed to all members; and the same read showed every e-mail generated that day still in `send-ready` hours later.

## 36. Platform Analytics List: variable columns empty for one user — that user's personalized columns (confirmed 2026-10-20, customer instance, Zurich)

- **Symptom:** a Platform Analytics List visualization on Requested Item [`sc_req_item`] with catalog-variable columns (Variables > item > variable). For one user some variable columns are **present but empty**; another user sees the values on the same rows — on the dashboard and also in the visualization opened on its own. Both users are admin; impersonating the affected user reproduces it.
- **What it is not** (checked in this order): the data or the ACLs — the RITM form shows that user every variable value; the session language — the other user switched to the same language and still saw the values; the catalog item's user criteria — the item has none.
- **Cause:** the user's runtime column personalization. With **Show option to personalize columns** on, each viewer can add, remove and reorder the List's columns at runtime (`now-intelligence/create-list-dv-with-var-col.md`), and that column set is kept per user. Here it was most likely saved before the visualization's columns were re-picked a few days earlier: the columns still render, their values stay empty.
- **Fix:** as the user (impersonate), on the list open **Personalize columns** → **Reset to default**, or remove the empty columns and add them again from Variables; then Refresh.
- **After changing the columns of a shared list visualization:** users with a personal column set do not get the change — tell them to reset, or keep **Show option to personalize columns** off when nobody needs runtime personalization (not verified whether switching it off also drops column sets already saved).
- Provenance: a dashboard with two access-request lists — one fine for everyone, the other with three empty variable columns (a Reference, a Multi-line text and one more) for a project manager only.

## 37. Catalog client script: a variable declared outside the handler did not keep its value between two onChange calls on the portal (confirmed 2026-10-22, customer dev instance, Employee Center)

- **Symptom:** an onChange client script on a PC-name variable searched the CMDB through GlideAjax and filled the IP variable from the CI found. To clear that IP when the requester typed another name, it remembered the auto-filled IP in a `var` declared at the top of the script, outside `onChange`. On the Employee Center order form the IP was never cleared: with a second name that does not exist, the first PC's IP stayed.
- **Cause (observed):** the script-level variable read empty on the next onChange call, so the "was this IP filled by me?" check never matched. A node mock that evaluated the script once kept the value and passed, which is why the defect reached the instance.
- **Fix:** keep no state between calls. The IP now follows the PC name: every name change first clears the IP and the result field, then searches again; found → IP filled; empty name → both stay empty, and an IP typed afterwards is searched by the IP variable's own script. Cost of the rule: an IP typed by hand before the name is cleared when a name is typed.
- **Rule:** in catalog client scripts derive behaviour from the current field values, never from a variable outside the handler. A mock harness must load the script body afresh for every change event, or it hides this.
- Provenance: a Sophos policy-change request with PC name / IP / Discovery result variables; test "change the PC name to an unknown one" on dev.

## 38. Scripted catalog re-order (CartJS): the job must copy every variable, and hidden variables need a guard and a post-order check (confirmed 2026-10-22, customer prod + dev)

- **Symptom:** a daily job raises a termination request for each expired temporary access by ordering the same catalog item again with `sn_sc.CartJS().orderNow()` and copying the grant's variables. A variable added to the item later (a free-text "new port", shown by a UI policy only when Port = Other) arrived empty on every generated request, so the fulfilment task had no port to remove.
- **Cause:** the job lists the variables it copies in code, and the new variable was never added to that list. Two traps sit next to it: a variable hidden on the order form gets no value row (`sc_item_option`) on a portal order, so `ritm.variables.x` reads `undefined` and `undefined + ''` is the text `'undefined'`; and CartJS has already dropped a variable hidden on the order form (the reference variable that linked an earlier termination to its grant was lost on the scripted order).
- **Fix:** copy the variable with a guard (`gs.nil(v) ? '' : v + ''`), then make sure the value reached the new RITM: find its `sc_item_option_mtom` row through `sc_item_option.item_option_new`; if the option is empty, update its value; if there is no row, insert the `sc_item_option` (value + the variable's order) and its `sc_item_option_mtom` link. Never add a second row. A node mock with three CartJS behaviours (keeps the value / drops it / leaves an empty row) passed 8/8; the old code failed the same mock.
- **Rule:** a job that orders an item by script is part of that item: a variable added to the item goes into the job's copy list in the same change. Read hidden variables only through `gs.nil()`.
- Provenance: network-access catalog item with Permanent / Temporary / Termination types and a daily auto-termination job; defect reported on prod, fix tested on dev and promoted to test and prod.

## 39. Creating a business location / service organization fails with "insufficient privileges": the organization code collides (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- **Symptom:** inserting a CSM service organization or internal business location (`sn_csm_business_location_internal`, parent `sn_customer_service_organization`) through the Table API returned 403 (reported by the tool as INSUFFICIENT_PRIVILEGES) for an admin user; the same insert in a server-side script returned `null`. The create ACLs had admin overrides and the cross-scope create access was on, so it was not an access problem.
- **Cause:** `service_organization_code` and `service_organization_path` are unique. The code's default value comes from `GenerateCodeForSvcOrgTreePath.generateCode()`, which increments the last code kept in the property `com.snc.service_organization.last.generated.code.tree.path`. On an instance whose organizations were loaded with explicit codes (demo data), the property lagged far behind the codes in use, so every generated code already existed and the unique index rejected the insert.
- **Fix:** set `service_organization_code` explicitly to an unused code (check `service_organization_code` and `service_organization_path` first); the "Create SO Path for Insert" rule then builds the path from it (parent path + "/" + code, or the code alone at the root).
- **Rules:** a Table API 403 on insert is not always an ACL — check unique fields and before-insert rules. In a server-side script, test the return value of `insert()` before using it: `insert() + ''` is the text `'null'`, and a follow-on record then points at nothing.
- Related on the same tables: `sn_csm_service_organization_member` and `sn_retail_organization` refused Table API writes for admin, while a server-side script could write them (one-off scheduled script run as an admin, deleted afterwards).

## 40. Now Assist Skill Kit by server script: create, publish, run and re-version a custom skill (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- **When:** the Skill Kit UI cannot be driven from the connection (no background script, the UX data broker endpoint refused) — a one-off scheduled script run as an admin, deleted after it ran, does the same steps as the UI.
- **Create:** `sn_skill_builder.NaskServiceUtils` (public) `createSkill({name, description, modelProvider:{provider, providerApi}, prompt:[{promptname, promptTemplate, model, temperature, maxTokens}], inputs:[{name, datatype, mandatory, truncation, description, testRecord:{value}}], outputs:[], skillAccess:{roleMasking:{roles:[], allowAllSessionRoles:true}, acl:[{roles:[]}]}})` returns the capability and skill-config ids. Input names allow letters, digits and spaces only ("Attribute Label should contain only alphanumeric characters and whitespace" — no underscore); add one later with `createCapabilityAttributes(inputs, [], capabilityId, configId)`.
- **Publish:** finalize the prompt first — `sn_one_extend.GenerativeAIUtility.finalizeGenerativeAIConfig(promptId)` — then `NaskServiceUtils.publishSkill({configId, capabilityId, prompts:[promptId], sourceModality:'flowAction'})`. Without the finalize the prompt stays a draft and a run fails with 100004 "Active prompt configuration not found". The Now Assist Admin toggle is `sn_nowassist_skill_config_status` active + in_product_active.
- **Run** (flow inline script or server script): `sn_one_extend.OneExtendUtil.executeSecure({executionRequests:[{payload:{<input>:<value>}, capabilityId, meta:{skillConfigId}}], mode:'sync'})` → `capabilities[capabilityId].status` and `.response` (the model's text; parse the JSON between the first `{` and the last `}`).
- **Change a published prompt** (what the UI's edit does): `GenerativeAIUtility.cloneGenerativeAIConfig(promptId)` → `OneExtendUtil.updateGenerativeAIConfig({configId:<copy>, definition, name, prompt:<new text>, model, temperature, maxTokens, …, state:'draft', active:false, version:<n+1>})` → finalize the copy → `GenerativeAIUtility.publishGenerativeAIConfigs([{configId:<copy>, showInPromptLibrary:true}])`. The publish archived the old version and moved the default flag (`sys_generative_ai_prompt_config.is_default`) to the new one. `sn_skill_builder.PromptDesigner` and `SkillDesigner` are package-private — not callable from global.
- **Model:** a Claude model behind the Amazon Bedrock provider answered Polish input natively at temperature 0 (about 4 s per call).

## 41. Dynamic Translation with no working translator: the error codes, and an LLM skill as the fallback (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- `sn_dt_api.DynamicTranslation.getTranslation(text, {targetLanguages:['en']})` threw 40002 (no default translator), 40012 (the ServiceNow translator only detects the language) and 40050 (the Microsoft Azure OEM translator is not authorized).
- **Pattern:** try Dynamic Translation in a `try/catch`, fall back to a Skill Kit translation skill, and record which one translated. A one-word ambiguity in the source ("stan" read as "status" instead of "stock level") is fixed in the source text, not in the prompt.

## 42. E-mail intake for internal requesters: open the interaction in your own flow; reply matching by In-Reply-To (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- **The shipped subflow** "Create Interaction from Email - subflow" (Email Interaction for CSM) looks the sender up as a consumer, then a customer contact, otherwise opens a **guest** interaction: Opened for empty, the sender only as an interaction context value, an "Interaction created for guest" e-mail sent to the sender, and the e-mail attachments moved to the interaction. Internal users (store staff, employees) always take the guest path.
- **Own flow:** create the interaction (type Email, Opened for = the sender) in state **New** — the rule "Prevent setting unassigned to WIP" aborts an unassigned interaction in Work in Progress; link it with `interaction_related_record` (type `task`, `task` = the case, operation Created / Updated — the "Set Document Details" rule fills `document_table` and `document_id`); close it Closed Complete once the case exists, as the documented case-from-interaction behaviour does (`customer-service-management/creating-case-from-email-interaction.md`); associate the e-mail and its attachments with the case.
- **Reply-all in the same chain** (no watermark, no record number in the subject) was classified as a reply to the case through In-Reply-To (`platform-administration/inbound-action-type-criteria.md`), because the original inbound e-mail was associated with the case. A `sys_email` inserted by script for a test has no `message_id` (the headers text is not parsed) — set `message_id` on the original to test this path. Test method: insert a received `sys_email`, then a `sysevent` `email.read` with parm1 = its sys_id.

## 43. CSM case Category and Subcategory are integer columns (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- On `sn_customerservice_case` both are integers (defaults 1 and 0). Choices added with text values on a child case table cannot be stored. Use integer values (for example 10–13, subcategories 101–131) and put the category value in the subcategory's `dependent_value`. The subcategory has no dependent field by default, so the dependent values only document the hierarchy unless a dictionary override sets the dependency.

## 44. Scoped tables with "Can delete" off refuse deletes from global — run the delete in the table's scope (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- **Symptom:** deleting records of Retail Store Services / Retail Core tables (store inquiry case, retail task) through the Table API returned 403 ("ACL Exception Delete Failed due to security constraints") for an admin; a global scheduled script's `deleteRecord()` returned false without a log line.
- **Cause:** the tables' application access has `delete_access` = false (other scopes may read, create and update, not delete).
- **Fix:** create the one-off script in the table's scope. `sys_scope` in the insert payload is ignored; a record inserted while the user's `apps.current_app` preference points to the scope gets that scope. Set the preference, insert the job, restore the preference (delete it if it did not exist), delete the job after it ran.

## 45. Record numbers collide with loaded demo data — raise the base number (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- Demo data loaded with explicit numbers above the counter: new records reused numbers already in use (two cases with the same number). Raise the base number in Number Maintenance above the highest number in use — a base above the counter becomes the next number (`platform-administration/t_AutoNumberingRecordsInATable.md`). Check every numbered table a flow writes (case and task).

## 46. Tasks from a service definition's related services; "changes" triggers on insert; the trigger record in inline scripts (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- A CSM service definition's **Default table field values** (`sn_case_type_selection.template`) is what the workspace passes as the query of the new record form. A script that creates tasks from the related services (`sn_csm_case_types_service_to_service_rel`) applies it with `task.applyEncodedQuery(template.replace(/\^EQ$/, ''))`.
- A Flow Designer **Created or Updated** trigger with the condition "Service changes" (`serviceVALCHANGES`) fired on the insert of a record created with the field set, and on each later change.
- In a flow inline script, `fd_data.trigger.current` is the trigger record as a GlideRecord (`getUniqueValue()`, `getValue()`, dot-walk `getDisplayValue()`).

## 47. Appointment [itil_appointment] e-mails a real meeting request; a script date-time is read in the session time zone (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- The baseline notification "Appointment Invite" (event `itil_appointment.inserted`, vCalendar) sends `text/calendar; method=REQUEST` — Outlook shows a meeting request. Fictitious addresses bounce: demos need real mailboxes. The From name is the instance's e-mail display name unless branded.
- A Flow Designer inline script that returned `GlideDateTime.getValue()` (UTC) into a Date/Time field put the appointment 7 hours off on a PDT instance: the string is read in the session time zone. Return `getDisplayValueInternal()` instead (fix not verified — the automatic appointments were dropped).
- **Changing the meeting request text (24 Oct 2026).** "Appointment Invite" and "Appointment Update" are of type vCalendar with the iCalendar template `meeting.invitation`. The event's DESCRIPTION comes from the notification's legacy **Message** field (`message`, plain text), not from `message_html`: a change to the HTML body had no effect. `${mail_script:<name>}` works in `message`; print plain text lines joined with `\n` (the engine escapes line breaks and commas). In that mail script, a date-time display value carried the time zone abbreviation, as the baseline `${starts}` does.
- LOCATION is the display value of the appointment's `location`, a reference to `cmn_location`; a text written into that field is stored as an invalid sys_id and prints empty. Use a location record.
- Every meeting request gets its own UID (`Ref:MSG…`), so an update of the appointment reaches Outlook as a second meeting, not a change of the first.
- **Meeting responses (24 Oct 2026).** An Outlook "Declined" response (subject "Declined: <case number> - …", `calendar.ics` attached) arrived as a reply to the related case and ran through the case's reply handling: an empty customer comment and the .ics on the case. `RSVP=FALSE` on the ATTENDEE line of the template `meeting.invitation` makes the request ask for no response.
- **No table ACLs.** `itil_appointment` ships without table rules, so the default `*` rules leave create and write to admins: agents see no New on the Appointments related list. ACLs for a role cannot be created over the Table API (INSUFFICIENT_PRIVILEGES, security_admin elevation needed); a one-off server script created them, and the update set captured them.

## 48. Reading an attachment's text in the global scope: `getContent()` returns undefined (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- `new GlideSysAttachment().getContent(gr)` in a global Flow Designer inline script returned undefined, and the flow silently fell back to the e-mail text. Documented: the scoped `getContent()` returns undefined in the global scope (`api-reference/server-api-reference/c_GlideSysAttachmentScopedAPI.md`).
- Read the stream instead: `new GlideTextReader(new GlideSysAttachment().getContentStream(attachmentSysId))`, then `readLine()` until it returns null (`api-reference/server-api-reference/GlideSysAttachmentGlobalAPI.md`, `api-reference/server-api-reference/c_GlideTextReaderScopedAPI.md`). UTF-8 Polish text came through correctly; strip a leading byte-order mark.

## 49. Now Assist adds a response-language line after the prompt; a prompt that echoes its input returns it (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- A Skill Kit translation prompt ("translate the transcript below; keep lines already in English") returned its English input followed by "Generate the response in language English. Do not return any translation. You are allowed to respond only in English." — the line the platform appends after the prompt.
- Fix: put the input between marker lines (for example `<<<TRANSCRIPT>>>` and `<<<END>>>`), tell the model to return only the content, and drop the marker lines and that line in the calling script.

## 50. Form and related list changes through the Table API (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- A form section with no `sys_ui_element` rows shows no fields: a task's workspace view had an empty main section, and the record opened with no fields in the workspace and in the classic UI for that view. Check the sections of every view the demo opens.
- `sys_ui_element` inserts through the Table API are not captured; an update of the section record itself (for example its caption) captures the whole section (`sys_ui_section_<sys_id>`).
- `sys_ui_related_list` is `update_synch_custom`: Table API edits of the list or of its entries are not captured at all. The related list slushbucket saves through `SNC.SysRelatedListSaver().saveRelatedList2(table, viewName, scope, package, domain, listSysId)`; called from a one-off server script, it captured `sys_ui_related_<table>_<view>` in the current update set.
- A child case table can have its own related list record for a view, which replaces the parent table's list for that view — add the entries there.

## 51. SLA definitions attach to the exact table only; the name is cut at 40 characters (confirmed 2026-10-23, ServiceNow demo instance, Australia, 2011 engine)

- SLA definitions on the parent CSM case table with matching conditions did not attach to records of a child case table; define them on the child table itself.
- The definition name is cut at 40 characters.
- A task closed as cancelled (Closed with a "Cancelled: …" note) still meets a "state is closed" stop condition. Excluding it from the start and stop conditions (`close_notesNOT LIKECancelled:`) with "When to cancel: Start conditions are not met" made its SLA Cancelled instead of Completed.
- After a reopen, a resolution SLA whose start condition still matched attached again as a new task SLA from the reopen time.

## 52. Triage of an e-mail reply: classify the newest message only (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- A reply carries the whole thread. An LLM classifying it with the quoted history switched the case's service back on a plain thank-you. Cut the body at the first quoted message ("-----Original Message-----" and its localised forms, a line of underscores, "On … wrote:", a quoted "From:" line), classify only that text, and give the model a "keep the current value" answer for messages that ask for no other outcome.
- The baseline flow action "Get Latest Response Text From Email" kept the "-----Original Message-----" separator in the test.

## 53. Scheduled script jobs: one-off jobs run on a Run Once start time; Execute Now also runs inactive jobs (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- A `sysauto_script` inserted through the Table API with Run = On Demand and Active = true got a `sys_trigger` with the next action set to now. Once it ran immediately; later the same day such a trigger stayed Ready and did not run for minutes.
- **One-off job:** Run = Once with a start time a minute or two ahead (plus `entered_time`, see above). Each one ran within seconds of its start time; its trigger moves when the start time is changed.
- Keep on-demand jobs (demo or rehearsal jobs) inactive. Execute Now still runs them: the UI action calls `SncTriggerSynchronizer.executeNow(current)` after `current.update()`, and a one-off server script calling `SncTriggerSynchronizer.executeNow(job)` ran an inactive job once.

## 54. Knowledge v3: a published article ignores Table API changes; publish and renumber it by server script (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- Table API updates of `workflow_state` (to publish a draft) and of `number` on a published article returned success and changed nothing.
- **Publish:** `new global.KnowledgeUIAction().publish(articleGr)` — what the Publish button runs.
- **Renumber:** a server script that set `number` and `display_number` (`<number> v1.0`) kept the article published.
- Loaded demo data had articles with explicit, duplicate numbers (the same KB number in several knowledge bases), so new articles took numbers already in use. Raise the `kb_knowledge` number base above the highest number in use, as for other tables (see "Record numbers collide with loaded demo data"). Its Number Maintenance record has the sys_id `kb_knowledge`; look it up by `category`.

## 55. Playbooks (Process Automation Designer) by server script: create, publish, change, start (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- **Create:** `new global.PDProcessService().createProcess({process:{sysId, sysScope, label, name, description}, triggers:[…], lanes:[…], activities:[…]})`. Lanes and activities carry a `startRule` — `{startRuleName:'immediate'}`, `{startRuleName:'after_items', startsAfterLanes:[…]}` or `startsAfterActivities:[…]`, `{startRuleName:'manual'}` for an optional activity. Activity inputs are `{variableName, variableValue, value}` entries; pills such as `{{pd.inputRecord.<field>}}` and `{{act.<activity sys_id>.outputs.<name>}}` work, also inside text.
- **Publish:** `sn_pad.PDAutomationProvider.activateProcess(processId)` returns `{state:'SUCCESS', …}`. The whole playbook (lanes, activities, trigger) is captured as one update record `sys_pd_process_definition_<sys_id>`.
- **Change:** `new global.PDProcessService().updateProcess({process:{sysId}, lanes:{insert, update, remove}, activities:{insert, update, remove}})`. `remove` takes an array of sys_id strings; an array of objects deletes nothing. Update entries use camelCase field names: lanes `{sysId, label, order}`, activities `{sysId, lane, order, label, startRule:{startRuleName:'after_items', startsAfterActivities:[…]}}`. Publish again with `activateProcess`. Deleting `sys_pd_activity` rows with GlideRecord also works (the designer's delete rules clean up the flow data and the order).
- **Stage names:** publishing creates one `sys_ui_message` per stage label (code `playbook_<process sys_id>`); they belong in the same update set as the playbook.
- **Start:** a Created trigger does not fire for a record inserted by a scheduled script. A Created or Updated trigger did start the playbook when a scheduled script updated the record into the trigger condition. From a script: `sn_playbook.PlaybookExperience.triggerPlaybook('<scope>.<name>', record)` — it ignores the playbook's run-once strategy, so after such a trigger it starts a second execution. Check `sys_pd_context` (`input_record`, `name` = `<scope>.<name>`) before calling it.
- **Stop:** `sn_playbook.PlaybookExperience.cancelPlaybook(contextGr, reason)` with two arguments returned state Pending Cancel and the engine cancelled the execution afterwards. The forced call `cancelPlaybook(contextGr, reason, undefined, true)` (and with `''` as the third argument) returned In Progress with no error and cancelled nothing. Read the returned `state`; open tasks and approval requests of the cancelled execution stay open (close them).
- **Trap:** a call on a playbook of another application scope (`getProcess` included) switches the session's current application (`PDScopeSwitcher`); here it reset the user's update-set preference to Default. For a playbook of a Store app scope it also set the user's update set for that scope (`updateSetForScope<scope sys_id>`) back to the scope's Default set, and the playbook's deferred capture (a scheduled bump of the process record) landed there. Check the preferences after every playbook job and move the rows into the named set of that scope.

## 56. Playbook cards completed by server script: checklists, flow-data cards, ad hoc approvals (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- Every card of a running playbook has a `sys_flow_data` row: `playbook_context` = the execution [`sys_pd_context`], `activity_id` = the activity's sys_id. The card itself is a `sys_pd_activity_context` row (`context`, `activity`, `state`, `associated_table`, `associated_record`).
- **Checklist Task cards** open a Visual Task Board task [`vtb_task`] (the card's associated record) with a `checklist` whose `document` is that task. Setting `complete` (with `completed`, `completed_by`) on every `checklist_item` completed the card within seconds; a partly ticked list keeps the card open. The task itself stays Open, also after the whole playbook is complete (corrected 24 Oct 2026).
- **Navigation, Record Form and Create Baseline cards** completed when their `sys_flow_data` row was set to `COMPLETE`.
- **Ask For Ad Hoc Approval:** setting the requested `sysapproval_approver` rows (`document_id` = the record) to `approved` completed the card about 70 seconds later.
- With stages that start immediately, the cards of all stages open at once; only each stage's approval, started after the stage's other cards, waits.
- Cards open over several seconds (dozens of flows at once): poll for the card, its task or its flow-data row before completing it.
- To test a playbook to its end, one loop is enough: for every `IN_PROGRESS` card, tick its checklist (Checklist Task cards) or set its `sys_flow_data` row to `COMPLETE` (all other cards except the approvals); approve the requested approvals; wait a few seconds; repeat until the execution is `COMPLETE`. It ran a seven-stage stage-gate playbook with 10 approvals to the end in about 90 seconds (24 Oct 2026).
- **Dropped card completions (24 Oct 2026).** Every card event wakes the one flow context of the execution, one event at a time. With many events at once (a script completing four cards within a second, here on a 53-card playbook) the log fills with `Failed to get mutex for contextId=<execution flow context>, scheduling retry …`, and after about 20 retries the engine gives up on an event: `Failed to acquire mutex and not retrying … because retry count exceeded`. The card's subflow is then `COMPLETE`, the card stays `IN_PROGRESS`, and the stage approval, which waits for the stage's other cards, is never requested.
- The execution waits for each card's subflow through a record watcher: a `sys_flow_rw_action` row on table `sys_flow_context`, query `sys_id=<subflow context>^stateINWAITING,COMPLETE,ERROR,CANCELLED`, still active after the drop. The subflow context id is `fdContext` in the card's `locals` JSON [`sys_pd_activity_context`]. Saving that `sys_flow_context` row again (`setForceUpdate(true)`, `update()`) fired the watcher and the card completed within a second. Saving the card's `sys_flow_data` row again, unchanged or with its state set back and forth, did nothing.
- A script that completes cards should complete them one at a time (wait until each card is `COMPLETE`), tick checklist items about one per second, and wake a card that stays `IN_PROGRESS` with a finished subflow as above.

## 57. An e-mail "sent from a record", by script for a test (confirmed 2026-10-24, ServiceNow demo instance, Australia)

- A `sys_email` row with `type` = `send-ready`, `target_table` and `instance` = the record, `recipients` / `direct` / `copied`, `subject`, `body` and `content_type` shows in the record's activity, and the mailer sends it.
- To send it with an attachment, insert it as `send-ignored`, attach the file to the `sys_email` row, then set it to `send-ready`.
- Fictitious recipient domains end as `send-retry-delayed` or a bounce; the row stays on the record.

## 58. SPM Retail: the stage-gate playbook comes with the project type (confirmed 2026-10-23, ServiceNow demo instance, Australia family; SPM Retail is documented in the Brazil release)

- Store app `sn_spm_retail` (Retail Strategic Portfolio Management Suite) on Customer Projects. A project type [`project_type`] names its table, a dynamic category and form and workspace views; the project's `proj_type` and `proj_dynamic_category` hold them.
- The playbook trigger is Created or Updated on `pm_project` (extended tables included), condition `proj_type=<type>`, run once. Setting the type on an existing project by script started it.
- Project type fields are dynamic attributes in the `dynamic_attribute_store` field `proj_type_fields`: `gr.setDynamicAttributeValue('proj_type_fields-><attribute>', glideDate)` stored `{"<attribute>":"yyyy-MM-dd"}`.
- The shipped playbooks start every stage immediately; each stage ends with Ask For Ad Hoc Approval to the group Retail HQ Governance (empty after installation), started after the stage's other cards.
- A shipped playbook can be adapted in place with `updateProcess` (stage labels and order, card stage, order and label, approval start rules, removal) and published again; the change is a customer update in the Store app's scope.

## 59. Deleting a subflow by GlideRecord leaves its published snapshots (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- `deleteRecord()` on `sys_hub_flow` removed the subflow with its action and logic instances (a DELETE row in the current update set), but its `sys_hub_flow_snapshot` rows stayed. Deleting the snapshot rows removed their components as well; snapshots are not captured in update sets.

## 60. Playbook activity outputs reach the next activity as text; a stage goes on when its activity ends in error (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- An activity output pill, even from a subflow output of type Reference, arrives as a string. Fed to the shipped Wait For Condition activity, or to a subflow input of type Reference, it failed with "class java.lang.String cannot be cast to class com.glide.util.IGlideRecord".
- **Fix:** a subflow-backed activity whose subflow takes the sys_id in a String input, looks the record up (Look Up Record, `sys_id=<input>`) and passes the found record to Wait For Condition.
- An activity that ends in ERROR counts as finished for the "after" start rules: every gate failed and the playbook ran to its end in seconds. Test the gates with an open record before relying on them.
- Wait For Condition on a record already in the condition completes at once; it also ended when the watched record was deleted.
- `sn_fd.FlowAPI.getRunner().subflow(name).inForeground()…run()` on a subflow that reaches a wait throws "The current execution is in the waiting state"; the context stays WAITING. Find it in `sys_flow_context` and stop it with `sn_fd.FlowAPI.cancel(contextId, reason)`.

## 61. Project tasks created by script: the planning rules overwrite the end date (confirmed 2026-10-23, ServiceNow demo instance, Australia, Customer Project Management)

- A `customer_project_task` inserted with start and end dates (calculation "manual" on the task and the project) got end = start + the dictionary default duration of one day, and its parents rolled up to the wrong dates.
- Setting the end date again on the saved, open task made the rules recalculate the duration and keep the end date. A closed task was not recalculated: fix the end date while the task is open, then close it.
- In data sent to an AI skill, use the stored (UTC) value of a date, not its display value: the display value is in the session user's time zone and moved dates by a day.

## 62. CSM: the watch list of a new case is replaced with its creator (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- The baseline before-insert rule "Add user to watch list" on `sn_customerservice_case` (condition: the user has `sn_customerservice.relationship_agent`, which an admin has) sets the watch list to the current user only. A script that creates a case with a watch list sets it in an update after the insert.

## 63. Running a server-side UI action from a script, for a test (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- `var ev = new GlideScopedEvaluator(); ev.putVariable('current', gr); ev.putVariable('action', {setRedirectURL: function () {}}); ev.evaluateScript(uiActionGr, 'script', null);` ran a UI action's script the way its button does, from a one-off scheduled script.

## 64. Approval e-mails that open the approval in Employee Center, not the platform UI (confirmed 2026-10-23, customer dev instance, Zurich, Employee Center)

- The shipped Employee Center notification "Request approval assigned" (mail script `request_approval`) fires only on `request.approval.inserted`, so only for approvals on the request (`sc_request`). Approvals on requested items, changes and other records are mailed by "Approval Request", "Approval Rejected" and "Approval Rejected By Other" through the global templates `change.itil.approve.role`, `change.itil.approver.reject` and `change.itil.rejected.by.other` (the catalog variants use `request.itil.approver.reject` and `request.itil.cancelled.role`). Their bodies sit in the legacy `message` field and link to the platform UI with `${URI}`, `${URI_REF}`, `${sysapproval.URI}`, `${URI+&amp;sysparm_record_target=sysapproval_approver}` or `${document_id.URI}`.
- Working pattern: one global mail script that prints `<a href="<glide.servlet.uri><portal suffix>?id=hrm_todo&sysparm_tableName=sysapproval_approver&sys_id=<approval>"><approved record number></a>`. This is the page the shipped `request_approval` script links to; the suffix comes from `sn_ex_emp_fd.FoundationNotificationUtil().getPortalSuffix()`, with `esc` as the fallback. Then `${mail_script:<name>}` replaces every platform link variable in the active global approval notifications, their templates and their translations. The link opens the approval in the Employee Center to-dos with Approve and Reject.
- Employee Center shows approvals on `sc_request` and `sc_req_item` only to users with `approver_user` or `business_stakeholder`, because of a filter in `todoPageUtils`. Other approvals (change, contract …) show for every approver (`ServiceNowDocs/markdown/employee-service-management/employee-experience-foundation/approval-hub-ootb.md`).
- Approval notifications of scoped apps (GRC, Content Publishing, Service Catalog for mobile) are changed in their own scope, so a global update set does not carry them. The background-script run summary counts the `sys_update_xml` inserts, which is a quick capture check against the number of changed records.
- In this global mail script, `.slice()` on the value of `gs.getProperty('glide.servlet.uri')` ran without error, and the e-mails carried the link. The Java-string trap is about strict comparison, not about string methods.

## 65. GlideScopedEvaluator gave no output for a mail script under test (confirmed 2026-10-23, customer dev instance, Zurich)

- `evaluateScript()` on the saved `sys_script_email` record with a variables map (`current`, plus a stand-in `template` with `print`) printed nothing and raised no error. So did an `initialize()`d `sys_script_email` record holding a wrapper that returned the output or the caught error. In real e-mails the same mail script worked. (`putVariable()` on the saved record was not tried.)
- Test a mail script with a real e-mail instead: take the `body` of the `sys_email` row found through `sys_email_log.notification`. Do not call it a defect on an empty harness result.

## 66. Catalog variables cannot be queried by name on sc_req_item: the condition is dropped (confirmed 2026-10-23, customer test instance, Zurich)

- `addQuery('variables.type_of_access', 'temporary')` and `addNotNullQuery('variables.expiry_date')` on `sc_req_item` log `QueryEventLogger: Invalid query detected [Unknown field variables.type_of_access in table sc_req_item]`. The platform then leaves the condition out, so the query returns every row that the other conditions match. A scheduled job built on such a query read every request of the catalog item for weeks. Only its per-record date check kept it from acting on all of them. Permanent requests carried no date, because a variable hidden on the portal order gets no value row, so in practice nothing went wrong, but the filter it relied on was never applied.
- A test that checks only that the expected records were processed cannot tell a dropped condition from a working one. Filter catalog variables per record (`gr.variables.<name>`, with `gs.nil()` for a missing value row) or query `sc_item_option_mtom` by the variable's `item_option_new`. Look at the system log for `Invalid query detected` after the first run.
- An expiry job that fires only on `expiry == yesterday` never acts on a request that is completed after its expiry date. Compare with `<=` and keep a duplicate check instead. Count only requests whose access was really given (`state = Closed Complete` and `approval = approved`), or a request that is still waiting for approval gets reminded and terminated.

## 67. Approval reminder every 24 hours for every approval, by e-mail (confirmed 2026-10-23, customer dev instance, Zurich)

- The shipped "Request approval reminder" is an ITSM Virtual Agent actionable notification: chat only, for catalog requests only (`ServiceNowDocs/markdown/it-service-management/itsm-virtual-agent/va-itsm-notifications-approvals.md`). An e-mail reminder for all approvals has to be built.
- Working pattern, configuration only: an event on `sysapproval_approver`; a notification on that event with recipient = the Approver field (delegates included) and condition `state=requested`, so nothing goes out if the approval was decided after the event was queued; a scheduled job every 5 minutes. The job reminds an approval when it is in the first 15 minutes after each full day since it was created. A check for the same event on that approval in the last 2 hours keeps it to one reminder a day, and a missed run is caught by the next one inside the window. Create the job inactive: once on, every pending approval gets its first reminder within a day.
- Not every approval carries the record it approves in the same field. 85 of 240 pending approvals on requested items had Approval for (`sysapproval`) set, but Source table and Approving (`document_id`) empty, so `${document_id}` printed nothing. Non-task approvals have only `document_id`. A mail script that takes `sysapproval`, else `document_id`, prints the number and sets the subject with `email.setSubject()` (`ServiceNowDocs/markdown/platform-administration/r_MailScriptAPI.md`).

## 68. Cleaning a build update set: rows the platform adds, and how a move works (confirmed 2026-10-23, ServiceNow demo instance, Australia)

- Rows that reached an in-progress set without being part of the build:
  - runtime rows of tracked tables: "Knowledge Graph User Context Log" (`sn_kg_context_log`, about one every 10 minutes around the clock, also with nobody working, so a platform job writes them under the user) and `sn_ex_ai_portal_to_do_activities_*` (approval to-dos). They keep arriving while a user's update-set preference points at the set, so clean again just before the export;
  - a Store application installed while the set was current: its Upgrade Plan item (type "App Install", `sys_upgrade_plan_item`), plus dictionary and contained-role rows of the installed app. The Upgrade Plan replays installs on other instances (`ServiceNowDocs/markdown/platform-administration/upgrade-center/uc-upgrade-plan.md`); the update-set row installs nothing;
  - a changed number base (`sys_number`) also writes `number_ref` on the table's `sys_db_object` record, a customer update of the table. The shipped tables had `number_ref` empty, and their numbering worked;
  - Process Automation Designer writes one `sys_ui_message` per label when it activates a playbook (`code` = `playbook_<process sys_id>`, English, key = message) and `sys_documentation` labels for the process and snapshot inputs (`var__m_sys_pd_process_input_<id>`, `var__m_sys_pd_snapshot_input_<id>`). They stay when the playbook is deleted, and so do its `sys_pd_snapshot` rows;
  - DELETE rows of objects created and deleted inside the same set: no-ops on a target.
- To tell a side effect from a real change, compare the row's payload with the previous `sys_update_version` (state `previous`) without the audit fields.
- Moving rows out keeps them recoverable: set `sys_update_xml.update_set` to a parking set, then set the parking set to state Ignore. The before-update rule "Handle updates moving between sets" also re-points `sys_update_version.source`. It aborts the move when the row's application differs from the target set's ("Cannot move update to a set for a different scope"), so rows of other scopes captured in a global set cannot be parked in a global set. They would also fail a global commit ("scope is not global", see the e-mail layout note above). Delete them, or park them in a set of their own scope. Their payloads stay in `sys_update_version`. The after-delete rule "Delete sys_upgrade_state on delete" removes the matching `sys_upgrade_state` row.

## 69. E-mail interactions open on their own page: give the interaction the e-mail text and copies of the files (confirmed 2026-10-24, ServiceNow demo instance, Australia)

- With Email Interaction for CSM (`sn_eaai_csm`) active, CSM/FSM Configurable Workspace opens every interaction of type Email on that plugin's "Email Interaction page". Its screen condition `isEmailInteractionVisible` is true for type `email`, and the page uses the view `email_interaction_view`. The page is built around the e-mails linked to the interaction (`sys_email.instance`).
- A flow that links the inbound e-mail to the case (so that replies thread to the case) leaves that page empty. A copy of the `sys_email` on the interaction does not fix it. The copy keeps the original `message_id`, and the next reply's In-Reply-To was matched to the copy's record instead of the case.
- What works: write the e-mail as the interaction's work note (sender, subject, text; for a reply, its newest message) and copy the e-mail's files to the interaction.
- **Copy, do not move.** The action "Move Email Attachments to Record" takes the files off the e-mail, so the e-mail opened from the case shows none. In an inline script, `new GlideSysAttachment().copy('sys_email', <e-mail sys_id>, <table>, <sys_id>)` leaves the files on the e-mail and puts copies on the case and the interaction (`api-reference/server-api-reference/GlideSysAttachmentGlobalAPI.md`).
- A flow with an inbound e-mail trigger gets seven platform-created `sys_hub_flow_input` rows (`inbound_email`, `subject`, `body_text`, `from_address`, `user`, `target_record`, `target_table_name`), each with a `sys_documentation` row. A reload whose `delete_multiple` covers `sys_hub_flow_input model=<flow>` deletes them, and the next activation creates them again. The old `sys_documentation` rows stay behind.

## 70. Agent Assist and Response Template tabs for a table that extends the case (confirmed 2026-10-24, ServiceNow demo instance, Australia)

- In CSM/FSM Configurable Workspace the contextual side panel gets its Agent Assist (knowledge search) and Response Template tabs from the UX page property `contextualTableConfigMapping_main`, which maps a table to a `cxs_table_config`. It names `sn_customerservice_case`, so a table that extends the case gets no knowledge search. The data broker "Get Side Tab Configs" matches the table name exactly or as a prefix, not by inheritance.
- When the main mapping has no match, the same transform reads every `sys_ux_page_property` named `contextualTableConfigMapping`, in any scope. A new global property on the experience adds both tabs without changing a shipped record: `[{"agent_assist":[{"table=<child table>":"<case Agent Assist config>"}],"response_template":[{"table=<child table>":"<case template config>"}]}]` (`customer-service-management/config-csm-ws-agent-assist-table-configid.md`).

## 71. What the workspace checks that a job running as the user does not (confirmed 2026-10-24, ServiceNow demo instance, Australia)

- **Query rules.** Rules in `sn_query_rule` (applied through `sn_queryrules.QueryRuleGenerator`) filter lists only in interactive sessions. A scheduled job running as the user read and wrote every retail task, while the workspace showed the case's Tasks list empty, with no error. The rule "Retail Tasks - My Organization" (role `sn_retail.associate_fulfiller`, contained in `sn_rtl_hq_ops.location_agent`) limits retail tasks to stores of the user's organization. To check a user's rules from a job running as that user, take `new sn_queryrules.QueryRuleGenerator().getEncodedQuery(<table>)` and test the record with `GlideFilter.checkRecord`.
- **Items-only action layouts.** A workspace form action layout with `use_layout_items_only = true` shows only the items linked to it through `sys_ux_m2m_action_layout_item`. An action item without that link does not show for anyone, and neither does a shipped item such as Compose Email that the layout does not list.
- **Retail task ACLs.** Read needs `sn_retail.case_viewer` and `RetailTask.canRead()` (access to the parent case, and the query rules). Write needs `sn_retail.support_agent` (or the location agent role) and `canWrite()`. A table-level `canRead()` on an empty `sn_retail_task` GlideRecord returns false even with those roles, because the script needs a parent case.
- **Cross-scope alert on a task form.** Now Assist (`sn_uxc_gen_ai.UXCGAFUtil`) reads the task's e-signature template field, which raised "Restricting display value to sys_id of referenced record in table sn_esign_configuration because of cross scope access restrictions". Setting the matching Restricted Caller Access request (`sys_restricted_caller_access`, status Requested) to Allowed stopped the alert.
- **Landing page by audience.** In CSM/FSM Configurable Workspace a user with `sn_customerservice.case_task_agent` gets the CSM agent landing page (on the demo instance, "CSM Landing Page - Demohub"). Its score cards and lists use case, SLA and case-task fields that back-office users cannot read, so it shows "Unable to load the list" (log: `getNowListLayoutComposite - You do not have access to this table`, `AnalyticsDataLayerUtil` ACL exceptions). The tables themselves were open to those users.

## 72. Major Incident Management: child incidents and a custom auto-propose rule (confirmed 2026-10-26, customer prod instance, Zurich)

- The OOTB before rule **"Child incident cannot be major incident"** (`incident`, order 100, global) runs on every insert and update of an incident that has a Parent Incident and a non-empty `major_incident_state`. It aborts the save of an accepted one ("Major Incident ... cannot be a child of an Incident"), and otherwise empties the state with the message "... is no longer a Major Incident Candidate".
- Baseline MIM never makes a child a candidate: `MajorIncidentTriggerRulesSNC.canProposeMIC()` and `canApproveMIC()` refuse a child, and trigger rules skip it (`canEvaluate()`; the async trigger rule filters on an empty Parent Incident). `canRejectMIC()` does **not** check the parent, so Reject is offered on a proposed child.
- A custom before rule that auto-proposes when the MI state is empty (order above 100) therefore re-proposes a child in the same save: Reject sets Rejected, the OOTB rule empties it, the custom rule proposes again. The audit of that save shows only the work note and a fresh Proposed on / Proposed by (stamped with the rejecting user), never an MI state change; the custom rule's log line appears at the same second.
- Decide child incidents explicitly in any custom MIM automation: either the custom rules skip a child (baseline), or, if children must be candidates, deactivate the OOTB rule (or narrow its condition to the accepted case). Deactivating it also removes the abort that stops an accepted major incident from becoming a child, and lets custom auto-accept rules make a child a major incident - guard them if that is not wanted.
- Diagnosis without instance access: group the incident's `sys_audit` rows by `record_checkpoint` (one block per save) and read `syslog` from a few seconds before to half a minute after each save.

## 73. Catalog flows: a "Request Cancelled" stage on a step cancels the flow before the step runs (confirmed 2026-10-26, customer dev instance, Zurich)

- A flow writes the stage attached to a step when it reaches that step, before the step's action runs. The stage change is its own write of the requested item.
- Stage "Request Cancelled" (stored value `Request Cancelled`) fires the baseline `sc_req_item` rules on that write:
  - "Set Active Flag" (before) sets `active = false`; outside a delivery plan it leaves the state to the task closer (`TaskStateUtil`), which writes the default close state, Closed Complete;
  - "cancel flow on request cancelled/deleted" (after, order -100) cancels the item's flow context with `sn_fd.FlowAPI.cancel`;
  - "Close Tasks Due to Cancellations" sets the item's catalog tasks (by `parent`) to Closed Incomplete, and "Close Parent if Required" closes the request.
- Effect: a branch "task not completed → Update the item to Closed Incomplete with a comment", with the stage on that Update step, ends Closed Complete, without the comment, and the run shows Cancelled.
- A rejected approval is not affected: the baseline rejection sets "Request Cancelled" itself before the flow reaches its step, so the stage does not change at that step.
- Fix: no stage on the step; set State = Closed Incomplete, Stage = Request Cancelled and the comment as fields of the same Update Record. The record ends right. The cancel rule still fires after that write, so expect the run to show Cancelled. Leave the Stage field out and the item keeps its previous stage while the run completes normally.
- Diagnosis without instance access: the item's `sys_audit` shows the stage and the state changing in the same second, both by `system`; its `sys_flow_context` is Cancelled; the branch's comment is missing.

## 74. Catalog flows: a Completed stage on the closing step writes the requested item twice (confirmed 2026-10-26, customer prod instance, Zurich)

- The closing step: Update Record on the requested item with State = Closed Complete, and the flow's Completed stage (stored value `complete`) attached to that step.
- The stage write closes the item by itself: baseline "Set Active Flag" (before) sets `active = false` when the stage changes to `complete`, and the task closer writes Closed Complete; baseline "Close Parent if Required" (after) closes the request.
- The step's Update is a second write from the same version: the item's `sys_audit` shows `state 1 -> 3`, `active` and `closed_at` twice with one `record_checkpoint`, both by `system` in the same second, and the stage change once. The form history shows "State: Closed Complete was Open" twice.
- The second write runs the item's after rules again. A custom rule that closes the request when its last item turns inactive found the request still open and closed it again (also one `record_checkpoint`), so a request notification on `active` changes to false ("Request completed") went out twice.
- Not a comment copy: the task-to-item comment copy ran a second earlier, in the commenter's session, on its own version.
- Scale on that instance, 30 days: 1,970 of 2,314 closed requested items were closed twice - every flow whose Completed stage has the stored value `complete` (the baseline stage-set value). The two flows whose Completed stage has another value (`Completed`, `completed`) had 0 of 126: "Set Active Flag" compares the stage with `complete` exactly, so their stage write does not close the item and only the Update closes it.
- Do not fix it by changing the stage value. On the same instance the flow whose Completed stage had the value `completed` and no step showed the raw value `complete` on its closed items, and everything that waits for `complete` (baseline "Close Parent if Required", scoped rules on `stage=complete`, custom re-close logic) stops matching.
- The baseline pattern does not write the state at all. The out-of-box "Service Catalog item request" flow ends with a Log action that carries the Completed stage (`complete`) and has no Update to Closed Complete: the stage write closes the item through "Set Active Flag" and the task closer, and "Close Parent if Required" closes the request. (Read on a Zurich PDI: `sys_hub_flow_stage` "Completed" -> component 15 = the final Log.)
- Fix: do as the baseline flow does. Replace the closing Update (State = Closed Complete) with a final Log step that carries the Completed stage. Do not just delete the Update: a stage with no step after it is never written.
- Also confirmed (customer dev instance, 2026-10-27): no stage on the closing step, and the closing Update sets State = Closed Complete and Stage = Completed as its fields. One write closes the item, and the stage field still shows the stage label, because the value written (`complete`) is the value of the flow's own Completed stage. The raw value `complete` appears only when the flow's Completed stage has another value (`completed`). Branches that must end Closed Incomplete still need one Update with State, Stage and the comment as fields and no stage on the step (previous note), because without a delivery plan the task closer writes Closed Complete. After a test run the item's `sys_audit` holds one closing `state` change and the run ends Complete.
- Diagnosis without instance access: read the item's and the request's `sys_audit` with `record_checkpoint` (a closing change repeated within one checkpoint = two writes from one version) and `sys_email_log` (which notification sent each e-mail).

## 75. Group approvals: approvers added by hand on the record do not count (confirmed 2026-10-26, customer prod instance, Zurich)

- A group approval (`sysapproval_group`) gets one `sysapproval_approver` per member when it is created. Changing the group's members later does not touch the pending approvals: no baseline rule on `sys_user_grmember` does.
- Approvers added by hand on the record (the Approvers related list) have an empty `group`, so they are not part of the group approval:
  - Ask For Approval counts them only when its rule includes "Manual approvers";
  - a custom roll-up that reads `sysapproval_approver.group` ignores them.
- Effect: after a member change someone deletes the old members' approvals and adds the new members by hand; the new member approves, but the request stays in Waiting for Approval.
- Release: insert an approval linked to the open group approval (`group` = the `sysapproval_group`, `sysapproval` and `document_id` = the record, `source_table`) quietly with `setWorkflow(false)` so no approval e-mail goes out, then set it to approved with the rules on. The baseline "SNC - Notify Flow (Approval)" wakes the flow, and a custom roll-up sees a linked approval. Set the hand-added approvals still waiting to `not_required`. This released the custom roll-up flows (they wait on the record's approval field). It did not release an Ask For Approval flow: its group approval has `wait_for` = process flow, so the flow decides it, and the flow reacted neither to the added linked approval nor to the group approval set to approved afterwards (prod, 2026-10-27). For such a request, close it in one save (State = Closed Incomplete + Stage = Request Cancelled + a comment; the baseline cancels the flow) and let the requester resubmit.
- Avoid it: after a member change, do not add approvers on the record by hand. Re-create the pending group approvals for the new members, or let the custom roll-up accept a hand-added approval from a current member and turn on "Manual approvers" in Ask For Approval.
- Diagnosis without instance access: list the request's `sysapproval_group` and `sysapproval_approver` rows; hand-added ones show `group` empty and `sys_created_by` a user, created after the request.
