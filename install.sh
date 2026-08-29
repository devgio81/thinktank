#!/usr/bin/env bash
#
# install.sh - set up ThinkTank on this machine.
#
# Nine steps, in order:
#   1. check prerequisites (including a running Docker daemon, not just the CLI)
#   2. create .env and generate an API key, without rotating an existing one
#   3. start the Qdrant container
#   4. poll for readiness
#   5. create the memory collection
#   6. copy skills, agents and hooks into ~/.claude
#   7. register the MCP server
#   8. print the settings.json hook block for you to merge
#   9. smoke-test the collection with a real write, read and delete
#
# Re-running the script is safe. It creates what is missing, leaves what is
# already there, and backs up any file it would otherwise overwrite.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"
CLAUDE_HOME="${CLAUDE_HOME:-${HOME}/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# --- output helpers --------------------------------------------------------
step()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
log()   { printf '  %s\n' "$*"; }
ok()    { printf '  [ok]   %s\n' "$*"; }
warn()  { printf '  [warn] %s\n' "$*"; }
fail()  { printf '\n  [fail] %s\n\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
install.sh - set up ThinkTank on this machine.

Nine steps, in order:
  1. check prerequisites (including a running Docker daemon, not just the CLI)
  2. create .env and generate an API key, without rotating an existing one
  3. start the Qdrant container
  4. poll for readiness
  5. create the memory collection
  6. copy skills, agents and hooks into ~/.claude
  7. register the MCP server
  8. print the settings.json hook block for you to merge
  9. smoke-test the collection with a real write, read and delete

Re-running the script is safe. It creates what is missing, leaves what is
already there, and backs up any file it would otherwise overwrite.

Usage:
  ./install.sh            full setup
  ./install.sh --help     this text

The installer takes no other options. Settings live in .env.
USAGE
}

# --- arguments -------------------------------------------------------------
# An unrecognised argument is an error. Ignoring it and running the full
# installation regardless is the worst of both worlds: the user asked for
# something specific and got a complete install instead.
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0 ;;
    *)
      usage >&2
      fail "Unknown argument: '$1'. This installer takes no options other than --help." ;;
  esac
done

printf '\n\033[1mThinkTank installer\033[0m\n'
log "repo:        ${REPO_ROOT}"
log "claude home: ${CLAUDE_HOME}"

# ===========================================================================
# 1. Prerequisites
# ===========================================================================
step "1/9  Prerequisites"

missing=""
for cmd in docker curl; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    ok "${cmd} found"
  else
    warn "${cmd} is missing"
    missing="${missing} ${cmd}"
  fi
done

if [ -n "${missing}" ]; then
  fail "Missing required command(s):${missing}. Install them and run this script again."
fi

# `docker compose` (v2 plugin) is what docker-compose.yml is written for.
if docker compose version >/dev/null 2>&1; then
  ok "docker compose (v2) found"
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  warn "Only the standalone docker-compose (v1) was found. It should work, but v2 is what this setup is tested against."
  COMPOSE="docker-compose"
else
  fail "Neither 'docker compose' nor 'docker-compose' is available. Install the Docker Compose v2 plugin: https://docs.docker.com/compose/install/"
fi

# The CLI being on PATH says nothing about the daemon. `docker info` talks to
# the daemon, so this is the check that actually catches "Docker Desktop is not
# running" - the single most common reason this installer fails.
if docker info >/dev/null 2>&1; then
  ok "docker daemon is running"
else
  fail "The Docker CLI is installed, but no Docker daemon is reachable.
         Start Docker Desktop (macOS, Windows) or the service (Linux:
         sudo systemctl start docker), wait until 'docker info' succeeds,
         then run this script again."
fi

# The MCP server runs through uv's tool runner. `uvx` is the short form; where
# only `uv` is on PATH the equivalent is `uv tool run`. These are NOT
# interchangeable strings - recording "uvx" when only `uv` exists registers a
# command that does not exist, and the MCP server then fails to start with no
# hint from this installer.
if command -v uvx >/dev/null 2>&1; then
  ok "uvx found"
  UVX_CMD="uvx"
elif command -v uv >/dev/null 2>&1; then
  UVX_CMD="uv tool run"
  ok "uv found - using '${UVX_CMD}' (uvx itself is not on PATH)"
