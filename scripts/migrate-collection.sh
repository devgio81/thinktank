#!/usr/bin/env bash
#
# migrate-collection.sh - copy points from another collection into the
# ThinkTank memory collection.
#
# This upgrade path is for anyone who ran an earlier setup under a different
# collection name. It reads the source through the scroll API, processes it
# page by page, and upserts each batch into the target. It preserves point IDs
# and payloads, so rerunning the migration overwrites existing points instead
# of creating duplicates.
#
# It will not write to a target whose vector size or distance metric differs
# from the source. Mixed vectors are worse than no migration: every subsequent
# search would silently return nonsense.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

SOURCE_COLLECTION=""
DRY_RUN=0
BATCH=128

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
warn() { printf '  [warn] %s\n' "$*" >&2; }
fail() { printf '  [fail] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
migrate-collection.sh - copy points from another collection into the ThinkTank
memory collection.

Usage:
  ./scripts/migrate-collection.sh SOURCE_COLLECTION [--dry-run] [--batch N]

  SOURCE_COLLECTION  required - the collection to copy FROM. There is no
                     default: nothing should be read out of a collection you
                     did not name yourself.
  --dry-run          count the source points and check compatibility, write
                     nothing
  --batch N          points per scroll page and per upsert (default 128)

The target is COLLECTION_NAME from .env (default: thinktank-memory).

Example:
  ./scripts/migrate-collection.sh my-old-memory --dry-run
  ./scripts/migrate-collection.sh my-old-memory

To see which collections exist on your instance:
  curl -s -H "api-key: $QDRANT_API_KEY" "$QDRANT_URL/collections" | jq -r '.result.collections[].name'

  (QDRANT_URL and QDRANT_API_KEY are in .env; without jq, read the JSON as it
  comes.)
USAGE
}

# --- arguments -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --batch)
      [ $# -ge 2 ] || fail "--batch needs a number."
      BATCH="$2"; shift 2 ;;
    -h|--help)
      usage
      exit 0 ;;
    -*) fail "Unknown option: $1" ;;
    *)
      [ -z "${SOURCE_COLLECTION}" ] || fail "Only one source collection may be given."
      SOURCE_COLLECTION="$1"; shift ;;
  esac
done

if [ -z "${SOURCE_COLLECTION}" ]; then
  usage >&2
  printf '\n'
  fail "No source collection given. Name the collection you want to copy from."
fi

case "${BATCH}" in
  ''|*[!0-9]*) fail "--batch must be a positive integer." ;;
esac
[ "${BATCH}" -gt 0 ] || fail "--batch must be greater than zero."

# --- load .env -------------------------------------------------------------
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
TARGET_COLLECTION="${COLLECTION_NAME:-thinktank-memory}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"

[ -n "${QDRANT_API_KEY}" ] || fail "QDRANT_API_KEY is empty. Run ./install.sh, or set the key in ${ENV_FILE}."
command -v curl >/dev/null 2>&1 || fail "curl is required but not installed."
command -v jq   >/dev/null 2>&1 || fail "jq is required for this script (it rewrites JSON point batches). Install it with: brew install jq  /  apt-get install jq"

[ "${SOURCE_COLLECTION}" != "${TARGET_COLLECTION}" ] || fail "Source and target are the same collection ('${SOURCE_COLLECTION}'). Nothing to do."

# --- REST helpers ----------------------------------------------------------
# Body on stdout, HTTP status as the final line.
qdrant_call() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "${body}" ]; then
    curl -sS -X "${method}" \
      -H "api-key: ${QDRANT_API_KEY}" \
      -H "Content-Type: application/json" \
      -w '\n%{http_code}' --max-time 120 \
      -d "${body}" "${QDRANT_URL}${path}"
  else
    curl -sS -X "${method}" \
      -H "api-key: ${QDRANT_API_KEY}" \
      -w '\n%{http_code}' --max-time 120 \
      "${QDRANT_URL}${path}"
  fi
}

status_of() { printf '%s' "$1" | tail -n1; }
body_of()   { printf '%s' "$1" | sed '$d'; }

