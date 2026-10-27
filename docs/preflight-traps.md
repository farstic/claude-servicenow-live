# Pre-flight traps — always-on checklist

Condensed list of the ServiceNow platform traps met on live engagements (May–Sep 2026). The Chief Architect applies it **before writing any script, patch, flow guide or promotion step** — without being asked. Full detail and provenance for each item live in `docs/nowaikit-field-notes.md`. Generic patterns only: no instance URLs, sys_ids or client data.

## Scripts / patches

- Test every regex transform on the REAL stored body first (CRLF `\r\n`, tabs, hand edits on prod) — dump the block with `JSON.stringify` before writing the patch.
- Rhino: Java strings — never `===` / `indexOf` on GlideRecord values without `+ ''`; `gs.getProperty()` is a Java String; `value + ''` prints `"null"` for empty.
- Rhino: `parseInt()` returns a double — storing it in an integer/choice field yields `"9.0"`. Pass choice/type codes as strings.
- `addQuery(f, 'LIKE', v)` may be exact-only → use encoded `LIKE` / `CONTAINS`; `setValue` on journal fields is a no-op (use `.journal.setJournalEntry`).
- Isolated catalog client scripts (`isolate_script = true`) have no regex / `isNaN` — set false explicitly when creating by script, and verify the flag after every scripted insert (it may read `true` anyway). UI Type = All lint also flags regex / `isNaN`; write bodies without them and without helper functions outside the handler.
- `setValue` before `showFieldMsg` (the portal re-render wipes the message).
- Catalog client scripts keep no state between calls: a variable declared outside the handler did not keep its value between two onChange calls on the portal — derive behaviour from the current field values, and load the body afresh per event in any mock.
- Name columns cap at 40 chars (`catalog_script_client`, events, notifications, `sys_script`) — silently truncated on insert; look records up by sys_id afterwards, not by name.
- Scheduled jobs: set `entered_time` + `time_zone`, not `run_time`; `sysauto_script` is not update-set tracked by default; the next run is on `sys_trigger`, not on the job.
- Scripted notifications default to *Record inserted or updated* — set `generation_type = 'event'` or they never fire.
- Scripted re-orders (a CartJS job that copies a request): a variable added to the item goes into the job's copy list in the same change; read hidden variables through `gs.nil()` (no value row, and `undefined + ''` is the text `'undefined'`); CartJS may drop a variable hidden on the order form, so check the new RITM and write the `sc_item_option` + `sc_item_option_mtom` row (update an empty one, never add a second).
- A Table API 403 on insert is not always an ACL: unique fields and before-insert rules give the same error (e.g. a CSM service organization whose generated code already exists - set the code explicitly). In scripts, check `gs.nil(value)` before using a value: `undefined + ''` is the text 'undefined'.
- Every write script: dry run → `APPLY` guard, update-set guard on dev (`'' = write as data` on test/prod), idempotent, prints before/after.
- An integration that writes as its own user meets every user-based restriction rule on the target table (e.g. "only assignment-group members may update"): journals are usually carved out, so its comments pass while its state / group writes are aborted. List those rules before go-live and exempt machine accounts (Internal Integration User + Web service access only) explicitly.
- Notification reported missing: read the record's `sys_email` rows first (type, recipients vs active group members, `sys_email_log.notification`). `send-ready` older than a few minutes = outbox stuck (System Diagnostics > Email Diagnostics), not a notification fault. An empty Group email mails every active member; Include members matters only when a Group email is set.
- Test a mail script on a real e-mail (`sys_email` body via `sys_email_log.notification`), not through `GlideScopedEvaluator`: there it gave no output although the mail script worked. An empty harness result is not a defect.

## Update sets / promotion

- A list-valued property captured in two sets → last commit wins: merge by hand after the last commit; a trailing newline in a pasted property breaks `split(',')`.
- Data does not travel: `sys_ui_message`, `sys_translated_text`, `sys_translated`, `question_choice` translations, m2m rows (topics, catalog links, KB user criteria) — push with `GlideUpdateManager2` or re-run the data script per instance.
- Cloned Service Portal widgets carry `m2m_sp_ng_pro_sp_widget` links; a provider from an app not installed on the target blanks the widget. Compare widgets by provider/dependency links too.
- Rollback of a set does not purge m2m rows; a before/after snapshot must be taken AFTER the capture set exists.
- Scoped MCP/REST writes ignore the global `sys_update_set` preference and land in Default; hand builds do too — run a "latest version is in which set" check before marking the set Complete.
- Prod-only hand edits (translated texts) get overwritten by committing the set — apply them by script on prod instead, or re-type after the commit.
- A changed Platform Analytics List visualization (columns) does not reach users who personalized its columns at runtime: their saved column set stays (columns present, values empty) — Personalize columns → Reset to default per user (impersonate to check).
- Before export, clean the set of platform rows (AI runtime logs, app-install side effects, `number_ref` rows from number-base changes, labels and messages of deleted playbooks, DELETE rows of objects made and removed in the same set): park them in an Ignore set. A row of another scope will not move into a global set; delete it (its payload stays in `sys_update_version`).

