#!/usr/bin/env bash
# Compatibility entry point. V17 uses one implementation for both host apps.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { printf 'ThinkTank needs Node.js 20.19+ and npm.\n' >&2; exit 1; }
if [ ! -d "${ROOT}/node_modules/yaml" ]; then
  printf 'Run npm ci in %s first, or use the published npx package.\n' "${ROOT}" >&2
  exit 1
fi
exec node "${ROOT}/src/cli.mjs" "$@"
