#!/usr/bin/env bash
# ThinkTank — loop-mode guard (PreToolUse).
#
# Base behaviour: in an unattended run, irreversible and outward-facing actions
# are denied so the run has to write them to its triage queue for a human.
# On top of that sits the Autonomy Grant — a human-signed, expiring, scoped file
# that opens a NAMED corridor (feature-branch push, PR create, PR merge into a
# granted base, an exactly-allowlisted deploy command, an allowlisted workflow
# dispatch) and nothing else.
#
# The grant never widens the never-grantable surface (section A), and the guard
# FAILS CLOSED: anything it cannot positively verify is denied.
#
# DESIGN NOTE (written after an adversarial review found six confirmed
# bypasses): a hook can only ever string-match one command line — it cannot
# parse a shell, resolve variables, or follow a redirect. So the corridor no
# longer tries to guess what is dangerous. It demands a NARROW COMMAND FORM and
# denies everything else:
#   * the command must START with the verb (no `cd … &&`, no `git -C`),
#   * it must be ONE command (no &&, ||, ;, |, backticks, $( ), redirects),
#   * only allowlisted FLAGS may appear (kills -f, --force, --repo, --admin,
#     --mirror, --delete and every flag nobody thought of),
#   * quoted segments are neutralised before flag parsing, so a PR title
#     containing "--force" does not deny the happy path.
# Blocklists remain only as the outer no-grant net (sections A and D).
#
# NO-OP unless CLAUDE_TT_LOOP_MODE=1. Interactive sessions are untouched.
#   CLAUDE_TT_LOOP_MODE=1 CLAUDE_TT_RUN_ID=<id> claude -p "..."
#
# Grant:   ${CLAUDE_TT_GRANT_DIR:-~/.claude/loop-grants}/<run-id>.json
# Contract: ~/.claude/skills/thinktank/references/delivery-loop.md §3, §6
#           ~/.claude/skills/thinktank/references/loop-engineering.md §6a, §11
set -uo pipefail

[ "${CLAUDE_TT_LOOP_MODE:-0}" = "1" ] || exit 0

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // ""')

deny() {
  jq -Rn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

QUEUE_HINT="Queue it in docs/loop-triage/<run-id>.md for human triage — a schedule is not authorization. When in doubt: queue."
FORM_HINT="Gated actions must be issued as ONE plain command that starts with the verb, with no chaining, substitution or redirection, and only the flags the corridor allows."

# ---------------------------------------------------------------------------
# 0. Never-grantable TOOL classes.
# ---------------------------------------------------------------------------

# Scheduling / self-perpetuation: a loop may not create its own successor.
case "$tool" in
  CronCreate|CronDelete|ScheduleWakeup|mcp__scheduled-tasks__create_scheduled_task|mcp__scheduled-tasks__update_scheduled_task|mcp__scheduled-tasks__delete_scheduled_task)
    deny "Loop mode: creating or changing schedules is not permitted inside an unattended run (a loop must not spawn its own successor). Write the proposal to the triage queue instead."
    ;;
esac

# Self-modification: the harness that gates the next run is off limits — and so
# is the grant that authorizes this one. A loop that can mint its own
# authorization has none.
case "$tool" in
  Write|Edit|NotebookEdit)
    path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // ""')
    case "$path" in
      */.claude/loop-grants/*)
        deny "Loop mode: a run may never write its own Autonomy Grant ($path). The grant is minted interactively by a human before launch. Queue the request for a wider grant instead."
        ;;
      */.claude/skills/*|*/.claude/hooks/*|*/.claude/agents/*|*/.claude/commands/*|*/.claude/plugins/*|*/CLAUDE.md|*/settings.json|*/settings.local.json|*/.mcp.json|*/keybindings.json)
        deny "Loop mode: self-modification of the harness ($path) is forbidden inside an unattended run. Hill-climbing proposals go to the triage queue and land only in an interactive session, as an approved diff."
        ;;
    esac
    ;;
esac