else
  fail "Neither uvx nor uv was found. The MCP server runs via uvx.
         Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh
         Then reopen your shell and run this script again."
fi

# jq is optional here. Only scripts/migrate-collection.sh requires it;
# scripts/init-collections.sh uses it when present and falls back to sed.
if command -v jq >/dev/null 2>&1; then
  ok "jq found (required by scripts/migrate-collection.sh)"
else
  warn "jq is not installed. Everything below works without it, but scripts/migrate-collection.sh will not run."
fi

# ===========================================================================
# 2. .env and API key
# ===========================================================================
step "2/9  Environment file"

# Any temp file written in this step holds the API key. If the script dies
# between creating it and moving it into place, the key would be left lying in
# the repository working tree. The trap removes it on every exit path.
TMP_ENV=""
cleanup_tmp_env() {
  if [ -n "${TMP_ENV}" ] && [ -f "${TMP_ENV}" ]; then
    rm -f "${TMP_ENV}"
  fi
  return 0
}
trap cleanup_tmp_env EXIT INT TERM

generate_key() {
  # openssl is on nearly every system. The /dev/urandom path is the fallback
  # for the ones where it is not.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 48
    printf '\n'
  fi
}

# Tighten the file-creation mask *before* anything containing the key is
# written. Creating the file first and chmod'ing afterwards leaves a window in
# which .env is readable by group and world - short, but a race is a race.
PREV_UMASK="$(umask)"
umask 077

if [ -f "${ENV_FILE}" ]; then
  ok ".env already exists - keeping it as it is."
  # An existing key is never rotated. Rotating it would leave the running
  # container authenticating against the old value until it is recreated.
  if grep -qE '^QDRANT_API_KEY=.+$' "${ENV_FILE}"; then
    ok "QDRANT_API_KEY is set - not touching it."
  else
    log "QDRANT_API_KEY is empty or absent. Generating one."
    NEW_KEY="$(generate_key)"
    # Rewrite through a temp file, so a failed edit cannot truncate .env.
    TMP_ENV="${ENV_FILE}.tmp.${STAMP}"
    if grep -qE '^QDRANT_API_KEY=' "${ENV_FILE}"; then
      sed "s|^QDRANT_API_KEY=.*$|QDRANT_API_KEY=${NEW_KEY}|" "${ENV_FILE}" > "${TMP_ENV}"
    else
      # No such line at all - append one instead of silently doing nothing.
      cat "${ENV_FILE}" > "${TMP_ENV}"
      printf '\nQDRANT_API_KEY=%s\n' "${NEW_KEY}" >> "${TMP_ENV}"
    fi
    mv "${TMP_ENV}" "${ENV_FILE}"
    TMP_ENV=""
    chmod 600 "${ENV_FILE}"
    ok "Generated a new API key and wrote it to .env."
  fi
else
  [ -f "${ENV_EXAMPLE}" ] || fail ".env.example is missing from ${REPO_ROOT}. The repository looks incomplete."
  NEW_KEY="$(generate_key)"
  sed "s|^QDRANT_API_KEY=.*$|QDRANT_API_KEY=${NEW_KEY}|" "${ENV_EXAMPLE}" > "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  ok "Created .env from .env.example with a freshly generated API key."
fi

umask "${PREV_UMASK}"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION_NAME="${COLLECTION_NAME:-thinktank-memory}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-sentence-transformers/all-MiniLM-L6-v2}"
[ -n "${QDRANT_API_KEY:-}" ] || fail "QDRANT_API_KEY is still empty after setup. Check ${ENV_FILE} by hand."

log "url:        ${QDRANT_URL}"
log "collection: ${COLLECTION_NAME}"
log "model:      ${EMBEDDING_MODEL}"
log "The API key lives in ${ENV_FILE} (mode 600) and is never printed here."

