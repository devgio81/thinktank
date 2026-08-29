#!/usr/bin/env bash
#
# init-collections.sh - create the ThinkTank memory collection if it is missing.
#
# Idempotent: an existing collection is reported and left untouched. This script
# never deletes, never recreates, and never edits vector parameters on a
# collection that already holds points.
#
# Usage:
#   ./scripts/init-collections.sh
#
# Reads QDRANT_URL, QDRANT_API_KEY, COLLECTION_NAME and EMBEDDING_MODEL from
# .env in the repo root; each may be overridden by an environment variable of
# the same name.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
fail() { printf '  [fail] %s\n' "$*" >&2; exit 1; }

# --- load .env -------------------------------------------------------------
if [ -f "${ENV_FILE}" ]; then
  # `set -a` exports everything sourced, so the values reach child processes.
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION_NAME="${COLLECTION_NAME:-thinktank-memory}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-sentence-transformers/all-MiniLM-L6-v2}"

# ---------------------------------------------------------------------------
# Vector parameters
#
# VECTOR_SIZE is NOT a constant. It is the output dimension of EMBEDDING_MODEL,
# and it is looked up below rather than assumed, because a wrong size is not a
# cosmetic defect: Qdrant accepts the CREATE happily and then rejects the first
# real write with
#
#   Vector dimension error: expected dim: 384, got 768 for vector '<name>'
#
# i.e. the setup reports success and the memory system is dead on first store.
# A default of 384 would be right for the default model and silently wrong for
# every other one, so an unknown model is a hard stop, not a guess.
#
# VECTOR_NAME is not cosmetic either. mcp-server-qdrant embeds through fastembed
# and
# writes into a *named* vector, deriving the name as "fast-" plus the last path
# segment of the model id, lowercased:
#
#   sentence-transformers/all-MiniLM-L6-v2  ->  fast-all-minilm-l6-v2
#
# A collection created with an unnamed vector ({"vectors":{"size":384,...}})
# looks healthy over REST and still fails on the very first store and the very
# first search, with:
#
#   Not existing vector name error: fast-all-minilm-l6-v2
#
# The name is therefore derived from EMBEDDING_MODEL rather than hard-coded, so
# that pointing .env at a different model cannot silently create a collection
# the MCP server is unable to write to. Override VECTOR_NAME only if you know
# the server uses a different name.
# ---------------------------------------------------------------------------
DISTANCE="${DISTANCE:-Cosine}"

derive_vector_name() {
  local model="$1" leaf
  leaf="${model##*/}"                       # drop the org/ prefix, if any
  leaf="$(printf '%s' "${leaf}" | tr '[:upper:]' '[:lower:]')"
  printf 'fast-%s' "${leaf}"
}
VECTOR_NAME="${VECTOR_NAME:-$(derive_vector_name "${EMBEDDING_MODEL}")}"

# --- model -> dimension ----------------------------------------------------
# The full set of text models fastembed can actually load, with the dimension
# fastembed itself reports. Read out of the library's own registry rather than
# copied from model cards:
#
#   uv run --no-project --with fastembed python -c \
#     "from fastembed import TextEmbedding
#      [print(m['model'], m['dim']) for m in TextEmbedding.list_supported_models()]"
#
# (30 models, verified 2026-08-29 against fastembed as installed by that
# command. Re-run it after a fastembed upgrade to pick up new models.)
#
# Matching is case-insensitive on the full model id, because that is how the id
# is written in .env - "BAAI/bge-small-en-v1.5", not the leaf.
fastembed_dim() {
  local m
  m="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "${m}" in
    baai/bge-base-en)                                            printf '768' ;;
    baai/bge-base-en-v1.5)                                       printf '768' ;;
    baai/bge-large-en-v1.5)                                      printf '1024' ;;
    baai/bge-small-en)                                           printf '384' ;;
    baai/bge-small-en-v1.5)                                      printf '384' ;;
    baai/bge-small-zh-v1.5)                                      printf '512' ;;
    qdrant/clip-vit-b-32-text)                                   printf '512' ;;
    intfloat/multilingual-e5-large)                              printf '1024' ;;
    jinaai/jina-clip-v1)                                         printf '768' ;;
    jinaai/jina-embeddings-v2-base-code)                         printf '768' ;;
    jinaai/jina-embeddings-v2-base-de)                           printf '768' ;;
    jinaai/jina-embeddings-v2-base-en)                           printf '768' ;;
    jinaai/jina-embeddings-v2-base-es)                           printf '768' ;;
    jinaai/jina-embeddings-v2-base-zh)                           printf '768' ;;
    jinaai/jina-embeddings-v2-small-en)                          printf '512' ;;
    jinaai/jina-embeddings-v3)                                   printf '1024' ;;
    mixedbread-ai/mxbai-embed-large-v1)                          printf '1024' ;;
    nomic-ai/nomic-embed-text-v1)                                printf '768' ;;
    nomic-ai/nomic-embed-text-v1.5)                              printf '768' ;;
    nomic-ai/nomic-embed-text-v1.5-q)                            printf '768' ;;
    sentence-transformers/all-minilm-l6-v2)                      printf '384' ;;
    sentence-transformers/paraphrase-multilingual-minilm-l12-v2) printf '384' ;;
    sentence-transformers/paraphrase-multilingual-mpnet-base-v2) printf '768' ;;
    snowflake/snowflake-arctic-embed-l)                          printf '1024' ;;
    snowflake/snowflake-arctic-embed-m)                          printf '768' ;;
    snowflake/snowflake-arctic-embed-m-long)                     printf '768' ;;
    snowflake/snowflake-arctic-embed-s)                          printf '384' ;;
    snowflake/snowflake-arctic-embed-xs)                         printf '384' ;;
    thenlper/gte-base)                                           printf '768' ;;
    thenlper/gte-large)                                          printf '1024' ;;
    *)                                                           printf '' ;;
  esac
}

