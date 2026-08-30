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
#   9. smoke-test the collection: write, read back, search the named vector, delete
#
# Re-running the script is safe. It creates what is missing, leaves what is
# already there, and backs up any file it would otherwise overwrite.
#
# Settings (QDRANT_URL, QDRANT_API_KEY, COLLECTION_NAME, EMBEDDING_MODEL) are
# read from .env, but an environment variable of the same name wins: .env only
# fills in what is not already set, so one run can be aimed elsewhere without
# editing the file:
#
#   COLLECTION_NAME=thinktank-scratch ./install.sh
#
# "Set" means set, not non-empty - VAR= in the environment is an empty value
# you chose, and it beats .env too. Docker Compose resolves ${...} the same
# way (shell environment before .env), so the container and this script agree
# on what they are using. See scripts/lib/load-env.sh for the reader and its
# parsing rules.
#
# Step 2 is unaffected by this: it still creates .env and generates a key into
# the file. Exporting QDRANT_API_KEY changes which key this run *uses*, not
# what gets written.

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
# Warnings go to stderr, like fail(), so that a run captured with `> install.log`
# does not silently drop half of them: scripts/lib/preflight.sh already writes
# its warnings there, and two diagnostics on two different streams means whoever
# reads one of them reads an incomplete run.
warn()  { printf '  [warn] %s\n' "$*" >&2; }
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
  9. smoke-test the collection: write, read back, search the named vector, delete

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

# jq belongs in this list, next to docker and curl, and not in a "nice to have"
# note further down. The loop-mode guard (hooks/tt-loop-guard.sh) reads the tool
# name and the shell command out of a JSON payload with jq. Without jq it cannot
# read the request at all, so it now denies every gated action instead of
# deciding one — which stops an unattended run dead rather than waving it
# through, but stops it dead all the same. An installation without jq has no
# usable loop mode.
missing=""
for cmd in docker curl jq; do
  if command -v "${cmd}" >/dev/null 2>&1; then
    ok "${cmd} found"
  else
    warn "${cmd} is missing"
    missing="${missing} ${cmd}"
  fi
done

if [ -n "${missing}" ]; then
  fail "Missing required command(s):${missing}. Install them and run this script again.
         jq:     brew install jq  |  apt-get install jq  |  dnf install jq
                 The loop-mode guard parses its tool payload with jq. Without
                 jq it can decide nothing, so it denies everything and no
                 unattended run can proceed."
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

# jq was checked with docker and curl above; by here it is present. This line
# only records what depends on it, because the reasons are unequal: the two
# scripts merely fail visibly without jq, while the loop-mode guard fails
# SILENTLY - it would parse nothing, match nothing, and allow everything.
ok "jq found (required by hooks/tt-loop-guard.sh and scripts/migrate-collection.sh)"

# --- can step 6 actually write where it is going? --------------------------
#
# Asked here, five steps early, because the alternative is finding out in the
# middle of the copy. That is not hypothetical. An installation run stopped on
#
#   mv: rename ~/.claude/hooks/tt-loop-completion-gate.sh to
#       ~/.claude/hooks/tt-loop-completion-gate.sh.bak.<stamp>: Permission denied
#
# with ~/.claude/hooks at mode 0500. Skills and agents were already installed;
# the hooks and the MCP registration were not; and the only thing the user was
# handed was that one line of mv output. A directory's write bit governs
# creating, deleting and renaming entries - not writing to a file that already
# exists - so an unwritable directory stops the backup even though every file
# in it is readable.
#
# The mode is very probably intentional: this kit's own delivery-loop reference
# recommends taking the write bit off ~/.claude/hooks. So the check reports and
# stops. It never changes a mode, and neither does anything else in this
# script; the reasoning sits next to the function in scripts/lib/preflight.sh.
#
# What it does NOT do is block on a read-only directory that needs no writing.
# The check compares each tree against the repository first, and a directory
# whose files are already byte-identical is skipped with a warning rather than
# treated as an obstacle - otherwise anyone who had actually applied the
# hardening could never run this installer again, not even to register the MCP
# server. Step 6 reports such a tree as skipped.
PREFLIGHT_LIB="${REPO_ROOT}/scripts/lib/preflight.sh"
[ -f "${PREFLIGHT_LIB}" ] || fail "scripts/lib/preflight.sh is missing from ${REPO_ROOT}. The repository looks incomplete."
# shellcheck source=scripts/lib/preflight.sh
. "${PREFLIGHT_LIB}"

if check_install_targets_writable "${CLAUDE_HOME}" "${REPO_ROOT}"; then
  # Do not list the trees here. A tree that was skipped for being read-only and
  # already current is reported two lines above; naming it again as writable
  # contradicts that warning on the very next line.
  if [ -n "${PREFLIGHT_SKIPPED_TREES:-}" ]; then
    ok "step 6 can write everything it has to into ${CLAUDE_HOME} (skipping:${PREFLIGHT_SKIPPED_TREES})"
  else
    ok "step 6 can write everything it has to into ${CLAUDE_HOME} (skills, agents, hooks)"
  fi
else
  # The function has already printed which directory, its mode, why it is
  # probably deliberate, and the three commands. Repeating any of that here
  # would only push it off the screen.
  exit 1
fi

# ===========================================================================
# 2. .env and API key
# ===========================================================================
step "2/9  Environment file"

