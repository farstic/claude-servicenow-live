#!/usr/bin/env bash
# setup.sh
#
# One command to fix. Takes a bare clone of the ServiceNow Architecture Engine
# to a working engine, idempotently, and stops cleanly at whichever mode the
# user actually wants:
#
#   Tier 0 (design-only)   the engine, its specialist roster and the
#                          ServiceNowDocs submodule. No ServiceNow instance,
#                          no credentials, no MCP server. This is a COMPLETE,
#                          first-class end state — every design deliverable the
#                          engine produces (HLD/LLD, stories, ADRs, estimates,
#                          diagrams, code artefacts) works fully in Tier 0.
#   Live instance          everything above, plus the snowarch MCP server
#                          ('servicenow') so the engine can read (and, where the
#                          instance's flags allow it, write) live platform data.
#                          snowarch is a separate checkout with its own CLI;
#                          this script only PRINTS the steps for it — it never
#                          prompts for a URL or a credential and registers
#                          nothing.
#
# Steps (each one idempotent — a re-run prints "SKIP: ... already done"):
#   S1  Preflight          scripts/doctor.sh --tier0 (host toolchain + repo)
#   S2  Submodule          ServiceNowDocs, australia branch
#   S3  Hooks              git config core.hooksPath .githooks
#   S4  Mirrors            scripts/sync-agents-skills.sh
#   S5  context-mode       optional global npm package the hooks call
#   S6  settings.json      from settings.example.json, placeholder resolved
#   S7  MODE GATE          closing scripts/doctor.sh --tier0, then either stop
#                          at Tier 0 or continue to the hand-off (S8)
#   S8  snowarch hand-off  the live-instance steps, printed, nothing executed:
#                          clone farstic/ai-servicenow-architect, run its
#                          bootstrap, ./snowarch mode live, ./snowarch doctor,
#                          and how to make the server visible to a session
#
# WHERE THE LIVE-INSTANCE CONFIGURATION LIVES (and why this script has no part in it):
#   1. Credentials live ONLY in the snowarch checkout's store
#      (.local/instances.json — file mode 0600, directory 0700), written by
#      the snowarch wizard or by `./snowarch instance add … --password-stdin`.
#      Never in ~/.claude.json, never in .mcp.json, never in an environment
#      variable, never in Git. Nothing in this repository can therefore leak
#      one, and nothing here has to back a configuration file up first.
#   2. Registration is secret-free. The snowarch checkout carries a committed
#      .mcp.json (project scope); Claude Code reads .mcp.json from the
#      session's PRIMARY WORKING DIRECTORY, so a session started in that
#      checkout sees the server with no further step. `./snowarch mode live
#      --register local` (that checkout only) and `./snowarch mode live
#      --register user --ack-user-scope` (every project on the machine — the
#      documented last resort, and the only way a session started in THIS
#      folder sees the server) go through the `claude mcp` CLI; snowarch never
#      hand-edits Claude Code's configuration file. `./snowarch mode design`
#      removes what it registered.
#   3. Registrations made by the previous tooling (server key 'servicenow-mcp',
#      credentials in ~/.claude.json) are retired — re-register through
#      snowarch. scripts/doctor.sh reports such a registration as exactly that.
#
# CREDENTIAL RULES (non-negotiable, enforced throughout):
#   - No credential is ever prompted for, read, echoed or written by this
#     script — there is no code path that handles one.
#   - No file outside this repository is ever modified by this script.
#   - `set -x` is never enabled anywhere in this script.
#
# Exit 0: setup completed AND the closing scripts/doctor.sh run was clean
#         (Tier 0, with or without the hand-off printed), or --mcp printed
#         the snowarch hand-off.
# Exit 1: either a setup step failed, or every step succeeded but the closing
#         doctor run still reports problems. The final two lines say which:
#         a step failure is a setup defect, a doctor-only failure is a repo
#         health finding setup does not fix by itself.
# Exit 3: required tooling missing (git / node / npm).
#
# Usage:
#   bash scripts/setup.sh                        # interactive, full bootstrap
#   bash scripts/setup.sh --yes                  # non-interactive; stops at Tier 0
#   bash scripts/setup.sh --tier0                # explicitly stop after S7
#   bash scripts/setup.sh --mcp                  # print the snowarch hand-off (S8) only; changes nothing

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MCP_NAME="servicenow"
SNOWARCH_REPO="https://github.com/farstic/ai-servicenow-architect.git"