KNOWN_SIZE="$(fastembed_dim "${EMBEDDING_MODEL}")"
SIZE_WARNING=0

if [ -n "${VECTOR_SIZE:-}" ]; then
  # Explicitly set (environment or .env). Honour it - someone may be running a
  # model this table does not know - but say so when it contradicts the table,
  # because then one of the two is wrong and the write will fail either way.
  case "${VECTOR_SIZE}" in
    ''|*[!0-9]*) fail "VECTOR_SIZE must be a positive integer, got '${VECTOR_SIZE}'." ;;
  esac
  [ "${VECTOR_SIZE}" -gt 0 ] || fail "VECTOR_SIZE must be greater than zero."
  if [ -n "${KNOWN_SIZE}" ] && [ "${VECTOR_SIZE}" != "${KNOWN_SIZE}" ]; then
    # Held back rather than printed here, so it appears under the header block
    # that states the parameters it is warning about.
    SIZE_WARNING=1
  fi
elif [ -n "${KNOWN_SIZE}" ]; then
  VECTOR_SIZE="${KNOWN_SIZE}"
else
  fail "Unknown EMBEDDING_MODEL '${EMBEDDING_MODEL}': this script does not know its vector dimension, and guessing one would create a collection that reports [ok] and then rejects the very first store with 'Vector dimension error'. Either set EMBEDDING_MODEL to a model fastembed supports (see the table in this script; note that mcp-server-qdrant can only load fastembed models, so an id missing from that list will most likely fail there too), or, if you know the dimension, state it: VECTOR_SIZE=<dim> ./scripts/init-collections.sh"
fi

if [ -z "${QDRANT_API_KEY}" ]; then
  fail "QDRANT_API_KEY is empty. Run ./install.sh, or set the key in ${ENV_FILE}."
fi

command -v curl >/dev/null 2>&1 || fail "curl is required but not installed."

HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

# --- helper: one REST call, returns body + status --------------------------
# Prints the response body on stdout and the HTTP status as the last line.
qdrant_call() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "${body}" ]; then
    curl -sS -X "${method}" \
      -H "api-key: ${QDRANT_API_KEY}" \
      -H "Content-Type: application/json" \
      -w '\n%{http_code}' \
      --max-time 30 \
      -d "${body}" \
      "${QDRANT_URL}${path}"
  else
    curl -sS -X "${method}" \
      -H "api-key: ${QDRANT_API_KEY}" \
      -w '\n%{http_code}' \
      --max-time 30 \
      "${QDRANT_URL}${path}"
  fi
}

# Escape a string so it can be used literally inside a POSIX basic regular
# expression. Model leaf names carry dots (bge-small-en-v1.5), and an unescaped
# dot would quietly match any character.
sed_escape() { printf '%s' "$1" | sed 's/[][\.*^$/&]/\\&/g'; }

printf '\n== ThinkTank collection setup ==\n'
log "instance:   ${QDRANT_URL}"
log "collection: ${COLLECTION_NAME}"
log "model:      ${EMBEDDING_MODEL}"
log "vectors:    ${VECTOR_NAME} (${VECTOR_SIZE}-dim, ${DISTANCE})"
printf '\n'

if [ "${SIZE_WARNING}" -eq 1 ]; then
  log "WARNING: VECTOR_SIZE is set to ${VECTOR_SIZE}, but ${EMBEDDING_MODEL}"
  log "         produces ${KNOWN_SIZE}-dim vectors. Every store will fail with"
  log "         'Vector dimension error'. Unset VECTOR_SIZE to use ${KNOWN_SIZE}."
  printf '\n'
fi

# --- reachability ----------------------------------------------------------
response="$(qdrant_call GET "/collections" || true)"
status="$(printf '%s' "${response}" | tail -n1)"

case "${status}" in
  200) : ;;
  401|403)
    fail "Qdrant rejected the API key (HTTP ${status}). The key in ${ENV_FILE} does not match the running container. Restart it with: docker compose up -d --force-recreate"
    ;;
  "")
    fail "No response from ${QDRANT_URL}. Is the container running? Try: docker compose up -d"
    ;;
  *)
    fail "Unexpected response from ${QDRANT_URL}/collections (HTTP ${status})."
    ;;
esac