# Any temp file written in this step holds the API key. If the script dies
# between creating it and moving it into place, the key would be left lying in
# the repository working tree. The trap removes it on every exit path.
TMP_ENV=""
# Step 6 keeps its file manifests here. Declared next to TMP_ENV so a single
# trap covers both; a second trap would replace this one rather than add to it.
TT_SCAN_DIR=""
# The curl config file created further down holds the API key. Same reasoning
# as TMP_ENV: it must not survive an abort, and one trap has to cover every
# temporary thing this script creates, because a second `trap ... EXIT` would
# replace this one instead of adding to it.
CURL_AUTH_LIB="${REPO_ROOT}/scripts/lib/curl-auth.sh"
[ -f "${CURL_AUTH_LIB}" ] || fail "scripts/lib/curl-auth.sh is missing from ${REPO_ROOT}. The repository looks incomplete."
# shellcheck source=scripts/lib/curl-auth.sh
. "${CURL_AUTH_LIB}"

cleanup_tmp_env() {
  if [ -n "${TMP_ENV}" ] && [ -f "${TMP_ENV}" ]; then
    rm -f "${TMP_ENV}"
  fi
  if [ -n "${TT_SCAN_DIR}" ] && [ -d "${TT_SCAN_DIR}" ]; then
    rm -rf "${TT_SCAN_DIR}"
  fi
  curl_auth_file_remove
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

# Not `set -a; . .env; set +a`: sourcing assigns, so the file would overwrite
# the environment instead of filling it in, and `COLLECTION_NAME=x ./install.sh`
# would be ignored. load_env_file sets only what is unset, and never executes
# the file.
LOAD_ENV_LIB="${REPO_ROOT}/scripts/lib/load-env.sh"
[ -f "${LOAD_ENV_LIB}" ] || fail "scripts/lib/load-env.sh is missing from ${REPO_ROOT}. The repository looks incomplete."
# shellcheck source=scripts/lib/load-env.sh
. "${LOAD_ENV_LIB}"

load_env_file "${ENV_FILE}"

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION_NAME="${COLLECTION_NAME:-thinktank-memory}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-sentence-transformers/all-MiniLM-L6-v2}"
[ -n "${QDRANT_API_KEY:-}" ] || fail "QDRANT_API_KEY is still empty after setup. Check ${ENV_FILE} by hand."

# Every curl call below authenticates through this file instead of through
# `-H "api-key: ${QDRANT_API_KEY}"`. The header in an argument is visible to
# any local process in `ps` for as long as the call runs; the file is mode 0600
# and only its name reaches argv. See scripts/lib/curl-auth.sh for the full
# reasoning and the measurement. The trap installed above removes it on every
# exit path, including an abort halfway through the smoke test.
curl_auth_file_create "${QDRANT_API_KEY}" \
  || fail "Could not create a temporary curl configuration file in ${TMPDIR:-/tmp}.
         The API key is passed to curl through that file so it never appears in
         the process list. Check that ${TMPDIR:-/tmp} is writable, then run this
         script again."

# --- host ports ------------------------------------------------------------
#
# docker-compose.yml publishes Qdrant as ${QDRANT_HOST_PORT}:6333 and
# ${QDRANT_GRPC_HOST_PORT}:6334. Only the host side moves. Inside the container
# Qdrant listens on 6333 and 6334 whatever is set here, which is also why the
# compose healthcheck stays on 6333: it runs in the container, where the
# published port does not exist.
#
# Resolved here in step 2, not in step 3, because the consistency check below
# needs QDRANT_URL. Exported so `${COMPOSE} up -d` in step 3 resolves the same
# values this script uses - compose reads the environment before .env, and a
# default that lived only in this shell would let the two disagree.
QDRANT_HOST_PORT="${QDRANT_HOST_PORT:-6333}"
QDRANT_GRPC_HOST_PORT="${QDRANT_GRPC_HOST_PORT:-6334}"
export QDRANT_HOST_PORT QDRANT_GRPC_HOST_PORT

valid_port "${QDRANT_HOST_PORT}" || fail "QDRANT_HOST_PORT='${QDRANT_HOST_PORT}' is not a port number (1-65535). Fix it in ${ENV_FILE}."
valid_port "${QDRANT_GRPC_HOST_PORT}" || fail "QDRANT_GRPC_HOST_PORT='${QDRANT_GRPC_HOST_PORT}' is not a port number (1-65535). Fix it in ${ENV_FILE}."
if [ "${QDRANT_HOST_PORT}" = "${QDRANT_GRPC_HOST_PORT}" ]; then
  fail "QDRANT_HOST_PORT and QDRANT_GRPC_HOST_PORT are both ${QDRANT_HOST_PORT}. One host port
         cannot serve both the REST API and gRPC; 'compose up -d' would fail on the
         duplicate binding. Give them two different ports in ${ENV_FILE}."
fi

# --- do QDRANT_URL and QDRANT_HOST_PORT agree? -----------------------------
#
# CHECKED, NOT DERIVED. The tempting shortcut is to rebuild QDRANT_URL from
# QDRANT_HOST_PORT and be done with it. That is wrong in the one case where it
# would matter: QDRANT_URL is a complete address, and it may deliberately point
# at a Qdrant this compose file does not manage - another host, a tunnel, an
# instance someone else operates. Overwriting its port from a local compose
# setting would silently redirect that. Deriving also only appears to remove the
# failure mode: nothing stops QDRANT_URL naming a different HOST, so a check is
# needed regardless, at which point the derivation is just a second, hidden
# source of truth.
#
# So: the two values stay independent, and disagreement is reported with both
# numbers and both file lines. It costs an error message on a half-done edit -
# which is the moment the user is still holding the file open - instead of a
# container on one port and a script talking to another.
URL_HOST="$(url_host "${QDRANT_URL}")"
URL_PORT="$(url_port "${QDRANT_URL}")"

if [ -z "${URL_PORT}" ]; then
  warn "Could not read a port out of QDRANT_URL='${QDRANT_URL}'."
  warn "Skipping the QDRANT_URL/QDRANT_HOST_PORT consistency check - verify it yourself."
elif host_is_local "${URL_HOST}"; then
  if [ "${URL_PORT}" != "${QDRANT_HOST_PORT}" ]; then
    fail "QDRANT_URL and QDRANT_HOST_PORT disagree, and both are about this machine:

           QDRANT_URL=${QDRANT_URL}          -> port ${URL_PORT}
           QDRANT_HOST_PORT=${QDRANT_HOST_PORT}

         docker-compose.yml would publish Qdrant on 127.0.0.1:${QDRANT_HOST_PORT}, while this
         script, the MCP launcher and every recall would connect to port ${URL_PORT}.
         Step 4 would then wait 60 seconds for a container that is up and
         answering somewhere else.

         Set both lines in ${ENV_FILE} to the same port:
           QDRANT_HOST_PORT=${QDRANT_HOST_PORT}
           QDRANT_URL=http://localhost:${QDRANT_HOST_PORT}

         The installer does not fix this for you: it cannot tell which of the two
         numbers you meant, and guessing wrong sends every stored memory to the
         wrong instance."
  fi
  ok "QDRANT_URL and QDRANT_HOST_PORT agree on port ${QDRANT_HOST_PORT}."
else
  warn "QDRANT_URL points at '${URL_HOST}', which is not this machine, so the local"
  warn "compose ports are not what this run will talk to. Starting the container"
  warn "anyway; it will publish 127.0.0.1:${QDRANT_HOST_PORT} and nothing here will use it."
fi

log "url:        ${QDRANT_URL}"
log "collection: ${COLLECTION_NAME}"
log "model:      ${EMBEDDING_MODEL}"
log "host ports: ${QDRANT_HOST_PORT} (REST) / ${QDRANT_GRPC_HOST_PORT} (gRPC) -> 6333/6334 in the container"
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

# QDRANT_HOST_PORT and QDRANT_GRPC_HOST_PORT were resolved, validated and
# checked against QDRANT_URL at the end of step 2, and exported there so that
# `${COMPOSE} up -d` below resolves exactly the values used here. Defaulting
# them again at this point would create a second source of truth that goes
# stale the first time step 2 learns something the copy does not.

# --- port collision --------------------------------------------------------
# `compose up -d` takes the host port. On a machine that already runs a Qdrant
# of its own - the normal case for the people this kit is aimed at, not the
# exception - that displaces a container someone depends on and points their
# existing MCP servers at a fresh, empty, differently-keyed instance. The data
# survives on disk, but the memory is offline and nobody was told.
#
# So the port is examined first, and the installer refuses rather than taking
# what is already in use. The one exception is a container this very compose
# project created: `compose up -d` is idempotent against its own container, and
# treating a re-run as a collision would break every second install.

# True when something accepts a TCP connection on the port. This catches a
# plain listening process as well as a container's published mapping, and needs
# no lsof/ss/netstat - bash opens the socket itself. The subshell closes the
# descriptor by exiting, so nothing is left open either way.
port_is_listening() { ( exec 3<>"/dev/tcp/127.0.0.1/$1" ) >/dev/null 2>&1; }

# Proof that a container belongs to THIS compose project, from three
# independent angles - any one of them is enough, and none of them is the
# container's name. A name is not ownership: a `thinktank-qdrant` left behind by
# a different checkout of this repository carries different labels and is
# correctly treated as foreign.
container_is_ours() {
  local cid="$1" label
  label="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "${cid}" 2>/dev/null || true)"
  [ "${label}" = "${REPO_ROOT}" ] && return 0
  label="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "${cid}" 2>/dev/null || true)"
  case ",${label}," in
    *",${REPO_ROOT}/docker-compose.yml,"*) return 0 ;;
  esac
  # Older compose versions label less. Asking compose itself which containers
  # the project in this directory owns covers them.
  local own
  own="$(${COMPOSE} ps -aq 2>/dev/null || ${COMPOSE} ps -q 2>/dev/null || true)"
  printf '%s\n' "${own}" | grep -q "^${cid}" && return 0
  return 1
}