# The name of the vector mcp-server-qdrant reads and writes: "fast-" plus the
# lowercased last path segment of the model id. Derived, not hard-coded, for
# the same reason as in scripts/init-collections.sh - a changed EMBEDDING_MODEL
# must not silently leave the smoke test checking the wrong slot.
VECTOR_NAME_EXPECTED="fast-$(printf '%s' "${EMBEDDING_MODEL##*/}" | tr '[:upper:]' '[:lower:]')"

# ===========================================================================
# 3. Start the container
# ===========================================================================
step "3/9  Starting Qdrant"

cd "${REPO_ROOT}"
if ${COMPOSE} up -d; then
  ok "Container thinktank-qdrant is up."
else
  fail "'${COMPOSE} up -d' failed. Read the output above - a port conflict on 6333 and a stale container of the same name are the usual causes.
         Inspect with: docker ps -a --filter name=thinktank-qdrant"
fi

# ===========================================================================
# 4. Wait for readiness
# ===========================================================================
step "4/9  Waiting for readiness"

# Poll rather than sleep: a blind sleep is either too short on a cold start or
# wasted time on a warm one.
#
# /readyz is the only endpoint that answers the question being asked. It returns
# 503 until the collections and their shards are actually loaded. /healthz and
# / answer 200 as soon as the HTTP server has bound its socket, which is why
# they must not be part of the same round-robin: whichever answers first wins,
# and /healthz will usually answer first, declaring Qdrant ready before it is.
# They are used only when /readyz is genuinely absent (HTTP 404 on a Qdrant old
# enough to predate the endpoint), and that downgrade is stated in the log.
READY=0
READY_PATH=""
READYZ_MISSING=0
DEADLINE=$(( $(date +%s) + 60 ))
attempt=0

probe() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -H "api-key: ${QDRANT_API_KEY}" "${QDRANT_URL}$1" || printf '000'
}

while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
  attempt=$((attempt + 1))
  code="$(probe /readyz)"
  if [ "${code}" = "200" ]; then
    READY=1
    READY_PATH="/readyz"
    break
  fi
  if [ "${code}" = "404" ]; then
    READYZ_MISSING=1
    break
  fi
  remaining=$(( DEADLINE - $(date +%s) ))
  printf '  waiting for %s/readyz ... attempt %s, %ss left\r' "${QDRANT_URL}" "${attempt}" "${remaining}"
  sleep 2
done
printf '\n'

if [ "${READY}" -ne 1 ] && [ "${READYZ_MISSING}" -eq 1 ]; then
  warn "This Qdrant does not implement /readyz (HTTP 404) - it predates the endpoint."
  warn "Falling back to /healthz. That only proves the HTTP port is bound, not that"
  warn "the shards have finished loading. Consider updating the image."
  while [ "$(date +%s)" -lt "${DEADLINE}" ]; do
    attempt=$((attempt + 1))
    for path in /healthz /; do
      code="$(probe "${path}")"
      if [ "${code}" = "200" ]; then
        READY=1
        READY_PATH="${path} (fallback - readiness not actually proven)"
        break
      fi
    done
    [ "${READY}" -eq 1 ] && break
    sleep 2
  done
fi

if [ "${READY}" -ne 1 ]; then
  log "Container logs (last 30 lines):"
  ${COMPOSE} logs --tail 30 qdrant 2>&1 | sed 's/^/    /' || true
  fail "Qdrant did not become ready within 60 seconds at ${QDRANT_URL}.
         Check the logs above, then: ${COMPOSE} ps"
fi

ok "Qdrant is ready (responded 200 on ${READY_PATH} after ${attempt} attempt(s))."

# ===========================================================================
# 5. Create the collection
# ===========================================================================
step "5/9  Collection"

INIT_SCRIPT="${REPO_ROOT}/scripts/init-collections.sh"
[ -f "${INIT_SCRIPT}" ] || fail "scripts/init-collections.sh is missing. The repository looks incomplete."
[ -x "${INIT_SCRIPT}" ] || chmod +x "${INIT_SCRIPT}"

if ! "${INIT_SCRIPT}"; then
  fail "Collection setup failed. See the message above."
fi

# ===========================================================================
# 6. Copy skills, agents and hooks
# ===========================================================================
step "6/9  Installing skills, agents and hooks into ${CLAUDE_HOME}"

mkdir -p "${CLAUDE_HOME}/skills" "${CLAUDE_HOME}/agents" "${CLAUDE_HOME}/hooks"

installed=0
backed_up=0