# 0b. Tool-name classification. Reached for every tool once the settings.json
# matcher is "*". Outward-facing tools are denied by NAME, because a hook that
# only inspects shell commands governs one tool and calls it a gate.
# Deliberately NOT denied: TaskCreate (the triage queue's second half needs it),
# PushNotification and SendUserFile (the escape hatch), and the in-app Browser
# pane (rung 4's exploratory half runs in a sandbox). The user's real Chrome and
# desktop ARE denied — those carry live credentials.
DENY_TOOLS='^(Artifact|RemoteTrigger|SendMessage|mcp__ccd_session_mgmt__send_message|mcp__journal__(journal_(create|update|delete|publish|unpublish|archive|generate.*)|hero_.*)|mcp__plugin_azure_azure__(deploy|azd|extension_.*)|mcp__(claude-in-chrome|computer-use)__.*)$'
if printf '%s' "$tool" | grep -Eq "$DENY_TOOLS"; then
  deny "Loop mode: tool '$tool' is outward-facing or acts with live credentials, and is never grantable through a tool call. No Autonomy Grant widens this. $QUEUE_HINT"
fi

[ "$tool" = "Bash" ] || exit 0
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
cmd_norm=$(printf '%s' "$cmd" | tr '\n' ' ' | tr -s '[:space:]' ' ' | sed -E 's/^ +| +$//g')
# Quoted spans neutralised: flag and token parsing must not trip over a PR
# title, and a quoted string must not be able to smuggle a flag.
unquoted=$(printf '%s' "$cmd_norm" | sed -E 's/"[^"]*"/QUOTED/g' | sed -E "s/'[^']*'/QUOTED/g")
# Quote CHARACTERS deleted: the blocklists must see `npm publ"ish"` as `npm publish`.
# Opposite direction to $unquoted, and both are needed — spans for flag parsing,
# characters for keyword matching.
dequoted=$(printf '%s' "$cmd_norm" | tr -d "\"'")

# Form rule for EVERY Bash call in loop mode, not only for granted ones. A hook
# cannot parse a shell, so a command that chains, substitutes or redirects is
# unverifiable by construction — and `cat deploy.sh | bash`, `eval "$CMD"` and
# `echo x > /srv/www/index.html` are exactly how a blocklist gets walked around.
if printf '%s' "$unquoted" | grep -Eq '(&&|\|\||[;|`]|\$\(|\$\{|>|<)'; then
  deny "Loop mode: '$cmd_norm' chains, substitutes or redirects, which a string-matching guard cannot verify. Issue one plain command per call; use the Read/Grep tools for inspection instead of pipes. $QUEUE_HINT"
fi

# ---------------------------------------------------------------------------
# A. Never grantable — denied even with a valid grant.
# ---------------------------------------------------------------------------

# A0. The harness itself, at the SHELL level. Section 0 only covers the
# file-editing tools; without this an ordinary redirect rewrites or deletes the
# guard, and every later call in the run is ungated.
harness=(
  '\.claude/(hooks|skills|agents|commands|plugins|loop-grants|loop-checker)'
  'loop-grants'
  'loop-checker'
  '\.claude/settings(\.local)?\.json'
  '(^|[^A-Za-z0-9_-])CLAUDE\.md'
  '(^|[^A-Za-z0-9_-])\.mcp\.json'
  'keybindings\.json'
)
for p in "${harness[@]}"; do
  if printf '%s' "$cmd_norm" | grep -Eqi -e "$p"; then
    deny "Loop mode: '$cmd_norm' touches the harness or the run's own authorization (/$p/). Skills, hooks, agents, commands, plugins, CLAUDE.md, settings, the grant and the checker record are never reachable from a shell inside an unattended run — no grant widens this. Hill-climbing proposals go to the triage queue and land only in an interactive session, as an approved diff."
  fi
done