# A port nothing holds right now, for the "use another port" advice. Naming a
# fixed number would sooner or later print the port that just failed - which is
# what happens when the collision is on that number in the first place. So the
# suggestion is probed, and if the whole window is busy the advice says "a free
# port" rather than a number that is not one.
suggest_free_port() {
  local base="$1" p end
  end=$(( base + 40 ))
  p=$(( base + 10 ))
  while [ "${p}" -le "${end}" ] && [ "${p}" -le 65535 ]; do
    if ! port_is_listening "${p}" \
       && [ -z "$(docker ps --filter "publish=${p}" --format '{{.ID}}' 2>/dev/null || true)" ]; then
      printf '%s' "${p}"
      return 0
    fi
    p=$(( p + 1 ))
  done
  return 1
}

# Both published ports get the same treatment. The REST port is the one that
# hurt on a real machine, but compose publishes the gRPC port from the same
# file in the same instant: leaving 6334 unchecked would move the identical
# failure one line down and surface it as an opaque "up -d failed".
#
# QDRANT_URL appears only in the advice for the REST port. It carries no gRPC
# port, so printing it beside QDRANT_GRPC_HOST_PORT would be a wrong
# instruction - and step 2 would then reject the file the user just edited.
assert_port_available() {
  local port="$1" var="$2" role="$3"
  local holders foreign own_holder line cid cname free listener url_line

  free="$(suggest_free_port "${port}" || true)"
  [ -n "${free}" ] || free="<a free port>"
  url_line=""
  if [ "${var}" = "QDRANT_HOST_PORT" ]; then
    url_line="
               QDRANT_URL=http://localhost:${free}
             The first moves the published port, the second is what this script
             and the MCP server connect to - step 2 refuses to continue when the
             two disagree."
  fi

  holders="$(docker ps --filter "publish=${port}" --format '{{.ID}} {{.Names}}' 2>/dev/null || true)"
  foreign=""
  own_holder=""
  while IFS= read -r line; do
    [ -n "${line}" ] || continue
    cid="${line%% *}"
    cname="${line#* }"
    if container_is_ours "${cid}"; then
      own_holder="${cname}"
    else
      foreign="${foreign}${foreign:+, }${cname} (${cid})"
    fi
  done <<EOF
${holders}
EOF

  if [ -n "${foreign}" ]; then
    fail "Host port ${port} (${role}) is already published by a container that is not
         part of this installation: ${foreign}

         The installer will not displace it. Starting ThinkTank here would take
         the port away from that container and leave anything pointed at
         localhost:${port} talking to a new, empty Qdrant with a different API key.

         Two ways on:
           - stop the other service yourself, then re-run ./install.sh:
               docker stop ${foreign%% *}
           - or give ThinkTank a port of its own by adding a free one to ${ENV_FILE}:
               ${var}=${free}${url_line}"
  elif [ -n "${own_holder}" ]; then
    ok "Host port ${port} (${role}) is held by this installation's own container (${own_holder}) - 'up -d' is a no-op there."
  elif port_is_listening "${port}"; then
    listener=""
    if command -v lsof >/dev/null 2>&1; then
      listener="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sed -n '2p' | awk '{print $1" (pid "$2")"}' || true)"
    fi
    fail "Host port ${port} (${role}) is already in use by a process on this machine${listener:+: ${listener}}.
         It is not a Docker container, so no container name can be reported.
         Find it with:  lsof -nP -iTCP:${port} -sTCP:LISTEN

         The installer will not take the port. Stop that process, or give
         ThinkTank a port of its own in ${ENV_FILE}:
               ${var}=${free}${url_line}"
  else
    ok "Host port ${port} (${role}) is free."
  fi
}