# Reads the vector configuration of a collection into the globals DESC_KIND,
# DESC_NAME, DESC_SIZE and DESC_DISTANCE.
#
# Assigning globals rather than printing to stdout is deliberate: `fail` inside
# a command substitution would only kill the subshell, and the caller would
# carry on with empty values. Assigning globals keeps the abort an abort.
#
# Named vectors are the normal case, not an exception: mcp-server-qdrant writes
# into a named vector ("fast-" plus the lowercased model leaf, e.g.
# fast-all-minilm-l6-v2), so essentially every real source collection has one.
# Unnamed single-vector collections are still handled, because hand-made
# collections and older setups have them.
#
# Collections with more than one named vector are refused. Choosing which one
# to carry over is a decision this script has no basis to make.
DESC_KIND=""
DESC_NAME=""
DESC_SIZE=""
DESC_DISTANCE=""
describe_collection() {
  local info="$1" name="$2" kind count names path
  kind="$(printf '%s' "${info}" | jq -r '
    .result.config.params.vectors
    | if type == "object" and has("size") then "unnamed"
      elif type == "object" then "named"
      else "unknown" end' 2>/dev/null || echo unknown)"

  case "${kind}" in
    unnamed)
      DESC_KIND="unnamed"
      DESC_NAME=""
      path='.result.config.params.vectors'
      ;;
    named)
      count="$(printf '%s' "${info}" | jq -r '.result.config.params.vectors | keys | length')"
      names="$(printf '%s' "${info}" | jq -r '.result.config.params.vectors | keys | join(", ")')"
      if [ "${count}" != "1" ]; then
        fail "Collection '${name}' declares ${count} named vectors (${names}). This script migrates collections with exactly one vector; picking one for you would be a guess."
      fi
      DESC_KIND="named"
      DESC_NAME="$(printf '%s' "${info}" | jq -r '.result.config.params.vectors | keys[0]')"
      path='.result.config.params.vectors[$n]'
      ;;
    *)
      fail "Could not read the vector configuration of '${name}'."
      ;;
  esac

  DESC_SIZE="$(printf '%s' "${info}" | jq -r --arg n "${DESC_NAME}" "${path}.size | tostring")"
  DESC_DISTANCE="$(printf '%s' "${info}" | jq -r --arg n "${DESC_NAME}" "${path}.distance")"

  case "${DESC_SIZE}" in
    ''|null|*[!0-9]*) fail "Collection '${name}' reports no usable vector size." ;;
  esac
  if [ -z "${DESC_DISTANCE}" ] || [ "${DESC_DISTANCE}" = "null" ]; then
    fail "Collection '${name}' reports no distance metric."
  fi
}

describe_label() {
  # "vector 'x' (384-dim, Cosine)" / "unnamed vector (384-dim, Cosine)"
  local kind="$1" name="$2" size="$3" dist="$4"
  if [ "${kind}" = "named" ]; then
    printf "vector '%s' (%s-dim, %s)" "${name}" "${size}" "${dist}"
  else
    printf 'unnamed vector (%s-dim, %s)' "${size}" "${dist}"
  fi
}

printf '\n== ThinkTank collection migration ==\n'
log "instance: ${QDRANT_URL}"
log "source:   ${SOURCE_COLLECTION}"
log "target:   ${TARGET_COLLECTION}"
[ "${DRY_RUN}" -eq 1 ] && log "mode:     dry run (nothing is written)"
printf '\n'

# --- does the source exist? ------------------------------------------------
resp="$(qdrant_call GET "/collections/${SOURCE_COLLECTION}" || true)"
st="$(status_of "${resp}")"
case "${st}" in
  200) : ;;
  404) fail "Source collection '${SOURCE_COLLECTION}' does not exist on ${QDRANT_URL}. Nothing to migrate. Run with --help to see how to list the collections you have." ;;
  401|403) fail "Qdrant rejected the API key (HTTP ${st})." ;;
  *) fail "Could not read source collection (HTTP ${st}): $(body_of "${resp}")" ;;
