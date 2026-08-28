#!/usr/bin/env bash
set -euo pipefail

# Sync OpenAI Codex CLI auth (~/.codex/auth.json) into Pi auth slot (default: openai-codex-2)
# Usage:
#   bin/sync-codex-to-pi-slot.sh                # -> openai-codex-2
#   bin/sync-codex-to-pi-slot.sh openai-codex-3

SLOT="${1:-openai-codex-2}"
CODEX_AUTH="${HOME}/.codex/auth.json"
PI_AUTH="${HOME}/.pi/agent/auth.json"

python - "$SLOT" "$CODEX_AUTH" "$PI_AUTH" <<'PY'
import base64
import json
import os
import shutil
import sys
import time
from pathlib import Path

slot, codex_path, pi_path = sys.argv[1:4]

if not slot.startswith("openai-codex"):
    raise SystemExit(f"Invalid slot: {slot}")

codex_file = Path(codex_path)
pi_file = Path(pi_path)

if not codex_file.exists():
    raise SystemExit(f"Missing Codex auth file: {codex_file}")
if not pi_file.exists():
    raise SystemExit(f"Missing Pi auth file: {pi_file}")

with codex_file.open() as f:
    codex = json.load(f)
with pi_file.open() as f:
    pi = json.load(f)

tokens = codex.get("tokens") or {}
access = tokens.get("access_token")
refresh = tokens.get("refresh_token")
account_id = tokens.get("account_id")

if not (access and refresh and account_id):
    raise SystemExit("Codex auth missing one of: access_token, refresh_token, account_id")

# derive expires (ms) from JWT exp
expires_ms = None
try:
    payload = access.split(".")[1]
    payload += "=" * ((4 - len(payload) % 4) % 4)
    data = json.loads(base64.urlsafe_b64decode(payload.encode()))
    exp = data.get("exp")
    if isinstance(exp, (int, float)):
        expires_ms = int(exp * 1000)
except Exception:
    pass

if expires_ms is None:
    expires_ms = int((time.time() + 3600) * 1000)

backup = pi_file.with_name(f"auth.json.backup-{time.strftime('%Y%m%d-%H%M%S')}")
shutil.copy2(pi_file, backup)

pi[slot] = {
    "type": "oauth",
    "access": access,
    "refresh": refresh,
    "expires": expires_ms,
    "accountId": account_id,
}

with pi_file.open("w") as f:
    json.dump(pi, f, indent=2)
    f.write("\n")
os.chmod(pi_file, 0o600)

print(f"Updated slot: {slot}")
print(f"Pi auth     : {pi_file}")
print(f"Backup      : {backup}")
print(f"Expires(ms) : {expires_ms}")
PY
