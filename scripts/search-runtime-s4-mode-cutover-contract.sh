#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/apps/mobile/src/screens/Search/hooks"
REQUEST_RUNTIME_TARGET="$HOOKS_DIR/use-search-request-runtime-owner.ts"
NATURAL_SUBMIT_TARGET="$HOOKS_DIR/use-search-natural-submit-owner.ts"
STRUCTURED_SUBMIT_TARGET="$HOOKS_DIR/use-search-structured-submit-owner.ts"
EXECUTION_TARGET="$HOOKS_DIR/use-search-submit-execution-owner.ts"
RESPONSE_TARGET="$HOOKS_DIR/use-search-submit-response-owner.ts"

failures=0
checks=0

ensure_target() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    echo "[s4-cutover-contract] FAIL: target file not found: $target" >&2
    exit 1
  fi
}

ensure_target "$REQUEST_RUNTIME_TARGET"
ensure_target "$NATURAL_SUBMIT_TARGET"
ensure_target "$STRUCTURED_SUBMIT_TARGET"
ensure_target "$EXECUTION_TARGET"
ensure_target "$RESPONSE_TARGET"

require_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s4-cutover-contract] PASS: $description"
  else
    echo "[s4-cutover-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s4-cutover-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$target" >&2 || true
    failures=$((failures + 1))
  else
    echo "[s4-cutover-contract] PASS: $description"
  fi
}

require_pattern "$RESPONSE_TARGET" "runtimeShadow:\\s*SearchSubmitHandleSearchResponseRuntimeShadow;" \
  "Response apply requires runtimeShadow (no optional bypass)."
require_pattern "$RESPONSE_TARGET" "runtimeTuple:\\s*SearchSubmitActiveOperationTuple;" \
  "Response apply requires runtime tuple guard (no optional bypass)."
forbid_pattern "$HOOKS_DIR" "runtimeShadow\\?:" \
  "No optional runtimeShadow path remains in response apply options."
forbid_pattern "$HOOKS_DIR" "runtimeTuple\\?:" \
  "No optional runtimeTuple path remains in response apply options."
forbid_pattern "$HOOKS_DIR" "if \\(runtimeShadow\\)" \
  "No mode/runtime branch bypass around transition emission remains."
forbid_pattern "$HOOKS_DIR" "else if \\(runtimeShadow\\)" \
  "No append-mode runtime bypass branch remains."

require_pattern "$REQUEST_RUNTIME_TARGET" "const requestAttempt = startSearchRequestAttempt\\(\\{" \
  "All mode activation is controller-gated through the shared runtime owner."
require_pattern "$REQUEST_RUNTIME_TARGET" "if \\(!requestAttempt\\) \\{" \
  "Shared runtime owner aborts when controller rejects activation."
require_pattern "$NATURAL_SUBMIT_TARGET" "mode:\\s*'natural'" \
  "Natural mode activation flows through the shared request runtime owner."
require_pattern "$STRUCTURED_SUBMIT_TARGET" "mode:\\s*'entity'" \
  "Entity mode activation flows through the shared request runtime owner."
require_pattern "$STRUCTURED_SUBMIT_TARGET" "mode:\\s*'shortcut'" \
  "Shortcut mode activation flows through the shared request runtime owner."

require_pattern "$EXECUTION_TARGET" "createNaturalResponseReceivedPayload\\(" \
  "Natural mode response is adapter-normalized before transition."
require_pattern "$EXECUTION_TARGET" "createEntityResponseReceivedPayload\\(" \
  "Entity mode response is adapter-normalized before transition."
require_pattern "$EXECUTION_TARGET" "createShortcutResponseReceivedPayload\\(" \
  "Shortcut mode response is adapter-normalized before transition."

require_pattern "$RESPONSE_TARGET" "emitShadowTransition\\('response_received'" \
  "All response apply paths emit response_received transition."
require_pattern "$RESPONSE_TARGET" "emitShadowTransition\\('phase_a_committed'" \
  "All response apply paths emit phase_a_committed transition."
require_pattern "$RESPONSE_TARGET" "emitShadowTransition\\('phase_b_materializing'" \
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
