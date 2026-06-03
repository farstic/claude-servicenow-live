# Installation Guide

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** Plug-and-play setup for the engine in Claude Code — plus the optional NowAIKit MCP step for connecting to a live ServiceNow instance.
**Audience:** First-time users
**Last updated:** 29 May 2026
**Time to complete:** 2 minutes (core) · +3 minutes (optional live-instance connection)
**You will need:** Node.js (for npm), Git, and an Anthropic API key. For live-instance work: a ServiceNow instance (a PDI is fine) and the NowAIKit MCP server.

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
Status — ServiceNow Architecture Engine v2.6

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

## Optional — connect to a live ServiceNow instance (NowAIKit MCP)

The core engine above is **design-only** and needs no instance. To let the engine *read and write a live instance*, add the NowAIKit MCP server. This is what powers live §1.1 validation against the real schema and direct deployment of approved artefacts.

1. Install/configure the NowAIKit MCP server per its own documentation, and register it with Claude Code as an MCP server.
2. Provide the connection settings (these live **locally only** — never commit them). The required environment variables:

   ```
   SERVICENOW_INSTANCE_URL: your-instance.service-now.com
   WRITE_ENABLED: true
   SCRIPTING_ENABLED: true     # correct even on a PDI — script endpoints are unavailable at PDI level
   CMDB_WRITE_ENABLED: false
   ATF_ENABLED: false
   MCP_TOOL_PACKAGE: full
   ```

3. Restart Claude Code and confirm the connection with a read-only check, e.g. ask: *"What instance am I connected to, and what permission tier?"*

**Before you rely on this for writes, read [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md).** Every write is governed by two gates — §2.1 write approval and §2.2 Update Set capture — and the running list of confirmed MCP behaviours is in [`nowaikit-field-notes.md`](./nowaikit-field-notes.md).

> **Security:** instance URLs, credentials, and sys_ids must never be committed. The repository's `.gitignore` already excludes the local config, settings, and `clients/` folders.

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
| `Status` shows fewer than 4 Domain Experts | Quit Claude Code (`/exit` or Ctrl+D) and relaunch from the repo root. The session may have cached an empty roster. |
| `ServiceNowDocs/` references fail | You cloned without submodules. Run `git submodule update --init --recursive`. |
| Authentication errors | `ANTHROPIC_API_KEY` not set or invalid. Re-export it and try again. |

---

*Documents the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.6 install.*