assert_port_available "${QDRANT_HOST_PORT}"      QDRANT_HOST_PORT      "REST"
assert_port_available "${QDRANT_GRPC_HOST_PORT}" QDRANT_GRPC_HOST_PORT "gRPC"

# --- what is this container actually called? -------------------------------
#
# Read, not assumed. Both messages below used to say "thinktank-qdrant" as a
# literal, while docker-compose.yml carries `container_name:` as an ordinary,
# editable line. Anyone who changed it got a success message naming a container
# that does not exist and a `docker ps --filter name=...` that matches nothing -
# a confident statement about the wrong object, which is worse than saying
# nothing.
#
# `compose config` renders the file with variables resolved, so it answers for
# the file that is really in effect, overrides included. It is not called for
# anything but this name, and its output is only ever piped - it also renders
# the API key, which must not reach the terminal.
compose_container_name() {
  local n=""
  # jq is a hard prerequisite (step 1), so the structured path is always
  # available; --format json is not, on an older compose.
  n="$(${COMPOSE} config --format json 2>/dev/null | jq -r '.services.qdrant.container_name // empty' 2>/dev/null || true)"
  if [ -z "${n}" ] || [ "${n}" = "null" ]; then
    # YAML fallback for a compose without --format json. Single service, so the
    # first container_name is the right one; if a second service is ever added
    # here, this line needs to become service-aware.
    n="$(${COMPOSE} config 2>/dev/null | sed -n 's/^[[:space:]]*container_name:[[:space:]]*//p' | head -n1)"
  fi
  [ -n "${n}" ] || return 1
  printf '%s' "${n}"
}

# Once the container exists, compose can be asked what it actually called it.
# That is the better source of the two, and it is the only one that answers at
# all for a compose file carrying no `container_name:` line, where the name is
# generated as <project>-<service>-1. Only usable after `up -d`, which is why
# the config reader above still exists for the failure branch.
running_container_name() {
  local n=""
  n="$(${COMPOSE} ps --format json qdrant 2>/dev/null \
       | jq -r 'if type=="array" then .[0].Name else .Name end // empty' 2>/dev/null || true)"
  if [ -z "${n}" ] || [ "${n}" = "null" ]; then
    n="$(${COMPOSE} ps --format '{{.Name}}' qdrant 2>/dev/null | head -n1)"
  fi
  [ -n "${n}" ] || return 1
  printf '%s' "${n}"
}

# Never invented when it cannot be read: an empty value makes the messages
# below describe the container instead of naming it. A missing name is a small
# loss; a wrong one sends the reader looking for something that was never there.
QDRANT_CONTAINER="$(compose_container_name || true)"

