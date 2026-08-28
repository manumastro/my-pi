#!/usr/bin/env bash
# Sync stack before Pi loads models.json
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
export PI_STACK_PRE_SYNCED=1
PI_CLI="$(node scripts/resolve-pi-cli.mjs 2>/dev/null || true)"
if [[ -n "$PI_CLI" ]]; then
  exec node "$PI_CLI" "$@"
fi
exec pi "$@"