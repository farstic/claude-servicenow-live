#!/usr/bin/env bash
# doctor.sh
#
# Environment audit for the ServiceNow Architecture Engine. Answers the one
# question nothing else in this repo answers — "is my setup correct?" — BEFORE
# work starts, so that a deferred, mid-task failure (a missing submodule, a
# drifted roster, a dead hook target, a registration left behind by the
# previous tooling, a server that does not declare the §2.2 capture tool)
# becomes a startup failure with a named remedy.
#   1. Host toolchain      — claude CLI, node, npm, git, optional renderers
#   2. Engine integrity    — roster, structure audit, hooks, submodule, citations
#   3. MCP layer           — what the session ADVERTISES, nothing more: server
#                            key present or not, connection status, whether the
#                            registered server declares snow_us_capture_target_set.
#                            Credentials are never read — they live only in the
#                            snowarch store — and `./snowarch doctor`, run in the
#                            snowarch checkout, is the authoritative live check.
#
# READ-ONLY. Every remedy is printed, never applied; scripts/setup.sh is the
# only writer. No credential is ever read, so none can be echoed.
# No MCP server registered is a fully supported mode (Tier 0), never an error.
#
# Exit 0: no FAILs (WARNs are allowed). Exit 1: one or more FAILs.
# Exit 3: required host tooling missing — the audit could not be run at all.
#
# Usage: bash scripts/doctor.sh [--tier0] [--no-network] [--json]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TIER0=0
NO_NETWORK=0
JSON=0

usage() {
  echo "Usage: bash scripts/doctor.sh [--tier0] [--no-network] [--json]"
  echo "  --tier0        skip the MCP section entirely (design-only mode)"
  echo "  --no-network   run the MCP section without 'claude mcp list', which spawns every registered server"
  echo "  --json         one JSON object per check on stdout, then a summary object"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier0)      TIER0=1 ;;
    --no-network) NO_NETWORK=1 ;;
    --json)       JSON=1 ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "Unknown flag: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

oks=0
warns=0
fails=0
missing_bin=0
CHECK_ID="D00"
MODE_LINE="design-only (no MCP)"

# ─── output helpers ───────────────────────────────────────────────────────────
# In --json mode a record is buffered rather than printed immediately, so that a
# following hint() can be folded into its msg. This keeps the emitted shape at
# exactly {"id","status","msg"} while never losing a remedy.
pending_id=""
pending_status=""
pending_msg=""

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\t' '  '
}

flush_pending() {
  [[ -z "$pending_status" ]] && return 0
  printf '{"id":"%s","status":"%s","msg":"%s"}\n' \
    "$pending_id" "$pending_status" "$(json_escape "$pending_msg")"
  pending_status=""
  pending_msg=""
}

# last_stream tracks where the record a hint() belongs to was written, so that a
# FAIL (stderr, house style) and its remedy never end up on different streams —
# `doctor.sh > report.txt` would otherwise drop every FAIL and keep orphan hints.
last_stream=1

ok()   { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="ok";   pending_msg="$*"; else echo "OK: $*";       fi; last_stream=1; oks=$((oks + 1)); }
warn() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="warn"; pending_msg="$*"; else echo "WARN: $*";     fi; last_stream=1; warns=$((warns + 1)); }
fail() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="fail"; pending_msg="$*"; else echo "FAIL: $*" >&2; fi; last_stream=2; fails=$((fails + 1)); }
skip() { if [[ $JSON -eq 1 ]]; then flush_pending; pending_id="$CHECK_ID"; pending_status="skip"; pending_msg="$*"; else echo "SKIP: $*";     fi; last_stream=1; }

hint() {
  if [[ $JSON -eq 1 ]]; then
    pending_msg="$pending_msg — hint: $*"
  elif [[ $last_stream -eq 2 ]]; then
    echo "      hint: $*" >&2
  else
    echo "      hint: $*"
  fi
}

