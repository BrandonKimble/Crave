#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/index.tsx"
READ_MODEL_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx"
PROFILE_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/profile/profile-runtime-controller.ts"
MATERIALIZER_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts"

if [[ ! -f "$ROOT_TARGET" ]]; then
  echo "[s5-hydration-contract] FAIL: root target file not found: $ROOT_TARGET" >&2
  exit 1
fi

if [[ ! -f "$MATERIALIZER_TARGET" ]]; then
  echo "[s5-hydration-contract] FAIL: materializer target file not found: $MATERIALIZER_TARGET" >&2
  exit 1
fi
if [[ ! -f "$READ_MODEL_TARGET" ]]; then
  echo "[s5-hydration-contract] FAIL: read-model target file not found: $READ_MODEL_TARGET" >&2
  exit 1
fi
if [[ ! -f "$PROFILE_TARGET" ]]; then
  echo "[s5-hydration-contract] FAIL: profile target file not found: $PROFILE_TARGET" >&2
  exit 1
fi

failures=0
checks=0

require_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s5-hydration-contract] PASS: $description"
  else
    echo "[s5-hydration-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s5-hydration-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$target" >&2 || true
    failures=$((failures + 1))
  else
    echo "[s5-hydration-contract] PASS: $description"
  fi
}

require_pattern "$READ_MODEL_TARGET" "phaseBMaterializerRef\.current\.syncHydrationCommit\(" \
  "Hydration read-model delegates reconciliation to materializer."
require_pattern "$PROFILE_TARGET" "phaseBMaterializerRef\.current\.commitHydrationImmediately\(" \
  "Profile hydration fallback delegates immediate commit to materializer."
forbid_pattern "$ROOT_TARGET" "phaseBMaterializerRef\.current\.scheduleHydrationCommit\(" \
  "Root does not call scheduleHydrationCommit directly."
forbid_pattern "$ROOT_TARGET" "phaseBMaterializerRef\.current\.cancelHydrationCommit\(" \
  "Root does not call cancelHydrationCommit directly."
forbid_pattern "$ROOT_TARGET" "resultsHydrationTaskRef\.current = InteractionManager\.runAfterInteractions\(" \
  "Legacy root InteractionManager hydration task writer is deleted."

require_pattern "$MATERIALIZER_TARGET" "public syncHydrationCommit\(" \
  "Materializer exposes hydration reconciliation delegate API."
require_pattern "$MATERIALIZER_TARGET" "public commitHydrationImmediately\(" \
  "Materializer exposes immediate hydration commit delegate API."
require_pattern "$MATERIALIZER_TARGET" "public resetHydrationCommit\(" \
  "Materializer exposes hydration reset API for teardown."
require_pattern "$MATERIALIZER_TARGET" "private scheduleHydrationCommit\(" \
  "Scheduling primitive is encapsulated in materializer."
require_pattern "$MATERIALIZER_TARGET" "private cancelHydrationCommit\(" \
  "Cancellation primitive is encapsulated in materializer."

if [[ "$checks" -eq 0 ]]; then
  echo "[s5-hydration-contract] FAIL: no checks executed." >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[s5-hydration-contract] FAILED ($failures/$checks checks)." >&2
  exit 1
fi

echo "[s5-hydration-contract] OK ($checks checks)."
