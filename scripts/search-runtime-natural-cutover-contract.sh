#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/hooks/use-search-submit.ts"

if [[ ! -f "$TARGET" ]]; then
  echo "[natural-cutover-contract] FAIL: target file not found: $TARGET" >&2
  exit 1
fi

failures=0
checks=0

require_pattern() {
  local pattern="$1"
  local description="$2"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$TARGET" >/dev/null; then
    echo "[natural-cutover-contract] PASS: $description"
  else
    echo "[natural-cutover-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local pattern="$1"
  local description="$2"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$TARGET" >/dev/null; then
    echo "[natural-cutover-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$TARGET" >&2 || true
    failures=$((failures + 1))
  else
    echo "[natural-cutover-contract] PASS: $description"
  fi
}

require_pattern "const shouldPreclearNaturalResults = false;" \
  "Natural submit pre-request clear remains disabled."
require_pattern "const shouldPrimeSubmittedQueryBeforeResponse = false;" \
  "Natural submit query priming before response remains disabled."
require_pattern "naturalControllerCutover: true" \
  "Loading telemetry reports natural controller cutover enabled."
require_pattern "const naturalShadowActivated = activateRuntimeShadowOperation\\(" \
  "Natural submit runtime operation activation is explicit."
require_pattern "if \\(!naturalShadowActivated\\) \\{" \
  "Natural submit has explicit rejected-activation guard."
require_pattern "clearActiveOperationTuple\\(naturalTuple\\);" \
  "Natural submit clears tuple when controller rejects activation."
require_pattern "if \\(!emitShadowTransition\\('response_received'" \
  "Response apply path is gated by controller transition acceptance."
require_pattern "if \\(!emitShadowTransition\\('phase_a_committed'" \
  "Phase-A commit path is gated by controller transition acceptance."

forbid_pattern "EXPO_PUBLIC_SEARCH_RUNTIME_NATURAL_CONTROLLER_CUTOVER" \
  "No natural cutover environment fallback flag remains."
forbid_pattern "NATURAL_CONTROLLER_CUTOVER_ENABLED" \
  "No natural cutover legacy toggle remains."

if [[ "$checks" -eq 0 ]]; then
  echo "[natural-cutover-contract] FAIL: no checks executed." >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[natural-cutover-contract] FAILED ($failures/$checks checks)." >&2
  exit 1
fi

echo "[natural-cutover-contract] OK ($checks checks)."