# Copy one file, preserving anything already at the destination under a
# timestamped name. Identical files are skipped, so a re-run does not litter
# the directory with backups of unchanged content - but the mode is still
# enforced, so a re-run repairs permissions that drifted.
#
# The mode is set explicitly rather than left to the ambient umask. With the
# common umask of 022, `cp` would give the loop guard hook mode 0755: readable
# by every local user, and the guard is exactly the file whose contents an
# attacker would want to read before working around it.
install_file() {
  local src="$1" dest="$2" mode="$3"
  mkdir -p "$(dirname "${dest}")"
  if [ -f "${dest}" ]; then
    if cmp -s "${src}" "${dest}"; then
      chmod "${mode}" "${dest}" || warn "could not set mode ${mode} on ${dest}"
      return 0
    fi
    mv "${dest}" "${dest}.bak.${STAMP}"
    backed_up=$((backed_up + 1))
  fi
  cp "${src}" "${dest}"
  chmod "${mode}" "${dest}" || warn "could not set mode ${mode} on ${dest}"
  installed=$((installed + 1))
}

copy_tree() {
  local src_dir="$1" dest_dir="$2" label="$3" mode="$4"
  if [ ! -d "${src_dir}" ]; then
    warn "No ${label} directory in the repository - skipping."
    return 0
  fi
  if [ -z "$(find "${src_dir}" -type f -print -quit)" ]; then
    warn "${label} directory is empty - skipping."
    return 0
  fi
  while IFS= read -r src; do
    rel="${src#"${src_dir}/"}"
    install_file "${src}" "${dest_dir}/${rel}" "${mode}"
  done < <(find "${src_dir}" -type f ! -name '.DS_Store')
  ok "${label} copied (mode ${mode})."
}

copy_tree "${REPO_ROOT}/skills" "${CLAUDE_HOME}/skills" "skills" 0644
copy_tree "${REPO_ROOT}/agents" "${CLAUDE_HOME}/agents" "agents" 0644
# Hooks are executed by the harness and gate irreversible actions. Owner-only:
# executable for the user who runs Claude Code, invisible to everyone else.
copy_tree "${REPO_ROOT}/hooks"  "${CLAUDE_HOME}/hooks"  "hooks"  0700

log "${installed} file(s) installed, ${backed_up} existing file(s) backed up with the suffix .bak.${STAMP}"

# ===========================================================================
# 7. Register the MCP server
# ===========================================================================
step "7/9  MCP server registration"

MCP_NAME="qdrant-thinktank"
LAUNCHER="${REPO_ROOT}/scripts/qdrant-mcp-launcher.sh"

[ -f "${LAUNCHER}" ] || fail "scripts/qdrant-mcp-launcher.sh is missing. The repository looks incomplete."
[ -x "${LAUNCHER}" ] || chmod +x "${LAUNCHER}"

# The registration deliberately carries no API key.
#
# `claude mcp add --env "QDRANT_API_KEY=<key>"` would place the key in this
# process's argv, where `ps -ef` (macOS) or /proc/<pid>/cmdline (Linux) exposes
# it to other local processes, and it would then be stored verbatim in the MCP
# configuration file. The launcher reads the key out of .env (mode 600) at
# server start instead, so it exists in exactly one place on disk.
#
# The trade-off, stated plainly: the registration points at a path inside this
# repository. Move or delete the repository and the MCP server stops starting.
# That is already true of `docker compose down`, which also needs this
# directory, so the install was never portable to begin with.
read -r -d '' MCP_JSON <<JSON || true
  "${MCP_NAME}": {
    "command": "${LAUNCHER}",
    "args": [],
    "env": {
      "QDRANT_URL": "${QDRANT_URL}",
      "COLLECTION_NAME": "${COLLECTION_NAME}",
      "EMBEDDING_MODEL": "${EMBEDDING_MODEL}",
      "THINKTANK_UVX_CMD": "${UVX_CMD}"
    }
  }
JSON

print_mcp_json() {
  printf '\n%s\n\n' "${MCP_JSON}"
  log "There is no QDRANT_API_KEY in that block on purpose. The launcher reads the"
  log "key from ${ENV_FILE} when the server starts, so it stays out of your"
  log "configuration file and out of this terminal."
  log ""
  log "If you would rather not use the launcher, replace \"command\" with your uvx"
  log "invocation (${UVX_CMD} mcp-server-qdrant --transport stdio) and add"
  log "  \"QDRANT_API_KEY\": \"<paste the QDRANT_API_KEY value from .env>\""
  log "to the env block yourself. Do not put a real key into a file you share."
}

