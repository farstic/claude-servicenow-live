# Installation Guide

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** Plug-and-play setup for the engine in Claude Code — plus the optional snowarch step for connecting to a live ServiceNow instance.
**Audience:** First-time users
**Last updated:** 19 September 2026
**Time to complete:** 2 minutes (core) · +5 minutes (optional live-instance connection)
**You will need:** Node.js (for npm), Git, and an Anthropic API key. For live-instance work: a ServiceNow instance (a PDI is fine) and a snowarch checkout.

This is the plug-and-play setup. The repository ships fully configured — no scripts to run, no folders to sync, no ZIPs to upload. Three commands and you're running.

> **Prefer the browser instead of a terminal?** See [`ADVANCED-WEB-SETUP.md`](./ADVANCED-WEB-SETUP.md) for the optional Claude.ai web setup. Note that live-instance deployment is CLI-only.

---

## Step 1 — Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

If you don't have Node.js, install it from [nodejs.org](https://nodejs.org) first (the LTS version is fine).

You'll also need an Anthropic API key. Generate one at [console.anthropic.com](https://console.anthropic.com) and set it as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

To persist it across terminal sessions, add the same line to `~/.zshrc` or `~/.bashrc`.

---

## Step 2 — Clone the repository

```bash
git clone --recurse-submodules https://github.com/farstic/claude-servicenow-live
cd claude-servicenow-live
```

The `--recurse-submodules` flag matters — it pulls the `ServiceNowDocs/` reference branch the engine uses to validate every ServiceNow claim it makes. Skip the flag and the engine will work, but won't be able to cite primary sources.

If you forgot the flag:

```bash
git submodule update --init --recursive
```

---

## Step 3 — Run it

```bash
claude
```

You'll see the Claude Code prompt. Type `Status` and press Enter.

You should see output like this:

```
Status — ServiceNow Architecture Engine v2.7.5

1. Working Scope
   No client engagement loaded. Working in repo root.

2. Release Family
   ServiceNowDocs/ submodule — Australia branch.

3. Specialist Roster
   Domain Expert Gateways (v2.0)
   - ITSM Specialist, CSM Specialist, HRSD Specialist, ITOM/Discovery Specialist
   Phase 2.1 Builders, Code Reviewer, full roster ...

4. Drift Check
   Ready for first task.
```

If you see all five Domain Experts in the roster, you're done. Setup complete.

---

## Verify it works

Paste this prompt into Claude Code:

> *We need to track the source channel of each ITSM incident — phone, email, portal, walk-up, chat, system-generated. Currently this distinction doesn't appear in our reports. How do we design this? Australia release.*

The engine should respond with the **ITSM Specialist** taking the lead, identifying `incident.contact_type` as the existing baseline answer, and recommending you configure the existing field rather than create a new one. No code, no custom table — just the right answer.

If you see that response, your install is healthy.

---

## Optional — connect to a live ServiceNow instance (snowarch)

The core engine above is **design-only** and needs no instance. To let the engine *read and write a live instance*, add **snowarch** — the live-instance layer. It is one repository that ships the engine and its MCP server (server key `servicenow`, tool prefix `mcp__servicenow__`, 397 tools declared in a pinned contract) together with the same roster of 28 skills and 9 sub-agents as this repository. This is what powers live §1.1 validation against the real schema and direct deployment of approved artefacts.

