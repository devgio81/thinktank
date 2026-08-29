#!/usr/bin/env bash
#
# qdrant-mcp-launcher.sh - start mcp-server-qdrant with the API key taken from
# .env at launch time instead of from the registration command line.
#
# Why this exists:
#
#   claude mcp add qdrant-thinktank --env "QDRANT_API_KEY=<key>" -- uvx ...
#
# puts the key into this process's argv. Argv is not private: `ps -ef` on macOS
# and /proc/<pid>/cmdline on Linux expose it to other local processes, and the
# value is then also written verbatim into the MCP configuration file. Neither
# is a place a credential belongs.
#
# So install.sh registers *this* script as the MCP command and passes only the
# non-secret settings (QDRANT_URL, COLLECTION_NAME, EMBEDDING_MODEL) as
# environment variables. The key stays in .env, which install.sh creates with
# mode 600, and is read here at startup.
#
# An externally supplied QDRANT_API_KEY wins, so the launcher stays usable in
# setups that inject the key some other way (a secret manager, a wrapper).
#
# IMPORTANT: Claude Code speaks MCP over this process's stdin/stdout. Nothing
# may ever be printed to stdout here - it would corrupt the protocol stream.
# Diagnostics go to stderr.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${THINKTANK_ENV_FILE:-${SCRIPT_DIR}/../.env}"

if [ -z "${QDRANT_API_KEY:-}" ] && [ -f "${ENV_FILE}" ]; then
  # Read the single line we need rather than sourcing the file. Sourcing would
  # execute whatever happens to be in .env, and would also overwrite the
  # QDRANT_URL / COLLECTION_NAME / EMBEDDING_MODEL that Claude Code passes in
  # deliberately.
  key="$(sed -n 's/^[[:space:]]*QDRANT_API_KEY[[:space:]]*=[[:space:]]*//p' "${ENV_FILE}" | head -n1)"
  key="${key%$'\r'}"                     # tolerate a CRLF .env
  case "${key}" in                       # tolerate a quoted value
    \"*\") key="${key#\"}"; key="${key%\"}" ;;
    \'*\') key="${key#\'}"; key="${key%\'}" ;;
  esac
  if [ -n "${key}" ]; then
    export QDRANT_API_KEY="${key}"
  fi
fi

if [ -z "${QDRANT_API_KEY:-}" ]; then
  printf 'qdrant-mcp-launcher: no QDRANT_API_KEY in the environment, and none found in %s\n' "${ENV_FILE}" >&2
  printf 'qdrant-mcp-launcher: run ./install.sh in the ThinkTank repository, or set QDRANT_API_KEY yourself.\n' >&2
  exit 1
fi

# THINKTANK_UVX_CMD is either "uvx" or "uv tool run"; the word split is intended.
read -r -a runner <<< "${THINKTANK_UVX_CMD:-uvx}"

exec "${runner[@]}" mcp-server-qdrant --transport stdio