errors=0
warns=0

# ---------------------------------------------------------------- reporting --
ok()   { echo "OK: $*"; }
warn() { echo "WARN: $*"; warns=$((warns + 1)); }
fail() { echo "FAIL: $*"; errors=$((errors + 1)); }
skip() { echo "SKIP: $*"; }
step() { echo; echo "== $* =="; }

# --help prints this file's header block (the shebang excluded) — it is the doc.
usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"; }

# ------------------------------------------------------------------- flags ---
ASSUME_YES=false
FORCE_TIER0=false
MCP_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)      ASSUME_YES=true ;;
    --tier0)       FORCE_TIER0=true ;;
    --mcp)         MCP_ONLY=true ;;
    --creds-only)
      echo "FAIL: --creds-only was retired with the previous tooling — credentials are managed by"
      echo "      snowarch: ./snowarch instance set-credentials <label>  (run in the snowarch checkout)."
      echo "      For the full hand-off: bash scripts/setup.sh --mcp"
      exit 1 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "FAIL: unknown option '$1' — run: bash scripts/setup.sh --help"; exit 1 ;;
  esac
  shift
done

if $FORCE_TIER0 && $MCP_ONLY; then
  echo "FAIL: --tier0 and --mcp are contradictory. Pick one."
  exit 1
fi

INTERACTIVE=1
[[ -t 0 ]] || INTERACTIVE=0
$ASSUME_YES && INTERACTIVE=0