# --- does the collection already exist? ------------------------------------
response="$(qdrant_call GET "/collections/${COLLECTION_NAME}" || true)"
status="$(printf '%s' "${response}" | tail -n1)"
body="$(printf '%s' "${response}" | sed '$d')"

if [ "${status}" = "200" ]; then
  ok "Collection '${COLLECTION_NAME}' already exists - leaving it untouched."

  # Read back what the existing collection actually declares. jq handles both
  # shapes properly; the sed path is the no-jq fallback and can only read the
  # size.
  existing_size=""
  existing_names=""
  if [ "${HAVE_JQ}" -eq 1 ]; then
    existing_size="$(printf '%s' "${body}" | jq -r --arg n "${VECTOR_NAME}" '
      .result.config.params.vectors
      | if type != "object" then empty
        elif has("size") then (.size|tostring)
        elif has($n) then (.[$n].size|tostring)
        else empty end' 2>/dev/null || true)"
    existing_names="$(printf '%s' "${body}" | jq -r '
      .result.config.params.vectors
      | if type != "object" then empty
        elif has("size") then "<unnamed>"
        else (keys | join(", ")) end' 2>/dev/null || true)"
  else
    esc_name="$(sed_escape "${VECTOR_NAME}")"
    flat="$(printf '%s' "${body}" | tr -d ' \n')"
    existing_size="$(printf '%s' "${flat}" | sed -n "s/.*\"${esc_name}\":{\"size\":\([0-9][0-9]*\).*/\1/p" | head -n1)"
    if [ -z "${existing_size}" ]; then
      existing_size="$(printf '%s' "${flat}" | sed -n 's/.*"vectors":{"size":\([0-9][0-9]*\).*/\1/p' | head -n1)"
      [ -n "${existing_size}" ] && existing_names="<unnamed>"
    else
      existing_names="${VECTOR_NAME}"
    fi
  fi

  if [ -n "${existing_names}" ]; then
    log "existing vectors: ${existing_names}${existing_size:+ (${existing_size}-dim)}"
  fi

  if [ -n "${existing_size}" ] && [ "${existing_size}" != "${VECTOR_SIZE}" ]; then
    printf '\n'
    log "WARNING: the existing collection declares ${existing_size}-dim vectors,"
    log "         but this script expects ${VECTOR_SIZE}. That mismatch means the"
    log "         collection was built with a different embedding model. Point"
    log "         EMBEDDING_MODEL back at the original model, or create a new"
    log "         collection and migrate into it - do not write mixed vectors."
  fi

  if [ -n "${existing_names}" ] && [ "${existing_names}" != "${VECTOR_NAME}" ]; then
    printf '\n'
    log "WARNING: the existing collection carries vector '${existing_names}',"
    log "         but mcp-server-qdrant will write into '${VECTOR_NAME}' for"
    log "         EMBEDDING_MODEL=${EMBEDDING_MODEL}. Every store and every"
    log "         search will fail with 'Not existing vector name error'."
    log "         Either set EMBEDDING_MODEL back to the model this collection"
    log "         was built with, or point COLLECTION_NAME at a new collection"
    log "         and migrate: ./scripts/migrate-collection.sh <old-collection>"
  fi

  printf '\n'
  exit 0
fi

if [ "${status}" != "404" ]; then
  fail "Could not determine whether '${COLLECTION_NAME}' exists (HTTP ${status}): ${body}"
fi

# --- create ----------------------------------------------------------------
log "Collection '${COLLECTION_NAME}' does not exist. Creating it."

create_body="$(printf '{"vectors":{"%s":{"size":%s,"distance":"%s"}}}' \
  "${VECTOR_NAME}" "${VECTOR_SIZE}" "${DISTANCE}")"
response="$(qdrant_call PUT "/collections/${COLLECTION_NAME}" "${create_body}" || true)"
status="$(printf '%s' "${response}" | tail -n1)"
body="$(printf '%s' "${response}" | sed '$d')"

if [ "${status}" != "200" ]; then
  fail "Creating '${COLLECTION_NAME}' failed (HTTP ${status}): ${body}"
fi

# Verify rather than trust the status code, and verify the vector name came
# back the way it was sent - a 200 here says nothing about the shape stored.
response="$(qdrant_call GET "/collections/${COLLECTION_NAME}" || true)"
status="$(printf '%s' "${response}" | tail -n1)"
body="$(printf '%s' "${response}" | sed '$d')"
[ "${status}" = "200" ] || fail "Collection was reported created but cannot be read back (HTTP ${status})."

esc_name="$(sed_escape "${VECTOR_NAME}")"
if ! printf '%s' "${body}" | tr -d ' \n' | grep -q "\"vectors\":{\"${esc_name}\":{"; then
  fail "Collection '${COLLECTION_NAME}' was created, but it does not declare the named vector '${VECTOR_NAME}'. mcp-server-qdrant would fail on every store. Response: ${body}"
fi

ok "Collection '${COLLECTION_NAME}' created (vector '${VECTOR_NAME}', ${VECTOR_SIZE}-dim, ${DISTANCE})."
printf '\n'