section() { [[ $JSON -eq 0 ]] && { echo; echo "== $* =="; }; return 0; }

verdict() {
  flush_pending
  local status="ok"
  [[ $fails -gt 0 ]] && status="fail"
  if [[ $JSON -eq 1 ]]; then
    printf '{"id":"SUMMARY","status":"%s","ok":%d,"warn":%d,"fail":%d,"mode":"%s"}\n' \
      "$status" "$oks" "$warns" "$fails" "$(json_escape "$MODE_LINE")"
  else
    echo
    echo "DOCTOR: $oks ok, $warns warn, $fails fail"
    echo "Mode: $MODE_LINE"
  fi
  [[ $fails -gt 0 ]] && exit 1
  exit 0
}

# ══════════════════════════════════════════════════════════════════════════════
section "Host toolchain"

CHECK_ID="D01"
if command -v claude >/dev/null 2>&1; then
  ok "claude $(claude --version 2>/dev/null | head -1)"
else
  fail "claude CLI not found on PATH."
  hint "npm install -g @anthropic-ai/claude-code"
  missing_bin=1
fi

CHECK_ID="D02"
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
  case "$node_major" in
    ''|*[!0-9]*) node_major=0 ;;
  esac
  if [[ $node_major -lt 20 ]]; then
    fail "node v$(node -v 2>/dev/null) — Node 20 or newer is required (the floor of the live-instance layer, snowarch)."
    hint "nvm install 20"
  else
    ok "node $(node -v 2>/dev/null)"
  fi
else
  fail "node not found on PATH — Node 20 or newer is required (the floor of the live-instance layer, snowarch)."
  hint "nvm install 20"
  missing_bin=1
fi

CHECK_ID="D03"
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v 2>/dev/null)"
else
  fail "npm not found on PATH."
  hint "reinstall Node.js (npm ships with it) — https://nodejs.org or 'nvm install 20'"
  missing_bin=1
fi

CHECK_ID="D04"
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version 2>/dev/null | awk '{print $3}')"
else
  fail "git not found on PATH."
  hint "xcode-select --install (macOS) or apt install git (Linux)"
  missing_bin=1
fi

CHECK_ID="D05"
if command -v python3 >/dev/null 2>&1; then
  HAVE_PY3=1
  ok "python3 $(python3 -V 2>&1 | awk '{print $2}')"
else
  HAVE_PY3=0
  warn "python3 not found — scripts/md-to-docx.py (.docx export) unavailable."
  hint "brew install python (macOS) or apt install python3 (Linux)"
fi

CHECK_ID="D06"
# Same candidate lists render-drawio.sh / render-pdf.sh already probe.
DRAWIO_BIN="$(command -v drawio 2>/dev/null || true)"
for c in "/Applications/draw.io.app/Contents/MacOS/draw.io" \
         "/Applications/drawio.app/Contents/MacOS/drawio" \
         "/usr/bin/drawio"; do
  [[ -z "$DRAWIO_BIN" && -x "$c" ]] && DRAWIO_BIN="$c"
done
SOFFICE_BIN="$(command -v soffice 2>/dev/null || true)"
for c in "/Applications/LibreOffice.app/Contents/MacOS/soffice"; do
  [[ -z "$SOFFICE_BIN" && -x "$c" ]] && SOFFICE_BIN="$c"
done
if [[ -n "$DRAWIO_BIN" && -n "$SOFFICE_BIN" ]]; then
  ok "optional renderers present (draw.io, LibreOffice)"
else
  warn "draw.io / LibreOffice not found — diagram PNG + PDF QA unavailable."
  hint "brew install --cask drawio libreoffice"
fi

if [[ ${missing_bin:-0} -eq 1 ]]; then
  flush_pending
  if [[ $JSON -eq 1 ]]; then
    printf '{"id":"SUMMARY","status":"fail","ok":%d,"warn":%d,"fail":%d,"mode":"aborted — required host tooling missing"}\n' \
      "$oks" "$warns" "$fails"
  else
    echo
    echo "DOCTOR: required tooling missing — cannot continue."
  fi
  exit 3
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Engine integrity"

