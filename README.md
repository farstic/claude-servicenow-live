# claude-servicenow-live — installation

Ready-made ServiceNow expertise for Claude, connected to a live ServiceNow instance.

- **Claude Code (locally, in the terminal)** — the Chief ServiceNow Architect from `CLAUDE.md`: 28 specialists, 9 sub-agents, 29 skills and the official ServiceNow documentation, local in the repo.
- **claude.ai (in the browser)** — the same skills, uploaded to your account, for work without a terminal.
- **The `snow-mcp` MCP server** — connects Claude Code to a live ServiceNow instance: 394 tools for reading and writing, without leaving the terminal.

Both layers use the same skills from `.claude/skills/`. You write the expertise once and use it everywhere.

The steps are for Windows 11. Time for a full installation: about 2 hours.

---

## Contents

**Before you start:** [How the system works](#1-how-the-system-works) · [What you get](#2-what-you-get) · [Requirements](#3-requirements) · [Let Claude do it](#4-let-claude-do-the-steps-for-you)

**Installation (steps 1–9):** [1 Clone](#step-1--clone-the-repo) · [2 Submodule](#step-2--fetch-the-servicenowdocs-submodule) · [3 Git settings](#step-3--configure-git-for-this-copy) · [4 MCP server](#step-4--build-the-snow-mcp-mcp-server) · [5 instances.json](#step-5--create-instancesjson) · [6 .mcp.json](#step-6--create-mcpjson) · [6a Rights](#step-6a--configure-the-rights-in-mcpjson) · [7 Permission](#step-7--allow-the-server-in-claude-code) · [8 First launch](#step-8--sign-in-and-launch-claude-code) · [9 Check](#step-9--verify-that-it-works-4-tests)

**After installation:** [Enabling writes](#when-you-enable-writes-to-the-instance) · [Skills in claude.ai](#upload-the-skills-to-claudeai) · [Document toolchain](#document-and-diagram-toolchain-optional-per-os) · [Day-to-day work](#day-to-day-work) · [Check before push](#pre-push-check) · [Monthly maintenance](#monthly-maintenance)

**Reference:** [Final check](#final-check) · [If something breaks](#if-something-breaks) · [What in the old documentation is no longer true](#what-in-the-old-documentation-is-no-longer-true) · [Where things live](#where-things-live)

---

## 1. How the system works

```
claude.ai (browser)                 Claude Code (terminal)
─────────────────────────           ──────────────────────────────────────────
Skills in the account               Chief Architect (CLAUDE.md)
  └─ the same 29 skills               ├─ 28 specialists, 9 sub-agents
Knowledge projects                    ├─ ServiceNowDocs/ (submodule, australia)
  └─ one per engagement               └─ snow-mcp ──► live ServiceNow instance
```

The Architect reads the official documentation from the submodule and calls tools against the live instance.

---

## 2. What you get

- You run `claude` in the repo folder and get the Chief ServiceNow Architect (Engine v2.8.1) with 9 project agents and 29 skills, including the six mandatory domain gateways: ITSM, CSM, HRSD, ITOM/Discovery, CMDB & CSDM, FSO Insurance.
- The ServiceNow documentation (`australia` branch) locally, with the citations in the skills verified on every commit.
- An MCP server with 394 tools that works with several instances from a single file.
- A Git hook that synchronises the mirrored folders and stops the commit on a broken structure or a citation to a non-existent file.
- The same skills in claude.ai as well, identical to those in the repo.

---

## 3. Requirements

**This first.** Allow PowerShell scripts (otherwise `npm` and `claude` will not start at all) and enable long paths (otherwise the submodule cannot be fetched).

**PowerShell**
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
git config --global core.longpaths true
git config --global core.quotepath off
```

> These three settings apply to the whole user profile and to all repositories, not only this one. If you cannot change the policy, call `npm.cmd` and `claude.cmd` everywhere instead of `npm` and `claude`.

**Then install.** Open a new window after each command — PATH is refreshed only in new windows.

| Tool | Minimum version | Installation | Check |
|---|---|---|---|
| Git for Windows | 2.36 (2.54+ recommended) | `winget install --id Git.Git -e` | `git --version` |
| Node.js | 22 or newer | `winget install --id OpenJS.NodeJS.LTS -e` | `node -v` |
| npm | comes with Node | — | `npm -v` |
| Claude Code | latest | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| claude.ai subscription | Pro or higher | [claude.ai](https://claude.ai) | sign in with `/login` |
| ServiceNow PDI | — | [developer.servicenow.com](https://developer.servicenow.com) | sign in via the browser |

> Do not add `--omit=optional` to the Claude Code installation. `claude.exe` comes from the optional package `@anthropic-ai/claude-code-win32-x64` and from the postinstall step — without them the command is broken.
>
> The sub-agents are pinned to the `claude-opus-4-8` model. Your account must have access to it, otherwise every dispatch to a sub-agent fails with an error. Verify with `/model` in a session.

**Verify that everything is in place.**

**PowerShell**
```powershell
git --version                        # 2.54.0.windows.1 or newer (minimum 2.36)
node -v                              # v22 or newer (the LTS package usually gives v24.x)
npm config get ignore-scripts        # false
claude --version                     # 2.1.274 (Claude Code) or newer
Get-ExecutionPolicy -Scope CurrentUser   # RemoteSigned
```

**What you will need at hand:** `<GITHUB_USERNAME>`, `<GITHUB_EMAIL>`, the address of the PDI `<pdi-instance>`, a user `<USERNAME>` and password `<PASSWORD>` for it, and a short name for the instance `<PDI_ALIAS>`. `<profile>` is the name of your profile folder in `C:\Users\`.

---

## 4. Let Claude do the steps for you

Steps 1–7 are commands. Claude Code runs them by itself if you give it this file. You only do what requires a browser or a personal account.

**Do this yourself, before the first session:**

1. The two blocks from section 3 — the script permission, long paths, and the installation of Git, Node and Claude Code.
2. Create a PDI at [developer.servicenow.com](https://developer.servicenow.com). Note down the address, the user and the password.

**Then open a session:**

**PowerShell**
```powershell
cd "$env:USERPROFILE\Documents"
claude
```

Paste into the chat:

```
Read the file <full path to this file> and carry out steps 1 to 7 from it, one at a time.
Stop after every step and show me the result against the "Expected" line.
Create instances.json with the placeholders only and tell me which values to fill in.
```

**What it will ask you for along the way:** approval for every command; a GitHub sign-in in the browser, if it prompts during cloning; the values for `instances.json`, which you fill in in Notepad.

**What remains entirely up to you:** signing in to Claude Code (Step 8), the four tests from Step 9, uploading the skills to claude.ai, and the decision on when to enable writes in the instance.

> After `.mcp.json` is created, close the session with `/exit` and start it again, this time from the root of the repo. The MCP server is loaded at session start.
>
> The steps are for Windows 11. On macOS or Linux the commands with `winget`, `notepad` and PowerShell are different — ask Claude to translate them for your system.

---

## Step 1 — Clone the repo

The repo contains `CLAUDE.md`, the agents, the skills, the hooks and the scripts.

**PowerShell**
```powershell
cd "$env:USERPROFILE\Documents"
git clone https://github.com/farstic/claude-servicenow-live.git
cd claude-servicenow-live
git branch --show-current
Test-Path CLAUDE.md, .claude\agents, .claude\skills, .githooks\pre-commit, .gitmodules
(Get-ChildItem .claude\agents -File).Count
(Get-ChildItem .claude\skills -Directory).Count
```

**Expected:** branch `main`, `True` five times, then `9` and `29`.

> Do not place the repo in OneDrive. The submodule from the next step has over 46 thousand files and very long paths.

---

## Step 2 — Fetch the ServiceNowDocs submodule

The submodule is the official ServiceNow documentation (branch `australia`). The skills cite paths in it, and the hook checks every citation.

**PowerShell** (in the repo folder)
```powershell
git config --global --get core.longpaths
git submodule update --init --recursive
git submodule status
```

**Expected:**
- `true` from the first command.
- A download of 130–280 MB and 46,053 files, 2–6 minutes.
- `git submodule status` prints a line that starts with a **space**, then a hash and `ServiceNowDocs`. If the line starts with `-`, the submodule has not been fetched — run the command again.

> The warning `the following paths have collided` is expected and harmless — the `australia` branch contains two files that differ only in letter case. Do not touch any files in `ServiceNowDocs/`.

---

## Step 3 — Configure git for this copy

These settings live in `.git/config` and **are not carried over when cloning**. Without them the hook does not run, and the submodule looks permanently modified.

**PowerShell** (in the repo folder)
```powershell
git config core.hooksPath .githooks
git config submodule.ServiceNowDocs.ignore dirty
git config user.name "<GITHUB_USERNAME>"
git config user.email "<GITHUB_EMAIL>"
git config --get core.hooksPath
git status --short
```

**Expected:** `.githooks`; `git status --short` shows no ` m ServiceNowDocs` line.

> Edit only `.claude/skills/` and `.claude/agents/`. The root-level `skills/` and `agents/` are copies for GitHub that the hook generates itself — a change made only there disappears on the next commit.

---

## Step 4 — Build the snow-mcp MCP server

The server is not an npm package. You clone it separately and build it locally.

**PowerShell**
```powershell
cd $env:USERPROFILE
git clone https://github.com/farstic/snow-mcp.git
cd snow-mcp
npm ci
npm run build
Test-Path .\dist\cli\index.js
Test-Path .\dist\tools-manifest.json
```

**Expected:** both commands finish without `ERR!` and without TypeScript errors; then `True` and `True`.

> If `npm ci` reports that `package.json` and `package-lock.json` do not match — run `npm install`, then `npm run build`. After every `git pull` in `snow-mcp`, run `npm run build` again — the `dist/` folder is not in git.
>
> Steps 4–7 are only for the MCP layer. If you do not have an instance yet, defer them and go straight to Step 8.

---

## Step 5 — Create instances.json

This is where the instances and passwords live. The file sits in the repo root but never goes into git.

**First, exclude it from git.** The repo's `.gitignore` covers `.env`, `.mcp.json` and the settings files, but does **not** cover `instances.json`, `mcp.json` or the `.bak` copies — and they carry the same password.

**PowerShell** (in the repo folder)
```powershell
Add-Content -Path .git\info\exclude -Encoding ascii -Value ".mcp.json*","instances.json*","mcp.json",".env",".claude/settings.local.json",".claude/settings.json"
git check-ignore -v .mcp.json .mcp.json.bak instances.json instances.json.bak mcp.json .env .claude/settings.local.json .claude/settings.json
```

**Expected:** eight lines — one per path. Run the first command only once; running it again duplicates the lines.

**Now create the file.**

**PowerShell**
```powershell
$f = "$env:USERPROFILE\Documents\claude-servicenow-live\instances.json"
$t = @'
{
  "default_instance": "<PDI_ALIAS>",
  "instances": {
    "<PDI_ALIAS>": {
      "instance_url": "https://<pdi-instance>.service-now.com",
      "auth_method": "basic",
      "username": "<USERNAME>",
      "password": "<PASSWORD>"
    }
  }
}
'@
if (Test-Path $f) { Write-Warning "$f already exists - stop and check" } else { [IO.File]::WriteAllText($f, $t, (New-Object Text.UTF8Encoding $false)); notepad $f }
```

If you see a warning, the file already exists — open it with `notepad $f` and compare it against the content above instead of deleting it.

Replace the values in angle brackets in Notepad and save with Ctrl+S:

- `<PDI_ALIAS>` — a short lowercase name with no spaces. It appears twice and must match **exactly**, including letter case.
- `instance_url` — no trailing `/`.
- In the password, `"` becomes `\"` and `\` becomes `\\` (JSON rules).
- If you use File → Save As, choose `UTF-8` in the Encoding field, not `UTF-8 with BOM`.

**Verify** (does not display passwords):

**PowerShell** (in the repo folder)
```powershell
node -e "const b=require('fs').readFileSync('instances.json'); console.log(b[0]===0xEF?'BOM!':'no BOM'); const j=JSON.parse(b.toString('utf8')); console.log('default:', j.default_instance); for (const [k,v] of Object.entries(j.instances)) console.log(k, v.auth_method, v.instance_url?'url ok':'NO URL', v.username?'user ok':'NO USER', v.password?'pwd ok':'NO PWD')"
```

**Expected:** `no BOM`, `default: <PDI_ALIAS>`, then one line `<PDI_ALIAS> basic url ok user ok pwd ok`.

> The password sits in plain text on disk — keep your profile folder on an encrypted drive (BitLocker) and use a dedicated PDI user, not your personal admin account. Do not write JSON with `Set-Content` or `Out-File` — they add a BOM and the server will not start.
>
> Start with the PDI only. Add another instance only after you have read the rules of the corresponding engagement.

---

## Step 6 — Create .mcp.json

This file tells Claude Code how to launch the server. `__HOME__` is replaced automatically — there is nothing for you to fill in.

**PowerShell**
```powershell
$f = "$env:USERPROFILE\Documents\claude-servicenow-live\.mcp.json"
$h = $env:USERPROFILE.Replace('\','\\')
$t = @'
{
  "mcpServers": {
    "snow-mcp": {
      "command": "node",
      "args": ["__HOME__\\snow-mcp\\dist\\cli\\index.js", "start"],
      "cwd": "__HOME__\\snow-mcp",
      "env": {
        "SN_INSTANCES_CONFIG": "__HOME__\\Documents\\claude-servicenow-live\\instances.json",
        "WRITE_ENABLED": "false",
        "SCRIPTING_ENABLED": "false",
        "CMDB_WRITE_ENABLED": "false",
        "ATF_ENABLED": "false",
        "NOW_ASSIST_ENABLED": "false",
        "FLUENT_ENABLED": "false",
        "MCP_TOOL_PACKAGE": "full"
      }
    }
  }
}
'@
$t = $t.Replace('__HOME__', $h)
if (Test-Path $f) { Write-Warning "$f already exists - stop and check" } else { [IO.File]::WriteAllText($f, $t, (New-Object Text.UTF8Encoding $false)) }
```

**Verify:**

**PowerShell** (in the repo folder)
```powershell
node -e "const b=require('fs').readFileSync('.mcp.json'); console.log(b[0]===0xEF?'BOM!':'no BOM'); const s=JSON.parse(b.toString('utf8')).mcpServers['snow-mcp']; console.log('entry exists:', require('fs').existsSync(s.args[0]), '| instances.json exists:', require('fs').existsSync(s.env.SN_INSTANCES_CONFIG)); console.log('SERVICENOW_* keys:', Object.keys(s.env).filter(k=>k.startsWith('SERVICENOW_')).length); for (const k of ['WRITE_ENABLED','SCRIPTING_ENABLED','CMDB_WRITE_ENABLED','ATF_ENABLED','NOW_ASSIST_ENABLED','FLUENT_ENABLED','MCP_TOOL_PACKAGE','SN_INSTANCES_CONFIG']) console.log(k, '=', s.env[k] ?? '(unset)')"
```

**Expected:** `no BOM`; `entry exists: true | instances.json exists: true`; `SERVICENOW_* keys: 0`; all flags `false`, `MCP_TOOL_PACKAGE = full` and the full path to `instances.json`.

> The paths must be absolute — Claude Code does not honour `cwd`. The flags apply to **all** instances in the file. The file is created read-only. **The next step (6a) deliberately asks you which rights you want** — without it, every attempt to write to the instance returns `WRITE_NOT_ENABLED`.

---

## Step 6a — Configure the rights in .mcp.json

The flags in `.mcp.json` determine what Claude is allowed to do in the instance. Step 6 leaves them all at `false` (read-only) — this is intentional, but **you need to decide now**, otherwise you will later wonder why writes are not working.

| Flag | What it enables | When `true` |
|---|---|---|
| `WRITE_ENABLED` | create / update / delete of records | you want Claude to write to the instance |
| `SCRIPTING_ENABLED` | business rules, script includes, ACL, client scripts, update set tools | almost always together with WRITE_ENABLED |
| `CMDB_WRITE_ENABLED` | writes to the CMDB (CI, relationships, reconcile) | only for ITOM/CMDB work |
| `ATF_ENABLED` | running ATF tests | for testing work |
| `NOW_ASSIST_ENABLED` | Now Assist / AI tools | for Now Assist work |
| `FLUENT_ENABLED` | Fluent (ServiceNow SDK) tools | rarely |

**Option A — via the terminal (prompts you for each flag):**

**PowerShell** (in the repo folder)
```powershell
$f = "$env:USERPROFILE\Documents\claude-servicenow-live\.mcp.json"
$j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
$env2 = $j.mcpServers.'snow-mcp'.env
foreach ($k in 'WRITE_ENABLED','SCRIPTING_ENABLED','CMDB_WRITE_ENABLED','ATF_ENABLED','NOW_ASSIST_ENABLED','FLUENT_ENABLED') {
  $cur = $env2.$k
  $a = Read-Host "$k (now: $cur) - true / false [Enter = keep $cur]"
  if ($a -eq 'true' -or $a -eq 'false') { $env2.$k = $a }
}
[IO.File]::WriteAllText($f, ($j | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
Write-Host "Saved. Run the check from Step 6."
```

**Option B — by hand:**

**PowerShell**
```powershell
notepad "$env:USERPROFILE\Documents\claude-servicenow-live\.mcp.json"
```

Change `"false"` to `"true"` for the flags you want (for writes: `WRITE_ENABLED` **and** `SCRIPTING_ENABLED`). Save with Ctrl+S.

**After any change, always:** `/exit` Claude Code and run `claude` again — the server reads the flags only at start-up. Run the check from Step 6 again and confirm the flags are set the way you want them.

> The flags apply to **all** instances in `instances.json`. Do not keep a production instance in the file while writes are enabled. An actual write from Claude Code still has to pass your `write approved` (`CLAUDE.md` §2.1) and update set capture (§2.2) — the flag only makes it possible.

---

## Step 7 — Allow the server in Claude Code

Without this file, Claude Code asks you to approve the server on every start.

**PowerShell**
```powershell
$f = "$env:USERPROFILE\Documents\claude-servicenow-live\.claude\settings.local.json"
$t = @'
{
  "enabledMcpjsonServers": ["snow-mcp"],
  "permissions": {
    "allow": [
      "mcp__snow-mcp__snow_core_current_instance_read",
      "mcp__snow-mcp__snow_core_instances_index",
      "mcp__snow-mcp__snow_core_records_query",
      "mcp__snow-mcp__snow_core_record_read",
      "mcp__snow-mcp__snow_core_table_schema_read",
      "mcp__snow-mcp__snow_us_current_update_set_read"
    ]
  }
}
'@
if (Test-Path $f) { Write-Warning "$f already exists - stop and check" } else { [IO.File]::WriteAllText($f, $t, (New-Object Text.UTF8Encoding $false)) }
Get-Content $f | ConvertFrom-Json | Select-Object -ExpandProperty enabledMcpjsonServers
```

**Expected:** `snow-mcp`.

> The list contains read-only tools only. A write tool placed here runs without any prompt from Claude Code — the only remaining safeguard is then the `write approved` rule in `CLAUDE.md` §2.1.

---

## Step 8 — Sign in and launch Claude Code

Always launch Claude Code **from the repo root**. From any other folder, Claude loads neither its role, nor the agents, nor its memory.

First, the user settings. This is the **user-level** file in your profile folder — it is different from the one in the repo from Step 7.

**PowerShell**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude" | Out-Null
notepad "$env:USERPROFILE\.claude\settings.json"
```

- If the file is **empty**, paste the entire block below and save.
- If it already has content, add only the `"theme"` and `"cleanupPeriodDays"` lines **inside** the existing `{ }`, with a comma after the previous line.

```json
{
  "theme": "dark",
  "cleanupPeriodDays": 3650
}
```

Then:

**PowerShell**
```powershell
cd "$env:USERPROFILE\Documents\claude-servicenow-live"
claude
```

1. Accept the folder trust dialog.
2. If prompted to sign in — `/login`, then the browser and your claude.ai account.

Verify in a **second PowerShell window**:
```powershell
Test-Path "$env:USERPROFILE\.claude\.credentials.json"
Test-Path Env:ANTHROPIC_API_KEY
```

**Expected:** `True` and `False`. You sign in with your subscription; no API key is used. If the second line is `True`, remove the variable (`Remove-Item Env:ANTHROPIC_API_KEY`) and run `claude` again — otherwise you pay per API call instead of through the subscription.

> `cleanupPeriodDays` keeps the transcripts. Without it, Claude Code deletes them after 30 days. Transcripts may contain passwords — keep your profile folder on an encrypted drive.

---

## Step 9 — Verify that it works (4 tests)

All tests are run in a `claude` session started from the repo root. Nothing is written to the instance.

**1. The Architect.** Type `Status`, then `/agents`.

**Expected:** a response as Chief ServiceNow Architect, Engine v2.8.1, release family `australia`, 28 specialists and the six gateways; `/agents` shows 9 project agents.

**2. Routing.** Paste exactly:

```
I have a transcript snippet. Draft 3 Gherkin stories for restricting incident creation to GSC agents only.
```

**Expected:** it proposes `story-writer` and **waits** for approval. It may fire the ITSM gateway first — that is correct. Type `no` — we are only testing the routing, not the output.

**3. MCP connection.** Type `/mcp`, then:

```
Call snow_core_instances_index and snow_core_current_instance_read and show the result without comment.
```

**Expected:** `snow-mcp` is connected; `current` is `<PDI_ALIAS>`, `total` is `1`.

**4. A real query against the PDI.**

```
Call snow_core_records_query with {"table":"sys_user","query":"user_name=<USERNAME>","fields":"sys_id,user_name","limit":1,"instance":"<PDI_ALIAS>"}
```

**Expected:** `{"count":1,...}`.

> Pass `instance` explicitly on every call. Instance names are written exactly as they appear in `instances.json` — in this version they are case-sensitive. If any test fails, see [If something breaks](#if-something-breaks).

---

## When you enable writes to the instance

If you left everything at `false` in Step 6a, every write returns `WRITE_NOT_ENABLED`. Enabling it is the same procedure — Step 6a (Option A or B), then `/exit` and `claude` again.

**PowerShell**
```powershell
notepad "$env:USERPROFILE\Documents\claude-servicenow-live\.mcp.json"
```

Change `"WRITE_ENABLED": "false"` to `"WRITE_ENABLED": "true"` and `"SCRIPTING_ENABLED": "false"` to `"SCRIPTING_ENABLED": "true"`. Save with Ctrl+S, close the session with `/exit` and start `claude` again. Re-run the check from Step 6.

> `SCRIPTING_ENABLED` is required for business rules, script includes, ACLs and the update set tools. The flags apply to **all** instances in the file — do not keep a production instance in the file while writes are enabled.

---

## Upload the skills to claude.ai

This way the same expertise also works in the browser. Skills live at the **account** level, not in individual projects.

First enable the feature: claude.ai → Settings → Capabilities → Skills → enabled (the labels in the interface change from time to time).

**Check the description lengths.** claude.ai limits the frontmatter `description` to 1024 characters and rejects longer ones.

**PowerShell** (in the repo root)
```powershell
node -e "const fs=require('fs');for(const d of fs.readdirSync('.claude/skills')){const t=fs.readFileSync('.claude/skills/'+d+'/SKILL.md','utf8');const m=t.match(/^---\r?\n([\s\S]*?)\r?\n---/);const fm=m?m[1]:'';const x=fm.match(/^description:[ \t]*(.*)$/m);const n=x?x[1].trim().replace(/^['\x22]|['\x22]$/g,'').length:0;if(n>1024)console.log(d,n)}"
```

**Expected:** a list of the skills over the limit. As of today there are 13 — these may be rejected on upload. Shorten the `description` in `.claude/skills/<name>/SKILL.md`, commit through the hook and upload again.

**Create the archives.** The archive must contain the folder itself, not just the files inside it.

**PowerShell**
```powershell
New-Item -ItemType Directory -Force "$env:TEMP\claude-ai-uploads" | Out-Null
cd "$env:USERPROFILE\Documents\claude-servicenow-live\.claude\skills"
Get-ChildItem -Directory | ForEach-Object { tar.exe -a -c -f "$env:TEMP\claude-ai-uploads\$($_.Name).zip" $_.Name }
(Get-ChildItem "$env:TEMP\claude-ai-uploads" -Filter *.zip).Count
tar.exe -t -f "$env:TEMP\claude-ai-uploads\itsm-specialist.zip"
cd "$env:USERPROFILE\Documents\claude-servicenow-live"
```

**Expected:** `29`, then `itsm-specialist/`, `itsm-specialist/EXAMPLES.md`, `itsm-specialist/SKILL.md`.

Upload via Settings → Capabilities → Skills → Upload skill. Upload in this order: the six gateways and the core first — `itsm-specialist`, `csm-specialist`, `hrsd-specialist`, `itom-discovery-specialist`, `cmdb-csdm-specialist`, `fso-insurance-specialist`, `developer`, `code-reviewer`. Then the remaining 21.

**Expected:** every uploaded skill appears in the list in claude.ai.

> Finally, delete the temporary folder: `Remove-Item -Recurse -Force "$env:TEMP\claude-ai-uploads"`. Re-upload every time you change a `SKILL.md` — `CLAUDE.md` requires this to happen within 24 hours.

---

## Document and diagram toolchain (optional, per OS)

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

## Day-to-day work

Always start the session from here:

**PowerShell**
```powershell
cd "$env:USERPROFILE\Documents\claude-servicenow-live"
claude
```

- The Architect first restates the task, shows the assumptions and **proposes** a specialist. After your approval it launches it.
- A direct call with `@<name>` (for example `@developer`) skips the approval, but not the domain gateway.
- Every write to an instance requires a separate `write approved` from you in the same conversation (`CLAUDE.md` §2.1) — and works only after you have enabled the flags.
- Before a configuration write, set the active update set via `sys_user_preference` (`CLAUDE.md` §2.2, using the new tool names from the table below). `snow_us_update_set_switch` and `snow_us_active_update_set_ensure` do not switch the context.
- Tools are named `snow_<domain>_<object>_<action>` — for example `snow_core_records_query`, `snow_scr_script_include_add`. Queries return 10 rows by default (`MAX_RECORDS`); ask for more explicitly.
- Engagement work stays in `clients/<name>/`. Do not mix two engagements in one conversation. After every change to `.mcp.json` or `instances.json`, close the session with `/exit` and start `claude` again.

---

## Pre-push check

Run this before every `git push`. It checks the outgoing commits, not the working folder. First open Git Bash from PowerShell while you are in the repo folder:

**PowerShell**
```powershell
& "C:\Program Files\Git\bin\bash.exe"
```

**Git Bash** (in the repo root)
```bash
R=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo origin/main)
echo "range: $R..HEAD"
git log --name-only --format= "$R..HEAD" | sort -u | grep -E '^(clients|products|_migration)/|instances\.json|\.mcp\.json|(^|/)mcp\.json|(^|/)\.env$' && echo "STOP: confidential or secret path in outgoing commits" || echo "OK: no confidential paths in outgoing commits"
git diff "$R..HEAD" | grep -iE "password|secret|api_key|token|client_secret|bearer\s" && echo "WARNING: possible credentials in outgoing commits" || echo "OK: no credential patterns found"
git diff "$R..HEAD" | grep -iE "service-now\.com" | grep -v "<pdi-instance>" && echo "WARNING: instance URL in outgoing commits" || echo "OK: no instance URLs found"
```

**Expected:** three `OK` lines.

> Review every `WARNING` line by line. Never `git add -A` blindly.

---

## Monthly maintenance

About 30 minutes once a month.

**PowerShell** (in the repo folder)
```powershell
git submodule update --remote ServiceNowDocs
git add ServiceNowDocs
git commit -m "chore: bump ServiceNowDocs to latest australia"
cd "$env:USERPROFILE\snow-mcp"
git status --short
git pull --rebase origin main
npm ci
npm run build
```

**Expected:** the commit passes through the hook (about 35 seconds); `git status --short` in `snow-mcp` is empty; the build completes without errors.

> If `git status --short` in `snow-mcp` is not empty, stop — you have local changes. Save them with `git stash` before the `pull`.

Then: review the release notes in `ServiceNowDocs/markdown/release-notes/`, update the affected skills in `.claude/skills/`, upload the changed ones to claude.ai and restart `claude`. If a skill cites a deleted file, the hook blocks the commit — that is the intent; fix the citation.

---

## Final check

Everything in PowerShell, **from the repo root**, unless stated otherwise.

| # | Command | Expected result |
|---|---|---|
| 1 | `node -v` | `v22` or newer |
| 2 | `claude --version` | `2.1.274 (Claude Code)` or newer |
| 3 | `git config --global --get core.longpaths` | `true` |
| 4 | `(Get-ChildItem .claude\agents -File).Count; (Get-ChildItem .claude\skills -Directory).Count` | `9`, `29` |
| 5 | `git config --get core.hooksPath` | `.githooks` |
| 6 | `git submodule status` | a line that starts with a space (not with `-` or `+`) |
| 7 | `& "C:\Program Files\Git\bin\bash.exe" scripts/verify-structure.sh` | `OK: structure audit passed (...)` |
| 8 | `& "C:\Program Files\Git\bin\bash.exe" scripts/verify-citations.sh` | `dead: 0` and `OK: all ServiceNowDocs citations resolve.` |
| 9 | `git check-ignore -v .mcp.json .mcp.json.bak instances.json instances.json.bak mcp.json .env .claude/settings.local.json .claude/settings.json` | 8 lines |
| 10 | `Test-Path "$env:USERPROFILE\snow-mcp\dist\cli\index.js"` | `True` |
| 11 | `claude mcp list` | `snow-mcp: ... - ✔ Connected` |
| 12 | In a session: `Status` | Chief ServiceNow Architect, v2.8.1, `australia`, 28 specialists, 6 gateways |

---

## If something breaks

| Symptom | What to do |
|---|---|
| `running scripts is disabled on this system` on `npm` or `claude` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Until then, call `npm.cmd` and `claude.cmd`. |
| `claude` is not recognised or does not start after installation | Open a new window. `npm config get ignore-scripts` must be `false`. Reinstall without `--omit=optional`. |
| Model error when dispatching to a sub-agent | The agents are pinned to `claude-opus-4-8`. Check with `/model` whether your account has access to it. |
| `Status` gives a generic answer, `/agents` shows no project agents | You started `claude` outside the repo root. `cd` back and start it again. |
| `error: unable to create file ...: Filename too long` | `git config --global core.longpaths true`, then run `git submodule update --init --recursive` again. |
| `git status` always shows ` m ServiceNowDocs` | `git config submodule.ServiceNowDocs.ignore dirty`. Do not rename files in the submodule. |
| Commit passes without checks, or prints `SKIP: ServiceNowDocs submodule not populated` | `git config core.hooksPath .githooks` is missing (Step 3), or the submodule has not been fetched and the citation check is disabled (Step 2). |
| `/mcp` shows snow-mcp failed, `MCP error -32000: Connection closed` | The path in `args[0]` must be absolute and `npm run build` must have completed. |
| Asks on every start whether to approve the MCP server | `"enabledMcpjsonServers": ["snow-mcp"]` is missing from `.claude/settings.local.json`. |
| The server stops after editing the JSON; `SyntaxError` or `BOM!` | Save the file again without a BOM — from Notepad with Encoding `UTF-8`, not `UTF-8 with BOM`. |
| `Unknown instance "default". Available: ` with an empty list | `SN_INSTANCES_CONFIG` does not point to a valid `instances.json`. Absolute path, the check from Step 6, restart. |
| `WRITE_NOT_ENABLED` or `SCRIPTING_NOT_ENABLED` | The flag is not exactly `"true"` in `.mcp.json`. The update set tools also require `SCRIPTING_ENABLED`. Restart after the change. |
| `AUTHENTICATION_FAILED` or 401 | Wrong username or password in `instances.json`. Log in through the browser with the same user. |
| `query_records`, `create_update_set` or `mcp__nowaikit__*` do not exist | The old names are gone. Use the table below; the full map is in `snow-mcp\tool-rename-map.json`. |
| `snow_deploy_background_script_exec` returns `{"action":"failed"}` | The script-execution tools do not work. Run scripts by hand: System Definition → Scripts - Background. |

---

## What in the old documentation is no longer true

The files `SETUP.md`, `docs/INSTALLATION-GUIDE.md`, `docs/ADVANCED-WEB-SETUP.md` and `docs/MCP-OPERATIONS-GUIDE.md` were written for the previous MCP server. Wherever they disagree with this file, this file takes precedence.

- **The MCP server is not an npm package.** `claude-servicenow-mcp` does not exist on npm. It is compiled locally (Step 4).
- **`claude_desktop_config.json` is not read by Claude Code.** It is only for Claude Desktop. Claude Code reads `.mcp.json` in the repo root plus `enabledMcpjsonServers`.
- **Node must be at least 22** (a Claude Code requirement), not 18. The value `lite` for `MCP_TOOL_PACKAGE` does not exist — the valid values are `full` and the specialised packages.
- **For basic auth the server reads `SERVICENOW_BASIC_USERNAME` / `SERVICENOW_BASIC_PASSWORD`**, not `SERVICENOW_USERNAME` / `SERVICENOW_PASSWORD`.
- **`context-mode` is not part of the working environment.** Do not copy `.claude/settings.example.json` as `.claude/settings.json` — the paths in it are Unix paths.
- **There are 28 specialists** (29 skills, 9 sub-agents, 6 gateways — FSO Insurance was added on 21 Sep 2026), not 22. The templates in `claude-ai-projects/` do not exist — the claude.ai projects are set up by hand.
- **The tool names have changed.** `CLAUDE.md` §2.1 and §2.2 still use the old ones:

| Old name | New name |
|---|---|
| `query_records` | `snow_core_records_query` |
| `get_record` | `snow_core_record_read` |
| `create_record` | `snow_core_record_add` |
| `update_record` | `snow_core_record_modify` |
| `create_update_set` | `snow_us_update_set_add` |
| `switch_update_set` | `snow_us_update_set_switch` |

---

## Where things live

`<repo>` = `C:\Users\<profile>\Documents\claude-servicenow-live`

| Path | What it is | In git |
|---|---|---|
| `<repo>\CLAUDE.md` | The architect's instructions, v2.8.1 | yes |
| `<repo>\.claude\agents\` (9) | The agents that Claude Code reads | yes |
| `<repo>\.claude\skills\` (28) | The skills that Claude Code reads | yes |
| `<repo>\agents\`, `<repo>\skills\` | Copies for GitHub — do not edit | yes |
| `<repo>\.githooks\pre-commit` | The hook: sync, structure, citations | yes |
| `<repo>\ServiceNowDocs\` | The ServiceNow documentation (submodule, `australia`) | pointer |
| `<repo>\instances.json` | Instances and passwords | **no, never** |
| `<repo>\.mcp.json` | Registration of `snow-mcp` | **no** |
| `<repo>\.claude\settings.local.json` | Permissions and `enabledMcpjsonServers` | **no** |
| `<repo>\clients\<name>\` | The working folder for a single engagement | local |
| `C:\Users\<profile>\snow-mcp\` | The MCP server; the entry point is `dist\cli\index.js` | separate repo |
| `%USERPROFILE%\.claude\settings.json` | The user-level Claude Code settings | — |

---