esac
src_info="$(body_of "${resp}")"
describe_collection "${src_info}" "${SOURCE_COLLECTION}"
src_kind="${DESC_KIND}"
src_vector_name="${DESC_NAME}"
src_size="${DESC_SIZE}"
src_distance="${DESC_DISTANCE}"
src_count="$(printf '%s' "${src_info}" | jq -r '.result.points_count // 0')"

# --- does the target exist? ------------------------------------------------
resp="$(qdrant_call GET "/collections/${TARGET_COLLECTION}" || true)"
st="$(status_of "${resp}")"
case "${st}" in
  200) : ;;
  404) fail "Target collection '${TARGET_COLLECTION}' does not exist. Create it first: ./scripts/init-collections.sh" ;;
  *) fail "Could not read target collection (HTTP ${st}): $(body_of "${resp}")" ;;
esac
tgt_info="$(body_of "${resp}")"
describe_collection "${tgt_info}" "${TARGET_COLLECTION}"
tgt_kind="${DESC_KIND}"
tgt_vector_name="${DESC_NAME}"
tgt_size="${DESC_SIZE}"
tgt_distance="${DESC_DISTANCE}"
tgt_count_before="$(printf '%s' "${tgt_info}" | jq -r '.result.points_count // 0')"

log "source: ${src_count} point(s), $(describe_label "${src_kind}" "${src_vector_name}" "${src_size}" "${src_distance}")"
log "target: ${tgt_count_before} point(s), $(describe_label "${tgt_kind}" "${tgt_vector_name}" "${tgt_size}" "${tgt_distance}")"
printf '\n'

# --- compatibility gate ----------------------------------------------------
# Abort before writing anything rather than leaving a half-migrated collection.
#
# What this gate can and cannot prove: identical size and distance rule out the
# gross mismatches - a 768-dim model copied into a 384-dim collection, cosine
# vectors landing in a dot-product collection. They do NOT prove the two
# collections were embedded with the same model. bge-small-en-v1.5 is also
# 384-dim/Cosine, and its vectors are meaningless next to all-MiniLM-L6-v2's.
# Only you know which model wrote the source. If you are not sure, re-embed the
# content instead of copying raw vectors.
if [ "${src_size}" != "${tgt_size}" ]; then
  fail "Vector size mismatch: source is ${src_size}-dim, target is ${tgt_size}-dim. These collections were built with different embedding models. Re-embed the source content instead of copying raw vectors."
fi
if [ "${src_distance}" != "${tgt_distance}" ]; then
  fail "Distance metric mismatch: source uses ${src_distance}, target uses ${tgt_distance}. Copying the vectors would leave every future search scoring against the wrong metric."
fi
ok "Vector parameters match (${src_size}-dim, ${src_distance})."

# A differing vector name is a rename, not an incompatibility: the numbers are
# the same shape, only the slot they sit in has a different label. Each point's
# vector is re-keyed to the target's name on the way in.
if [ "${src_kind}" != "${tgt_kind}" ] || [ "${src_vector_name}" != "${tgt_vector_name}" ]; then
  log "Vector names differ: $(describe_label "${src_kind}" "${src_vector_name}" "${src_size}" "${src_distance}")"
  log "                 -> $(describe_label "${tgt_kind}" "${tgt_vector_name}" "${tgt_size}" "${tgt_distance}")"
  log "Each point is re-keyed to the target's vector on upsert. Size and metric"
  log "match, so the vectors themselves are copied unchanged."
  log "Note: same size and metric do not prove the same embedding model - see the"
  log "      comment above the compatibility gate in this script."
  printf '\n'
fi

if [ "${src_count}" = "0" ]; then
  printf '\n'
  ok "Source collection is empty. Nothing to copy."
  printf '\n'
  exit 0
fi

if [ "${DRY_RUN}" -eq 1 ]; then
  printf '\n'
  ok "Dry run complete: ${src_count} point(s) would be copied into '${TARGET_COLLECTION}'."
  log "Re-run without --dry-run to perform the migration."
  printf '\n'
  exit 0
