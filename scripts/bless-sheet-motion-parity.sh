#!/usr/bin/env bash
# @script-class: bless
# @run-by: a human, deliberately, when a sheet-motion plan change is INTENTIONAL
#
# F6604(a) / D112. Regenerates the frozen parity constants
# (apps/mobile/src/navigation/runtime/app-route-sheet-motion-plan-parity-frozen.ts)
# and prints the OLD and NEW digests, so a bless is a visible act with its own diff.
# Without --bless this script does nothing but tell you that.
set -euo pipefail

if [[ "${1:-}" != "--bless" ]]; then
  echo "usage: scripts/bless-sheet-motion-parity.sh --bless" >&2
  echo "  (refuses to regenerate without the explicit flag — blessing is never a side effect)" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BLESS_SHEET_MOTION_PARITY=1 yarn --cwd "$REPO_ROOT/apps/mobile" test:raw \
  --silent=false \
  --testPathPattern 'app-route-sheet-motion-plan-parity\.spec\.ts'

FROZEN_FILE="apps/mobile/src/navigation/runtime/app-route-sheet-motion-plan-parity-frozen.ts"
# The generator emits plain TS; prettier owns the formatting so the committed artifact is
# byte-stable under the repo's pre-commit check (a bless must not fail the hook it exists for).
(cd "$REPO_ROOT" && npx prettier --write "$FROZEN_FILE" >/dev/null)

echo
echo "[bless-sheet-motion-parity] frozen constants rewritten; review the diff:"
echo "  git diff -- apps/mobile/src/navigation/runtime/app-route-sheet-motion-plan-parity-frozen.ts"
