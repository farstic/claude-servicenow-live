# Setup Guide

**Last updated:** 2026-09-19

This is the single authoritative setup guide for the ServiceNow Architecture Engine. `README.md` is a project overview and `docs/INSTALLATION-GUIDE.md` covers the first session and the worked verification scenario. Where either of them disagrees with this file — on prerequisites, on configuration location, on capability flags, or on troubleshooting — **this file wins**. Anything conditional or version-sensitive is enforced by `scripts/doctor.sh`, not by prose here.

---

## Two commands

```bash
git clone --recurse-submodules <repo-url> AI-Architect-Claude
cd AI-Architect-Claude

bash scripts/setup.sh     # bootstrap (safe to re-run)
bash scripts/doctor.sh    # verify (read-only; run any time)
```

`setup.sh` is idempotent — re-running it repairs whatever has drifted and never writes a credential anywhere: live-instance setup happens in the snowarch checkout, not here. `doctor.sh` changes nothing on your machine or your instance, never reads a credential, and prints a named remedy for every check it fails.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Git | Needed for the clone and for the `ServiceNowDocs/` submodule. |
| Node.js **20 or newer** | The floor of the live-instance layer (snowarch is a Node.js application), stricter than Claude Code's own floor. `doctor.sh` enforces 20, not 18. |
| npm | Bundled with Node.js. |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code`. |
| A Claude Pro/Max subscription (`claude login`) **or** an `ANTHROPIC_API_KEY` | One or the other, not both. **Exporting `ANTHROPIC_API_KEY` overrides the subscription and routes all usage to metered API billing — Pro/Max subscribers should not set it.** |
| A snowarch checkout — live instance only | `git clone https://github.com/farstic/ai-servicenow-architect.git`: one repository (engine + MCP server) with the CLI `./snowarch`. Not needed for design-only. |

Optional, and only for document and diagram export: Python 3 (`scripts/md-to-docx.py`), draw.io Desktop (`scripts/render-drawio.sh`), LibreOffice (`scripts/render-pdf.sh`). None of these are needed to run the engine.

**Windows:** run the repository tooling under Git Bash or WSL. The document toolchain ships `.ps1` twins (`md-to-docx.ps1`, `render-pdf-pages.ps1`, `render-diagrams.ps1`); the governance and setup scripts — `doctor.sh`, `setup.sh`, `verify-structure.sh`, `verify-citations.sh` — are bash-only.

---

## Two modes

| Mode | What you need | What you get |
|---|---|---|
| **Design-only** (no ServiceNow instance) | Nothing beyond the prerequisites above | The full 27-specialist engine — all routing, Domain Expert gateways, §1.1 governance, and `ServiceNowDocs/` grounding |
| **Live instance** | A ServiceNow instance (a PDI is fine), an account with REST access, and a snowarch checkout with that instance saved in its store | Everything above, plus reading and writing that instance through the `servicenow` MCP server — 397 tools in a pinned contract, advertised under `mcp__servicenow__` |

Design-only is a complete, supported end state, not a half-finished install. `scripts/setup.sh` stops there cleanly if you decline the instance question, and `doctor.sh` records the absent MCP registration as a skip, not a failure.

Both scripts take `--tier0` to commit to design-only without being asked — `bash scripts/setup.sh --tier0` bootstraps the repo and never raises the instance question; `bash scripts/doctor.sh --tier0` skips the whole MCP section. Use them for a scripted or CI install where no prompt can be answered.

The `Mode:` line printed by the SessionStart hook — and by `./snowarch mode`, `./snowarch doctor` and `/snowarch status` — is the authoritative statement of design-only vs live. `bash scripts/doctor.sh` in this repository ends with its own `Mode:` line, derived only from what the session advertises.

---

## Connecting a live instance

```bash
bash scripts/setup.sh --mcp
```

prints the steps below and exits `0` without touching any file outside this repository. It clones nothing, prompts for no URL and no credential, and registers no server — all of that happens in the snowarch checkout:

```bash
cd ~/work
git clone https://github.com/farstic/ai-servicenow-architect.git
cd ai-servicenow-architect
# run the repository's bootstrap as documented in its README, then:
./snowarch mode live      # wizard: label, URL, environment, credentials, preset — writes the store
./snowarch doctor         # health report — the authoritative check
```

Scripted alternative — the password is read from stdin, never passed as an argument:

```bash
./snowarch instance add <label> --url https://<instance>.service-now.com --env pdi --username <user> --password-stdin --yes
```

