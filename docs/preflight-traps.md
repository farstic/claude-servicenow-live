# Pre-flight traps — always-on checklist

Condensed list of the ServiceNow platform traps met on live engagements (May–Sep 2026). The Chief Architect applies it **before writing any script, patch, flow guide or promotion step** — without being asked. Full detail and provenance for each item live in `docs/nowaikit-field-notes.md`. Generic patterns only: no instance URLs, sys_ids or client data.

## Scripts / patches

- Test every regex transform on the REAL stored body first (CRLF `\r\n`, tabs, hand edits on prod) — dump the block with `JSON.stringify` before writing the patch.
- Rhino: Java strings — never `===` / `indexOf` on GlideRecord values without `+ ''`; `gs.getProperty()` is a Java String; `value + ''` prints `"null"` for empty.
- Rhino: `parseInt()` returns a double — storing it in an integer/choice field yields `"9.0"`. Pass choice/type codes as strings.
- `addQuery(f, 'LIKE', v)` may be exact-only → use encoded `LIKE` / `CONTAINS`; `setValue` on journal fields is a no-op (use `.journal.setJournalEntry`).
- Isolated catalog client scripts (`isolate_script = true`) have no regex / `isNaN` — set false explicitly when creating by script, and verify the flag after every scripted insert (it may read `true` anyway). UI Type = All lint also flags regex / `isNaN`; write bodies without them and without helper functions outside the handler.
- `setValue` before `showFieldMsg` (the portal re-render wipes the message).
- Name columns cap at 40 chars (`catalog_script_client`, events, notifications, `sys_script`) — silently truncated on insert; look records up by sys_id afterwards, not by name.
- Scheduled jobs: set `entered_time` + `time_zone`, not `run_time`; `sysauto_script` is not update-set tracked by default; the next run is on `sys_trigger`, not on the job.
- Scripted notifications default to *Record inserted or updated* — set `generation_type = 'event'` or they never fire.
- Every write script: dry run → `APPLY` guard, update-set guard on dev (`'' = write as data` on test/prod), idempotent, prints before/after.

## Update sets / promotion

- A list-valued property captured in two sets → last commit wins: merge by hand after the last commit; a trailing newline in a pasted property breaks `split(',')`.
- Data does not travel: `sys_ui_message`, `sys_translated_text`, `sys_translated`, `question_choice` translations, m2m rows (topics, catalog links, KB user criteria) — push with `GlideUpdateManager2` or re-run the data script per instance.
- Cloned Service Portal widgets carry `m2m_sp_ng_pro_sp_widget` links; a provider from an app not installed on the target blanks the widget. Compare widgets by provider/dependency links too.
- Rollback of a set does not purge m2m rows; a before/after snapshot must be taken AFTER the capture set exists.
- Scoped MCP/REST writes ignore the global `sys_update_set` preference and land in Default; hand builds do too — run a "latest version is in which set" check before marking the set Complete.
- Prod-only hand edits (translated texts) get overwritten by committing the set — apply them by script on prod instead, or re-type after the commit.

## Flow Designer

- A stage annotation drops when an Action call is replaced; stage values must match the choice rows exactly (`complete`, not `completed` / `Completed`); the Completed stage must sit on the last step.
- The trigger pill has no Variables node → add *Get Catalog Variables* first; `fd_data` paths only via the picker.
- A Reference catalog-variable pill (`fd_data.step.var`) is a record object in scripts — use `.sys_id`; `+ ''` gives the display name.
- Ask For Approval: the pill goes inside the rule (Group / User field), the flow variable must be Reference → `sys_user_group` / `sys_user`; a pill dropped in *Rules* = zero approvers, silent pass.
- Flow inputs are gzip+base64 in `sys_hub_action_instance_v2.values` / `sys_hub_flow_logic_instance_v2.values`; `sys_hub_flow_stage` holds the stage definitions.
- The flow snapshot is frozen per RITM; a wait on the RITM deadlocks if the same flow closes it — wait on the task.

## Portal / Employee Center

- Employee Center renders `standard_ticket` (sn_std_tkt), not `ticket`; EC To-dos hides catalog approvals for users without `approver_user` / `sn_request_approver_read` (grant per environment).
- Portal strings live in four storage classes (`sys_ui_message` / `sys_translated_text` / `sys_translated` / choice label) — identify the class from `sys_dictionary.internal_type` before translating. Catalog variable labels and choice texts are `translated_field` → `sys_translated` rows keyed by VALUE; item name / short description / description are `translated_text` → `sys_translated_text` per record.
- `/cache.do` after every translation / choice / property change, or nothing renders.

## Local tooling

- On Windows, `python` / `python3` in Git Bash may be the Store stubs: they print "Python", exit 49 and run NOTHING — every `python - <<EOF` edit silently does not happen. Use `node` for scripted file edits, then grep the file to prove the edit landed.