# ------------------------------------------------------------------ prompts --
# bash writes `read -p` prompts to STDERR, so these are safe inside $( ).
ask_yn() {  # ask_yn "question" "Y|N"  -> exit 0 = yes
  local q="$1" def="${2:-N}" ans hint
  if [[ "$def" == "Y" ]]; then hint="[Y/n]"; else hint="[y/N]"; fi
  if [[ $INTERACTIVE -eq 0 ]]; then
    [[ "$def" == "Y" ]] && return 0 || return 1
  fi
  read -r -p "$q $hint " ans || ans=""
  ans="${ans:-$def}"
  case "$ans" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# --------------------------------------------------------------- utilities ---
have() { command -v "$1" >/dev/null 2>&1; }

json_ok() { # json_ok <file> -> exit 0 if the file parses as JSON
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" >/dev/null 2>&1
}

run_doctor() { # run_doctor [args...] -> echoes output, returns doctor's status
  if [[ ! -f scripts/doctor.sh ]]; then
    return 127
  fi
  bash scripts/doctor.sh "$@"
}

# ------------------------------------------------------- snowarch hand-off ---
# Printed, never executed. Every command below runs in the snowarch checkout;
# nothing here touches a file outside this repository.
snowarch_handoff() {
  cat <<EOF
The live-instance layer is snowarch: one repository (engine + MCP server) with
the CLI ./snowarch. It registers the MCP server '$MCP_NAME' (tool prefix
mcp__${MCP_NAME}__, 397 tools in a pinned contract) and ships the same roster as
this engine. This script asks for no instance URL and no credential and
registers nothing — credentials live ONLY in the snowarch checkout's store
(.local/instances.json, mode 0600), never in ~/.claude.json, .mcp.json,
environment variables or Git.

  1. Clone snowarch next to this folder and run its bootstrap:
       cd ~/work
       git clone $SNOWARCH_REPO
       cd ai-servicenow-architect
       # run the bootstrap documented in that repository's README

  2. Add your first instance (wizard: label, URL, environment, credentials, preset):
       ./snowarch mode live
     Scripted alternative (the password is read from stdin, never from an argument):
       ./snowarch instance add <label> --url https://<instance>.service-now.com \\
         --env pdi --username <user> --password-stdin --yes
     A 'prod' instance keeps writes locked until it is saved with --ack-prod.

  3. Verify — this is the authoritative check:
       ./snowarch doctor

  4. Start Claude Code IN THE SNOWARCH CHECKOUT. Claude Code reads .mcp.json from
     the session's primary working directory, and snowarch's committed .mcp.json
     is secret-free. Alternatives, both run from that checkout:
       ./snowarch mode live --register local                   # that checkout only
       ./snowarch mode live --register user --ack-user-scope   # LAST RESORT: every
                                                               # project on the machine —
                                                               # including this folder
     ./snowarch mode design removes what snowarch registered. Restart Claude Code
     after any registration change.

Afterwards, 'bash scripts/doctor.sh' here reports what the session advertises.
Coming from the previous tooling (server key 'servicenow-mcp', credentials in
~/.claude.json)? That model is retired — re-register through snowarch. See
SETUP.md, 'Coming from the previous tooling'.
EOF
}

# ============================================= --mcp: the hand-off, nothing else =
if $MCP_ONLY; then
  step "S8  snowarch hand-off (--mcp)"
  snowarch_handoff
  echo
  echo "OK: nothing was changed — live-instance setup happens in the snowarch checkout, not here."
  exit 0
fi

# =============================================================== S1 preflight =
# Hard requirements first, so a missing binary is exit 3 even if doctor.sh is
# not present yet (the two scripts ship together, but never assume it).
step "S1  Preflight"

missing=""
for b in git node npm; do
  have "$b" || missing="$missing $b"
done
if [[ -n "$missing" ]]; then
  echo "FAIL: required tooling missing:$missing"
  echo "      macOS: brew install git node   (npm ships with node)"
  echo "SETUP: aborted — required tooling missing."
  exit 3
fi
ok "host toolchain present (git, node $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null))"

doctor_out="$(run_doctor --tier0 2>&1)"; doctor_rc=$?
if [[ $doctor_rc -eq 127 ]]; then
  warn "scripts/doctor.sh not found — preflight limited to the binary check above."
elif [[ $doctor_rc -eq 3 ]]; then
  echo "$doctor_out"
  echo "SETUP: aborted — doctor reported missing required tooling (exit 3)."
  exit 3
elif [[ $doctor_rc -ne 0 ]]; then
  # Only the "before" problems, not the whole clean report — the closing
  # verification prints the full picture and this would otherwise be the same
  # 35 lines twice in one run.
  echo "$doctor_out" | grep -E '^(FAIL|WARN|DOCTOR):' || true
  echo "NOTE: doctor reported problems (exit $doctor_rc). The steps below are what fix them;"
  echo "      the full report is printed by the closing verification at the end of this run."
else
  echo "$doctor_out" | grep -E '^DOCTOR:' || true
  ok "preflight clean"
fi

# ------------------------------------------------------------ S2 submodule --
step "S2  ServiceNowDocs submodule"
if [[ -d ServiceNowDocs/markdown ]]; then
  skip "ServiceNowDocs already populated"
else
  if [[ ! -d .git && ! -f .git ]]; then
    fail "this is not a git working tree — the ServiceNowDocs submodule cannot be fetched. Re-clone the engine with git (a ZIP download omits submodules)."
  elif git submodule update --init --recursive; then
    # Exits 0 even when there is nothing registered to init, so only claim
    # success if the content actually appeared.
    if [[ -d ServiceNowDocs/markdown ]]; then
      ok "submodule initialised"
    else
      fail "'git submodule update --init' reported success but ServiceNowDocs/markdown is still absent — is .gitmodules present in this clone?"
    fi
  else
    fail "git submodule update --init --recursive failed — check network/SSH access to the docs remote (and that .gitmodules is present)."
  fi
fi

if [[ -d ServiceNowDocs/markdown ]]; then
  ok "ServiceNowDocs/markdown present"
  branch="$(git -C ServiceNowDocs rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  if [[ "$branch" == "australia" ]]; then
    ok "ServiceNowDocs on the australia branch"
  else
    echo "NOTE: ServiceNowDocs is on '$branch', expected 'australia' — checking it out."
    if git -C ServiceNowDocs checkout australia >/dev/null 2>&1; then
      ok "ServiceNowDocs switched to australia"
    else
      warn "could not check out 'australia' in ServiceNowDocs (still on '$branch'). Citations may not resolve; fix with: git -C ServiceNowDocs fetch origin australia && git -C ServiceNowDocs checkout australia"
    fi
  fi
else
  fail "ServiceNowDocs/markdown still missing — the engine will run, but every documentation citation will be unverifiable."
fi

# ---------------------------------------------------------------- S3 hooks --
step "S3  Git hooks"
# Setting core.hooksPath succeeds even when the directory does not exist —
# git then silently runs no hooks at all. Verify the hook is really there
# rather than reporting "guards armed" on the strength of an exit code.
if git config core.hooksPath .githooks; then
  if [[ -x .githooks/pre-commit ]]; then
    ok "core.hooksPath = .githooks (pre-commit guards armed)"
  elif [[ -f .githooks/pre-commit ]]; then
    if chmod +x .githooks/pre-commit 2>/dev/null; then
      ok "core.hooksPath = .githooks (pre-commit made executable — guards armed)"
    else
      fail ".githooks/pre-commit is not executable and chmod failed — the governance guards will never run."
    fi
  else
    fail "core.hooksPath is set to .githooks but .githooks/pre-commit does not exist — no governance guard is armed. Incomplete clone?"
  fi
else
  fail "could not set core.hooksPath — is this a git working tree? (a ZIP download is not: re-clone with git)"
fi

# -------------------------------------------------------------- S4 mirrors --
step "S4  agents/ + skills/ mirrors"
if [[ -f scripts/sync-agents-skills.sh ]]; then
  if bash scripts/sync-agents-skills.sh; then
    ok "mirrors in sync"
  else
    fail "scripts/sync-agents-skills.sh failed"
  fi
else
  fail "scripts/sync-agents-skills.sh missing — incomplete clone?"
fi

# ---------------------------------------------------------- S5 context-mode --
step "S5  context-mode (optional)"
STRIP_HOOKS=false
if npm ls -g context-mode >/dev/null 2>&1; then
  skip "context-mode already installed globally"
else
  echo "context-mode is an optional MCP server that keeps large command output"
  echo "out of the context window. .claude/settings.example.json wires three"
  echo "hooks to it; without the package those hooks point at nothing."
  do_install=false
  if $ASSUME_YES; then
    do_install=true
  elif ask_yn "Install context-mode globally?" "N"; then
    do_install=true
  fi
  if $do_install; then
    if npm install -g context-mode; then
      ok "context-mode installed globally"
    else
      warn "npm install -g context-mode failed — continuing without it."
      STRIP_HOOKS=true
    fi
  else
    warn "context-mode not installed — the hooks in .claude/settings.json would point at a package that is not present."
    # Removing a hooks block is destructive and irreversible from the user's
    # point of view, so it is NEVER auto-answered: a non-interactive run
    # leaves the file exactly as it found it.
    if [[ $INTERACTIVE -eq 0 ]]; then
      echo "  Non-interactive — leaving .claude/settings.json untouched. Install context-mode"
      echo "  (npm install -g context-mode) or re-run interactively to drop the hooks block."
    elif ask_yn "  Write .claude/settings.json with the hooks block removed instead?" "Y"; then
      STRIP_HOOKS=true
      echo "  Hooks will be omitted. Re-run this script after installing context-mode to restore them."
    else
      echo "  Keeping the hooks block. Install context-mode later with: npm install -g context-mode"
    fi
  fi
fi

# --------------------------------------------------------- S6 settings.json --
step "S6  .claude/settings.json"
SETTINGS=".claude/settings.json"
EXAMPLE=".claude/settings.example.json"

MUTATE_OK=true
if [[ -f "$SETTINGS" ]]; then
  # Back up only when something is actually about to change, so a no-op
  # re-run does not litter .backups/ with identical copies.
  pending_change=false
  $STRIP_HOOKS && pending_change=true
  grep -q '/path/to/your' "$SETTINGS" 2>/dev/null && pending_change=true
  if $pending_change; then
    mkdir -p .backups
    stamp="$(date +%Y%m%d%H%M%S)"
    if cp "$SETTINGS" ".backups/settings.json.$stamp"; then
      ok "backed up existing settings.json -> .backups/settings.json.$stamp"
    else
      fail "could not back up $SETTINGS — refusing to modify it."
      MUTATE_OK=false   # no unbacked-up mutation, ever
    fi
  else
    skip "$SETTINGS already configured — nothing to change, no backup needed"
  fi
elif [[ -f "$EXAMPLE" ]]; then
  if cp "$EXAMPLE" "$SETTINGS"; then
    ok "created $SETTINGS from settings.example.json"
  else
    fail "could not create $SETTINGS from $EXAMPLE"
  fi
else
  fail "$EXAMPLE missing — cannot create $SETTINGS"
fi

if [[ -f "$SETTINGS" ]]; then
  if $STRIP_HOOKS && ! $MUTATE_OK; then
    fail "refusing to strip the hooks block from $SETTINGS — no verified backup was taken."
  elif $STRIP_HOOKS; then
    tmp_s="$(mktemp)"
    if node -e '
      const fs=require("fs");
      const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      delete j.hooks;
      fs.writeFileSync(process.argv[2], JSON.stringify(j,null,2)+"\n");
    ' "$SETTINGS" "$tmp_s" 2>/dev/null; then
      mv "$tmp_s" "$SETTINGS"
      ok "hooks block removed from $SETTINGS (context-mode not installed)"
    else
      rm -f "$tmp_s"
      fail "could not strip the hooks block from $SETTINGS"
    fi
  fi

  if grep -q '/path/to/your' "$SETTINGS" 2>/dev/null && ! $MUTATE_OK; then
    fail "refusing to substitute placeholders in $SETTINGS — no verified backup was taken."
  elif grep -q '/path/to/your' "$SETTINGS" 2>/dev/null; then
    NPM_PREFIX="$(dirname "$(dirname "$(npm root -g 2>/dev/null)")")"
    if [[ -z "$NPM_PREFIX" || "$NPM_PREFIX" == "." || "$NPM_PREFIX" == "/" ]]; then
      fail "could not resolve the npm global prefix (npm root -g) — leave $SETTINGS placeholders and fix by hand."
    elif [[ "$NPM_PREFIX" == *"#"* ]]; then
      fail "npm global prefix contains '#' ($NPM_PREFIX) — substitute the placeholder by hand."
    else
      # Escape the sed replacement metacharacters. An unescaped '&' expands to
      # the whole match and a stray backslash is undefined behaviour — both
      # would write a WRONG path while sed still exits 0.
      NPM_PREFIX_ESC="$(printf '%s' "$NPM_PREFIX" | sed -e 's/[\\&]/\\&/g')"
      tmp_s="$(mktemp)"
      if sed "s#/path/to/your/npm-global#$NPM_PREFIX_ESC#g" "$SETTINGS" > "$tmp_s" && mv "$tmp_s" "$SETTINGS"; then
        ok "placeholder resolved -> $NPM_PREFIX"
      else
        rm -f "$tmp_s"
        fail "placeholder substitution failed in $SETTINGS"
      fi
    fi
  else
    skip "no /path/to/your placeholder left in $SETTINGS"
  fi

  # Verify: parses, no placeholder, every hook target exists on disk.
  if json_ok "$SETTINGS"; then
    ok "$SETTINGS parses as JSON"
  else
    fail "$SETTINGS does not parse as JSON — restore from .backups/ and retry."
  fi
  if grep -q '/path/to/your' "$SETTINGS" 2>/dev/null; then
    fail "$SETTINGS still contains a /path/to/your placeholder."
  fi

  hook_targets="$(node -e '
    const fs=require("fs");
    let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e) { process.exit(2); }
    const out=[];
    for (const ev of Object.keys(j.hooks||{})) {
      for (const m of (j.hooks[ev]||[])) {
        for (const h of (m.hooks||[])) {
          const c=String(h.command||"");
          const mt=c.match(/(^|[\s"'"'"'])(\/[^"'"'"'\s]+)/);
          out.push(ev+"\t"+(mt?mt[2]:""));
        }
      }
    }
    process.stdout.write(out.join("\n"));
  ' "$SETTINGS" 2>/dev/null)"

  if [[ -z "$hook_targets" ]]; then
    skip "no hooks configured in $SETTINGS — nothing to verify"
  else
    while IFS=$'\t' read -r ev target; do
      [[ -z "${ev:-}" ]] && continue
      if [[ -z "$target" ]]; then
        warn "hook $ev has no absolute path token — cannot verify it."
      elif [[ -e "$target" ]]; then
        ok "hook $ev -> $target"
      else
        fail "hook $ev target does not exist: $target"
      fi
    done <<< "$hook_targets"
  fi
