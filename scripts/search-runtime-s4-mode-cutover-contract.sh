#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/hooks/use-search-submit.ts"

if [[ ! -f "$TARGET" ]]; then
  echo "[s4-cutover-contract] FAIL: target file not found: $TARGET" >&2
  exit 1
fi

failures=0
checks=0

require_pattern() {
  local pattern="$1"
  local description="$2"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$TARGET" >/dev/null; then
    echo "[s4-cutover-contract] PASS: $description"
  else
    echo "[s4-cutover-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local pattern="$1"
  local description="$2"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$TARGET" >/dev/null; then
    echo "[s4-cutover-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$TARGET" >&2 || true
    failures=$((failures + 1))
  else
    echo "[s4-cutover-contract] PASS: $description"
  fi
}

require_pattern "runtimeShadow: HandleSearchResponseRuntimeShadow;" \
  "Response apply requires runtimeShadow (no optional bypass)."
require_pattern "runtimeTuple: ActiveOperationTuple;" \
  "Response apply requires runtime tuple guard (no optional bypass)."
forbid_pattern "runtimeShadow\\?:" \
  "No optional runtimeShadow path remains in response apply options."
forbid_pattern "runtimeTuple\\?:" \
  "No optional runtimeTuple path remains in response apply options."
forbid_pattern "if \\(runtimeShadow\\)" \
  "No mode/runtime branch bypass around transition emission remains."
forbid_pattern "else if \\(runtimeShadow\\)" \
  "No append-mode runtime bypass branch remains."

require_pattern "const naturalShadowActivated = activateRuntimeShadowOperation\\(" \
  "Natural mode activation is controller-gated."
require_pattern "const entityShadowActivated = activateRuntimeShadowOperation\\(" \
  "Entity mode activation is controller-gated."
require_pattern "const shortcutShadowActivated = activateRuntimeShadowOperation\\(" \
  "Shortcut mode activation is controller-gated."
require_pattern "const shortcutAppendShadowActivated = activateRuntimeShadowOperation\\(" \
  "Shortcut append activation is controller-gated."

require_pattern "if \\(!naturalShadowActivated\\) \\{" \
  "Natural mode aborts when controller rejects activation."
require_pattern "if \\(!entityShadowActivated\\) \\{" \
  "Entity mode aborts when controller rejects activation."
require_pattern "if \\(!shortcutShadowActivated\\) \\{" \
  "Shortcut mode aborts when controller rejects activation."
require_pattern "if \\(!shortcutAppendShadowActivated\\) \\{" \
  "Shortcut append aborts when controller rejects activation."

require_pattern "createNaturalResponseReceivedPayload\\(" \
  "Natural mode response is adapter-normalized before transition."
require_pattern "createEntityResponseReceivedPayload\\(" \
  "Entity mode response is adapter-normalized before transition."
require_pattern "createShortcutResponseReceivedPayload\\(" \
  "Shortcut mode response is adapter-normalized before transition."

require_pattern "emitShadowTransition\\('response_received'" \
  "All response apply paths emit response_received transition."
require_pattern "emitShadowTransition\\('phase_a_committed'" \
  "All response apply paths emit phase_a_committed transition."
require_pattern "emitShadowTransition\\('phase_b_materializing'" \
  "All response apply paths emit phase_b_materializing transition."

if [[ "$checks" -eq 0 ]]; then
  echo "[s4-cutover-contract] FAIL: no checks executed." >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[s4-cutover-contract] FAILED ($failures/$checks checks)." >&2
  exit 1
fi

echo "[s4-cutover-contract] OK ($checks checks)."