CHECK_ID="D07"
if [[ -f CLAUDE.md ]]; then
  ok "engine repo root: $REPO_ROOT"
else
  fail "CLAUDE.md not found — run doctor from inside the engine repo."
  hint "cd into the AI-Architect-Claude checkout and re-run: bash scripts/doctor.sh"
  verdict
fi

CHECK_ID="D08"
skills_n="$(ls -d skills/*/ 2>/dev/null | wc -l | tr -d ' ')"
agents_n="$(ls agents/*.md 2>/dev/null | wc -l | tr -d ' ')"
# Expected counts are read from CLAUDE.md's authoritative roster note rather than
# hardcoded, so the roster can grow without editing this script.
declared_skills="$(grep -oE 'There are \*\*[0-9]+\*\* .SKILL\.md. files' CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)"
declared_agents="$(grep -oE '[0-9]+ of them also have a sub-agent' CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)"
roster_source="CLAUDE.md"
if [[ -z "$declared_skills" || -z "$declared_agents" ]]; then
  declared_skills="${declared_skills:-28}"
  declared_agents="${declared_agents:-9}"
  roster_source="built-in fallback (could not parse the CLAUDE.md roster note)"
fi
if [[ "$skills_n" == "$declared_skills" && "$agents_n" == "$declared_agents" ]]; then
  ok "roster intact: $skills_n skills / $agents_n agents (expected per $roster_source)"
else
  fail "roster drift — CLAUDE.md declares $declared_skills skills / $declared_agents agents, filesystem has $skills_n/$agents_n."
  hint "bash scripts/sync-agents-skills.sh"
fi

CHECK_ID="D09"
missing_skill_md=0
for d in skills/*/; do
  [[ -d "$d" ]] || continue
  if [[ ! -f "$d/SKILL.md" ]]; then
    fail "skill directory has no SKILL.md: $d"
    hint "every specialist must ship a SKILL.md — see CLAUDE.md 'Specialist roster'"
    missing_skill_md=1
  fi
done
[[ $missing_skill_md -eq 0 ]] && ok "every skills/*/ directory ships a SKILL.md"

CHECK_ID="D10"
# Delegate to the existing structural audit — never re-implement its checks here.
struct_out="$(bash scripts/verify-structure.sh 2>&1)"
if [[ $? -eq 0 ]]; then
  ok "structure audit passed (parity, frontmatter, name-match, path refs)"
else
  if [[ $JSON -eq 0 ]]; then
    printf '%s\n' "$struct_out" | sed 's/^/  /' >&2
  fi
  fail "structure audit failed (output above)."
  hint "bash scripts/verify-structure.sh"
fi

CHECK_ID="D11"
hooks_path="$(git config core.hooksPath 2>/dev/null)"
if [[ "$hooks_path" == ".githooks" ]]; then
  ok "pre-commit governance hooks active (core.hooksPath=.githooks)"
else
  fail "pre-commit governance hooks are not active (core.hooksPath unset)."
  hint "git config core.hooksPath .githooks"
fi

CHECK_ID="D12"
SUBMODULE_OK=0
if [[ -d ServiceNowDocs/markdown ]]; then
  SUBMODULE_OK=1
  ok "ServiceNowDocs submodule populated"
else
  fail "ServiceNowDocs submodule not populated — the engine cannot cite primary sources."
  hint "git submodule update --init --recursive"
fi

CHECK_ID="D13"
if [[ $SUBMODULE_OK -eq 1 ]]; then
  docs_branch="$(git -C ServiceNowDocs rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [[ "$docs_branch" == "australia" ]]; then
    ok "ServiceNowDocs on the pinned release branch (australia)"
  else
    fail "ServiceNowDocs is on branch '$docs_branch', not 'australia' (the branch pinned in .gitmodules) — release-family claims will be wrong."
    hint "git -C ServiceNowDocs checkout australia && git -C ServiceNowDocs pull"
  fi