fi

# ------------------------------------------------------------ S7 MODE GATE --
step "S7  Mode gate"
echo "The engine runs in two modes:"
echo
echo "  Tier 0 — design-only. Everything above is all you need. The full"
echo "           specialist roster, the governance protocol and every design"
echo "           deliverable work with NO ServiceNow instance and NO"
echo "           credentials. This is a supported, complete configuration."
echo
echo "  Live   — adds the snowarch MCP server ('$MCP_NAME') so the engine can"
echo "           read and (where the instance's flags allow it) write real"
echo "           platform data. Configured in the snowarch checkout — this"
echo "           script only prints the steps; it asks for no URL or credential."
echo

want_live=false
if $FORCE_TIER0; then
  # --tier0 is a decision, not a suggestion: do not re-open the question.
  echo "--tier0 given — stopping here."
elif [[ $INTERACTIVE -eq 0 ]]; then
  echo "Non-interactive (--yes or no TTY) — stopping at Tier 0 by design."
elif ask_yn "Print the snowarch steps for connecting a live instance?" "N"; then
  want_live=true
fi

echo
ok "engine ready in Tier 0 (design-only). No ServiceNow instance is required for design work."
if ! $want_live; then
  echo "Run 'bash scripts/setup.sh --mcp' at any time to print the live-instance steps."