1. **Clone and bootstrap the snowarch checkout.** Clone [`farstic/ai-servicenow-architect`](https://github.com/farstic/ai-servicenow-architect) and run its bootstrap step as described in that repository's README, so that the `./snowarch` CLI is available in the checkout.
2. **Add the instance with the wizard.** From the snowarch checkout run:

   ```bash
   ./snowarch mode live
   ```

   The wizard asks for a label, the instance URL, the environment (`pdi` / `dev` / `test` / `prod`), the credentials and a preset, probes each capability, and saves the instance to the checkout's store `.local/instances.json` (file mode 0600, directory 0700). The non-interactive equivalent is:

   ```bash
   ./snowarch instance add <label> --url <url> --env pdi --username <user> --password-stdin --yes
   ```

3. **Choose the preset and check the flags.** The preset (`read-only` / `pdi-developer` / `full` / `custom`) sets six capability flags on the instance — `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`, `ATF_ENABLED`, `NOW_ASSIST_ENABLED`, `FLUENT_ENABLED`. Change it later with `./snowarch instance set-preset <label> <preset>`. A `prod` instance keeps writes locked until `--ack-prod` is given.
4. **Start Claude Code in the snowarch checkout.** The checkout carries a committed, secret-free `.mcp.json` (project scope); Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's primary working directory, so live sessions are started there. If your machine blocks project MCP servers, `./snowarch mode live --register local` registers the same secret-free entry for that checkout alone; `./snowarch mode live --register user --ack-user-scope` is the documented last resort and attaches the server to every project on the machine. `./snowarch mode design` removes what it registered. Live sessions therefore start in the snowarch checkout, which ships the same roster as this repository.
5. **Verify.** Run `./snowarch doctor` — the health report. Its `Mode:` line (also printed by the SessionStart hook, `./snowarch mode` and `/snowarch status` inside Claude) is the authoritative statement of design-only vs live. `./snowarch instance test <label>` re-runs the capability probes and `./snowarch instance list` shows what is stored. `/snowarch setup-instance` adds an instance from inside Claude.

**Before you rely on this for writes, read [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md).** Every write is governed by two gates — §2.1 write approval and §2.2 Update Set capture — and the running list of confirmed platform behaviours is in [`snowarch-field-notes.md`](./snowarch-field-notes.md).

> **Security:** instance URLs, credentials, and sys_ids must never be committed. Credentials live only in the snowarch store `.local/instances.json` — never in `~/.claude.json`, never in `.mcp.json`, never in environment variables, never in Git. Rotate or remove them with `./snowarch instance set-credentials <label>` and `./snowarch instance remove <label>`. This repository's `.gitignore` already excludes the local config, settings, and `clients/` folders.

---

## What's next

- **First time using the engine?** Read [`USER-GUIDE-AND-EXAMPLES.md`](./USER-GUIDE-AND-EXAMPLES.md) for three worked scenarios.
- **Want the team context?** Read [`BUSINESS-OVERVIEW.md`](./BUSINESS-OVERVIEW.md).
- **Want to extend the engine?** Read [`TECHNICAL-ARCHITECTURE.md`](./TECHNICAL-ARCHITECTURE.md).
- **Connecting to a live instance?** Read [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md).
- **Prefer the browser?** See [`ADVANCED-WEB-SETUP.md`](./ADVANCED-WEB-SETUP.md).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `command not found: claude` | `npm install -g @anthropic-ai/claude-code` did not complete. Re-run and check for permission errors. On macOS/Linux you may need `sudo`. |
| `Status` shows fewer than 5 Domain Experts | Quit Claude Code (`/exit` or Ctrl+D) and relaunch from the repo root. The session may have cached an empty roster. |
| `ServiceNowDocs/` references fail | You cloned without submodules. Run `git submodule update --init --recursive`. |
| Authentication errors | `ANTHROPIC_API_KEY` not set or invalid. Re-export it and try again. |
| `Mode:` line says design-only after adding an instance | The session was started outside the snowarch checkout, or the server is not registered. Start Claude Code in the snowarch checkout (or run `./snowarch mode live --register local`) and confirm with `./snowarch doctor`. |
| A live tool returns `AUTHENTICATION_FAILED` | Stop; do not retry. Run `./snowarch instance test <label>` and, if it fails, `./snowarch instance set-credentials <label>`, then call `snow_core_instances_reload` before retrying. |

---

*Documents the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.6 install.*