if ${COMPOSE} up -d; then
  QDRANT_CONTAINER="$(running_container_name || printf '%s' "${QDRANT_CONTAINER}")"
  if [ -n "${QDRANT_CONTAINER}" ]; then
    ok "Container ${QDRANT_CONTAINER} is up."
  else
    ok "The Qdrant container is up (its name could not be read from the compose file)."
  fi
else
  if [ -n "${QDRANT_CONTAINER}" ]; then
    fail "'${COMPOSE} up -d' failed. Read the output above - a port conflict on ${QDRANT_HOST_PORT} and a stale container of the same name are the usual causes.
         Inspect with: docker ps -a --filter name=${QDRANT_CONTAINER}"
  else
    fail "'${COMPOSE} up -d' failed. Read the output above - a port conflict on ${QDRANT_HOST_PORT} and a stale container of the same name are the usual causes.
         Inspect with: ${COMPOSE} ps -a"
  fi
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

# -s, deliberately NOT -sS.
#
# -S re-enables error messages that -s suppressed, and this is the one caller
# in the script that runs in a loop. Against an unreachable target it printed
# about twenty
#
#   curl: (7) Failed to connect to 127.0.0.1 port 6399: Couldn't connect to server
#
# lines, which pushed the [fail] message that explains what to do off the top of
# the terminal. Nothing is lost by dropping -S: the HTTP status is what this
# function returns, "000" already means "no answer at all", and the failure path
# below prints the container's own logs, which say considerably more than
# curl's connect error does.
#
# The single-shot calls in step 9 keep -sS on purpose - there one error line is
# the useful thing rather than a wall.
#
# The API key comes from ${CURL_AUTH_FILE} (mode 0600), not from -H, so it is
# not in this process's argv while the poll runs.
probe() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    -K "${CURL_AUTH_FILE}" "${QDRANT_URL}$1" || printf '000'
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

# `mkdir -p` on a directory that already exists is a no-op and needs no write
# permission on it, which is what lets this line stand in front of a read-only
# but complete ~/.claude/hooks.
if ! mkdir -p "${CLAUDE_HOME}/skills" "${CLAUDE_HOME}/agents" "${CLAUDE_HOME}/hooks" 2>/dev/null; then
  fail "Could not create the target directories under ${CLAUDE_HOME}.
         Step 1 checked that anything still missing could be created, so
         something changed since - or one of them is now a file rather than a
         directory.
         Check with: ls -ld ${CLAUDE_HOME} ${CLAUDE_HOME}/skills ${CLAUDE_HOME}/agents ${CLAUDE_HOME}/hooks"
fi

installed=0
backed_up=0
failed=0
# Counted separately from "installed", and reported, because a re-run installs
# almost nothing: the files are already identical. Without this number the
# summary of such a run reads "0 installed", which looks like a failed copy
# rather than a directory that was already correct.
unchanged=0
FAILED_LIST=""

# Copy one file, preserving anything already at the destination under a
# timestamped name. Identical files are skipped, so a re-run does not litter
# the directory with backups of unchanged content - but the mode is still
# enforced, so a re-run repairs permissions that drifted.
#
# The mode is set explicitly rather than left to the ambient umask. With the
# common umask of 022, `cp` would give the loop guard hook mode 0755: readable
# by every local user, and the guard is exactly the file whose contents an
# attacker would want to read before working around it.
#
# NOTHING IN HERE IS ALLOWED TO KILL THE SCRIPT.
#
# It used to. `set -e` plus an unchecked `mv` is how a run ended on a bare
#
#   mv: rename .../tt-loop-completion-gate.sh to ....bak.<stamp>: Permission denied
#
# in the middle of the tree, with no summary, no exit code anyone read, and no
# statement of what had already been copied. Step 1 now makes that particular
# cause unreachable, but a check is a prediction and the copy is the event: a
# mode can change between them, a filesystem can fill up, a file can turn out to
# be an unreadable symlink. So each failure is recorded with its reason and the
# walk continues, which is what makes the inventory printed afterwards complete
# rather than "everything up to the first problem".
record_failure() {
  FAILED_LIST="${FAILED_LIST}${1}
    ${2}
"
  failed=$((failed + 1))
}

install_file() {
  local src="$1" dest="$2" mode="$3" err=""

  if ! err="$(mkdir -p "$(dirname "${dest}")" 2>&1)"; then
    record_failure "${dest}" "could not create its directory: ${err}"
    return 0
  fi

  if [ -f "${dest}" ]; then
    if cmp -s "${src}" "${dest}"; then
      chmod "${mode}" "${dest}" 2>/dev/null || warn "could not set mode ${mode} on ${dest}"
      unchanged=$((unchanged + 1))
      return 0
    fi
    # Renaming an entry needs write permission on the DIRECTORY, not on the
    # file. This is the line the real failure happened on.
    if ! err="$(mv "${dest}" "${dest}.bak.${STAMP}" 2>&1)"; then
      record_failure "${dest}" "could not back up the existing file: ${err}"
      return 0
    fi
    backed_up=$((backed_up + 1))
  fi

  if ! err="$(cp "${src}" "${dest}" 2>&1)"; then
    record_failure "${dest}" "could not be copied: ${err}"
    return 0
  fi
  chmod "${mode}" "${dest}" 2>/dev/null || warn "could not set mode ${mode} on ${dest}"
  installed=$((installed + 1))
}