fi
echo
step "S7  Closing verification"
dout="$(run_doctor --tier0 2>&1)"; drc=$?
doctor_ran=true
if [[ $drc -eq 127 ]]; then
  warn "scripts/doctor.sh not found — skipping closing verification."
  drc=0
  doctor_ran=false
else
  echo "$dout"
fi
echo
echo "SETUP: Tier 0 — setup steps: $errors failure(s), $warns warning(s);" \
     "closing health check: $($doctor_ran && { [[ $drc -eq 0 ]] && echo clean || echo "problems found (doctor exit $drc)"; } || echo "NOT RUN (scripts/doctor.sh absent)")."
if [[ $errors -gt 0 ]]; then
  echo "FAIL: a setup step failed — see the FAIL lines above and re-run this script."
  exit 1
fi
if [[ $drc -ne 0 ]]; then
  echo "OK: every setup step succeeded — the engine IS usable in Tier 0 (design-only)."
  echo "FAIL: but scripts/doctor.sh still reports problems (its FAIL lines above)."
  echo "      These are repo-health findings setup does not fix by itself"
  echo "      (e.g. dead ServiceNowDocs citations). Address them, then re-run"
  echo "      'bash scripts/doctor.sh --tier0' to confirm a clean bill of health."
  exit 1
fi
echo "OK: setup complete (Tier 0, design-only)."

# ------------------------------------------------------ S8 snowarch hand-off --
if $want_live; then
  step "S8  snowarch hand-off"
  snowarch_handoff
fi
exit 0
