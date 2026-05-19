#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "search-results-prepared-rows-delete-gate: $1" >&2
  exit 1
}

scan_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  if rg -n "$pattern" "$@" >/tmp/search-results-prepared-rows-delete-gate.out; then
    cat /tmp/search-results-prepared-rows-delete-gate.out >&2
    fail "$description"
  fi
}

require_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  if ! rg -n "$pattern" "$@" >/tmp/search-results-prepared-rows-delete-gate.out; then
    fail "$description"
  fi
}

ACTIVE_PATHS=(
  "apps/mobile/src/screens/Search"
  "apps/mobile/src/overlays"
  "apps/mobile/src/perf"
)

scan_active "firstPaint|FirstPaint|first-paint|first_paint|firstVisibleRows|FirstVisibleRows|first_visible_rows|listFirstPaintReady|resultsFirstPaintKey|lane_c_list_first_paint|list_first_paint_not_ready" \
  "old first-paint / first-visible row vocabulary still exists in active search code" \
  "${ACTIVE_PATHS[@]}"

scan_active "SearchResultsBodyFirstPaintAdmission|firstPaintRenderMode|FIRST_PAINT_ROWS|resolveSearchResultsBodyAdmissionRowCount|scheduleSearchMountedResultsFirstPaintRowsReady|canMarkSearchMountedResultsFirstVisibleRowsReadyFromRowLayout|markSearchMountedResultsFirstVisibleRowsReady|allowFullBodyAdmission" \
  "old partial-admission or row-layout readiness path still exists" \
  "${ACTIVE_PATHS[@]}"

scan_active "retainedRowsMatchMountedResults|preparedRowsSnapshot\\.readyReadinessKey \\?\\?|preparedRowsSnapshot\\.targetReadinessKey \\?\\?|listPreparedRowsReady \\|\\||mountedPreparedRowsReadyKey === inputs\\.resultsSnapshotKey" \
  "prepared-row readiness must not keep retained-row or key-match fallback paths" \
  "apps/mobile/src/screens/Search/runtime/shared/search-surface-results-transaction.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"

scan_active "mode:\\s*'visual'|mode === 'visual'" \
  "results body admission must no longer expose a visual/partial mode" \
  "apps/mobile/src/screens/Search/runtime/shared/search-results-body-admission-controller.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

scan_active "\\.slice\\(" \
  "results body admission must not slice page-one rows" \
  "apps/mobile/src/screens/Search/runtime/shared/search-results-body-admission-controller.ts"

for old_file in \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-key-patch-runtime.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-patch-runtime.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-readiness-patch-runtime.ts"; do
  if [[ -e "$old_file" ]]; then
    fail "old first-paint patch file still exists: $old_file"
  fi
done

require_active "stageSearchMountedResultsPreparedRowsTarget" \
  "mounted results must stage prepared-row target readiness from row snapshot preparation" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

require_active "markSearchMountedResultsPreparedRowsCommitted" \
  "mounted list commit must mark prepared-row readiness after list data reaches the mounted surface" \
  "apps/mobile/src/overlays/SearchMountedSceneBody.tsx" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

require_active "initialDrawBatchSize:\\s*preparedRowsInitialDrawBatchSize" \
  "mounted results FlashList must draw the prepared page-one row batch, not the old small initial batch" \
  "apps/mobile/src/overlays/SearchMountedSceneBody.tsx"

require_active "preparedRows" \
  "presentation surface authority must expose preparedRows readiness" \
  "apps/mobile/src/screens/Search/runtime/shared/results-presentation-surface-authority.ts"

require_active "listPreparedRowsReady" \
  "results transaction gate must wait on listPreparedRowsReady" \
  "apps/mobile/src/screens/Search/runtime/shared/search-surface-results-transaction.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"

echo "search-results-prepared-rows-delete-gate: pass"
