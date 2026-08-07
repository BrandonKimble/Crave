#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime)
#
# WHAT THIS GATE IS FOR: the search results surface deleted its old partial
# first-paint/row-layout admission path in favour of PREPARED ROWS — page one is
# prepared, then admitted whole. This gate holds that deletion and asserts the
# prepared-rows seam still exists.
#
# REPAIRED + WIRED 2026-08-03 (audit D37 / F704). It had zero real references
# and had been failing on FALSE POSITIVES; see the two dated notes inline. The
# lesson both encode: a delete gate bans SYMBOLS, never WORDS, and pins the
# durable constant, never a local variable name.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "search-results-prepared-rows-delete-gate: $1" >&2
  exit 1
}

# TOOL PRECONDITION (F8500, 2026-08-07). `if rg …; then` treats EVERY non-zero
# rg exit as "no match → clean" — but exit 2 is an invalid regex and 127 is rg
# not installed. So a rotted pattern or a machine without ripgrep made every
# negative ban below PASS having scanned nothing (the exact class the sibling
# no-bypass-search-runtime.sh and app-route-runtime-delete-gate.sh were already
# hardened against; these two delete-gates were wired in the same D37 sweep but
# never inherited the defense). Missing tooling is a FAILURE, never a pass.
if ! command -v rg >/dev/null 2>&1; then
  fail "ripgrep (rg) is not installed — this gate cannot verify anything; refusing a green that means nothing (brew install ripgrep)"
fi

# A negative ban: any match is a failure. Exit 1 (no match) is the ONLY pass;
# exit 2 (bad regex) and anything else are hard failures, not silent greens.
scan_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  local status
  set +e
  rg -n "$pattern" "$@" >/tmp/search-results-prepared-rows-delete-gate.out
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    cat /tmp/search-results-prepared-rows-delete-gate.out >&2
    fail "$description"
  elif [[ "$status" -eq 1 ]]; then
    : # no match — the ban holds
  elif [[ "$status" -eq 2 ]]; then
    fail "invalid rg pattern (\`$pattern\`) — the scan for '$description' did not run"
  else
    fail "rg exited with status $status scanning for '$description' — check not performed"
  fi
}

# A required symbol: exit 0 (present) is the pass. Exit 1 (genuinely absent) is
# the designed failure; exit 2/other means the TOOL broke, reported distinctly
# so a rotted pattern is never misread as a missing symbol.
require_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  local status
  set +e
  rg -n "$pattern" "$@" >/tmp/search-results-prepared-rows-delete-gate.out
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    : # present
  elif [[ "$status" -eq 1 ]]; then
    fail "$description"
  elif [[ "$status" -eq 2 ]]; then
    fail "invalid rg pattern (\`$pattern\`) — the required-symbol check for '$description' did not run"
  else
    fail "rg exited with status $status checking for '$description' — check not performed"
  fi
}

ACTIVE_PATHS=(
  "apps/mobile/src/screens/Search"
  "apps/mobile/src/overlays"
  "apps/mobile/src/perf"
)

# NARROWED 2026-08-03 (audit D37 / F704). This scan used to ban the WORDS
# firstPaint / first-paint / firstVisibleRows outright. That made it a
# false-positive machine: it fired on `onBodyFirstPaint` / `handleBodyFirstPaint`
# (BottomSheetSceneStackPageFrame.tsx + BottomSheetSceneStackHost.tsx), which is
# a LIVE and legitimate paint-ack producer, and on two "first-paint default"
# prose comments. The killed thing was the LIST first-paint ADMISSION path, not
# the vocabulary — and its exact symbols are already enumerated in the scan
# below. Ban symbols, never words.
scan_active "listFirstPaintReady|resultsFirstPaintKey|lane_c_list_first_paint|list_first_paint_not_ready|firstVisibleRows|FirstVisibleRows|first_visible_rows" \
  "old list first-paint / first-visible row admission symbols still exist in active search code" \
  "${ACTIVE_PATHS[@]}"

scan_active "SearchResultsBodyFirstPaintAdmission|firstPaintRenderMode|FIRST_PAINT_ROWS|resolveSearchResultsBodyAdmissionRowCount|scheduleSearchMountedResultsFirstPaintRowsReady|canMarkSearchMountedResultsFirstVisibleRowsReadyFromRowLayout|markSearchMountedResultsFirstVisibleRowsReady|allowFullBodyAdmission" \
  "old partial-admission or row-layout readiness path still exists" \
  "${ACTIVE_PATHS[@]}"

scan_active "retainedRowsMatchMountedResults|preparedRowsSnapshot\\.readyReadinessKey \\?\\?|preparedRowsSnapshot\\.readyResultsIdentityKey \\?\\?|preparedRowsSnapshot\\.targetReadinessKey \\?\\?|preparedRowsSnapshot\\.targetResultsIdentityKey \\?\\?|listPreparedRowsReady \\|\\||mountedPreparedRowsReadyKey === inputs\\.resultsSnapshotKey" \
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

# REPOINTED 2026-08-03 (audit D37 / F704). Was pinned to the identifier
# `preparedRowsInitialDrawBatchSize`, which was split into
# primary/secondaryInitialDrawBatchSize. The INVARIANT is intact — both are
# Math.min(MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE, max(default, rows.length))
# — so assert the durable constant, not the local variable name.
require_active "MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE" \
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