else
  skip "submodule branch check — submodule not populated (see D12)"
fi

CHECK_ID="D14"
sub_status="$(git submodule status ServiceNowDocs 2>/dev/null | head -1)"
case "$sub_status" in
  \+*) warn "ServiceNowDocs checkout differs from the pinned commit."
       hint "git submodule update --recursive (or commit the bump if it is intentional)" ;;
  \-*) fail "ServiceNowDocs submodule not initialised."
       hint "git submodule update --init --recursive" ;;
  "")  skip "submodule pin check — 'git submodule status' returned nothing" ;;
  *)   ok "ServiceNowDocs matches the pinned commit" ;;
esac

CHECK_ID="D15"
# verify-citations.sh:23-26 deliberately exits 0 when the submodule is missing so
# it never blocks a commit on a machine that has not fetched the docs. The doctor
# must NOT inherit that leniency: a skipped citation gate means every citation in
# the repo is currently unverified, which is a finding, not a pass.
cit_out="$(bash scripts/verify-citations.sh 2>&1)"
cit_rc=$?
case "$cit_out" in
  SKIP:*)
    fail "citation gate SKIPPED because the submodule is missing — every ServiceNowDocs citation is currently unverified."
    hint "git submodule update --init --recursive" ;;
  *)
    if [[ $cit_rc -eq 0 ]]; then
      ok "$(printf '%s' "$cit_out" | tail -1)"
    else
      if [[ $JSON -eq 0 ]]; then
        printf '%s\n' "$cit_out" | sed 's/^/  /' >&2
      fi
      fail "citation audit failed (output above)."
      hint "remap each DEAD path to a real file under ServiceNowDocs/markdown/"
    fi ;;
esac

CHECK_ID="D16"
# (a) settings.json present
if [[ -f .claude/settings.json ]]; then
  ok ".claude/settings.json present"

  # (b) valid JSON
  if [[ $HAVE_PY3 -eq 1 ]]; then
    if python3 -m json.tool .claude/settings.json >/dev/null 2>&1; then
      ok ".claude/settings.json is valid JSON"
    else
      fail ".claude/settings.json is not valid JSON"
      hint "python3 -m json.tool .claude/settings.json  # shows the offending line"
    fi
  else
    warn "cannot validate .claude/settings.json — python3 not available"
  fi

  # (c) example placeholder not substituted
  if grep -q '/path/to/your' .claude/settings.json; then
    fail ".claude/settings.json still contains the placeholder path from settings.example.json"
    hint "bash scripts/setup.sh re-runs the substitution"
  else
    ok ".claude/settings.json placeholder paths substituted"
  fi

  # (d) every hook target resolves. This matters more than it looks: the PreToolUse
  #     matcher is Bash|WebFetch|Read|Grep|Agent|Task, so a broken hook target fires
  #     on essentially every tool call, not on some rare path.
  hook_bad=0
  hook_seen=0
  while IFS= read -r line; do
    # collapse backslashes and quotes to spaces, then take the first absolute path token
    tgt="$(printf '%s' "$line" | tr '\\"' '  ' | grep -oE '/[^ ]+' | head -1)"
    [[ -z "$tgt" ]] && continue
    hook_seen=$((hook_seen + 1))
    if [[ ! -e "$tgt" ]]; then
      fail "hook target missing: $tgt"
      hint "npm install -g context-mode"
      hook_bad=1
    fi
  done < <(grep '"command"' .claude/settings.json 2>/dev/null)
  if [[ $hook_bad -eq 0 ]]; then
    if [[ $hook_seen -gt 0 ]]; then
      ok "all $hook_seen hook target(s) resolve on disk"
    else
      skip "no hook commands declared in .claude/settings.json"
    fi
  fi
else
  fail ".claude/settings.json not found — Claude Code hooks are not configured."
  hint "bash scripts/setup.sh  (or: cp .claude/settings.example.json .claude/settings.json)"