if command -v claude >/dev/null 2>&1; then
  # `claude mcp list` prints one "<name>: <command> - <status>" line per server.
  # Anchoring on the trailing colon is what makes this an exact-name test.
  # "^${MCP_NAME}\b" does NOT work: "-" is not a word character, so \b matches
  # in front of it and the pattern also hits qdrant-thinktank-v5, -v6, -v8 and
  # -v9. On a machine carrying those, the check reports "already registered"
  # and this server never gets added.
  if ! mcp_list_out="$(claude mcp list 2>&1)"; then
    warn "'claude mcp list' failed. Its output was:"
    printf '%s\n' "${mcp_list_out}" | sed 's/^/    /'
    warn "Continuing as if the server were not registered."
    mcp_list_out=""
  fi
  if printf '%s\n' "${mcp_list_out}" | grep -q "^${MCP_NAME}:"; then
    ok "MCP server '${MCP_NAME}' is already registered - leaving it alone."
    log "To re-register it with the current .env values:"
    log "  claude mcp remove ${MCP_NAME} --scope user  &&  ./install.sh"
  else
    if claude mcp add "${MCP_NAME}" \
        --scope user \
        --env "QDRANT_URL=${QDRANT_URL}" \
        --env "COLLECTION_NAME=${COLLECTION_NAME}" \
        --env "EMBEDDING_MODEL=${EMBEDDING_MODEL}" \
        --env "THINKTANK_UVX_CMD=${UVX_CMD}" \
        -- "${LAUNCHER}"; then
      ok "Registered MCP server '${MCP_NAME}' at user scope."
      log "The API key was not part of that command - it is read from .env at startup."
    else
      warn "'claude mcp add' failed. Add this block to the mcpServers object of your MCP config by hand:"
      print_mcp_json
    fi
  fi
else
  warn "The 'claude' CLI was not found, so the MCP server was not registered automatically."
  log "Add this block to the mcpServers object of your MCP config:"
  print_mcp_json
fi

# ===========================================================================
# 8. Hook wiring (printed, never written)
# ===========================================================================
step "8/9  Hook wiring in settings.json"

# Deliberately not automated. settings.json is a shared file: it carries the
# user's own hooks, permissions and environment. Writing it from a script means
# either overwriting hooks somebody else depends on, or attempting a JSON merge
# in bash - and a merge that goes wrong takes the whole config down with it.
# Printing the block costs one copy-and-paste and cannot destroy anything.
SETTINGS_FILE="${CLAUDE_HOME}/settings.json"

cat <<'HOOKBLOCK'
  The two loop-mode hooks are in place, but nothing calls them until you wire
  them into settings.json. This script does not edit that file. Your
  settings.json contains your own hooks and permissions, and a script that
  rewrites it will either clobber them or attempt a JSON merge in Bash. A bad
  merge can break the entire configuration. Here is the block for you to merge.

  Add the "hooks" key below to your settings.json. If the file already has a
  "hooks" key, merge the matchers into it instead of replacing the object:

  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/tt-loop-guard.sh" }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/tt-loop-completion-gate.sh" }
        ]
      }
    ]
  }

  Both hooks do nothing unless a run sets CLAUDE_TT_LOOP_MODE=1, so interactive
  sessions remain unchanged. Never put that marker in the "env" block of
  settings.json. Doing so would arm the gates for every session and break
  normal interactive work.
HOOKBLOCK

if [ -f "${SETTINGS_FILE}" ]; then
  log "Your settings.json: ${SETTINGS_FILE} (left untouched)"
else
  log "No settings.json at ${SETTINGS_FILE} yet - create it with the block above wrapped in { }."
fi

# ===========================================================================
# 9. Smoke test
# ===========================================================================
step "9/9  Smoke test"

# "HTTP 200 on GET /collections/<name>" is not a test. A collection created with
# the wrong vector shape answers that request perfectly and still fails on the
# very first store and the very first search. So this step writes a point,
# searches for it, and deletes it again. Only a full round trip proves the
# collection is usable by mcp-server-qdrant.

smoke_call() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "${body}" ]; then
    curl -sS -X "${method}" -H "api-key: ${QDRANT_API_KEY}" \
      -H "Content-Type: application/json" -w '\n%{http_code}' --max-time 30 \
      -d "${body}" "${QDRANT_URL}${path}"
  else
    curl -sS -X "${method}" -H "api-key: ${QDRANT_API_KEY}" \
      -w '\n%{http_code}' --max-time 30 "${QDRANT_URL}${path}"
  fi
}