absolute=(
  # Global options that move git to another repository or override config
  # (-c core.hooksPath=…) — a loop works inside its granted repo, never beside it.
  'git[[:space:]]+-(C|c)([[:space:]]|=)'
  'git[[:space:]]+--(git-dir|work-tree|exec-path|namespace)([[:space:]]|=)'
  'git[[:space:]]+.*--force'
  'git[[:space:]]+push([[:space:]]+[^[:space:]]+)*[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$)'
  'git[[:space:]]+reset[[:space:]]+--hard'
  '(npm|yarn|pnpm|cargo)[[:space:]]+publish'
  'twine[[:space:]]+upload'
  'docker[[:space:]]+push'
  'gh[[:space:]]+(release|secret|repo[[:space:]]+delete|alias)'
  'gh[[:space:]]+api[[:space:]]+.*(-X|--method)[[:space:]=]*(POST|PUT|PATCH|DELETE)'
  'gh[[:space:]]+api[[:space:]]+(.*[[:space:]])?-(f|F)[[:space:]=]'
  'gh[[:space:]]+run[[:space:]]+(rerun|cancel|delete)'
  'terraform[[:space:]]+destroy'
  'kubectl[[:space:]]+delete'
  '(az|aws|gcloud)[[:space:]]+.*(delete|purge|[[:space:]]rm[[:space:]])'
  'crontab'
  '(systemctl|launchctl)'
  # Arbitrary execution: the vector every blocklist loses to. A repo's own
  # ./deploy.sh is invisible to any enumeration of known deploy tools.
  '(^|[[:space:]])(eval|exec|source)([[:space:]]|$)'
  '(^|[[:space:]])(bash|sh|zsh|ksh)[[:space:]]+([^-][^[:space:]]*|-c)'
  '(^|[[:space:]])\./[^[:space:]]*\.(sh|bash|zsh|py|rb|pl)([[:space:]]|$)'
  'rm[[:space:]]+-[a-zA-Z]*[rf]'
  'curl[[:space:]]+.*(-X|--request)[[:space:]=]*(POST|PUT|PATCH|DELETE)'
  'curl[[:space:]]+(.*[[:space:]])?(-d|--data|--data-raw|--data-binary|-F|--form|-T|--upload-file)([[:space:]=]|$)'
)
for p in "${absolute[@]}"; do
  if printf '%s' "$dequoted" | grep -Eqi -e "$p"; then
    deny "Loop mode: '$cmd_norm' matches a NEVER-GRANTABLE action (/$p/). No Autonomy Grant widens this. $QUEUE_HINT"
  fi
done

# ---------------------------------------------------------------------------
# B. Load the Autonomy Grant, if one is valid for this run.
# ---------------------------------------------------------------------------
GRANT_DIR="${CLAUDE_TT_GRANT_DIR:-$HOME/.claude/loop-grants}"
run_id="${CLAUDE_TT_RUN_ID:-}"
grant=""

if [ -n "$run_id" ] && [ -r "$GRANT_DIR/$run_id.json" ]; then
  if jq -e . >/dev/null 2>&1 <"$GRANT_DIR/$run_id.json"; then
    exp=$(jq -r '.expires_at // ""' <"$GRANT_DIR/$run_id.json")
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Fail closed on any format we cannot compare lexicographically.
    if printf '%s' "$exp" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'; then
      [[ "$exp" > "$now" ]] && grant="$GRANT_DIR/$run_id.json"
    fi
  fi
fi

g() { [ -n "$grant" ] && jq -r "$1" <"$grant" 2>/dev/null || printf ''; }

is_protected() {
  printf '%s' "$1" | grep -Eqi '^(main|master|production|prod|release([/-].*)?|staging-prod)$'
}

in_merge_targets() {
  local want="$1" t
  while IFS= read -r t; do [ "$t" = "$want" ] && return 0; done < <(g '.merge_targets[]? // empty')
  return 1
}

# The corridor accepts one plain command and nothing else. A hook cannot parse a
# shell, so anything that could hide a second action is denied outright.
single_command() {
  printf '%s' "$unquoted" | grep -Eq '(&&|\|\||[;|`]|\$\(|\$\{|>|<)' && return 1
  return 0
}

# Must start with the verb: kills `cd /elsewhere && …` and `git -C /other push`.
starts_with() {
  case "$cmd_norm" in "$1"*) return 0 ;; *) return 1 ;; esac
}