# --- leftovers from an earlier version -------------------------------------
# install_file copies one file at a time and never removes one. That is right
# for what it does, but it means an upgrade only ever adds: a file the kit used
# to ship and no longer does simply stays behind. Observed on a real upgrade -
# five reference files from an older version of the same skill sitting next to
# the fifteen current ones, indistinguishable to anyone reading the directory.
#
# They are reported, never deleted. This is the deliberate choice, not
# timidity: the destination is the user's own ~/.claude, the same directories
# hold their own notes and their own agents, and an installer that quietly
# removes files it does not recognise is a far worse failure mode than a few
# stale ones. The user gets the list and a ready-made rm; the decision stays
# theirs.
#
# Two limits, stated rather than hidden:
#   - Only directories the kit writes into are examined, one level deep. A
#     whole directory from an older version whose name the kit no longer uses
#     is not seen.
#   - In a directory the kit shares with the user (~/.claude/agents and
#     ~/.claude/hooks hold their files too), only names inside the kit's own
#     namespace are claimed. Everything else there is theirs, and saying
#     otherwise about 40 unrelated agents would make the report worthless.
ORPHAN_LIST=""

scan_for_orphans() {
  local src_dir="$1" dest_dir="$2" shared_glob="$3"
  local manifest="${TT_SCAN_DIR}/manifest" dirs="${TT_SCAN_DIR}/dirs"
  local src rel d scan f base rel_dest

  : > "${manifest}"
  : > "${dirs}"
  while IFS= read -r src; do
    rel="${src#"${src_dir}/"}"
    printf '%s\n' "${rel}" >> "${manifest}"
    printf '%s\n' "$(dirname "${rel}")" >> "${dirs}"
  done < <(find "${src_dir}" -type f ! -name '.DS_Store')
  sort -u "${dirs}" -o "${dirs}"

  while IFS= read -r d; do
    if [ "${d}" = "." ]; then
      # The destination root, shared with the user. Without a namespace to
      # scope the claim there is nothing defensible to report.
      [ -n "${shared_glob}" ] || continue
      scan="${dest_dir}"
    else
      # A directory that exists only because the kit created it. Everything in
      # it that the kit does not ship is a leftover.
      scan="${dest_dir}/${d}"
    fi
    [ -d "${scan}" ] || continue
    while IFS= read -r f; do
      base="$(basename "${f}")"
      case "${base}" in
        .DS_Store) continue ;;
        # A backup this script made: <name>.bak.YYYYmmdd-HHMMSS. Matched on the
        # shape, not on ".bak" alone, so a file the user happens to have called
        # something.bak.old is still reported rather than excused.
        *.bak.[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]) continue ;;
      esac
      if [ "${d}" = "." ]; then
        case "${base}" in
          ${shared_glob}) : ;;
          *) continue ;;
        esac
      fi
      rel_dest="${f#"${dest_dir}/"}"
      if ! grep -qxF "${rel_dest}" "${manifest}"; then
        ORPHAN_LIST="${ORPHAN_LIST}${f}
"
      fi
    done < <(find "${scan}" -maxdepth 1 -type f)
  done < "${dirs}"
}

# Per-tree tallies, so the summary can say WHICH of the three is incomplete.
# "3 files failed" across the whole step does not tell anyone whether the hooks
# are in place, and that is the only one of the three that gates anything.
TREE_REPORT=""

copy_tree() {
  local src_dir="$1" dest_dir="$2" label="$3" mode="$4" shared_glob="${5:-}"
  local before_i="${installed}" before_f="${failed}" before_b="${backed_up}"
  local before_u="${unchanged}"
  local n_i n_f n_b n_u
  if [ ! -d "${src_dir}" ]; then
    warn "No ${label} directory in the repository - skipping."
    TREE_REPORT="${TREE_REPORT}${label}: not in the repository, nothing installed
"
    return 0
  fi
  if [ -z "$(find "${src_dir}" -type f -print -quit)" ]; then
    warn "${label} directory is empty - skipping."
    TREE_REPORT="${TREE_REPORT}${label}: empty in the repository, nothing installed
"
    return 0
  fi
  # Step 1 found this tree read-only and, by comparing it file by file, found
  # it already complete. Walking it anyway would work - install_file's cmp -s
  # branch touches nothing - but it would count every file as "already current"
  # and the summary would then be indistinguishable from a tree the installer
  # had really gone through. It did not go through this one, and the inventory
  # has to say so.
  if preflight_tree_skipped "${label}"; then
    warn "${label}: ${dest_dir} is read-only and already holds every file this kit ships - skipped, nothing written."
    TREE_REPORT="${TREE_REPORT}${label}: SKIPPED - directory read-only, all files verified byte-identical in step 1, nothing written -> ${dest_dir}
"
    # The orphan scan reads and reports only; it never deletes, so it is just
    # as valid against a read-only directory and the answer is just as useful.
    scan_for_orphans "${src_dir}" "${dest_dir}" "${shared_glob}"
    return 0
  fi
  while IFS= read -r src; do
    rel="${src#"${src_dir}/"}"
    install_file "${src}" "${dest_dir}/${rel}" "${mode}"
  done < <(find "${src_dir}" -type f ! -name '.DS_Store')

  n_i=$(( installed - before_i ))
  n_f=$(( failed - before_f ))
  n_b=$(( backed_up - before_b ))
  n_u=$(( unchanged - before_u ))
  TREE_REPORT="${TREE_REPORT}${label}: ${n_i} installed, ${n_u} already current, ${n_b} backed up, ${n_f} FAILED -> ${dest_dir}
"
  # Only claim success when there was some. The old line said "[ok] hooks
  # copied" on the strength of having reached the end of the loop.
  #
  # No fraction in the failure line. "2 of 2 failed" was the first thing this
  # printed, and it was false in the way that matters: the denominator counted
  # only the files this run touched, not the tree - the other 14 were identical
  # and skipped. A wrong ratio is worse than no ratio, so the count stands on
  # its own and the per-tree line below carries the breakdown.
  if [ "${n_f}" -eq 0 ]; then
    ok "${label} copied (mode ${mode})."
  else
    warn "${label}: ${n_f} file(s) could not be installed (${n_i} installed, ${n_u} already current)."
  fi
  scan_for_orphans "${src_dir}" "${dest_dir}" "${shared_glob}"
}