fi

# ══════════════════════════════════════════════════════════════════════════════
if [[ $TIER0 -eq 1 ]]; then
  section "MCP layer"
  CHECK_ID="D17"
  skip "MCP section skipped (--tier0) — design-only is a fully supported mode."
  verdict
fi

section "MCP layer"

# Advertised state only. The live-instance layer is snowarch; its store
# (.local/instances.json in the snowarch checkout) is where the credentials
# live, and this doctor never opens it — nor does it read an env block out of
# ~/.claude.json. Its only sources are `claude mcp list` (server key, command,
# connection status — never a secret) and the files that command points at.
# The authoritative live-instance check is `./snowarch doctor`, run in the
# snowarch checkout; everything below defers to it.
SNOWARCH_KEY="servicenow"
LEGACY_KEY="servicenow-mcp"
SNOWARCH_DOCTOR="./snowarch doctor  (run in the snowarch checkout)"

# `claude mcp list` spawns every registered server for a health check, so it is
# time-boxed here — a hung server must not hang the doctor. Portable: macOS has
# no `timeout`, so the bound is a background job plus a polling loop.
MCP_LIST=""
MCP_LIST_STATE="ok"   # ok | timeout | empty | skipped
if [[ $NO_NETWORK -eq 1 ]]; then
  MCP_LIST_STATE="skipped"
else
  mcp_list_file="$(mktemp)"
  ( claude mcp list >"$mcp_list_file" 2>&1 ) &
  mcp_list_pid=$!
  mcp_waited=0
  while kill -0 "$mcp_list_pid" 2>/dev/null && [[ $mcp_waited -lt 60 ]]; do
    sleep 1
    mcp_waited=$((mcp_waited + 1))
  done
  if kill -0 "$mcp_list_pid" 2>/dev/null; then
    pkill -P "$mcp_list_pid" 2>/dev/null
    kill "$mcp_list_pid" 2>/dev/null
    MCP_LIST_STATE="timeout"
  else
    wait "$mcp_list_pid" 2>/dev/null
    esc="$(printf '\033')"
    MCP_LIST="$(sed -E "s/${esc}\[[0-9;]*[A-Za-z]//g" "$mcp_list_file" 2>/dev/null)"
    [[ -z "$MCP_LIST" ]] && MCP_LIST_STATE="empty"
  fi
  rm -f "$mcp_list_file"
fi

mcp_line() { # mcp_line <server key> -> that server's line from `claude mcp list`, if any
  printf '%s\n' "$MCP_LIST" | grep -m1 -E "^$1: " || true
}

CHECK_ID="D17"
case "$MCP_LIST_STATE" in
  skipped)
    skip "MCP registration not inspected (--no-network) — 'claude mcp list' would spawn every registered server."
    hint "$SNOWARCH_DOCTOR"
    MODE_LINE="unknown — MCP layer not inspected (--no-network); run ./snowarch doctor"
    verdict ;;
  timeout)
    warn "'claude mcp list' did not finish within 60s — a registered server may be hanging on start-up; the MCP layer is unaudited."
    hint "$SNOWARCH_DOCTOR"
    MODE_LINE="unknown — 'claude mcp list' timed out; run ./snowarch doctor"
    verdict ;;
  empty)
    fail "'claude mcp list' produced no output — the MCP layer is unaudited."
    hint "run 'claude mcp list' by hand; then $SNOWARCH_DOCTOR"
    verdict ;;
esac

SNOW_LINE="$(mcp_line "$SNOWARCH_KEY")"
LEGACY_LINE="$(mcp_line "$LEGACY_KEY")"
if [[ -z "$SNOW_LINE" && -z "$LEGACY_LINE" ]]; then
  skip "no '$SNOWARCH_KEY' MCP server advertised for this folder — Tier 0 (design-only) is a fully supported mode."
  hint "to go live: 'bash scripts/setup.sh --mcp' prints the snowarch steps. A session started in the snowarch checkout sees the server without any registration here; './snowarch mode live --register user --ack-user-scope' (last resort) makes it visible from this folder."
  verdict
