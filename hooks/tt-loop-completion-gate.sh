#!/usr/bin/env bash
# Completion is explicitly blocked while armed: no independent attestation yet.
# A self-authored EXIT/ACCEPTANCE/EVIDENCE record is not checker identity.
set -uo pipefail
if [ "$#" -eq 0 ]; then set -- --platform claude; fi
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'TT_GUARD_RUNTIME_MISSING: Node is required. HUMAN_HANDOFF: repair installation.' >&2
  exit 2
fi
root="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)" || exit 2
exec node "$root/src/guard/cli.mjs" "$@" --event completion