## Flow Designer

- A stage annotation drops when an Action call is replaced; stage values must match the choice rows exactly (`complete`, not `completed` / `Completed`); the Completed stage sits either on a last step that does not write the state, or is written as a field of the closing Update (no annotation) - never both.
- The trigger pill has no Variables node → add *Get Catalog Variables* first; `fd_data` paths only via the picker.
- A Reference catalog-variable pill (`fd_data.step.var`) is a record object in scripts — use `.sys_id`; `+ ''` gives the display name.
- Ask For Approval: the pill goes inside the rule (Group / User field), the flow variable must be Reference → `sys_user_group` / `sys_user`; a pill dropped in *Rules* = zero approvers, silent pass.
- Flow inputs are gzip+base64 in `sys_hub_action_instance_v2.values` / `sys_hub_flow_logic_instance_v2.values`; `sys_hub_flow_stage` holds the stage definitions.
- The flow snapshot is frozen per RITM; a wait on the RITM deadlocks if the same flow closes it — wait on the task.
- Flows are built only through the instance-side loader (or an XML import) — never row by row over the Table API: `sys_hub_flow.version` cannot be written over REST, the flow stays `version = 1`, Flow Designer ignores its `_v2` children and the update set captures only the flow row. A usable flow is `version = 2` and is captured as ONE `sys_update_xml` row `sys_hub_flow_<id>` holding every child.
- The loader captures by the `targetUpdateSetId` it is given; activation does NOT — `activate_flows` follows the user's global-scope `sys_update_set` preference and may re-point it to another in-progress global set (someone else's). `snow_flow_build` with `activate: true` sets the preference to the target set only around the activation call, restores it and moves its own stray rows back — do NOT set or restore it by hand around the build; read `activationPreferences.restored` and `activationCapture` instead. For a hand activation in Workflow Studio: make the target set current in that session first, then check that no row for the flow landed elsewhere.
- A UI session of the same account rewrites the `sys_update_set` preference (seen within a minute of a scripted write) — no interactive session on that account while a preference-captured write or an activation runs; re-check the preference immediately before.
- Record-triggered flows get two platform-managed `sys_hub_flow_input` rows (`current`, `table_name`) plus `sys_documentation` rows, random sys_ids, re-created on activation; their capture rows (`sys_documentation_var__m_sys_hub_flow_input_<flow id>_*`) follow the activation preference. What happens to them on a reload depends on the path:
  - **MCP loader build (`snow_flow_build`)** — reported as `platform_managed`; never stale, never confirmation-gated, never deleted on their own account. Do NOT list them in `confirm_delete` or the approval prompt.
  - **XML import / export commit (`snow_flow_export_xml` → Import Update Set from XML)** — the file's `sys_hub_flow_input` `model=<flow>` `delete_multiple` (shown in the export's `delete_multiple` list) removes them on commit when the flow already exists; re-activate the flow in Workflow Studio afterwards so the platform re-creates them.
- Inbound e-mail flows get seven such inputs (`inbound_email`, `subject`, `body_text`, `from_address`, `user`, `target_record`, `target_table_name`). A reload deletes them like the two above, and activation creates them again.
- Inbound e-mail files: copy them to the case (`GlideSysAttachment.copy`), never move them, or the e-mail shows no files. Never insert a copy of a received `sys_email`, because it keeps the `message_id` and a later reply threads to the copy.
- A job running as a persona does not see query rules (interactive sessions only): a list the job reads can be empty in the UI. Check a persona with `sn_queryrules.QueryRuleGenerator().getEncodedQuery(<table>)` + `GlideFilter.checkRecord`, and re-impersonate after every role change.
- An e-mail can take its text from the notification's **template** (`sysevent_email_template`), and old templates keep it in the plain `message` field: when removing or changing e-mail text, trace the sent e-mail via `sys_email_log` and search `message` / `message_html` / `message_text` on both the notification and its template.
- A String-typed pill (or a sys_id held in a String variable) in a User/Group approver slot of Ask for Approval yields ZERO approvers — the step passes silently. Approver pills must be Reference-typed (`sys_user` / `sys_user_group`); in a build spec declare them in `flow.pill_types`.
- A step's flow stage is written when the flow REACHES the step, before the step runs. Stage 'Request Cancelled' on a catalog flow step fires the baseline RITM rules "Set Active Flag" (inactive → the task closer writes the default Closed Complete) and "cancel flow on request cancelled/deleted" (the flow is cancelled) — that step never runs. To end a branch Closed Incomplete: no stage on the step; set State + Stage = Request Cancelled + the comment as fields of its Update Record.
- Close a catalog RITM ONCE. A flow stage with the baseline value `complete` closes the RITM by itself ("Set Active Flag"), so with an Update to Closed Complete in the same step the RITM is closed twice from one version: history "Closed Complete was Open" x2, the REQ closed twice, REQ completion e-mails twice. Keep the value `complete` (another value shows the raw `complete` on closed items) and close with one write: either the baseline way (last step = a Log carrying the Completed stage, no Update to Closed Complete) or no stage on the closing step and the Update sets State = Closed Complete + Stage = Completed as fields (confirmed 27 Oct). Closed Incomplete branches: one Update with State + Stage + comment, no stage on the step. After the first test run the RITM's sys_audit must hold one closing state change.
- Approvers added by hand on a record (Approvers related list, empty `group`) do not count for a group approval: Ask For Approval counts them only with "Manual approvers" in its rule, and a custom roll-up on `sysapproval_approver.group` ignores them. A group member change never updates pending approvals. Release a stuck one by inserting an approval linked to the open `sysapproval_group` quietly (`setWorkflow(false)`) and approving it with the rules on.

