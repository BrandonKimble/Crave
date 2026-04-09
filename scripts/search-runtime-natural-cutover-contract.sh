#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/apps/mobile/src/screens/Search/hooks"
REQUEST_RUNTIME_TARGET="$HOOKS_DIR/use-search-request-runtime-owner.ts"
NATURAL_SUBMIT_TARGET="$HOOKS_DIR/use-search-natural-submit-owner.ts"
EXECUTION_TARGET="$HOOKS_DIR/use-search-submit-execution-owner.ts"
RESPONSE_TARGET="$HOOKS_DIR/use-search-submit-response-owner.ts"

failures=0
checks=0

ensure_target() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    echo "[natural-cutover-contract] FAIL: target file not found: $target" >&2
    exit 1
  fi
}

ensure_target "$REQUEST_RUNTIME_TARGET"
ensure_target "$NATURAL_SUBMIT_TARGET"
ensure_target "$EXECUTION_TARGET"
ensure_target "$RESPONSE_TARGET"

require_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$2"
  description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[natural-cutover-contract] PASS: $description"
  else
    echo "[natural-cutover-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$2"
  description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[natural-cutover-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$target" >&2 || true
    failures=$((failures + 1))
  else
    echo "[natural-cutover-contract] PASS: $description"
  fi
}

forbid_pattern "$HOOKS_DIR" "shouldPreclearNaturalResults" \
  "Natural submit pre-request clear legacy gate is deleted."
forbid_pattern "$HOOKS_DIR" "shouldPrimeSubmittedQueryBeforeResponse" \
  "Natural submit query priming legacy gate is deleted."
require_pattern "$NATURAL_SUBMIT_TARGET" "await runManagedRequestAttempt\\(\\{" \
  "Natural submit delegates request attempts through the shared runtime owner."
require_pattern "$NATURAL_SUBMIT_TARGET" "mode:\\s*'natural'" \
  "Natural submit passes the explicit natural mode into the shared runtime owner."
require_pattern "$REQUEST_RUNTIME_TARGET" "const requestAttempt = startSearchRequestAttempt\\(\\{" \
  "Shared request runtime owns request-attempt activation."
require_pattern "$REQUEST_RUNTIME_TARGET" "if \\(!requestAttempt\\) \\{" \
  "Shared request runtime has an explicit rejected-activation guard."
require_pattern "$REQUEST_RUNTIME_TARGET" "clearActiveOperationTuple\\(tuple\\);" \
  "Shared request runtime clears tuple state when activation is rejected."
require_pattern "$EXECUTION_TARGET" "createNaturalResponseReceivedPayload\\(response,\\s*targetPage\\)" \
  "Natural response handoff is adapter-normalized before lifecycle entry."
require_pattern "$RESPONSE_TARGET" "!emitShadowTransition\\('response_received'" \
  "Response apply path is gated by controller transition acceptance."
require_pattern "$RESPONSE_TARGET" "!emitShadowTransition\\('phase_a_committed'" \
  "Phase-A commit path is gated by controller transition acceptance."

forbid_pattern "$HOOKS_DIR" "EXPO_PUBLIC_SEARCH_RUNTIME_NATURAL_CONTROLLER_CUTOVER" \
  "No natural cutover environment fallback flag remains."
forbid_pattern "$HOOKS_DIR" "NATURAL_CONTROLLER_CUTOVER_ENABLED" \
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