response="$(smoke_call GET "/collections/${COLLECTION_NAME}" || true)"
code="$(printf '%s' "${response}" | tail -n1)"
body="$(printf '%s' "${response}" | sed '$d')"

if [ "${code}" != "200" ]; then
  fail "The collection '${COLLECTION_NAME}' could not be read back (HTTP ${code:-no response}). Setup is not complete."
fi

flat="$(printf '%s' "${body}" | tr -d ' \n')"
points="$(printf '%s' "${flat}" | sed -n 's/.*"points_count":\([0-9][0-9]*\).*/\1/p' | head -n1)"

# Both of these patterns require the *named* shape
# ("vectors":{"<name>":{"size":N,...}}). An unnamed collection
# ("vectors":{"size":N,...}) matches neither, which is the point: it is exactly
# the broken shape this test has to catch rather than report as "unknown-dim".
vname="$(printf '%s' "${flat}" | sed -n 's/.*"vectors":{"\([^"]*\)":{"size":[0-9][0-9]*.*/\1/p' | head -n1)"
vsize="$(printf '%s' "${flat}" | sed -n 's/.*"vectors":{"[^"]*":{"size":\([0-9][0-9]*\).*/\1/p' | head -n1)"

if [ -z "${vname}" ] || [ -z "${vsize}" ]; then
  fail "Collection '${COLLECTION_NAME}' does not declare a named vector.
         mcp-server-qdrant writes into the named vector '${VECTOR_NAME_EXPECTED}'
         and would fail on every store with:
           Not existing vector name error: ${VECTOR_NAME_EXPECTED}
         Point COLLECTION_NAME at a new collection and re-run ./install.sh, or
         migrate: ./scripts/migrate-collection.sh ${COLLECTION_NAME}"
fi

ok "Collection '${COLLECTION_NAME}' exists."
log "points:  ${points:-unknown}"
log "vectors: ${vname} (${vsize}-dim)"

if [ "${vname}" != "${VECTOR_NAME_EXPECTED}" ]; then
  fail "Collection '${COLLECTION_NAME}' carries the vector '${vname}', but
         EMBEDDING_MODEL=${EMBEDDING_MODEL} makes mcp-server-qdrant read and
         write '${VECTOR_NAME_EXPECTED}'. Every store and every search would
         fail. Set EMBEDDING_MODEL back to the model this collection was built
         with, or point COLLECTION_NAME at a new collection."
fi

# --- write / read / delete -------------------------------------------------
# A constant vector is fine here: the search only has to find the point it just
# wrote, not rank anything meaningfully.
smoke_vec="["
i=0
while [ "${i}" -lt "${vsize}" ]; do
  if [ "${i}" -gt 0 ]; then smoke_vec="${smoke_vec},"; fi
  smoke_vec="${smoke_vec}0.05"
  i=$((i + 1))
done
smoke_vec="${smoke_vec}]"

# A random UUID, so the test point cannot collide with a real memory.
if command -v uuidgen >/dev/null 2>&1; then
  SMOKE_ID="$(uuidgen | tr 'A-Z' 'a-z')"
else
  h="$(LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 32)"
  SMOKE_ID="${h:0:8}-${h:8:4}-${h:12:4}-${h:16:4}-${h:20:12}"
fi

log "writing test point ${SMOKE_ID} ..."
response="$(smoke_call PUT "/collections/${COLLECTION_NAME}/points?wait=true" \
  "{\"points\":[{\"id\":\"${SMOKE_ID}\",\"vector\":{\"${vname}\":${smoke_vec}},\"payload\":{\"thinktank_install_smoke_test\":true}}]}" || true)"
code="$(printf '%s' "${response}" | tail -n1)"
if [ "${code}" != "200" ]; then
  fail "Writing a test point into '${COLLECTION_NAME}' failed (HTTP ${code}): $(printf '%s' "${response}" | sed '$d')
         The collection exists but cannot be written to. mcp-server-qdrant would
         fail the same way on your first stored memory."
fi
ok "write: a point with vector '${vname}' was accepted."

# Remove the test point before aborting, so a failed smoke test does not leave
# litter behind in a collection that may hold real memories.
smoke_cleanup() {
  smoke_call POST "/collections/${COLLECTION_NAME}/points/delete?wait=true" \
    "{\"points\":[\"${SMOKE_ID}\"]}" >/dev/null 2>&1 || true
}

# Read the point back by id. This proves the vector really landed under
# '${vname}' rather than merely that the request was accepted.
response="$(smoke_call POST "/collections/${COLLECTION_NAME}/points" \
  "{\"ids\":[\"${SMOKE_ID}\"],\"with_vector\":true}" || true)"
code="$(printf '%s' "${response}" | tail -n1)"
rbody="$(printf '%s' "${response}" | sed '$d')"
if [ "${code}" != "200" ] || ! printf '%s' "${rbody}" | grep -q "${SMOKE_ID}"; then
  smoke_cleanup
  fail "The test point was written but could not be read back (HTTP ${code}): ${rbody}"
fi
if ! printf '%s' "${rbody}" | tr -d ' \n' | grep -q "\"${vname}\":\["; then
  smoke_cleanup
  fail "The test point came back without a vector named '${vname}'. Response: ${rbody}"
fi
ok "read:  the point came back with its '${vname}' vector."

# Now the part that actually exercises the search path mcp-server-qdrant uses:
# a vector query with "using": "<name>". A wrong or absent vector name fails
# here with HTTP 400 and "Not existing vector name error".
#
# The has_id filter restricts the query to the point just written. Ranking must
# not decide whether this test passes: in a collection that already holds
# memories, some existing point can legitimately outscore the test point, and a
# plain "limit 1" search would then report a healthy collection as broken.
response="$(smoke_call POST "/collections/${COLLECTION_NAME}/points/query" \
  "{\"query\":${smoke_vec},\"using\":\"${vname}\",\"limit\":5,\"filter\":{\"must\":[{\"has_id\":[\"${SMOKE_ID}\"]}]},\"with_payload\":true}" || true)"
code="$(printf '%s' "${response}" | tail -n1)"
qbody="$(printf '%s' "${response}" | sed '$d')"
if [ "${code}" != "200" ]; then
  smoke_cleanup
  fail "A vector search on '${COLLECTION_NAME}' using '${vname}' failed (HTTP ${code}): ${qbody}
         This is the exact call mcp-server-qdrant makes on every recall."
fi
if ! printf '%s' "${qbody}" | grep -q "${SMOKE_ID}"; then
  smoke_cleanup
  fail "The vector search ran but did not return the test point. Response: ${qbody}"
fi
ok "search: a vector query using '${vname}' returned the test point."

response="$(smoke_call POST "/collections/${COLLECTION_NAME}/points/delete?wait=true" \
  "{\"points\":[\"${SMOKE_ID}\"]}" || true)"
code="$(printf '%s' "${response}" | tail -n1)"
if [ "${code}" != "200" ]; then
  warn "Deleting the test point failed (HTTP ${code}). Remove it yourself:"
  warn "  point id ${SMOKE_ID} in collection ${COLLECTION_NAME}"
else
  response="$(smoke_call POST "/collections/${COLLECTION_NAME}/points" \
    "{\"ids\":[\"${SMOKE_ID}\"]}" || true)"
  if printf '%s' "${response}" | sed '$d' | grep -q "${SMOKE_ID}"; then
    warn "The test point still exists after deletion. Remove it yourself:"
    warn "  point id ${SMOKE_ID} in collection ${COLLECTION_NAME}"
  else
    ok "clean: the test point was deleted again."
  fi
fi

if [ "${points:-0}" = "0" ]; then
  log "The collection is empty, which is what a fresh install looks like."
  log "Coming from an older setup? Copy the old memories over (name your own"
  log "source collection - there is no default):"
  log "  ./scripts/migrate-collection.sh <your-old-collection> --dry-run"
  log "  ./scripts/migrate-collection.sh --help   # how to list your collections"
fi

# ===========================================================================
printf '\n\033[1m== Done ==\033[0m\n'
log "1. Merge the hook block from step 8 into ${SETTINGS_FILE}."
log "2. Restart Claude Code so it picks up the MCP server and the new skills."
log "3. Try it: /thinktank <your task>"
printf '\n'
log "Stop the backend:   ${COMPOSE} down"
log "Stop and wipe it:   ${COMPOSE} down -v   (this deletes every stored memory)"
printf '\n'