## Portal / Employee Center

- Employee Center renders `standard_ticket` (sn_std_tkt), not `ticket`; EC To-dos hides catalog approvals for users without `approver_user` / `sn_request_approver_read` (grant per environment).
- Portal strings live in four storage classes (`sys_ui_message` / `sys_translated_text` / `sys_translated` / choice label) — identify the class from `sys_dictionary.internal_type` before translating. Catalog variable labels and choice texts are `translated_field` → `sys_translated` rows keyed by VALUE; item name / short description / description are `translated_text` → `sys_translated_text` per record.
- `/cache.do` after every translation / choice / property change, or nothing renders.
- English field labels (`sys_documentation`, language `en`) change only from an **English session**: from any other session language the platform rule "Sync with Dictionary and DB Object" aborts the update ("Can not change an English language label in the current language") and `update()` returns null. Guard label scripts with `gs.getSession().getLanguage() === 'en'` and check the return of `update()`.

## Playbooks / project tasks / CSM scripts

- Playbook activity outputs are text: a record-typed input (the shipped Wait For Condition activity, a Reference subflow input) fed from another activity fails with "String cannot be cast to IGlideRecord" — give the subflow a String input and look the record up inside it.
- A playbook activity that ends in ERROR lets the next lane start — one broken gate runs the playbook to its end. Test every gate with an open record.
- A playbook's record-created trigger does not fire for records inserted by a script — start it with `sn_playbook.PlaybookExperience.triggerPlaybook`. A created-or-updated trigger DOES fire when a script updates the record into its condition, and `triggerPlaybook` ignores run-once: check `sys_pd_context` before starting, or the playbook runs twice.
- Stop a playbook with `cancelPlaybook(contextGr, reason)` (two arguments, returns Pending Cancel); the forced variant returned In Progress and cancelled nothing. Close its open tasks and approval requests yourself.
- A playbook API call on another scope's playbook switches the session application and reset the update-set preference — re-check the preference after every playbook job; for a Store app playbook the scope's own preference fell back to its Default set and the capture landed there — move the rows.
- Completing many playbook cards at once by script makes the engine drop some of them ("Failed to acquire mutex ... retry count exceeded" in the log): the card's subflow is complete, the card stays In progress and the stage approval never starts. Complete one card at a time (wait for each to be Complete), tick checklist items about one per second, and wake a stuck card by saving its subflow's `sys_flow_context` row again; saving its flow-data row does nothing.
- Deleting a subflow with GlideRecord leaves its published snapshots — delete the `sys_hub_flow_snapshot` rows too.
- Project tasks inserted by script get end = start + 1 day (default duration) — set the end date again on the saved, open task; close it only afterwards.
- A new CSM case's watch list is replaced with its creator by a baseline rule — set it in an update after the insert.

## ITSM / MIM

- Custom MIM automation must decide child incidents explicitly: the OOTB rule "Child incident cannot be major incident" (order 100) empties a child's MI state on every save, so a custom auto-propose on an empty state re-proposes the child in the same save and overturns every Reject (the audit shows only a fresh Proposed on / by). Skip children in the custom rules, or deactivate the OOTB rule and guard auto-accept.

## Local tooling

- On Windows, `python` / `python3` in Git Bash may be the Store stubs: they print "Python", exit 49 and run NOTHING — every `python - <<EOF` edit silently does not happen. Use `node` for scripted file edits, then grep the file to prove the edit landed.
