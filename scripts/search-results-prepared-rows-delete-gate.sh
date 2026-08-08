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

# TOOL PRECONDITION + SOUND SCANNING VOCABULARY (F8900, 2026-08-07).
#
# The ~60 lines of `fail` / `scan_active` / `require_active` that used to sit
# here (written for F8500, and duplicated verbatim into
# crave-score-cutover-delete-gate.sh) now live once in scripts/lib/gate-runner.sh.
# Same contract, one owner: rg exit 1 is the only status that counts as
# evidence; exit 2 (rotted pattern) and 127 (rg absent) FAIL the gate instead of
# reading as "no match → clean". Proven RED by scripts/lib/gate-runner.test.sh.
source "$ROOT_DIR/scripts/lib/gate-runner.sh"
gate_init search-results-prepared-rows-delete-gate fast
gate_require_tool rg

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
gate_ban_absent old_list_first_paint_first \
  "old list first-paint / first-visible row admission symbols still exist in active search code" \
  "listFirstPaintReady|resultsFirstPaintKey|lane_c_list_first_paint|list_first_paint_not_ready|firstVisibleRows|FirstVisibleRows|first_visible_rows" \
  "${ACTIVE_PATHS[@]}"

gate_ban_absent old_partial_admission_or_row \
  "old partial-admission or row-layout readiness path still exists" \
  "SearchResultsBodyFirstPaintAdmission|firstPaintRenderMode|FIRST_PAINT_ROWS|resolveSearchResultsBodyAdmissionRowCount|scheduleSearchMountedResultsFirstPaintRowsReady|canMarkSearchMountedResultsFirstVisibleRowsReadyFromRowLayout|markSearchMountedResultsFirstVisibleRowsReady|allowFullBodyAdmission" \
  "${ACTIVE_PATHS[@]}"

gate_ban_absent prepared_row_readiness_must_not \
  "prepared-row readiness must not keep retained-row or key-match fallback paths" \
  "retainedRowsMatchMountedResults|preparedRowsSnapshot\\.readyReadinessKey \\?\\?|preparedRowsSnapshot\\.readyResultsIdentityKey \\?\\?|preparedRowsSnapshot\\.targetReadinessKey \\?\\?|preparedRowsSnapshot\\.targetResultsIdentityKey \\?\\?|listPreparedRowsReady \\|\\||mountedPreparedRowsReadyKey === inputs\\.resultsSnapshotKey" \
  "apps/mobile/src/screens/Search/runtime/shared/search-surface-results-transaction.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"

gate_ban_absent results_body_admission_must_no \
  "results body admission must no longer expose a visual/partial mode" \
  "mode:\\s*'visual'|mode === 'visual'" \
  "apps/mobile/src/screens/Search/runtime/shared/search-results-body-admission-controller.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

gate_ban_absent results_body_admission_must_not \
  "results body admission must not slice page-one rows" \
  "\\.slice\\(" \
  "apps/mobile/src/screens/Search/runtime/shared/search-results-body-admission-controller.ts"

for old_file in \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-key-patch-runtime.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-patch-runtime.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-list-first-paint-readiness-patch-runtime.ts"; do
  if [[ -e "$old_file" ]]; then
    gate_fail "old first-paint patch file still exists: $old_file"
  fi
done

gate_require_present mounted_results_must_stage_prepared \
  "mounted results must stage prepared-row target readiness from row snapshot preparation" \
  "stageSearchMountedResultsPreparedRowsTarget" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

gate_require_present mounted_list_commit_must_mark \
  "mounted list commit must mark prepared-row readiness after list data reaches the mounted surface" \
  "markSearchMountedResultsPreparedRowsCommitted" \
  "apps/mobile/src/overlays/SearchMountedSceneBody.tsx" \
  "apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts"

# REPOINTED 2026-08-03 (audit D37 / F704). Was pinned to the identifier
# `preparedRowsInitialDrawBatchSize`, which was split into
# primary/secondaryInitialDrawBatchSize. The INVARIANT is intact — both are
# Math.min(MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE, max(default, rows.length))
# — so assert the durable constant, not the local variable name.
gate_require_present mounted_results_flashlist_must_draw \
  "mounted results FlashList must draw the prepared page-one row batch, not the old small initial batch" \
  "MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE" \
  "apps/mobile/src/overlays/SearchMountedSceneBody.tsx"

gate_require_present presentation_surface_authority_must_expose \
  "presentation surface authority must expose preparedRows readiness" \
  "preparedRows" \
  "apps/mobile/src/screens/Search/runtime/shared/results-presentation-surface-authority.ts"

gate_require_present results_transaction_gate_must_wait \
  "results transaction gate must wait on listPreparedRowsReady" \
  "listPreparedRowsReady" \
  "apps/mobile/src/screens/Search/runtime/shared/search-surface-results-transaction.ts" \
  "apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"

gate_summary "pass"
