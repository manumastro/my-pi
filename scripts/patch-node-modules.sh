#!/usr/bin/env bash
# Patches applied after npm install to fix provider quirks.
# Covers both the local project node_modules and the global nvm installation.

set -euo pipefail

PATCH_STRING='throw new Error("Stream ended without finish_reason");'
FIX_STRING='output.stopReason = output.stopReason ?? "end_turn";'

apply_patch() {
    local target="$1"
    if [ ! -f "$target" ]; then return; fi
    if grep -q "$PATCH_STRING" "$target" 2>/dev/null; then
        node -e "
const fs = require('fs');
const file = process.argv[1];
let content = fs.readFileSync(file, 'utf8');
content = content.replace('$PATCH_STRING', '$FIX_STRING');
fs.writeFileSync(file, content);
console.log('[patch] Applied: finish_reason fix to', file);
" "$target"
    else
        echo "[patch] Already applied: finish_reason fix in $target"
    fi
}

# Local project node_modules (all nested copies)
while IFS= read -r f; do apply_patch "$f"; done < <(
    find node_modules -path "*/pi-ai/dist/providers/openai-completions.js" 2>/dev/null
)

# Global nvm installation
NVM_NODE_BIN=$(which node 2>/dev/null || true)
if [ -n "$NVM_NODE_BIN" ]; then
    NVM_LIB=$(dirname "$(dirname "$NVM_NODE_BIN")")/lib/node_modules
    while IFS= read -r f; do apply_patch "$f"; done < <(
        find "$NVM_LIB" -path "*/pi-ai/dist/providers/openai-completions.js" 2>/dev/null
    )
fi

# --- Patch: ignore lifecycle scripts for managed npm: extension packages ---
# Reason: some transitive deps (e.g. bunfig -> @stacksjs/clarity) have
# postinstall scripts that assume Bun ("bunx ...") is present and/or ship
# broken scripts not included in the npm tarball. These "npm:..." packages
# are only used for providing node_modules to Pi extensions (loaded as TS),
# so lifecycle scripts are unnecessary and harmful.
#
# We patch getNpmInstallArgs to always pass --ignore-scripts (npm/pnpm).

apply_ignore_scripts_patch() {
    local target="$1"
    if [ ! -f "$target" ]; then return; fi

    # Only patch if it looks like the right file and not already patched
    if ! grep -q 'getNpmInstallArgs' "$target" 2>/dev/null; then
        return
    fi
    if grep -q 'IGNORE_SCRIPTS_PATCHED' "$target" 2>/dev/null && grep -q -- '--ignore-scripts' "$target" 2>/dev/null; then
        echo "[patch] Already applied: --ignore-scripts for npm installs in $target"
        return
    fi

    # Use a temp file for the patcher to avoid quoting nightmares
    local patcher="/tmp/pi-patch-ignore-scripts.js"
    cat > "$patcher" << 'PATCHERJS'
const fs = require("fs");
const file = process.argv[1];
let content = fs.readFileSync(file, "utf8");

function addIgnoreIfMissing(str) {
  if (str.includes("--ignore-scripts")) return str;
  // naive but effective for our cases: append before final ]
  return str.replace(/\]\s*;/, ', "--ignore-scripts" ]; // IGNORE_SCRIPTS_PATCHED');
}

// Try to patch common return patterns for getNpmInstallArgs
// 1. The npm return line (single line with or without trailing flags)
content = content.replace(
  /(return\s+\[\s*"install"\s*,\s*\.\.\.specs\s*,\s*"--prefix"\s*,\s*installRoot(?:\s*,\s*"[^"]*")*\s*\]\s*;)/g,
  (m) => addIgnoreIfMissing(m)
);

// 2. pnpm multi-line array returns containing strict-dep-builds
content = content.replace(
  /(return\s+\[\s*"install"[\s\S]*?strict-dep-builds=false[\s\S]*?\]\s*;)/g,
  (m) => addIgnoreIfMissing(m)
);

// 3. Fallback: append to any install ... --legacy-peer-deps line
content = content.replace(
  /("(--legacy-peer-deps)"\s*\]\s*;)/g,
  (m) => m.includes("ignore-scripts") ? m : m.replace("]", ', "--ignore-scripts" ] // IGNORE_SCRIPTS_PATCHED')
);

// Ensure we have the marker somewhere in/near the function
if (!content.includes("IGNORE_SCRIPTS_PATCHED")) {
  content = content.replace(
    /(getNpmInstallArgs\(specs,\s*installRoot\)\s*\{)/,
    "$1 // IGNORE_SCRIPTS_PATCHED"
  );
}

fs.writeFileSync(file, content);
console.log("[patch] Applied: --ignore-scripts to npm/pnpm installs in", file);
PATCHERJS

    node "$patcher" "$target"
    rm -f "$patcher"
}

echo "[patch] Applying --ignore-scripts patch for Pi npm extension packages..."

# Patch in local node_modules copies (this workspace + nested)
while IFS= read -r f; do apply_ignore_scripts_patch "$f"; done < <(
    find node_modules -path "*/package-manager.js" 2>/dev/null
)

# Patch the globally resolved Pi installation (npm root -g)
GLOBAL_ROOT=$(npm root -g 2>/dev/null || true)
if [ -n "$GLOBAL_ROOT" ]; then
    while IFS= read -r f; do apply_ignore_scripts_patch "$f"; done < <(
        find "$GLOBAL_ROOT" -path "*/package-manager.js" 2>/dev/null
    )
fi

# Also try common nvm/global locations for the agent package
NVM_NODE_BIN=$(which node 2>/dev/null || true)
if [ -n "$NVM_NODE_BIN" ]; then
    NVM_LIB=$(dirname "$(dirname "$NVM_NODE_BIN")")/lib/node_modules
    if [ -d "$NVM_LIB" ]; then
        while IFS= read -r f; do apply_ignore_scripts_patch "$f"; done < <(
            find "$NVM_LIB" -path "*/package-manager.js" 2>/dev/null
        )
    fi
fi