TT_SCAN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/thinktank-install.XXXXXX")"

# The fifth argument names the kit's namespace in a directory it shares with
# the user. skills/ needs none: every file the kit puts there lives in a
# subdirectory the kit itself owns.
copy_tree "${REPO_ROOT}/skills" "${CLAUDE_HOME}/skills" "skills" 0644
copy_tree "${REPO_ROOT}/agents" "${CLAUDE_HOME}/agents" "agents" 0644 'thinktank-*'
# Hooks are executed by the harness and gate irreversible actions. Owner-only:
# executable for the user who runs Claude Code, invisible to everyone else.
copy_tree "${REPO_ROOT}/hooks"  "${CLAUDE_HOME}/hooks"  "hooks"  0700 'tt-loop-*'

log "${installed} file(s) installed, ${unchanged} already current, ${backed_up} existing file(s) backed up with the suffix .bak.${STAMP}"

# A skipped tree belongs in the closing inventory, not only in the warning that
# scrolled past ten seconds ago. "0 installed" for a tree nobody walked and "0
# installed" for a tree that was already correct are different facts, and this
# is where they get told apart.
if [ -n "${PREFLIGHT_SKIPPED_TREES}" ]; then
  printf '%s' "${PREFLIGHT_SKIPPED_TREES}" | while IFS= read -r t; do
    [ -n "${t}" ] && log "${t}: SKIPPED - ${CLAUDE_HOME}/${t} is read-only; step 1 compared every file and found them all identical, so nothing had to be written."
  done
  log "Nothing in a skipped tree was touched. If you later change one of those"
  log "files in the repository, unlock the directory, re-run ./install.sh, and"
  log "lock it again - step 1 will then say which file differs."
fi

if [ -n "${ORPHAN_LIST}" ]; then
  printf '\n'
  warn "These files are left over from a previous install. This kit no longer"
  warn "ships them, and they were not created by this script:"
  printf '%s' "${ORPHAN_LIST}" | while IFS= read -r f; do
    [ -n "${f}" ] && printf '           %s\n' "${f}"
  done
  warn ""
  warn "Nothing was deleted. These sit in your own ~/.claude, so the call is"
  warn "yours - check the list, then remove them if you agree:"
  printf '\n'
  printf '  rm -f'
  printf '%s' "${ORPHAN_LIST}" | while IFS= read -r f; do
    [ -n "${f}" ] && printf " \\\\\n    '%s'" "$(printf '%s' "${f}" | sed "s/'/'\\\\''/g")"
  done
  printf '\n\n'
fi

# --- did step 6 finish? ----------------------------------------------------
#
# The point of this block is that a partial install is stated, not left to be
# inferred. Whatever went wrong, the user gets the same three facts: what is on
# disk now, what is not, and which of the remaining steps therefore did not run.
# The failure this replaces produced none of them.
if [ "${failed}" -gt 0 ]; then
  printf '\n'
  warn "Step 6 did not complete. What is on disk now:"
  printf '\n'
  printf '%s' "${TREE_REPORT}" | while IFS= read -r line; do
    [ -n "${line}" ] && printf '           %s\n' "${line}"
  done
  printf '\n'
  warn "The file(s) that could not be installed, with the reason:"
  printf '\n'
  printf '%s' "${FAILED_LIST}" | while IFS= read -r line; do
    [ -n "${line}" ] && printf '           %s\n' "${line}"
  done
  printf '\n'
  fail "Stopping here, with ${failed} file(s) missing. Steps 7, 8 and 9 did NOT run:
         the MCP server is not registered, the settings.json hook block was not
         printed, and the collection was not smoke-tested.

         This is a PARTIAL installation. It is not a broken one - re-running
         ./install.sh after fixing the cause above installs only what is missing
         and leaves the rest alone. Until then, treat loop mode as unavailable:
         a hook that was not replaced is the old version, and a hook file that
         is missing gates nothing at all while looking like it does.

         If a permission is the cause, the three commands from step 1 apply here
         too - unlock the directory, re-run this script, lock it again."
fi


# ===========================================================================
# 7. Register the MCP server
# ===========================================================================
step "7/9  MCP server registration"

MCP_NAME="qdrant-thinktank"
LAUNCHER="${REPO_ROOT}/scripts/qdrant-mcp-launcher.sh"