snowarch probes each capability when the instance is saved. Every instance has an environment (`pdi` / `dev` / `test` / `prod`), a preset (`read-only` / `pdi-developer` / `full` / `custom`) and the six flags described under [Capability flags](#capability-flags); a `prod` instance keeps writes locked until it is saved with `--ack-prod` (`prodWriteAck`). The instance commands, all run in the snowarch checkout: `./snowarch instance list`, `./snowarch instance test <label>`, `./snowarch instance set-credentials <label>`, `./snowarch instance set-preset <label> <preset>`, `./snowarch instance remove <label>`. From inside a Claude Code session, `/snowarch setup-instance` adds an instance.

### Registration — where the session must start

The snowarch checkout carries a committed, secret-free `.mcp.json` (project scope). Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's **primary working directory**, so a session started in that checkout sees the `servicenow` server with no further step. Two registrations exist for other situations, both run from the snowarch checkout and both going through the `claude mcp` CLI — snowarch never edits Claude Code's own configuration file by hand:

| Command | Effect | When |
|---|---|---|
| `./snowarch mode live --register local` | Registers the same secret-free entry for that checkout alone | Machines that block project-scoped MCP servers |
| `./snowarch mode live --register user --ack-user-scope` | Attaches the server to every project on the machine | The documented **last resort** — and the only way a session started in *this* folder sees the server |

`./snowarch mode design` removes what snowarch registered. Restart Claude Code after any registration change.

### Coming from the previous tooling

Registrations made by the previous tooling used the server key `servicenow-mcp` (tool prefix `mcp__servicenow-mcp__`) and held the instance URL and credentials in `~/.claude.json`; that model is retired. Re-register through snowarch. Until then, the §2.1 gate applies to whichever prefix the session advertises, and if `snow_us_capture_target_set` is not advertised the registered server predates snowarch 2.0.0 and the §2.2 protocol cannot run — stop and say so rather than improvising a capture.

`bash scripts/doctor.sh` reports a `servicenow-mcp` key as exactly that: a registration that predates snowarch. Once snowarch is registered, remove the old entry from this folder with `claude mcp remove servicenow-mcp` — the credential it held stays in `~/.claude.json` until the entry is gone.

### Where the configuration actually lives

| What | Where | Never |
|---|---|---|
| Instance URL, environment, preset, the six flags, `prodWriteAck` | The snowarch store — `.local/instances.json` in the snowarch checkout (file mode `0600`, directory `0700`) | This repository; Git |
| Credentials | The snowarch store **only**, written by `./snowarch mode live` or `./snowarch instance add … --password-stdin` | `~/.claude.json`; `.mcp.json`; environment variables; Git |
| MCP server registration (secret-free) | `.mcp.json` committed in the snowarch checkout (project scope); optionally the same entry at local or user scope, written through `claude mcp` by `./snowarch mode live --register …` | Hand-edited into Claude Code's configuration file |
| Claude Code hooks for this repository | `.claude/settings.json` here — gitignored, written by `setup.sh` from `settings.example.json` | Git |
| The engine — roster, governance, `ServiceNowDocs/`, `clients/` workspaces | This repository | — |

Three consequences follow:

- Claude Code's configuration file is **not** `claude_desktop_config.json` — that file belongs to the Claude Desktop application, and Claude Code never reads it. Editing it will appear to work and change nothing.
- A `--register local` entry is keyed on the snowarch checkout's **absolute path**. Move or rename that checkout and the server silently disappears from that session; re-run `./snowarch mode live --register local` from the new location.
- There is no environment-variable or `.env` form of the credential. The store is the only source, and `snow_core_instances_reload` is how a running session picks up a change to it.

### Capability flags

| Flag | Gates |
|---|---|
| `WRITE_ENABLED` | Records, incidents, catalog, users, update sets — the ordinary data-mutating tools. Off is the read-only setting |
| `CMDB_WRITE_ENABLED` | CMDB write tools |
| `SCRIPTING_ENABLED` | Script Includes, Business Rules, Flow actions, update-set creation |
| `ATF_ENABLED` | ATF test and suite execution — needed only to run tests from a session |
| `NOW_ASSIST_ENABLED` | Now Assist tools — required by the Now Assist Specialist; also needs a Now Assist licence on the instance |
| `FLUENT_ENABLED` | Fluent / ServiceNow SDK tools |

Four rules govern all of the above:

- **Flags are per instance and set by the preset** — `read-only`, `pdi-developer`, `full`, or individually with `custom`. Change them with `./snowarch instance set-preset <label> <preset>`; probes verify each capability when the instance is saved, and `./snowarch instance test <label>` re-runs them.
- **A refused call returns a code such as `SCRIPTING_NOT_ENABLED` with a remedy naming the label.** Follow the remedy; do not retry blindly.
- **A `prod` instance keeps writes locked** until it is saved with `--ack-prod`, whatever its preset says.
- **The tools of a disabled family are still advertised to the model.** The refusal therefore surfaces at call time, which is why the `Mode:` line — not the tool list — states what is in force.

**Every tool that mutates instance state, whatever its name, needs an explicit "write approved" in the current conversation.** The question is `About to <action> on instance "<label>" — write approved?`, and approval is per action (`CLAUDE.md §2.1`).

---

## Security

- Credentials live **only** in the snowarch store — `.local/instances.json` in the snowarch checkout, file mode `0600`, directory `0700`. Never in `~/.claude.json`, never in `.mcp.json`, never in environment variables, never in Git. The MCP registration itself is secret-free, so nothing about it needs backing up or redacting.
- Use a **dedicated integration service account**, never a personal SSO credential.
- A `prod` instance stays write-locked until `--ack-prod` is given deliberately; leave it locked unless the engagement needs production writes.
- **Nothing in this repository should ever contain a real credential, a real instance hostname, or a real sys_id.** `doctor.sh` scans the tracked tree for a credential value and fails if one appears. It never learns the live hostname — it does not open the snowarch store — so hostname hygiene is the pre-push review in `README.md` Step 7. The documented placeholders this repository uses deliberately — `your-instance.service-now.com`, `<instance>`, `<repo-url>` — are not credentials; `docs/TECHNICAL-ARCHITECTURE.md` and `docs/MCP-OPERATIONS-GUIDE.md` both carry the placeholder hostname today.
- A registration left behind by the previous tooling (`servicenow-mcp`) still holds a plaintext credential in `~/.claude.json`. `doctor.sh` reports it; remove it once snowarch is registered (see [Coming from the previous tooling](#coming-from-the-previous-tooling)).

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `(Code: SCRIPTING_NOT_ENABLED)` — or any other `*_NOT_ENABLED` | The flag is off for the instance the session is using; the message names the label and the remedy | Follow the remedy: `./snowarch instance set-preset <label> <preset>` (or `/snowarch setup-instance`), then retry |
| `(Code: AUTHENTICATION_FAILED)` | The instance rejected the credential | **Stop; do not retry.** `./snowarch instance test <label>`; if it fails, `./snowarch instance set-credentials <label>`; then call `snow_core_instances_reload` before retrying |
| `(Code: INSUFFICIENT_PRIVILEGES)` (HTTP 403) | The account lacks the role for that table or operation — also what a direct write to `sys_update_xml` returns, admin included | Grant the role on the instance, or use an account that has it. Never write `sys_update_xml` directly: capture goes through the four-call protocol (`CLAUDE.md §2.2`) |
| `(Code: UNSUPPORTED_ON_THIS_INSTANCE)` | `snow_deploy_background_script_exec` and `snow_fluent_script_exec` refuse on this instance | Run the script from the instance UI (System Definition > Scripts - Background) |
| Writes refused on a `prod` instance although its preset allows them | `prodWriteAck` not set | Save the instance with `--ack-prod` |
| `snow_us_capture_target_set` is not among the advertised tools | The registered server predates snowarch 2.0.0 | Stop — the §2.2 protocol cannot run. `./snowarch upgrade` in the snowarch checkout, then re-register |
| Tools advertised as `mcp__servicenow-mcp__*` | A registration made by the previous tooling | Re-register through snowarch — see [Coming from the previous tooling](#coming-from-the-previous-tooling) |
| MCP tools do not appear at all | The session was not started in the snowarch checkout and no local/user registration exists — or Claude Code was not restarted after registering | `claude mcp list`, then `/mcp` inside a session; start the session in the snowarch checkout, or `./snowarch mode live --register local` / `--register user --ack-user-scope`; restart Claude Code |
| `Status` shows fewer specialists than expected, or `ServiceNowDocs/` citations fail | The submodule or the `agents/` / `skills/` mirrors have drifted | `bash scripts/doctor.sh` — it names which one |

Any symptom not listed here: run `./snowarch doctor` in the snowarch checkout for the live-instance layer and `bash scripts/doctor.sh` here for the engine. Each names the cause and the remedy for every check it owns.

---

## Verifying the install

1. Run `bash scripts/doctor.sh`. It ends with two lines — a tally, `DOCTOR: N ok, N warn, N fail`, and a `Mode:` line derived from what the session advertises. A healthy install reads `0 fail` and exits `0`; any fail exits `1`, and each failing check prints its own remedy inline. Warnings are advisory and do not affect the exit code.
2. Start Claude Code from the repo root and type `Status`. Two things to confirm:
   - The reply opens with a **`Mode:`** line. The line printed by the SessionStart hook (and by `./snowarch mode`, `./snowarch doctor`, `/snowarch status`) is the authoritative statement of whether you are design-only or live — not the presence of `snow_*` tools in the tool list, because a disabled family is still advertised, so the tool list always looks connected.
   - The roster lists **five** Domain Expert gateways (ITSM, CSM, HRSD, ITOM/Discovery, CMDB & CSDM).
3. Only if you are on a live instance: run `./snowarch instance test <label>` in the snowarch checkout, then ask the session for the five most recently created incidents and confirm the newest is recent.

Do not treat a transcribed sample of either output as the specification — the counts change as the roster grows. The criteria above do not. `Status` deliberately reports no engine version number; the version of record is the `Engine version:` line in `CLAUDE.md`, read from the file rather than from a session.

---

*Canonical setup and troubleshooting guide for the ServiceNow Architecture Engine. Version of record for the engine itself is the `Engine version:` line in `CLAUDE.md`.*