# Only allowlisted flags. `--base=dev` is compared as `--base`.
flags_ok() {
  local allow="$1" tail="$2" t
  for t in $tail; do
    case "$t" in
      -*) printf '%s' "${t%%=*}" | grep -Eq "^($allow)$" || { BAD_FLAG="$t"; return 1; } ;;
    esac
  done
  return 0
}

# Bounded background execution — the hook must never outlive its own timeout.
# Returns 124 on timeout so the caller can fail closed.
run_bounded() {
  local secs="$1"; shift
  local out; out=$(mktemp)
  "$@" >"$out" 2>/dev/null &
  local pid=$! i=0 limit=$((secs * 10))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$i" -ge "$limit" ]; then kill -9 "$pid" 2>/dev/null; rm -f "$out"; return 124; fi
    sleep 0.1; i=$((i + 1))
  done
  wait "$pid"; local rc=$?
  cat "$out"; rm -f "$out"
  return $rc
}

# ---------------------------------------------------------------------------
# C. Grantable corridor — only reached with a valid, unexpired grant.
# ---------------------------------------------------------------------------
if [ -n "$grant" ]; then
  prefix=$(g '.branch_prefix // ""')

  # C1. Local deploy command: exact allowlist match on the whole command.
  # Empty deploy_commands (the on-merge default, where the pipeline deploys)
  # means no local deploy command is ever permitted. The human wrote these
  # strings, so they are compared verbatim rather than parsed.
  while IFS= read -r allowed; do
    [ -z "$allowed" ] && continue
    allowed_norm=$(printf '%s' "$allowed" | tr -s '[:space:]' ' ' | sed -E 's/^ +| +$//g')
    [ "$cmd_norm" = "$allowed_norm" ] && exit 0
  done < <(g '.deploy_commands[]? // empty')

  # C1b. GitHub-initiated deploy: gh workflow run <workflow> --ref <branch>.
  # Only workflows the grant names, only refs the grant covers, and no --field
  # inputs (a staging workflow can otherwise be told to target production).
  if starts_with "gh workflow run"; then
    single_command || deny "Loop mode: $FORM_HINT $QUEUE_HINT"
    tail=$(printf '%s' "$unquoted" | sed -E 's/^gh workflow run[[:space:]]*//')
    flags_ok '--ref|-r' "$tail" || deny "Loop mode: flag '$BAD_FLAG' is not permitted on a granted workflow dispatch (only --ref). Workflow inputs could redirect a staging workflow at production. $QUEUE_HINT"
    wf=$(printf '%s' "$tail" | awk '{print $1}')
    case "$wf" in ""|-*) deny "Loop mode: 'gh workflow run' must name the workflow first so the guard can check it against the grant. $QUEUE_HINT" ;; esac
    wf_ok=1
    while IFS= read -r w; do [ "$w" = "$wf" ] && wf_ok=0; done < <(g '.deploy_workflows[]? // empty')
    [ "$wf_ok" -eq 0 ] || deny "Loop mode: workflow '$wf' is not in the grant's deploy_workflows. $QUEUE_HINT"
    wref=$(printf '%s' "$unquoted" | grep -oE -- '(--ref|-r)[= ]+[A-Za-z0-9._/-]+' | head -1 | sed -E 's/(--ref|-r)[= ]+//')
    [ -n "$wref" ] || deny "Loop mode: 'gh workflow run' must state --ref explicitly so the guard can check what would be deployed. $QUEUE_HINT"
    if is_protected "$wref"; then
      deny "Loop mode: dispatching '$wf' against protected ref '$wref' is never granted. $QUEUE_HINT"
    fi
    if ! in_merge_targets "$wref" && { [ -z "$prefix" ] || ! printf '%s' "$wref" | grep -q -- "^$prefix"; }; then
      deny "Loop mode: ref '$wref' is neither a granted merge target nor inside the grant's branch prefix ('$prefix'). $QUEUE_HINT"
    fi
    exit 0
  fi

  # C2. git push of a feature branch matching the grant's prefix.
  if starts_with "git push"; then
    single_command || deny "Loop mode: $FORM_HINT $QUEUE_HINT"
    tail=$(printf '%s' "$unquoted" | sed -E 's/^git push[[:space:]]*//')
    flags_ok '-u|--set-upstream|-q|--quiet|--porcelain' "$tail" || deny "Loop mode: flag '$BAD_FLAG' is not permitted on a granted push (only -u/--set-upstream/-q/--quiet/--porcelain). Force, mirror and delete pushes are never grantable. $QUEUE_HINT"
    positional=()
    for tok in $tail; do
      case "$tok" in -*) continue ;; esac
      positional+=("$tok")
    done
    if [ "${#positional[@]}" -ne 2 ]; then
      deny "Loop mode: '$cmd_norm' is an ambiguous push. Under a grant, push exactly one named branch to one named remote: git push -u origin <branch>. $QUEUE_HINT"
    fi
    remote="${positional[0]}"
    ref="${positional[1]}"
    case "$remote" in *:*|*/*|*@*) deny "Loop mode: '$remote' is a URL, not a named remote. A granted push goes to a configured remote of the granted repository. $QUEUE_HINT" ;; esac
    allowed_remote=$(g '.remote // ""'); [ -n "$allowed_remote" ] || allowed_remote="origin"
    if [ "$remote" != "$allowed_remote" ]; then
      deny "Loop mode: remote '$remote' is not the grant's remote ('$allowed_remote'). A second remote is a second repository. $QUEUE_HINT"
    fi
    case "$ref" in *:*|+*) deny "Loop mode: refspec pushes ('$ref') cannot be verified against the grant. Push a plain branch name. $QUEUE_HINT" ;; esac
    if is_protected "$ref" || in_merge_targets "$ref"; then
      deny "Loop mode: pushing directly to '$ref' is not granted — that branch is a merge target or protected. Open a PR from a feature branch instead. $QUEUE_HINT"
    fi
    if [ -z "$prefix" ] || ! printf '%s' "$ref" | grep -q -- "^$prefix"; then
      deny "Loop mode: branch '$ref' is outside the grant's branch prefix ('$prefix'). $QUEUE_HINT"
    fi
    exit 0
  fi

  # C3. gh pr create — the base must be stated and granted.
  if starts_with "gh pr create"; then
    single_command || deny "Loop mode: $FORM_HINT $QUEUE_HINT"
    tail=$(printf '%s' "$unquoted" | sed -E 's/^gh pr create[[:space:]]*//')
    flags_ok '--base|-B|--title|-t|--body|-b|--body-file|-F|--head|-H|--draft|-d|--label|-l|--assignee|-a|--reviewer|-r|--fill|--fill-verbose|--no-maintainer-edit' "$tail" \
      || deny "Loop mode: flag '$BAD_FLAG' is not permitted on a granted PR create. In particular --repo/-R would point the action at a repository the grant does not cover. $QUEUE_HINT"
    base=$(printf '%s' "$unquoted" | grep -oE -- '(--base|-B)[= ]+[A-Za-z0-9._/-]+' | head -1 | sed -E 's/(--base|-B)[= ]+//')
    if [ -z "$base" ]; then
      deny "Loop mode: 'gh pr create' must state --base explicitly so the guard can check it against the grant's merge targets. $QUEUE_HINT"
    fi
    if is_protected "$base" || ! in_merge_targets "$base"; then
      deny "Loop mode: base branch '$base' is not in the grant's merge targets. $QUEUE_HINT"
    fi
    exit 0
  fi

  # C4. gh pr merge — the PR's REAL base is resolved via gh, never trusted from
  # the command line, and the merge budget is enforced.
  if starts_with "gh pr merge"; then
    single_command || deny "Loop mode: $FORM_HINT $QUEUE_HINT"
    tail=$(printf '%s' "$unquoted" | sed -E 's/^gh pr merge[[:space:]]*//')
    flags_ok '--squash|-s|--merge|-m|--rebase|-r|--delete-branch|-d|--subject|-t|--body|-b|--body-file|-F' "$tail" \
      || deny "Loop mode: flag '$BAD_FLAG' is not permitted on a granted merge. --admin would bypass branch protection, --repo/-R would target another repository, and --auto exits 0 without producing a merge commit — the run would believe it merged. $QUEUE_HINT"
    printf '%s' "$tail" | grep -Eq -- '(^| )(--squash|-s|--merge|-m|--rebase|-r)( |$)' \
      || deny "Loop mode: 'gh pr merge' must state an explicit strategy (--squash / --merge / --rebase). gh refuses a strategyless merge in a non-interactive run, and the failed attempt would still burn a granted merge. $QUEUE_HINT"
    command -v gh >/dev/null 2>&1 || deny "Loop mode: gh is unavailable, so the PR's base branch cannot be verified against the grant. Failing closed. $QUEUE_HINT"

    pr=$(printf '%s' "$tail" | grep -oE '^[0-9]+' | head -1)
    [ -n "$pr" ] || deny "Loop mode: 'gh pr merge' must name the PR number explicitly so the guard can resolve its base branch. $QUEUE_HINT"

    repo_path=$(g '.repo_path // ""')
    [ -n "$repo_path" ] && [ -d "$repo_path" ] || deny "Loop mode: the grant's repo_path is missing or not a directory, so the guard cannot resolve the PR inside the granted repository. Failing closed. $QUEUE_HINT"
    base=$(cd "$repo_path" 2>/dev/null && run_bounded 4 gh pr view "$pr" --json baseRefName -q .baseRefName)
    rc=$?
    if [ $rc -ne 0 ] || [ -z "$base" ]; then
      deny "Loop mode: could not resolve the base branch of PR #$pr in $repo_path (rc=$rc). The guard fails closed rather than trusting the command line. $QUEUE_HINT"
    fi
    base=$(printf '%s' "$base" | tr -d '[:space:]')
    if is_protected "$base" || ! in_merge_targets "$base"; then
      deny "Loop mode: PR #$pr targets '$base', which the grant does not permit as a merge target. $QUEUE_HINT"
    fi

    max=$(g '.max_merges // 0'); [ -n "$max" ] || max=0
    counter="$GRANT_DIR/$run_id.merges"
    count=$(cat "$counter" 2>/dev/null || printf '0')
    printf '%s' "$count" | grep -Eq '^[0-9]+$' || count=0
    if [ "$count" -ge "$max" ]; then
      deny "Loop mode: merge budget exhausted ($count/$max granted merges). That is a budget exit — report it with evidence instead of continuing. $QUEUE_HINT"
    fi
    printf '%s' "$((count + 1))" >"$counter" 2>/dev/null
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# D. Everything else irreversible or outward-facing — the outer no-grant net.
# ---------------------------------------------------------------------------
patterns=(
  'git[[:space:]]+push'
  'gh[[:space:]]+pr[[:space:]]+(create|merge)'
  'gh[[:space:]]+workflow[[:space:]]+(run|enable|disable)'
  'terraform[[:space:]]+apply'
  'kubectl[[:space:]]+(apply|rollout)'
  '(az|aws|gcloud)[[:space:]]+.*(deploy|create)'
  'artisan[[:space:]]+migrate'
  '(npm|yarn|pnpm|bun)[[:space:]]+run[[:space:]]+[^[:space:]]*deploy'
  'make[[:space:]]+[^[:space:]]*deploy'
  '(vercel|netlify|fly|heroku|railway)[[:space:]]+.*(deploy|--prod|releases)'
  '(ssh|scp|rsync)[[:space:]]+.*@'
)
for p in "${patterns[@]}"; do
  if printf '%s' "$dequoted" | grep -Eqi -e "$p"; then
    if [ -n "$grant" ]; then
      deny "Loop mode: '$cmd_norm' matches an irreversible action (/$p/) that this run's Autonomy Grant does not cover in this form. $FORM_HINT $QUEUE_HINT"
    fi
    deny "Loop mode: '$cmd_norm' matches an irreversible or outward-facing action (/$p/) and no valid Autonomy Grant is in force for this run. $QUEUE_HINT"
  fi
done

exit 0