fi

if [[ -n "$SNOW_LINE" ]]; then
  SERVER_KEY="$SNOWARCH_KEY"
  SERVER_LINE="$SNOW_LINE"
  ok "MCP server '$SERVER_KEY' advertised for this folder (tool prefix mcp__${SERVER_KEY}__)"
else
  SERVER_KEY="$LEGACY_KEY"
  SERVER_LINE="$LEGACY_LINE"
  ok "MCP server '$SERVER_KEY' advertised for this folder (see D18 — it predates snowarch)"
fi

CHECK_ID="D18"
if [[ -n "$LEGACY_LINE" ]]; then
  warn "'$LEGACY_KEY' is a registration made by the previous tooling (tool prefix mcp__${LEGACY_KEY}__; instance URL and credentials in ~/.claude.json). That model is retired — until it is re-registered, the §2.1 gate applies to whichever prefix the session advertises."
  hint "re-register through snowarch ('./snowarch mode live' in the snowarch checkout), then remove the old entry from this folder: claude mcp remove $LEGACY_KEY"
else
  ok "no registration from the previous tooling ('$LEGACY_KEY') is advertised"
fi

CHECK_ID="D19"
case "$SERVER_LINE" in
  *Connected*)    ok "'$SERVER_KEY' reports connected per 'claude mcp list' (the server started and answered Claude Code; instance reachability is ./snowarch instance test <label>)" ;;
  *[Ff]ailed*)    fail "'$SERVER_KEY' failed its health check per 'claude mcp list' — the server did not start or could not reach its instance."
                  hint "$SNOWARCH_DOCTOR; for one instance: ./snowarch instance test <label>" ;;
  *[Aa]uthentic*) warn "'$SERVER_KEY' reports that it needs authentication per 'claude mcp list'."
                  hint "./snowarch instance test <label>; if it fails: ./snowarch instance set-credentials <label>, then snow_core_instances_reload in the session" ;;
  *)              skip "'$SERVER_KEY' connection status not recognised in the 'claude mcp list' output"
                  hint "$SNOWARCH_DOCTOR" ;;
esac

CHECK_ID="D20"
# Whether snow_us_capture_target_set is declared — the tool the §2.2 capture
# protocol depends on (governance-rules.md §2.2). The doctor can only tell by
# looking at the files the registration points at; when it cannot, snowarch's
# own doctor is the authority.
if [[ "$SERVER_KEY" == "$LEGACY_KEY" ]]; then
  skip "capture-tool check — not applicable to the retired '$LEGACY_KEY' registration (see D18): it predates snowarch 2.0.0 and does not declare snow_us_capture_target_set, so the §2.2 protocol cannot run against it."
else
  cmdline="${SERVER_LINE#*: }"
  cmdline="${cmdline% - *}"
  capture_hit=""
  capture_scanned=0
  for tok in $cmdline; do
    [[ -f "$tok" ]] || continue
    capture_scanned=1
    if grep -qF 'snow_us_capture_target_set' "$tok" 2>/dev/null; then
      capture_hit="$tok"
      break
    fi
    hit="$(find "$(dirname "$tok")" -maxdepth 2 -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.json' \) -not -path '*/node_modules/*' -print0 2>/dev/null \
      | xargs -0 grep -lF 'snow_us_capture_target_set' 2>/dev/null | head -1)"
    if [[ -n "$hit" ]]; then
      capture_hit="$hit"
      break
    fi
  done
  if [[ -n "$capture_hit" ]]; then
    ok "snow_us_capture_target_set is declared by the registered server ($capture_hit) — the §2.2 capture protocol can run"
  elif [[ $capture_scanned -eq 1 ]]; then
    warn "snow_us_capture_target_set was not found in the files the registration points at — if the session does not advertise it, the registered server predates snowarch 2.0.0 and the §2.2 protocol cannot run: stop and say so rather than improvising a capture."
    hint "$SNOWARCH_DOCTOR lists the declared tools; ./snowarch upgrade brings the checkout to a contract that declares it"
  else
    skip "capture-tool check — the registration's command does not point at a file this doctor can inspect"
    hint "$SNOWARCH_DOCTOR lists the declared tools"
  fi