fi

# --- scroll + upsert -------------------------------------------------------
offset_json="null"
copied=0
page=0

while :; do
  page=$((page + 1))
  scroll_body="$(jq -nc --argjson limit "${BATCH}" --argjson offset "${offset_json}" \
    '{limit:$limit, with_payload:true, with_vector:true} + (if $offset == null then {} else {offset:$offset} end)')"

  resp="$(qdrant_call POST "/collections/${SOURCE_COLLECTION}/points/scroll" "${scroll_body}" || true)"
  st="$(status_of "${resp}")"
  [ "${st}" = "200" ] || fail "Scroll on page ${page} failed (HTTP ${st}): $(body_of "${resp}")"
  scroll_result="$(body_of "${resp}")"

  n="$(printf '%s' "${scroll_result}" | jq -r '.result.points | length')"
  if [ "${n}" = "0" ]; then
    break
  fi

  # Keep only the three fields the upsert endpoint accepts, and move each
  # vector into the shape the target expects:
  #
  #   source unnamed -> .vector is [ ... ]
  #   source named   -> .vector is { "<src name>": [ ... ] }
  #   target unnamed -> send [ ... ]
  #   target named   -> send { "<tgt name>": [ ... ] }
  #
  # Points without a usable vector cannot be upserted and are skipped with a
  # warning rather than silently dropped.
  upsert_body="$(printf '%s' "${scroll_result}" | jq -c \
    --arg sn "${src_vector_name}" --arg tn "${tgt_vector_name}" '
      def raw($v):
        if   ($v | type) == "array"                    then $v
        elif ($v | type) == "object" and ($sn != "")   then ($v[$sn] // null)
        else null end;
      { points: [
          .result.points[]
          | . as $p
          | raw($p.vector) as $vec
          | select($vec != null)
          | { id: $p.id,
              vector: (if $tn == "" then $vec else {($tn): $vec} end),
              payload: $p.payload }
        ] }')"
  usable="$(printf '%s' "${upsert_body}" | jq -r '.points | length')"
  if [ "${usable}" != "${n}" ]; then
    if [ "${src_kind}" = "named" ]; then
      warn "Page ${page}: $(( n - usable )) point(s) carry no vector named '${src_vector_name}' and were skipped."
    else
      warn "Page ${page}: $(( n - usable )) point(s) carry no vector and were skipped."
    fi
  fi

  if [ "${usable}" != "0" ]; then
    resp="$(qdrant_call PUT "/collections/${TARGET_COLLECTION}/points?wait=true" "${upsert_body}" || true)"
    st="$(status_of "${resp}")"
    [ "${st}" = "200" ] || fail "Upsert of page ${page} failed (HTTP ${st}): $(body_of "${resp}")"
    copied=$((copied + usable))
  fi

  printf '  copied %s / %s point(s)\r' "${copied}" "${src_count}"

  offset_json="$(printf '%s' "${scroll_result}" | jq -c '.result.next_page_offset')"
  [ "${offset_json}" != "null" ] || break
done

printf '\n'

# --- verify ----------------------------------------------------------------
resp="$(qdrant_call GET "/collections/${TARGET_COLLECTION}" || true)"
st="$(status_of "${resp}")"
if [ "${st}" != "200" ]; then
  warn "${copied} point(s) were upserted, but the target could not be read back for verification (HTTP ${st}): $(body_of "${resp}")"
  warn "Check the target yourself before trusting this migration."
  exit 1
fi
tgt_count_after="$(body_of "${resp}" | jq -r '.result.points_count // 0')"

ok "Migration finished: ${copied} point(s) copied."
log "target '${TARGET_COLLECTION}': ${tgt_count_before} -> ${tgt_count_after} point(s)."
if [ "${tgt_count_after}" = "${tgt_count_before}" ] && [ "${copied}" != "0" ]; then
  warn "The target count did not change. Every copied point reused an existing id, which means this migration ran before."
fi
log "The source collection was not modified. Delete it yourself once you have checked the result."
printf '\n'
