# claude-servicenow-live

> **Setup: see [SETUP.md](./SETUP.md)** — two commands (`bash scripts/setup.sh`, `bash scripts/doctor.sh`). This README is a project overview.

A two-tier ServiceNow expertise system for Claude, with live ServiceNow instance integration via snowarch MCP.

- **Tier 1 — Claude.ai Projects** (web / mobile / desktop): daily driver for stories, HLDs, design discussions, transcript extraction, and client review prep.
- **Tier 2 — Claude Code** (local CLI): heavy lifting with sub-agents, code review, ATF generation, live instance operations, and batch artefact production.
- **MCP Layer — snowarch**: connects Tier 2 directly to a live ServiceNow instance. snowarch is one repository (engine + MCP server) with the CLI `./snowarch`; it registers the MCP server `servicenow` (tool prefix `mcp__servicenow__`, 397 tools declared in a pinned contract) and ships the same roster as this repository, so Claude can read from and write to the instance via structured MCP tools without switching tabs.

Both tiers share the same `.claude/skills/` directory so expertise is authored once and used everywhere.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Clone the repo](#step-1--clone-the-repo)
4. [Step 2 — Add ServiceNowDocs submodule](#step-2--add-servicenowdocs-submodule)
5. [Step 3 — Install and configure snowarch MCP](#step-3--install-and-configure-snowarch-mcp)
6. [Step 4 — Set up Tier 2 (Claude Code)](#step-4--set-up-tier-2-claude-code)
7. [Step 5 — Set up Tier 1 (Claude.ai Projects)](#step-5--set-up-tier-1-claudeai-projects)
8. [Step 6 — Daily workflow](#step-6--daily-workflow)
9. [Step 7 — GitHub security review (mandatory before every push)](#step-7--github-security-review-mandatory-before-every-push)
10. [Step 8 — Monthly maintenance](#step-8--monthly-maintenance-30-minutes)
11. [Step 9 — Extending the system](#step-9--extending-the-system)
12. [Repo layout](#repo-layout)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)

---

## 1. Architecture overview

```
Claude.ai Projects (Tier 1)          Claude Code CLI (Tier 2)
─────────────────────────────         ──────────────────────────────────────────
Master Project                        Chief Architect orchestrator (CLAUDE.md)
  └─ global skills                      ├─ 27 specialists (9 with sub-agents)
Satellite Projects (per client)         ├─ ServiceNowDocs/ (official docs submodule)
  └─ client knowledge + skills          └─ snowarch (MCP server "servicenow") ──► Live ServiceNow instance
```

The Chief Architect (CLAUDE.md) reads the official ServiceNow documentation submodule and can call live instance tools via snowarch — the MCP server `servicenow`, tool prefix `mcp__servicenow__` — for validation, creation, and deployment of artefacts. Credentials live only in the snowarch checkout's store; this repository never holds one.

This repository remains the Tier 2 engine folder with its clients/ workspaces; the live-instance layer is snowarch, which ships the same roster, and the folder-level cutover follows the snowarch migration plan (ARC-10).

---

## 2. Prerequisites

Before you begin, install and verify the following:

| Tool | Minimum version | Install command | Verify |
|---|---|---|---|
| Git | 2.30 | [git-scm.com](https://git-scm.com) | `git --version` |
| Node.js | **20** | [nodejs.org](https://nodejs.org) | `node --version` |
| npm | 9 | Bundled with Node.js | `npm --version` |
| Claude Code CLI | latest | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| Claude Pro/Max subscription **or** an `ANTHROPIC_API_KEY` | — | [claude.ai/settings](https://claude.ai/settings) | Settings > Features > Skills: ON |

> **Node 20, not 18.** `doctor.sh` enforces Node 20 — the floor of the live-instance layer (snowarch
> is a Node.js application), which is stricter than Claude Code's own floor. Node 18 is enough for
> design-only mode but not for snowarch.
>
> **Do not set `ANTHROPIC_API_KEY` if you have a Pro/Max subscription** — exporting it overrides the
> subscription and routes all usage to metered API billing. Use one or the other, never both.

Install Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
claude --version
# Expected: Claude Code x.y.z
```

### Document & diagram generation toolchain (optional, per OS)

Needed only when you produce Word/PDF deliverables (proposals, HLD/LLD) or render diagrams.
**Generating a `.docx` needs nothing beyond Python 3 (macOS/Linux) or PowerShell (Windows)** — no
Pandoc, no Word, no `python-docx`, no pip packages. Full details, install commands, and the
end-to-end pipeline are in **[`scripts/README.md`](./scripts/README.md)**.

| Capability | macOS / Linux | Windows |
|---|---|---|
| Markdown → styled `.docx` | Python 3 → `scripts/md-to-docx.py` | PowerShell → `scripts/md-to-docx.ps1` |
| `.drawio` → PNG (client-ready figures) | `brew install --cask drawio` → `scripts/render-drawio.sh` | draw.io Desktop (`winget install JGraph.Draw.io`) |
| `.docx` → PDF (visual QA) | `brew install --cask libreoffice` → `scripts/render-pdf.sh` | Microsoft Word → `scripts/render-pdf-pages.ps1` |
| `.mmd` → SVG/PNG (in-repo preview only) | Node.js → `scripts/render-diagrams.sh` | Node.js → `scripts/render-diagrams.ps1` |

> **Rule:** in a `.docx`, diagrams are embedded as **rendered draw.io PNGs** (authored by the
> Diagramming Specialist, rasterised with `render-drawio.sh`) — **never** raw Mermaid source.
> Renderers run **locally only** (confidentiality firewall).

---

## Step 1 — Clone the repo

```bash
# Choose a parent directory — ~/work is a common convention
cd ~/work

git clone --recurse-submodules https://github.com/farstic/claude-servicenow-live.git claude-servicenow-live
cd claude-servicenow-live
```

After this step your directory should contain `CLAUDE.md`, `README.md`, `.claude/`, `skills/`, `agents/`, and `templates/` at minimum.

Install the pre-commit hook (one-time per machine):

```bash
git config core.hooksPath .githooks
```

This activates the agents/skills sync guard — commits are blocked if the repo root mirrors (`agents/`, `skills/`) drift from the source of truth (`.claude/agents/`, `.claude/skills/`).

---

## Step 2 — Add ServiceNowDocs submodule

The submodule pulls the official ServiceNow documentation repo (Australia release branch) so Claude Code can read it directly without copying files. It is already declared in `.gitmodules` and its gitlink is committed — so it only needs populating, never adding. `git clone --recurse-submodules` in Step 1 does this for you; run the command below if you cloned without that flag, or to repair an empty `ServiceNowDocs/`.

```bash
cd ~/work/claude-servicenow-live

git submodule update --init --recursive
```

Verify the submodule is populated:

```bash
ls ServiceNowDocs/markdown/
# Expected: a list of documentation folders (it-service-management, now-platform, etc.)
```

### Updating to the latest docs (do this monthly)

```bash
git submodule update --remote ServiceNowDocs
git add ServiceNowDocs
git commit -m "chore: bump ServiceNowDocs to latest australia"
```

### Switching release families

```bash
cd ServiceNowDocs
git fetch origin
git checkout <new-branch-name>   # e.g., bangalore
cd ..
git add ServiceNowDocs
git commit -m "chore: switch ServiceNowDocs to <new-branch-name>"
```

---

## Step 3 — Install and configure snowarch MCP

snowarch is the live-instance layer: one repository (engine + MCP server) with the CLI `./snowarch`, connecting Claude Code to a live ServiceNow instance. This is the key differentiator of this setup: Claude can read from and write to your PDI or production instance directly from a Claude Code conversation. The registered MCP server key is **`servicenow`** — the name `claude mcp list` and `/mcp` will show you — and its tools are advertised under the prefix `mcp__servicenow__` (for example `mcp__servicenow__snow_core_record_add`), 397 of them declared in a pinned contract. snowarch ships the same roster as this repository (28 skills, 9 sub-agents).

**Sub-steps 3a–3c and 3f–3h are optional.** The engine is fully usable with no MCP server at all — design-only ("Tier 0") is a first-class supported mode, and `doctor.sh` reports it as healthy rather than broken. If you have no instance to connect, skip 3a–3c and 3f–3h, but **still do [3d](#3d--install-the-pre-commit-hook-agentsskills-sync-guard) and [3e](#3e--configure-claude-code-hooks-context-mode)** — the pre-commit hook and the context-mode hook config are repo hygiene, not MCP setup — then continue to [Step 4](#step-4--set-up-tier-2-claude-code).

### 3a — Clone snowarch and add an instance

Live-instance setup happens in the snowarch checkout, not in this repository — nothing here prompts for an instance URL or a credential. Clone snowarch next to this folder, run its bootstrap, then let its wizard add your first instance:

```bash
cd ~/work
git clone https://github.com/farstic/ai-servicenow-architect.git
cd ai-servicenow-architect
# run the repository's bootstrap as documented in its README, then:
./snowarch mode live          # wizard: label, URL, environment, credentials, preset
./snowarch doctor             # health report — the authoritative check
```

Scripted alternative — the password is read from stdin, never passed as an argument:

```bash
./snowarch instance add <label> --url https://<instance>.service-now.com --env pdi --username <user> --password-stdin --yes
```

`bash scripts/setup.sh --mcp` in this repository prints exactly these steps and exits without touching any file outside this checkout.

Each saved instance carries an environment (`pdi` / `dev` / `test` / `prod`), a preset (`read-only` / `pdi-developer` / `full` / `custom`) and the six capability flags summarised in 3b; snowarch probes each capability when the instance is saved. Day-to-day commands, all run in the snowarch checkout:

| Command | Purpose |
|---|---|
| `./snowarch instance list` | Show the saved instances with their environment, preset and flags |
| `./snowarch instance test <label>` | Re-run the connectivity and capability probes for one instance |
| `./snowarch instance set-credentials <label>` | Rotate the credential — then call `snow_core_instances_reload` in the session |
| `./snowarch instance set-preset <label> <preset>` | Change the preset, and with it the flags |
| `./snowarch instance remove <label>` | Forget the instance |
| `/snowarch setup-instance` | Add an instance from inside a Claude Code session |

For the full flag reference, the security model, and the error-string troubleshooting catalogue, see **[SETUP.md](./SETUP.md)** — it is the canonical setup authority. The two subsections below are a summary only; where they disagree with SETUP.md, SETUP.md wins.

### 3b — Capability flags (summary)

The flags are stored per instance in the snowarch store and are set by the instance's preset (individually with the `custom` preset). Full detail is in [SETUP.md § Capability flags](./SETUP.md#capability-flags).

| Flag | Gates |
|---|---|
| `WRITE_ENABLED` | Records, incidents, catalog, users, update sets — the ordinary data-mutating tools. Off is the read-only setting. |
| `CMDB_WRITE_ENABLED` | CMDB write tools. |
| `SCRIPTING_ENABLED` | Script Includes, Business Rules, Flow actions, update-set creation. |
| `ATF_ENABLED` | ATF test and suite execution — required by the ATF Author. |
| `NOW_ASSIST_ENABLED` | Now Assist tools — required by the Now Assist Specialist. Also needs a Now Assist licence on the instance. |
| `FLUENT_ENABLED` | Fluent / ServiceNow SDK tools. |

Three rules govern all of them:

- **A call refused by a flag returns a code such as `SCRIPTING_NOT_ENABLED` with a remedy that names the instance label** — follow the remedy; do not retry blindly.
- **A `prod` instance keeps writes locked** until it is saved with `--ack-prod`, whatever its preset says.
- **`AUTHENTICATION_FAILED` means stop.** Do not retry: run `./snowarch instance test <label>` and, if it fails, `./snowarch instance set-credentials <label>`, then call `snow_core_instances_reload` before retrying.

### 3c — Security note — where the credential lives

Credentials live **only** in the snowarch checkout's store, `.local/instances.json` (file mode `0600`, directory `0700`), written by the wizard or by `./snowarch instance add … --password-stdin`. They are never in `~/.claude.json`, never in `.mcp.json`, never in environment variables, and never in Git. Two consequences:

- **This repository never sees a credential.** `setup.sh` does not prompt for one, `doctor.sh` never reads the store, and the tracked-file scan in `doctor.sh` fails if a credential value shows up in this checkout.
- **The registration is secret-free.** The snowarch checkout carries a committed `.mcp.json` with no secret in it; the server resolves the instance from the store at start-up.

Use a dedicated integration service account, never a personal SSO credential, for any instance that is not a throwaway PDI. Full detail is in [SETUP.md § Security](./SETUP.md#security).

### 3d — Install the pre-commit hook (agents/skills sync guard)

The repo keeps `.claude/agents/` and `.claude/skills/` as the source of truth, with `agents/` and `skills/` at the repo root as mirrors (visible on GitHub). A pre-commit hook prevents commits where the mirrors are out of sync.

Install once per machine:

```bash
git config core.hooksPath .githooks
```

To sync manually at any time:

```bash
bash scripts/sync-agents-skills.sh        # sync source → mirror
bash scripts/sync-agents-skills.sh --check  # check only
```

### 3e — Configure Claude Code hooks (context-mode)

This repo uses [context-mode](https://www.npmjs.com/package/context-mode) to protect Claude's context window from flooding. Install it globally:

```bash
npm install -g context-mode
```

Then create your local settings file from the provided example:

```bash
cp .claude/settings.example.json .claude/settings.json
```

Open `.claude/settings.json` and replace every `/path/to/your/npm-global` with the actual path on your machine:

```bash
# Print your npm global prefix — this exact string is the replacement value
npm prefix -g
# Example output: /Users/yourname/.npm-global
```

There are three occurrences to replace. Two of them already wrap the path in escaped quotes
(`\"...\"`); the third (the `bin/context-mode` line) does not — if your npm prefix contains a
**space**, add escaped quotes around that path too, or the hook will silently fail to run.

**Note:** `.claude/settings.json` and `.claude/settings.local.json` are gitignored — they contain machine-specific paths and must never be committed.

### 3f — Start the session where the server is registered

Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's **primary working directory**, and the snowarch checkout carries a committed, secret-free `.mcp.json` (project scope). A session started there sees the `servicenow` server with no further step:

```bash
cd ~/work/ai-servicenow-architect
claude
```

Two alternatives exist, both run from the snowarch checkout and both going through the `claude mcp` CLI — snowarch never edits Claude Code's own configuration file by hand:

- `./snowarch mode live --register local` — registers the same secret-free entry for that checkout alone, for machines that block project-scoped MCP servers.
- `./snowarch mode live --register user --ack-user-scope` — the documented **last resort**: attaches the server to every project on the machine, which is what makes it visible to a session started in *this* folder.

`./snowarch mode design` removes whatever snowarch registered. After any registration change, restart Claude Code completely so it picks up the server.

### 3g — Verify MCP connection

The `Mode:` line printed by the SessionStart hook — and by `./snowarch mode`, `./snowarch doctor` and `/snowarch status` — is the authoritative statement of design-only vs live. In a Claude Code session, type:

```
> Check the current ServiceNow instance connection
```

Expected: Claude reports the instance it is connected to — the label, URL and version. If you see an error, run `./snowarch doctor` in the snowarch checkout; it names the failing check and its remedy. `bash scripts/doctor.sh` in this repository reports only what the session advertises: whether the `servicenow` server key is present, and whether `snow_us_capture_target_set` is among its tools.

If `claude mcp list` shows `servicenow-mcp` rather than `servicenow`, that registration was made by the previous tooling and predates snowarch — see [SETUP.md § Coming from the previous tooling](./SETUP.md#coming-from-the-previous-tooling).

### 3h — Understanding the Update Set capture pattern

When Claude creates or updates configuration objects via MCP, the changes must be captured into an Update Set for deployment. REST honours the authenticated user's `sys_user_preference` row with `name=sys_update_set`; the `is_default` flag on an update set is a UI concept and does nothing for the API. Before any write that produces a configuration object (Script Include, Business Rule, Client Script, UI Policy, UI Action, ACL, Flow, table or field), the session runs four calls:

1. `snow_us_active_update_set_ensure` `{ "name": "<engagement>-<topic>" }` — the name is required, and only the caller's own in-progress sets are returned.
2. `snow_us_capture_target_set` `{ "update_set_sys_id": "<sys_id from step 1>" }` — points capture at that set.
3. The write itself, with its own §2.1 approval.
4. `snow_us_update_set_preview` — confirms the objects are in the set. This step is the evidence.

Not substitutes: `snow_us_update_set_switch` sets `is_default` and changes nothing for REST; writing `sys_update_xml` directly is refused with `INSUFFICIENT_PRIVILEGES`, admin included; `snow_deploy_background_script_exec` and `snow_fluent_script_exec` refuse with `UNSUPPORTED_ON_THIS_INSTANCE`. Capture cannot be applied retroactively over REST — if steps 1–2 were skipped, the session stops and says so (see `CLAUDE.md §2.2`). If `snow_us_capture_target_set` is not advertised at all, the registered server predates snowarch 2.0.0 and the protocol cannot run.

Update-set creation is gated by `SCRIPTING_ENABLED` as well as `WRITE_ENABLED`, and every mutating call is confirmed before it executes — `About to <action> on instance "<label>" — write approved?` — one approval per action (see `§2.1 Write Approval Gate` in `CLAUDE.md`).

---

## Step 4 — Set up Tier 2 (Claude Code)

```bash
cd ~/work/claude-servicenow-live
claude
```

Claude Code reads `CLAUDE.md` automatically on startup and loads everything in `.claude/skills/` and `.claude/agents/`.

### Smoke test 1 — Architect identity

```
> Who are you and what specialists are available?
```

Expected: Claude introduces itself as the Chief ServiceNow Architect and lists all 27 specialists including ITSM Specialist, CSM Specialist, Developer, Code Reviewer, and others.

### Smoke test 2 — Routing

```
> I have a transcript snippet. Draft 3 Gherkin stories for restricting incident creation to GSC agents only.
```

Expected: the orchestrator routes to `story-writer`, asks your approval, then produces Gherkin stories using the `story-writer` skill.

### Smoke test 3 — MCP connection (requires Step 3 complete)

```
> Check the current ServiceNow instance connection
```

Expected: Claude returns the connected instance URL and ServiceNow version.

---

## Step 5 — Set up Tier 1 (Claude.ai Projects)

### 5a — Enable Skills

1. Go to [claude.ai](https://claude.ai) > **Settings** > **Features**.
2. Toggle **Skills** ON.

### 5b — Create the Master Project

1. Go to **claude.ai/projects** > **New Project**.
2. Name: `ServiceNow Architect — Master`
3. Description: `Master orchestrator for all ServiceNow expertise. No client-confidential data here.`
4. **Custom instructions**: ⚠️ **Not yet available.** The Tier 1 master instructions file (`claude-ai-projects/master-project-instructions.md`) is **not yet shipped** — see the note below. Tier 1 (Claude.ai) setup cannot be completed until it is authored; use Tier 2 (Claude Code) in the meantime.

   > ⚠️ **Not yet implemented:** the `claude-ai-projects/` templates (`master-project-instructions.md`, `satellite-project-template.md`, `state-file-template.md`) do **not** exist in the repo yet and are not generated by any current step. Tier 1 (Claude.ai) onboarding is therefore **not yet available** — use Tier 2 (Claude Code) per the steps above. This section is retained as a placeholder for when the Tier 1 templates are authored.

5. **Project knowledge** (optional — small, non-confidential anchors):
   - `templates/gherkin-feature-template.md`
   - `templates/hld-template.md`
6. **Skills**: upload each skill as an individual markdown file. Go to **Settings > Skills** in Claude.ai, click **New Skill**, and upload the `SKILL.md` file from each folder. The repo ships **28** `SKILL.md` files under `.claude/skills/` — run `ls .claude/skills/` for the current list. The 13 highest-value ones to upload first are:

   | Skill file | Purpose |
   |---|---|
   | `.claude/skills/itsm-specialist/SKILL.md` | ITSM gateway (incident, problem, change, SLA) |
   | `.claude/skills/csm-specialist/SKILL.md` | CSM gateway (case, account, contact) |
   | `.claude/skills/hrsd-specialist/SKILL.md` | HRSD gateway (HR case, Lifecycle Events) |
   | `.claude/skills/itom-discovery-specialist/SKILL.md` | ITOM gateway (Discovery, MID Server, Service Mapping) |
   | `.claude/skills/cmdb-csdm-specialist/SKILL.md` | CMDB & CSDM gateway (CI class model, CSDM v5, IRE) |
   | `.claude/skills/developer/SKILL.md` | Server-side and client-side scripting |
   | `.claude/skills/code-reviewer/SKILL.md` | Four-checklist code review |
   | `.claude/skills/flow-designer-specialist/SKILL.md` | Flow Designer flows and subflows |
   | `.claude/skills/integration-specialist/SKILL.md` | REST/SOAP, IntegrationHub, MID Server |
   | `.claude/skills/story-writer/SKILL.md` | Gherkin stories and acceptance criteria |
   | `.claude/skills/hld-lld-writer/SKILL.md` | HLD and LLD documents |
   | `.claude/skills/technical-designer/SKILL.md` | Table models, ACLs, business rule design |
   | `.claude/skills/now-assist-specialist/SKILL.md` | AI Agents, Now Assist skills, agentic workflows |

   Start with the five Domain Expert skills (itsm, csm, hrsd, itom, cmdb-csdm) and the developer + code-reviewer pair — those cover 90% of daily use.

### 5c — Create Satellite Projects (one per active client)

For each client engagement:

1. **New Project** > name: `<Client> — Active Engagement`
2. **Custom instructions**: ⚠️ **Not yet available** — depends on the `claude-ai-projects/` templates that are not yet shipped (see the note under §5b). Satellite (per-client) Tier 1 setup cannot be completed until they are authored.
3. **Project knowledge**: client-specific docs only — transcripts, scoped app exports, current-state diagrams, naming conventions. Upload the state file (`clients/<client>/<client>-engagement-state.md`).
4. **Skills**: upload the same skills as in Step 5b. All skills are client-agnostic — same set for every project.

### 5d — Confidentiality firewall

- The Master Project **never** receives client transcripts, scoped app names, internal client IDs, or client-specific business logic.
- Client-specific data lives **only** inside the matching satellite Project.
- When copying a finding from a satellite back to the master, anonymise it first.
- In Claude Code (Tier 2), client work lives in `clients/<client-name>/` — never in root-level files.

---

## Step 6 — Daily workflow

### Tier 1 (Claude.ai)

- Casual brainstorming, single-document tasks, transcript extraction → use the matching satellite Project.
- Cross-client reusable methodology, template improvements → Master Project.
- Domain Expert gateway (ITSM Specialist, CSM Specialist, etc.) fires automatically on domain keywords.

### Tier 2 (Claude Code)

- Run from `~/work/claude-servicenow-live`. For live-instance work the snowarch server must be visible to that session: register it at user scope (`./snowarch mode live --register user --ack-user-scope`, the documented last resort) or start the session in the snowarch checkout instead, which ships the same roster — see [3f](#3f--start-the-session-where-the-server-is-registered).
- Use when a task needs: multiple ServiceNow doc pages, linked artefacts, local code operations, or live instance validation via MCP.
- Sub-agents are invoked by the orchestrator automatically, or explicitly with `@<agent-name>` to skip the routing-approval step.
- **Write operations require explicit approval.** Before any tool that mutates instance state, whatever its name, Claude asks `About to <action> on instance "<label>" — write approved?` and waits for your confirmation; approval is per action.

### Typical flow for a code deliverable

```
User request
  → Chief Architect restates + surfaces assumptions
  → Domain Expert gateway fires (ITSM / CSM / HRSD / ITOM / CMDB & CSDM)
  → Developer sub-agent dispatched (with constraint envelope)
  → Code Reviewer pass proposed (§6.2 hook)
  → ATF Author pass proposed
  → Deploy to instance (with Update Set capture, write approval required)
```

---

## Step 7 — GitHub security review (mandatory before every push)

This step protects your repository from accidentally publishing credentials, client data, or internal instance details.

### What to check before every `git push`

Run the following scan from the repo root:

```bash
# Check for common secret patterns
git diff --staged | grep -iE \
  "password|secret|api_key|token|client_secret|SERVICENOW_[A-Z_]+|bearer\s" \
  && echo "WARNING: possible credentials in staged changes" \
  || echo "OK: no credential patterns found"

# Check for instance URLs
git diff --staged | grep -iE "service-now\.com" \
  && echo "WARNING: instance URL in staged changes" \
  || echo "OK: no instance URLs found"

# Check for client-specific names (update this list per your engagements)
git diff --staged | grep -iE "<client-name-1>|<client-name-2>" \
  && echo "WARNING: client name in staged changes" \
  || echo "OK"
```

### What must never be committed

| Item | Where it lives instead |
|---|---|
| ServiceNow instance URL | The snowarch store — `.local/instances.json` in the snowarch checkout (mode `0600`), never in Git |
| ServiceNow username / password | The snowarch store **only** — never `~/.claude.json`, never `.mcp.json`, never an environment variable — see [§3c](#3c--security-note--where-the-credential-lives) |
| Client names, internal project codes | `clients/<name>/` folder — confirm the folder is in `.gitignore` if the client requires it |
| Update Set sys_ids from a specific instance | Session memory only — not in committed files |
| User sys_ids, preference sys_ids | Session memory / `MEMORY.md` (project-local, not pushed to public remotes) |

### Recommended `.gitignore` additions

```gitignore
# Project-scoped MCP config — this repository does not ship one (registration is done
# from the snowarch checkout); kept ignored so a stray local copy is never committed.
# Already in this repo's .gitignore; re-add it if you reuse this list in another repo
.mcp.json

# Client deliverables (add per-client as needed)
clients/*/deliverables/
clients/*/transcripts/

# Context-mode sandbox
.ctx/
```

### Claude Code security review protocol

Before every `git push`, Claude Code will (when invoked):

1. Run `git diff HEAD` and scan for the patterns listed above.
2. Report any findings with file name and line number.
3. Require your explicit confirmation (`security review approved`) before allowing the push to proceed.
4. If findings exist, propose remediation (remove the value, move to config, redact) before re-scanning.

To invoke manually:

```
> Review staged changes for security before push
```

---

## Step 8 — Monthly maintenance (~30 minutes)

1. **Update ServiceNowDocs**:
   ```bash
   git submodule update --remote ServiceNowDocs
   git add ServiceNowDocs
   git commit -m "chore: bump ServiceNowDocs to latest australia"
   ```

2. **Skim release notes** for breaking changes affecting skills:
   ```bash
   ls ServiceNowDocs/markdown/release-notes/
   ```

3. **Update affected SKILL.md files.** Bump the version in the file header comment.

4. **Re-upload changed skills** to your Claude.ai Projects (Master + any satellites that use the skill).

5. **Update snowarch** (run in the snowarch checkout, then re-verify):
   ```bash
   cd ~/work/ai-servicenow-architect && ./snowarch upgrade && ./snowarch doctor
   cd -
   bash scripts/doctor.sh
   ```

6. **Tag the repo**:
   ```bash
   git tag v1.x.0
   git push && git push --tags
   ```

---

## Step 9 — Extending the system

### Add a new sub-agent

1. Create `.claude/agents/<role>.md` with YAML frontmatter (`name`, `description`, `tools`, `model`) and a body describing the persona and protocols.
2. Add a corresponding `.claude/skills/<domain>/SKILL.md` if the role needs domain knowledge other agents could also use.
3. Register the role in `CLAUDE.md` under "Specialist roster".
4. Test with `@<role>` in a Claude Code session.

### Add new domain knowledge

1. Create `.claude/skills/<domain>/SKILL.md`.
2. Reference it in any sub-agent that should auto-load it.
3. Upload to the relevant Claude.ai Projects.

### Add a new client engagement

1. Run the onboarding ritual described in `client-onboarding.md`.
2. Create `clients/<client-name>/` with state file and instructions.
3. Create a Satellite Project in Claude.ai.

---

## Repo layout

```
.
├── README.md                         ← this file (project overview)
├── SETUP.md                          ← canonical setup + troubleshooting authority
├── CLAUDE.md                         ← Chief Architect orchestrator config (see its `Engine version:` line)
├── taxonomy.md                       ← specialist boundaries; routing-ambiguity resolver
├── governance-rules.md               ← §1.1 Baseline-First and other global rules
├── client-onboarding.md              ← repeatable onboarding ritual
├── prompt-patterns.md                ← reusable prompt templates (PP-01 through PP-24)
├── VALIDATION-TESTS.md               ← routing/governance regression suite
├── .claude/
│   ├── settings.example.json         ← copy to settings.json and fill in your paths (see Step 3e)
│   ├── skills/                       ← portable expertise, 28 skills (Tier 1 + Tier 2)
│   │   ├── itsm-specialist/          ← SKILL.md + EXAMPLES.md
│   │   ├── csm-specialist/
│   │   ├── hrsd-specialist/
│   │   ├── itom-discovery-specialist/
│   │   ├── cmdb-csdm-specialist/     ← the five Domain Expert gateways
│   │   ├── developer/
│   │   ├── code-reviewer/
│   │   └── …                         ← `ls .claude/skills/` for the full list
│   └── agents/                       ← 9 sub-agents (Tier 2 only)
│       ├── story-writer.md
│       ├── hld-lld-writer.md
│       ├── technical-designer.md
│       ├── now-assist-specialist.md
│       ├── developer.md
│       ├── flow-designer-specialist.md
│       ├── integration-specialist.md
│       ├── atf-author.md
│       └── diagramming-specialist.md
├── skills/                           ← mirror of .claude/skills/ (for repo sync tooling)
├── agents/                           ← mirror of .claude/agents/ (for repo sync tooling)
├── scripts/                          ← setup, doctor, sync, verify, docx/diagram toolchain
│   └── README.md                     ← per-OS prerequisites for the document pipeline
├── reference/
│   └── templates/                    ← ADR · traceability matrix · RAID log · NFR checklist
├── templates/
│   ├── gherkin-feature-template.md
│   └── hld-template.md
├── docs/
│   ├── INSTALLATION-GUIDE.md         ← first session + worked verification scenario
│   ├── snowarch-field-notes.md       ← MCP tool patterns and known limitations (cross-laptop knowledge base)
│   └── …                             ← architecture, operations, and user-guide docs
├── claude-ai-projects/               ← (NOT YET IMPLEMENTED) planned Tier 1 templates — none ship yet
├── clients/                          ← gitignored — per-client working folders
│   └── <client-name>/
│       ├── <client>-engagement-state.md
│       └── deliverables/
└── ServiceNowDocs/                   ← git submodule (australia branch)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Claude Code doesn't pick up skills | Confirm you started `claude` from the repo root. Inside the session, type `/agents` and `/skills` to list what loaded (these are in-session slash commands, not CLI arguments). |
| `ServiceNowDocs/` is empty | `git submodule update --init --recursive` |
| Sub-agent not invoked automatically | Tighten the `description` field in the agent file — that is what the router matches against. Add explicit trigger phrases. |
| Skills not loading in claude.ai | Settings > Features > Skills must be ON; skills must be uploaded to the specific Project. |
| MCP tools not available in Claude Code | Verify with `claude mcp list` and `/mcp` — the server key is `servicenow`. Claude Code reads `.mcp.json` from the session's primary working directory, so either start the session in the snowarch checkout or register at user scope (`./snowarch mode live --register user --ack-user-scope`). Restart Claude Code after any registration change; `./snowarch doctor` is the authoritative check. |
| `claude mcp list` shows `servicenow-mcp`, tools appear as `mcp__servicenow-mcp__*` | A registration made by the previous tooling (credentials in `~/.claude.json`); that model is retired. Re-register through snowarch — see [SETUP.md § Coming from the previous tooling](./SETUP.md#coming-from-the-previous-tooling). |
| `(Code: AUTHENTICATION_FAILED)` | **Stop; do not retry.** Run `./snowarch instance test <label>`; if it fails, `./snowarch instance set-credentials <label>`; then call `snow_core_instances_reload` before retrying. Confirm too that the user holds the `rest_api_explorer` or `admin` role on the instance. |
| `SCRIPTING_NOT_ENABLED` (or any `*_NOT_ENABLED`) | The instance's flag is off. The message names the label and the remedy: change the preset with `./snowarch instance set-preset <label> <preset>` (or `/snowarch setup-instance`), then retry. |
| MCP write operations not captured in Update Set | Run the four-call protocol before the write: `snow_us_active_update_set_ensure` → `snow_us_capture_target_set` → the write → `snow_us_update_set_preview` (the evidence). Retroactive capture over REST is not possible. See `CLAUDE.md §2.2` and [§3h](#3h--understanding-the-update-set-capture-pattern). |
| `snow_us_capture_target_set` is not among the advertised tools | The registered server predates snowarch 2.0.0 and the §2.2 protocol cannot run — stop and say so rather than improvising a capture. `./snowarch upgrade` in the snowarch checkout, then re-register. |
| `snow_deploy_background_script_exec` / `snow_fluent_script_exec` return `UNSUPPORTED_ON_THIS_INSTANCE` | The instance does not expose the endpoint. Use the manual background script UI instead: System Definition > Scripts - Background. |
| Writes refused on a `prod` instance although its preset allows them | Production writes stay locked until the instance is saved with `--ack-prod`. |
| `(Code: UNKNOWN_TOOL)` | A tool name that is not in the pinned contract — typically a name retired with the previous tooling. Use the name the session advertises under `mcp__servicenow__`; `doctor.sh` warns on any governing document that still cites a retired name. |
| Output drifts from English | Add `LANGUAGE: English (corporate, professional)` to the satellite Project's custom instructions. |
| Anything else, or unsure | `bash scripts/doctor.sh`, then [SETUP.md § Troubleshooting](./SETUP.md#troubleshooting). |

---

## Roadmap

> **Note on versioning:** the roadmap below uses a `v1.x` product-release cadence. The engine's internal `CLAUDE.md` version tracks protocol and governance changes on a separate increment — the authoritative value is the `Engine version:` line in `CLAUDE.md` (v2.8.0 at the time of writing). Both version numbers are maintained; they do not conflict.

**v1.0** (shipped): Story Writer, HLD/LLD Writer, Technical Designer, Now Assist Specialist as full sub-agents. ITSM, CSM, HRSD, ITOM/Discovery, CMDB & CSDM as Domain Expert gateway skills (v2.0) with 5-Part Constraint Envelope and mandatory §1.1 Baseline-First governance.

**v1.1** (shipped): Developer, Code Reviewer, Flow Designer Specialist, Integration Specialist sub-agents and skills. snowarch MCP integration live — §2.1 Write Approval Gate and §2.2 Update Set Capture Protocol operational. Validation suite live (`VALIDATION-TESTS.md`). Three artefacts deployed to live PDI.

**v1.2** (shipped): ATF Author and Diagramming Specialist — skill + batch sub-agent each, taking the roster to 27 specialists and 9 sub-agents. Every specialist now has a `SKILL.md`, including Performance & Scale, Security & GRC, and the CMDB & CSDM Specialist (promoted to the fifth Domain Expert gateway). §4 Delivery Artefact Governance — ADR, traceability matrix, RAID log, NFR checklist — with engine-level templates under `reference/templates/`.

**v1.3** (next):
- `claude-ai-projects/` Tier 1 instruction templates (still not shipped — see §5b).
- Multi-instance support — shipped in snowarch (`./snowarch instance add <label> --env pdi|dev|test|prod`, one preset and six flags per instance); the folder-level cutover of this repository follows the snowarch migration plan (ARC-10).

**v2.0** (future):
- App Engine Specialist, DevOps / Release Manager as full sub-agents.
- ATF artefact deployment: Claude Code writes ATF test records directly to instance via MCP.
- Performance & Scale audit automation against live instance data.