fi

CHECK_ID="D21"
# snowarch registers from its own checkout; it never writes a .mcp.json into
# this folder. One found here is either a leftover from the previous tooling
# (which held the credential) or a hand-made entry. Key NAMES only are read —
# never a value.
if [[ -f .mcp.json ]]; then
  local_mcp="$(node -e '
    const fs = require("fs");
    let j; try { j = JSON.parse(fs.readFileSync(".mcp.json", "utf8")); } catch (e) { console.log("INVALID"); process.exit(0); }
    const s = j.mcpServers || {};
    const secretish = [];
    for (const n of Object.keys(s)) {
      for (const k of Object.keys((s[n] || {}).env || {})) {
        if (/PASSWORD|SECRET|TOKEN|_KEY$/i.test(k)) secretish.push(n + "." + k);
      }
    }
    console.log("SERVERS=" + Object.keys(s).join(","));
    console.log("SECRETISH=" + secretish.join(","));
  ' 2>/dev/null)"
  case "$local_mcp" in
    INVALID)
      fail ".mcp.json in this folder is not valid JSON — Claude Code will refuse to load it."
      hint "fix or delete it; snowarch registers from its own checkout, not from here" ;;
    *)
      local_servers="$(printf '%s\n' "$local_mcp" | grep -m1 '^SERVERS=' | sed 's/^SERVERS=//')"
      local_secretish="$(printf '%s\n' "$local_mcp" | grep -m1 '^SECRETISH=' | sed 's/^SECRETISH=//')"
      if [[ -n "$local_secretish" ]]; then
        fail "a project-scoped .mcp.json in this folder carries credential-shaped env key(s): $local_secretish — credentials live only in the snowarch store, never in .mcp.json."
        hint "delete .mcp.json here (it is gitignored) and re-register through snowarch"
      else
        warn "a project-scoped .mcp.json exists in this folder (servers: ${local_servers:-<none>}) — snowarch does not write one here; the supported registrations are its own checkout's .mcp.json, --register local, or --register user."
        hint "delete it if it is a leftover; otherwise keep it secret-free, as it is now"
      fi ;;
  esac
else
  ok "no project-scoped .mcp.json in this folder — snowarch registers from its own checkout"
fi

CHECK_ID="D22"
# Tracked-file leak scan. Only file:line is ever printed — never the matched
# line, which by definition could contain the credential. A doc may
# legitimately NAME a credential variable; it may never carry a VALUE.
# Placeholder forms (<...>, ${...}, YOUR..., your-..., xxx, ***) are filtered out.
# The live hostname is deliberately NOT searched for: this doctor never learns
# it (it does not open the snowarch store), so hostname hygiene is the pre-push
# review in README Step 7.
# git grep exits 128 outside a work tree; without this guard a zip download (no
# .git) would silently report "no credential found" — a clean bill of health
# issued by a scan that never ran.
IS_GIT_REPO=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IS_GIT_REPO=1
if [[ $IS_GIT_REPO -eq 0 ]]; then
  fail "the tracked-file credential leak scan could NOT run — $REPO_ROOT is not a git work tree, so 'git grep' has nothing to search. Treat the repo as unscanned, not as clean."
  hint "git init / re-clone the engine instead of unpacking a zip: git clone --recurse-submodules <repo>"