# Raised when a registration exists under the right name but does not point at
# this clone. Step 7 says so where it finds it, and the closing summary says it
# again, because steps 8 and 9 print enough output afterwards to scroll a single
# warning off the screen - and this particular warning is the one that decides
# whether the memory backend works at all.
MCP_REGISTRATION_STALE=0

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
  # in front of it, and the pattern then also hits any server whose name merely
  # STARTS with ${MCP_NAME} - "${MCP_NAME}-old", "${MCP_NAME}-2", a suffixed
  # copy of any kind. On a machine carrying one of those, the check reports
  # "already registered" and this server never gets added.
  if ! mcp_list_out="$(claude mcp list 2>&1)"; then
    warn "'claude mcp list' failed. Its output was:"
    printf '%s\n' "${mcp_list_out}" | sed 's/^/    /'
    warn "Continuing as if the server were not registered."
    mcp_list_out=""
  fi
  # `|| true` because grep exits 1 when it matches nothing, which is the
  # ordinary "not registered yet" case, and `set -e` would end the install here.
  mcp_line="$(printf '%s\n' "${mcp_list_out}" | grep "^${MCP_NAME}:" | head -n 1 || true)"
  if [ -n "${mcp_line}" ]; then
    # A registration under the right name is not the same as a working one.
    # Before this check the installer stopped at the name and reported success,
    # so a registration left behind by a clone that has since been moved,
    # renamed or deleted survived every later reinstall while the installer kept
    # calling it fine. Nothing downstream corrects that: Claude Code drops a
    # server whose command will not start, and the memory tools are then simply
    # absent from the session, with the error in a place the user is not
    # looking. An installer that cannot be re-run to fix a broken install is
    # only half an installer.
    #
    # The test is `grep -F` for this clone's launcher rather than a parse of the
    # line. The CLI prints "<name>: <command> - <status>", and a clone directory
    # may legally contain both spaces and " - ", so every way of splitting that
    # line is a guess. Asking whether this launcher appears in it is not.
    if printf '%s\n' "${mcp_line}" | grep -qF -- "${LAUNCHER}"; then
      ok "MCP server '${MCP_NAME}' is already registered against this clone."
      log "To re-register it with the current .env values:"
      log "  claude mcp remove ${MCP_NAME} --scope user  &&  ./install.sh"
    else
      MCP_REGISTRATION_STALE=1
      warn "MCP server '${MCP_NAME}' is registered, but not against this clone."
      log "Registered:"
      printf '%s\n' "${mcp_line}" | sed 's/^/      /'
      log "This clone:"
      log "      ${LAUNCHER}"
      log ""

      # Best effort, and only ever used to sharpen the message: if the
      # registered command is an absolute path that is simply gone, say so
      # outright rather than leaving two long paths to be compared by eye. When
      # the parse yields nothing usable the generic wording below still stands.
      mcp_cmd="${mcp_line#"${MCP_NAME}":}"
      mcp_cmd="${mcp_cmd% - *}"
      mcp_bin="$(printf '%s' "${mcp_cmd}" | awk '{print $1}')"
      if [ -n "${mcp_bin}" ] && [ "${mcp_bin#/}" != "${mcp_bin}" ] && [ ! -e "${mcp_bin}" ]; then
        warn "That path does not exist, so the registration is dead. The memory"
        warn "tools will be missing from your session without an error message."
      else
        log "If another clone of ThinkTank owns that registration, this is"
        log "expected and you can leave it as it is."
      fi
      log ""
      log "To point it at this clone instead:"
      log "  claude mcp remove ${MCP_NAME} --scope user"
      log "  ./install.sh"
    fi
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
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/tt-loop-completion-gate.sh" }
        ]
      }
    ]
  }

  Two details are load-bearing. PreToolUse carries "matcher": "*", because the
  guard has to see every tool call, not only Bash. TaskCompleted carries no
  matcher, because it is not a tool event and there is nothing to match on. Write
  the paths with $HOME rather than ~: the command runs through a shell, which
  expands the variable reliably, while a tilde that survives unexpanded points at
  a directory that does not exist. The hook then fails to start, and a hook that
  never runs gates nothing while looking exactly like one that does.

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

# -K "${CURL_AUTH_FILE}" carries the api-key header. -H stays for
# Content-Type, which is not a secret, and the two compose: a header from the
# config file and a header from the command line are both sent.
#
# -sS is right here and wrong in step 4's poll. These are single calls whose
# status is inspected immediately, so one curl error line is information, not
# noise.
smoke_call() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "${body}" ]; then
    curl -sS -X "${method}" -K "${CURL_AUTH_FILE}" \
      -H "Content-Type: application/json" -w '\n%{http_code}' --max-time 30 \
      -d "${body}" "${QDRANT_URL}${path}"
  else
    curl -sS -X "${method}" -K "${CURL_AUTH_FILE}" \
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

# Repeated from step 7 on purpose. A smoke test that passes proves the backend
# is reachable from this shell, and says nothing about whether Claude Code can
# reach it - that depends on the registration, and a stale one fails silently.
# Ending on "Done" while that is outstanding is how the earlier version of this
# script told people their install was fine when it was not.
if [ "${MCP_REGISTRATION_STALE:-0}" = "1" ]; then
  warn "The MCP registration for '${MCP_NAME}' does not point at this clone."
  warn "Until you repoint it, Claude Code starts without the memory tools and"
  warn "says nothing about it. See step 7 above for the two commands."
  printf '\n'
fi

log "1. Merge the hook block from step 8 into ${SETTINGS_FILE}."
log "2. Restart Claude Code so it picks up the MCP server and the new skills."
log "3. Try it: /thinktank <your task>"
printf '\n'
log "Stop the backend:   ${COMPOSE} down"
log "Stop and wipe it:   ${COMPOSE} down -v   (this deletes every stored memory)"
printf '\n'