else
  pw_hits="$(git grep -I -n -E 'SERVICENOW_BASIC_PASSWORD["'"'"']?[[:space:]]*[:=]' 2>/dev/null \
    | grep -vE '(<[^>]*>|\$\{|\$[A-Z_]+|YOUR|your-|xxx|\*\*\*|__REDACTED__|placeholder|read -rs)' \
    | cut -d: -f1,2 || true)"
  if [[ -n "$pw_hits" ]]; then
    while IFS= read -r lf; do
      [[ -z "$lf" ]] && continue
      fail "a credential value appears in a TRACKED file: $lf. Remove it before any push."
    done < <(printf '%s\n' "$pw_hits" | sort -u)
    hint "scrub the value, then rewrite history if it was already committed"
  else
    ok "no credential value found in tracked files (the live hostname is never known to this doctor — review it by hand before pushing, README Step 7)"
  fi
fi

# ─── governing-document agreement ─────────────────────────────────────────────
CHECK_ID="D23"
# The real tool prefix Claude Code exposes is mcp__<server key>__ . CLAUDE.md §2.1
# gates writes by naming tool patterns; if it names a different prefix, the gate
# matches nothing that actually exists.
if grep -q "mcp__${SERVER_KEY}__" CLAUDE.md; then
  ok "CLAUDE.md gates on the advertised tool prefix (mcp__${SERVER_KEY}__)"
elif [[ "$SERVER_KEY" == "$LEGACY_KEY" ]]; then
  warn "CLAUDE.md does not name the prefix this retired registration advertises (mcp__${SERVER_KEY}__) — the §2.1 gate applies to whichever prefix the session advertises, so every mutating tool under it stays gated until snowarch is registered."
  hint "re-register through snowarch; CLAUDE.md gates on mcp__${SNOWARCH_KEY}__"
else
  fail "CLAUDE.md §2.1 does not gate on the prefix this server is actually registered under (mcp__${SERVER_KEY}__) — the write-approval patterns match no live tool."
  hint "update the §2.1 patterns to mcp__${SERVER_KEY}__snow_*_add / _modify / _remove …, or re-register the server under the key the docs assume"
fi

CHECK_ID="D24"
# Tool names retired with the previous tooling must not survive in the
# governing documents. The names are spelled as alternations on purpose, so that
# this script does not itself carry a retired name verbatim.
RETIRED_TOOL_NAMES='(switch|create)_update_set|execute_(background_)?script|(query|update|create)_record(s)?'
if [[ $IS_GIT_REPO -eq 0 ]]; then
  # git grep exits 128 outside a work tree; reporting that as "no stale names"
  # would be a pass issued by a scan that never ran.
  skip "tool-name currency — not a git work tree, 'git grep' cannot scan the governing documents"
else
  stale_files="$(git grep -l -w -E "$RETIRED_TOOL_NAMES" -- '*.md' ':(exclude)ServiceNowDocs' ':(exclude)docs/CHANGELOG.md' 2>/dev/null || true)"
  if [[ -n "$stale_files" ]]; then
    stale_n="$(printf '%s\n' "$stale_files" | grep -c . | tr -d ' ')"
    stale_list="$(printf '%s\n' "$stale_files" | head -10 | tr '\n' ' ')"
    [[ $stale_n -gt 10 ]] && stale_list="$stale_list(+$((stale_n - 10)) more)"
    warn "$stale_n governing document(s) still cite tool names retired with the previous tooling: $stale_list"
    hint "the current names are the snow_* tools the session advertises under mcp__${SNOWARCH_KEY}__; the §2.2 capture calls are snow_us_active_update_set_ensure, snow_us_capture_target_set, snow_us_update_set_preview"
  else
    ok "no retired MCP tool names in the governing documents"
  fi
fi

# ─── derived mode line ────────────────────────────────────────────────────────
if [[ "$SERVER_KEY" == "$SNOWARCH_KEY" ]]; then
  MODE_LINE="live — MCP server \"$SNOWARCH_KEY\" advertised; per-instance capability flags: ./snowarch doctor"
else
  MODE_LINE="live (retired registration \"$LEGACY_KEY\" — re-register through snowarch)"
fi

verdict
