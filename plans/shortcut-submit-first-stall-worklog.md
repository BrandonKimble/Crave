# Shortcut Submit First >50ms Stall Worklog

Last updated: 2026-02-15
Owner: Codex
Scope: `apps/mobile/src/screens/Search/**`

## Goal

Reduce the first JS stall over `50ms` and lower overlap in `visual_sync_state` without UX regression.

## Baseline Context (from latest user-provided control)

- Control log: `/tmp/perf-shortcut-candidate-20260215T200936Z.log`
- Worst max frame: `340.3ms`
- `>80ms` windows: `4`
- `>50ms` windows: `5`
- First `>50ms`: `96.3ms` at `stage=none`
- Dominant worst stage: `visual_sync_state`

## Already Tried (before this pass)

1. Added submit attribution around early submit/materialization writes in `use-search-submit.ts`.
2. Changed `isAutocompleteSuppressed` timing (reverted due regression).
3. Added one-frame runtime-launch yield (`shortcut_runtime_launch_frame_yield`) before structured runtime start.
4. Yield run results were mixed/high variance (not a reliable fix).

## 2026-02-16 First-Stall Lift to ~160ms (kept stack)

- Objective:
  - Reduce the first JS `>50ms` stall in shortcut run-1 without changing visible behavior.
- Kept code changes that produced the lift:
  1. `apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`
     - Made stage attribution run-scoped (`inProgress`) so active shortcut runs no longer collapse to `shortcutStage=null`.
     - Added stable `pre_response_activation` attribution during active pre-response windows.
  2. `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
     - Shrunk shortcut preflight identity commit:
       - Removed pre-response `setSearchMode('shortcut')`
       - Removed pre-response `setIsSearchSessionActive(true)`
       - Removed pre-response `setIsAutocompleteSuppressed(true)`
     - Kept immediate UX identity updates (`query/submittedQuery/activeTab/currentPage`).
     - Session/mode/autocomplete activation stays on the response-accepted path (already transition-safe).
  3. `apps/mobile/src/screens/Search/index.tsx`
     - Made run-one coordinator snapshot subscription selective + transition-priority:
       - Skip root rerender on metadata-only/no-op snapshot changes.
       - Only commit render state when `operationId/phase/seq/page/markerRevealSettledAtMs/commitSpanPressure` changes.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Matched harness evidence (kept):
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T183233Z-16ab.log` (`runs=3`)
  - Per-run first `>50ms`:
    - run-1: `160.4ms` (`stage=pre_response_activation`, elapsed `432.7ms`)
    - run-2: `128.6ms` (`stage=marker_reveal_state`, elapsed `466.8ms`)
    - run-3: `104.6ms` (`stage=marker_reveal_state`, elapsed `299.9ms`)
  - Note:
    - First-stall improved materially vs recent `~260-280ms` single-run checks.
    - Program still blocked by later catastrophic windows (`marker_reveal_state` / `results_hydration_commit`).

## 2026-02-16 Follow-up candidate (reverted)

- Candidate:
  - Freeze map tree props through run-one `idle/h1/h2` (release at `h3`).
  - File: `apps/mobile/src/screens/Search/index.tsx`
- Result:
  - Not a reliable win; produced catastrophic later windows and no consistent first-stall gain.
  - Reverted.
  - Probe logs:
    - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T183510Z-7775.log` (first `>50ms` `358.5ms`, regression)
    - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T183807Z-41da.log` (first `>50ms` `164.4ms`, but worst `468.2ms`)

## 2026-02-16 Pagination Regression Fix

- Symptom:
  - Pagination appeared broken (next-page cards not showing even when append path was active).
  - In some sessions the list looked stuck/sparse after first response window.
- Root cause:
  - `read-model-selectors-runtime.tsx` list projection cache key did not vary on append within the same `searchRequestId`.
  - Page 2+ reused the same projection key and returned stale cached `sectionedRows`.
- Code change:
  - File: `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
  - Removed stale-key dependency from list projection path (build projection directly in `useMemo`).
  - Expanded `requestVersionKey` telemetry identity to include page + dish/restaurant counts.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
  - Harness run: `shortcut-pagination-check-20260216T030328Z`
  - Harness settle summary: `finalVisibleCount=40`, `finalSectionedCount=40`, `finalVisiblePinCount=30`, `finalVisibleDotCount=80`

## 2026-02-16 Pagination Gesture Gate (shortcut list)

- Symptom:
  - After first pagination, list could appear to jump/load too much at once.
  - Pagination could chain while still at end-of-list, instead of one request per explicit user scroll.
- Root cause:
  - `onEndReached` can fire repeatedly while the list remains near the end after append/layout changes.
  - Existing guard prevented duplicate `nextPage` in-flight, but did not require a new user scroll gesture before the next load-more trigger.
- Code change:
  - File: `apps/mobile/src/screens/Search/index.tsx`
  - Added `allowLoadMoreForCurrentScrollRef` gate.
  - Reset gate on user scroll begin / momentum begin.
  - Consume gate on first `handleResultsEndReached` call so each scroll gesture admits only one pagination request.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`

## 2026-02-16 Pagination Bottom-Reach Gate

- Symptom:
  - Pagination could trigger before the list visually reached the true bottom spacer region.
- Root cause:
  - `onEndReachedThreshold` allowed pre-bottom callbacks; pagination admission did not require `distanceFromEnd <= 0`.
- Code change:
  - File: `apps/mobile/src/overlays/panels/SearchPanel.tsx`
    - Set `onEndReachedThreshold` from `0.2` to `0`.
  - File: `apps/mobile/src/screens/Search/index.tsx`
    - Updated `handleResultsEndReached` to require `distanceFromEnd <= 0` before paginating.
    - Preserved one-request-per-scroll gating (`allowLoadMoreForCurrentScrollRef`).
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/overlays/panels/SearchPanel.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`

## New Micro-Cluster (this pass)

1. **Phase-A commit shrink** in `use-search-submit.ts`

- Keep phase-A write focused on results identity commit.
- Avoid non-append `mergeSearchResponses` in phase-A; commit phase-A preview payload directly.
- Move active-tab state mutation out of phase-A into scheduled `selection_feedback` lane.

2. **Hydration pressure lock** in `read-model-selectors-runtime.tsx`

- Enforce `stepRows=1` for full run-one commit-span pressure window.
- Remove temporary pressure frame budget countdown behavior.

3. **Hard scheduler admission** in scheduler/governor

- One heavy lane per frame (`selection_feedback`, `phase_b_materialization`, `overlay_shell_transition`).
- Disable starvation override during critical pressure frames.

4. **Stage isolation extension** in `Search/index.tsx`

- Extend run-one chrome/map defer behavior while commit-span pressure is active.
- Keep map/chrome finalize deferred longer in critical overlap windows.

## Validation Status

- Targeted ESLint on touched files: `PASS`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`: `PASS`
- `npx tsc -p apps/mobile/tsconfig.json --noEmit`: `FAIL` (pre-existing workspace-wide type errors outside this micro-cluster)

## Validation Pending

- Matched perf gate runs (next step after code validation).

## Next Measurements to Capture

1. First `>50ms` window (`stage`, `durationMs`).
2. `visual_sync_state` worst frame and count of `>80ms`/`>50ms` windows.
3. Whether `results_hydration_commit` and `visual_sync_state` stop co-locating in the same frame windows.

## Latest Verification Run

- Run date: 2026-02-15
- Log: `/tmp/perf-shortcut-candidate-20260215T204809Z.log`
- Harness mode: single run (`EXPO_PUBLIC_PERF_HARNESS_RUNS=1`)
- Run 1 first `>50ms` JS stall: `307.6ms` at `stage=visual_sync_state` (`shortcutElapsedMs=453.5`)
- Run 1 worst JS stall window: `307.6ms`
- Run 1 `>50ms` windows: `3`
- Threshold check (`<350ms`): `PASS`

## Follow-up Attempts and Results

### Attempt: map hold + staged publish refinement

- Log: `/tmp/perf-shortcut-candidate-20260215T205738Z.log`
- Run 1 first `>50ms` JS stall: `319.2ms` at `stage=marker_reveal_state` (`shortcutElapsedMs=458`)
- Run 1 worst JS stall window: `319.2ms`
- Run 1 `>50ms` windows: `4`
- Run 1 `>80ms` windows: `3`

### Attempt: shortcut runtime identity pre-prime (this pass)

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - Added `shortcut_runtime_identity_bundle` preflight write.
  - Prime shortcut runtime identity before response apply (`searchMode`, `isSearchSessionActive`, `activeTab`, pagination/meta reset).
  - Removed duplicate shortcut identity write inside structured `onResponseAccepted`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`: `PASS`
- Perf log: `/tmp/perf-shortcut-candidate-20260215T210900Z.log`
- Run 1 first `>50ms` JS stall: `278.5ms` at `stage=results_list_materialization` (`shortcutElapsedMs=416.8`)
- Run 1 worst JS stall window: `325.3ms` at `stage=marker_reveal_state` (`shortcutElapsedMs=991.5`)
- Run 1 `>50ms` windows: `3`
- Run 1 `>80ms` windows: `2`
- First-stall delta vs prior run (`/tmp/perf-shortcut-candidate-20260215T205738Z.log`): `-40.7ms`

### Experiment: allow pins immediately (disable map marker hold gate)

- Code: `apps/mobile/src/screens/Search/index.tsx`
- Change summary:
  - Set `shouldHoldMapMarkerReveal = false` (temporary experiment) so pins are not held behind visual-sync.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf log: `/tmp/perf-shortcut-candidate-20260215T211300Z.log`
- Run 1 first `>50ms` JS stall: `266ms` at `stage=visual_sync_state` (`shortcutElapsedMs=502.3`)
- Run 1 worst JS stall window: `266ms`
- Run 1 `>50ms` windows: `3`
- Run 1 `>80ms` windows: `2`
- Pin visibility confirmation (harness settle payload): `finalVisiblePinCount=12`, `finalVisibleDotCount=80`

### Attempt: defer structured loading clear to run-one `h4`

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - Moved run-one shortcut `setIsLoading(false)` out of immediate structured-operation finalize.
  - Added deferred finalize path that waits for run-one handoff `h4_chrome_resume` and schedules clear on `overlay_shell_transition` lane.
  - Added telemetry mode tagging on finalize write: `mode=deferred_h4|immediate`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`: `PASS`
- Perf log: `/tmp/perf-shortcut-candidate-20260215T211700Z.log`
- Run 1 first `>50ms` JS stall: `214.9ms` at `stage=visual_sync_state` (`shortcutElapsedMs=481.2`)
- Run 1 worst JS stall window: `214.9ms`
- Run 1 `>50ms` windows: `2`
- Run 1 `>80ms` windows: `2`
- Telemetry confirmation: run-1 loading finalize emitted as `label=structured_set_is_loading_false`, `mode=deferred_h4`
- Pin visibility confirmation: `finalVisiblePinCount=12`, `finalVisibleDotCount=80`

## 2026-02-16 Follow-up Runs (stability check)

### Reference run before latest experiments

- Log: `/tmp/perf-shortcut-candidate-20260215T220312Z.log`
- Run 1 first `>50ms` JS stall: `256.7ms` at `stage=results_list_materialization` (`shortcutElapsedMs=378.3`)
- Run 1 worst JS stall window: `256.7ms`
- Run 1 `>50ms` windows: `3`
- Run 1 `>80ms` windows: `3`
- Outcome: this is the best recent stable reference in the current branch state.

### Experiment: long delay + forced panel fallback path (reverted)

- Log: `/tmp/perf-shortcut-candidate-20260216T010303Z.log`
- Run 1 first `>50ms` JS stall: `322.3ms` (`shortcutStage=null`)
- Run 1 worst JS stall window: `322.3ms`
- Run 1 `>50ms` windows: `3`
- Run 1 `>80ms` windows: `3`
- Outcome: regression; reverted.

### Experiment: identity preflight transition path (reverted)

- Log: `/tmp/perf-shortcut-candidate-20260216T010407Z.log`
- Run 1 first `>50ms` JS stall: `287.6ms` (`shortcutStage=null`)
- Run 1 worst JS stall window: `308.0ms`
- Run 1 `>50ms` windows: `4`
- Run 1 `>80ms` windows: `4`
- Outcome: regression/noise increase; reverted.

### Experiment: scheduler-admitted shortcut loading-state bundle (current check)

- Log: `/tmp/perf-shortcut-candidate-20260216T010555Z.log`
- Run 1 first `>50ms` JS stall: `266.8ms` (`shortcutStage=null`, `shortcutElapsedMs=387.3`)
- Run 1 worst JS stall window: `266.8ms`
- Run 1 `>50ms` windows: `3`
- Run 1 `>80ms` windows: `3`
- Delta vs reference (`20260215T220312Z`): `+10.1ms` first stall (worse), same window counts.
- Outcome: not a winning change; candidate for revert.

## Current Facts (2026-02-16)

1. The dominant hotspot remains the run-one overlap window where root/sheet/map/chrome work co-locates.
2. Timing shifts without overlap removal have produced mixed or negative results.
3. A reliable path to `<50ms` requires reducing same-frame commit mass, not just delaying writes.

## 2026-02-16 Deep-Dive Addendum

### Timestamp correlation pass (first `>50ms` window)

- Method: correlate first JS sampler window to in-window runtime events across:
  - `/tmp/perf-shortcut-candidate-20260215T220312Z.log`
  - `/tmp/perf-shortcut-candidate-20260216T010555Z.log`
  - `/tmp/perf-shortcut-candidate-20260216T010923Z.log`
  - `/tmp/perf-shortcut-candidate-20260216T011027Z.log`
- Finding:
  - The first hot window frequently contains only:
    - `submit_preflight:shortcut_ui_prep`

## 2026-02-16 List Hydration UX Correction (remove one-card-first lock)

- Symptom:
  - Results list visually loaded one card first, then ramped the rest.
- Root cause:
  - Run-one hydration path had an intentional one-row clamp (`HYDRATION_PENDING_INITIAL_ROWS=1` and forced `stepRows=1` under commit-span pressure).
  - Stale hydration row-limit state could also bleed into the next hydration key before effects ran.
- Code change:
  - File: `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
  - Set pending initial rows to the ramp default (`4`) and removed forced `stepRows=1` lock for run-one pressure.
  - Added safer start-row resolution for hydration ramp.
  - Keyed hydration row-limit state by `resultsHydrationKey` so previous-key limits are ignored immediately after key swap.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf check:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T033833Z-3865.log`
  - First full-page hydration render (`sectionedRowCount=20`) now starts at `rowsForRenderCount=4` (`effectiveHydrationRowsLimit=4`) instead of `1`.
  - Run 1 first `>50ms` stall: `347.3ms` (`shortcutStage=null`)
  - Run 1 `>50ms` windows: `3`
  - Run 1 `>80ms` windows: `3`

## 2026-02-16 Shortcut Immediate UX + Full List Commit

- Requested UX fixes:
  - Remove first-card-first behavior.
  - Make shortcut fill search text/header immediately.
  - Make `Best restaurants` shortcut switch tab immediately to restaurants.
- Code changes:
  - `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
    - Shortcut preflight identity now immediately sets:
      - `searchMode='shortcut'`
      - `isSearchSessionActive=true`
      - `activeTab=targetTab`
      - `submittedQuery=submittedLabel`
    - Disabled phase-A truncation by setting `PHASE_A_RESPONSE_ROW_LIMIT=Number.MAX_SAFE_INTEGER`.
    - Run-1 phase-A split now only applies when phase-A actually defers rows (`hasDeferredPhaseBResponseApply=true`).
  - `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
    - `HYDRATION_PENDING_INITIAL_ROWS=Number.MAX_SAFE_INTEGER` to avoid staged list row reveal for first page.
  - `apps/mobile/src/screens/Search/index.tsx`
    - Shortcut query sync now applies `setQuery(nextQuery)` immediately (removed run-after-interactions deferral path).

## 2026-02-16 Map-stage churn suppression (current loop)

### Variant A: shortcut fallback removal + hold during visual-sync/loading (kept)

- Code:
  - `apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
    - In shortcut mode, stop falling back to `markerCandidatesRef` for ranked pin source; use coverage-ranked source only.
  - `apps/mobile/src/screens/Search/index.tsx`
    - Shortcut dot read model no longer falls back to marker-catalog features when coverage payload is absent.
    - Hold marker reveal while `isVisualSyncPending || isShortcutCoverageLoading`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T062023Z-1dfc.log`
- Summary:
  - `stallMaxMean`: `432.6ms` (improved from `493.7ms`)
  - `stallP95`: `446.05ms` (improved from `517.64ms`)
  - Catastrophic windows (`>300ms`): `3` (improved from `4`)
  - Run first `>50ms` stalls:
    - run-1: `284.3ms` (`stage=none`)
    - run-2: `205.9ms` (`stage=marker_reveal_state`)
    - run-3: `140.0ms` (`stage=marker_reveal_state`)
  - Still far from target (`<50ms`), but this is the best of the three compared variants in this loop.

### Variant B: hold-latch until coverage present + disable staged publish while hold (reverted)

- Code (experimental, reverted):
  - `apps/mobile/src/screens/Search/index.tsx`
    - Held map reveal until coverage features existed (`!hasShortcutCoverageFeatures` latch).
  - `apps/mobile/src/screens/Search/components/search-map.tsx`
    - Disabled staged publish when hold marker keys were active.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/components/search-map.tsx apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T062258Z-068f.log`
- Summary:
  - `stallMaxMean`: `481.27ms` (regressed vs Variant A `432.6ms`)
  - `stallP95`: `496.74ms` (regressed vs Variant A `446.05ms`)
  - Run first `>50ms` stalls:
    - run-1: `323.3ms`
    - run-2: `443.9ms`
    - run-3: `532.1ms`
- Outcome:
  - Reverted this variant and retained Variant A behavior.

## 2026-02-16 Profiler Probe + Preflight Identity Trim Experiment

### Profiler probe run (span log mode)

- Harness:
  - `EXPO_PUBLIC_PERF_HARNESS_RUNS=1 EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG=1 bash scripts/perf-shortcut-loop.sh`
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T062552Z-42d1.log`
- Finding:
  - First `>50ms` JS window (`maxFrameMs=308.3ms`, `stage=none`, `shortcutElapsedMs=308.3`) overlaps a large early pre-response commit.
  - Dominant profiler contributors in that early commit:
    - `SearchScreen` (`actualDurationMs≈54`)
    - `SearchResultsSheetTree` (`actualDurationMs≈39.5`)
    - commit span around `~62ms`.
  - This indicates the first hot window still includes heavy root/sheet work before response hydration.

### Experiment: trim `shortcut_runtime_identity_bundle` to UX-only fields (reverted)

- Code (experimental):
  - `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
  - Removed preflight writes for `searchMode`, `isSearchSessionActive`, and pagination flags from `shortcut_runtime_identity_bundle`, leaving only immediate UX identity fields.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T062756Z-0b97.log`
- Outcome:
  - Mixed with net regression vs Variant A (`062023Z-1dfc`):
    - `stallMaxMean`: `442.7ms` (worse than `432.6ms`)
    - `stallP95`: `463.3ms` (worse than `446.05ms`)
    - First `>50ms` stalls worsened in run-2/run-3 (`399.6ms`, `454.8ms`)
  - Reverted this preflight-trim change.
  - `apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx`
    - Results header submitted query now reads live `submittedQuery` (not frozen snapshot copy).
- Validation:
  - `npx eslint` on touched files: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Harness check:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T045345Z-2828.log`
  - First full-page list render now commits all rows at once:
    - `sectionedRowCount=20`
    - `rowsForRenderCount=20`
    - `effectiveHydrationRowsLimit=20`
  - First root commit after shortcut identity shows immediate shortcut session activation:
    - `searchMode=shortcut`, `isSearchSessionActive=true`
  - Run 1 first `>50ms` stall: `306.6ms`
  - Run 1 worst JS stall: `639ms` (`stage=visual_sync_state`)
    - `submit_preflight:shortcut_runtime_identity_bundle`
    - `root_state_commit:search_root_state_commit`
    - `results_read_model:list_read_model_build`
  - This indicates the earliest stall is primarily tied to root state activation churn, not list/map hydration itself.

### Profiler-span confirmation run

- Log: `/tmp/perf-shortcut-candidate-prof-20260216T011235Z.log`
- Note: profiler span logging inflates runtime cost; use for attribution only, not perf baseline.
- First `>50ms` window in this run: `457.4ms` (`stage=null`)
- Dominant overlapping components in first window:
  - `SearchScreen` (`238.1ms` overlap)
  - `SearchMapTree` (`237.7ms`)
  - `SearchOverlayChrome` (`226.8ms`)
  - `SearchResultsSheetTree` (`193.4ms`)
- Conclusion: dominant subtree is confirmed; first window is rooted in early root-activation commit overlap.

### Attempt: defer shortcut session activation from preflight to response-accepted

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change:
  - Removed `setSearchMode('shortcut')` + `setIsSearchSessionActive(true)` from preflight identity bundle.
  - Scheduled session activation in response-accept path (scheduler lane `selection_feedback`).
- Results:
  - `/tmp/perf-shortcut-candidate-20260216T011457Z.log`: first `161.8ms`, worst `268.3ms`, `>50=5`, `>80=5`
  - `/tmp/perf-shortcut-candidate-20260216T011554Z.log`: first/worst `288ms`, `>50=4`, `>80=4`
  - `/tmp/perf-shortcut-candidate-20260216T011733Z.log`: first `128.9ms`, worst `266.7ms`, `>50=4`, `>80=4`
  - `/tmp/perf-shortcut-candidate-20260216T012029Z.log`: first/worst `233.2ms`, `>50=5`, `>80=5`
- Behavior:
  - Pin/dot integrity in these runs remained valid (`12/80`).
- Interpretation:
  - Directional first-stall improvement exists in multiple runs, but variance remains high and still far above target.

### Failed variant: strict handoff-phase gating for session activation (reverted)

- Log: `/tmp/perf-shortcut-candidate-20260216T011913Z.log`
- Outcome:
  - Session activation failed to apply during run (`searchMode` remained `null`), visual path degraded.
  - Final marker integrity regressed to `finalVisiblePinCount=1`, `finalVisibleDotCount=20`.
- Action:
  - Reverted strict gating logic in same pass; restored prior non-broken variant.

### Follow-up variant: RAF phase-poller for session activation (iteration)

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Intent:
  - Make session activation deterministic (wait past `h1/h2`) without relying on scheduler phase metadata.
- First implementation outcome:
  - `/tmp/perf-shortcut-candidate-20260216T012341Z.log`
  - first/worst `242.4ms`, but activation missed and map degraded (`finalVisiblePinCount=1`, `finalVisibleDotCount=20`).
  - Root cause: session activation poller was being canceled too early.
- Corrected implementation outcome:
  - `/tmp/perf-shortcut-candidate-20260216T012509Z.log`
  - first/worst `253.1ms`, `>50=3`, `>80=3`
  - marker integrity restored (`finalVisiblePinCount=12`, `finalVisibleDotCount=80`)
  - activation now lands in `h3` commit (`changedKeys` includes `searchMode`, `isSearchSessionActive` at `phase=h3_hydration_ramp`).
- Interpretation:
  - Correctness restored; deterministic h3 activation confirmed.
  - Stall remains far above target and still requires larger subtree isolation in `Search/index.tsx`.

### Attempt: transition-priority session activation (submit hook)

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change:
  - Wrapped deferred `setSearchMode('shortcut')` + `setIsSearchSessionActive(true)` in `React.startTransition` (fallback: `unstable_batchedUpdates`).
- Matched gate log:
  - `/tmp/perf-shortcut-candidate-20260216T012750Z.log`
- Per-run JS windows (`>50ms` sampler):
  - run 1: first `135.1ms` (`stage=none`), max `275.8ms`, `>50=6`, `>80=4`
  - run 2: first `84.4ms` (`stage=results_list_ramp`), max `153.8ms`, `>50=5`, `>80=4`
  - run 3: first `71.0ms` (`stage=results_list_ramp`), max `242.9ms`, `>50=4`, `>80=3`
- Notable behavior:
  - run 1 completed with sparse visuals (`finalVisiblePinCount=0`, `finalVisibleDotCount=0`, `finalVisibleCount=2`), while runs 2/3 were correct (`12/80`).
- Interpretation:
  - First-stall directionally improved in runs 2/3 but variance remained high and run-1 reliability looked weak.

### Attempt: stabilize Search results panel spec identity

- Code: `apps/mobile/src/overlays/panels/SearchPanel.tsx`
- Change:
  - Memoized the returned `OverlayContentSpec` object and derived style/background/underlay fragments so `SearchPanel` spec reference does not churn on unrelated parent renders.
- Matched gate log:
  - `/tmp/perf-shortcut-candidate-20260216T013305Z.log`
- Aggregate report (`/tmp/perf-shortcut-candidate-20260216T013305Z.json`):
  - `stallP95=201.76ms`, `stallMaxMean=209.30ms`, `floorMean=4.83`
- Per-run JS windows (`>50ms` sampler):
  - run 1: first `150.9ms` (`stage=none`), max `244.6ms`, `>50=6`, `>80=4`
  - run 2: first `71.6ms` (`stage=results_list_ramp`), max `190.7ms`, `>50=5`, `>80=4`
  - run 3: first `71.5ms` (`stage=results_list_ramp`), max `192.6ms`, `>50=6`, `>80=4`
- Behavior:
  - run 1 still sparse (`pins=0`, `dots=0`), runs 2/3 correct (`12/80`).
- Interpretation:
  - Better aggregate worst-window profile than the prior matched candidate (`stallP95 233.99 -> 201.76`), but still far from `<50ms` and still variant noise.

### Failed attempt (reverted): transition-split autocomplete suppression in preflight

- Code (reverted): `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change tested:
  - Kept `setShowSuggestions(false)` in urgent batch, moved `setIsAutocompleteSuppressed(true)` into `React.startTransition`.
- Matched gate log:
  - `/tmp/perf-shortcut-candidate-20260216T013533Z.log`
- Outcome:
  - Regression with catastrophic run-1 window:
    - run 1: first `242.8ms` (`stage=none`), max `509.1ms` (catastrophic)
  - Aggregate degraded vs previous candidate:
    - `stallP95=227.51ms`, `stallMaxMean=295.93ms`, `catastrophicRunCount=1`
- Action:
  - Reverted this suppression-split variant immediately.

## 2026-02-16 Marker Visibility / Dot+Pin Sync Pass

### Fix: runBestHere preflight skip guard runtime error

- Code: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change:
  - Fixed invalid `targetPage` reference in runBestHere preflight skip branch.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf gate log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T021144Z-25e8.log`
- Outcome:
  - Harness recovered from run-time error and completed all runs.
  - Marker integrity: run1 sparse (`pins=0`, `dots=1`), runs2/3 healthy (`12/80`).

### Attempt: parent-level shortcut pin fallback (reverted)

- Code (reverted): `apps/mobile/src/screens/Search/index.tsx`
- Change tested:
  - Added fallback LOD pin set from shortcut coverage/catalog when `lodPinnedMarkerMeta` empty.
  - Dot fallback used anchored-or-raw coverage before catalog fallback.
- Perf gate log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T021520Z-548e.log`
- Outcome:
  - Regression in run1 max frame (`427.3ms`), still sparse marker settle (`pins=1`, `dots=20`).
- Action:
  - Reverted parent-level pin fallback.

### Attempt: bounds-retry shortcut coverage fetch (reverted)

- Code (reverted): `apps/mobile/src/screens/Search/runtime/map/use-shortcut-coverage-owner.ts`, `apps/mobile/src/screens/Search/index.tsx`
- Change tested:
  - Stored pending coverage snapshots and retried coverage fetch with resolved viewport bounds when initial bounds were missing.
- Perf gate log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T021819Z-745c.log`
- Outcome:
  - Coverage fetch started but did not resolve in-run; dot density regressed to `20`.
  - run1 remained high (`383.7ms`) with sparse settle (`pins=1`, `dots=20`).
- Action:
  - Reverted bounds-retry variant.

### Current variant: map-local pin fallback from dots

- Code: `apps/mobile/src/screens/Search/components/search-map.tsx`
- Change:
  - Added local fallback pin set from top dot features (`12`, deterministic `lodZ`) only when `sortedRestaurantMarkers` is empty.
  - Uses fallback key only inside map pin transition path to keep parent state flow unchanged.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/components/search-map.tsx`: `PASS`
  - `npx eslint apps/mobile/src/screens/Search/runtime/map/use-shortcut-coverage-owner.ts`: `PASS`
  - `npx eslint apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf gate log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T022211Z-4f3a.log`
- Outcome:
  - run1: max `332.0ms`, first `>50ms` window at `173.8ms`, sparse settle still present (`pins=1`, `dots=1`) because coverage fetch skipped due missing bounds.
  - run2: max `139.5ms`, settle `pins=12`, `dots=80`.
  - run3: max `119.1ms`, settle `pins=12`, `dots=80`.
- Interpretation:
  - Dot+pin synchronization works when coverage resolves.
  - Remaining blocker for run1 marker integrity is unchanged: coverage fetch skip on missing bounds in first run.

### Follow-up: immediate initial bounds priming on map load

- Code: `apps/mobile/src/screens/Search/index.tsx`
- Change:
  - Removed `InteractionManager.runAfterInteractions` delay around initial `getVisibleBounds` priming; capture now starts immediately in `handleMapLoaded`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf gate log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T022433Z-6e80.log`
- Outcome:
  - run1 coverage still skipped (`Shortcut coverage fetch skipped (no bounds snapshot)`), so run1 remained sparse at settle (`pins=12`, `dots=20`) with high max stall (`445.1ms`).
  - runs2/3 remained healthy (`pins=12`, `dots=80`) with max stalls `168.1ms` and `133.5ms`.
- Interpretation:
  - Early map-load priming alone does not eliminate first-run missing-bounds race in this harness path.

## 2026-02-16 Regression Repair Pass (list + pin cap + fallback removal)

### Fix: restore pin cap, remove map fallback synthesis, unblock hydration finalize in h2

- Code:
  - `apps/mobile/src/screens/Search/index.tsx`
  - `apps/mobile/src/screens/Search/components/search-map.tsx`
- Change summary:
  - Restored `MAX_FULL_PINS` from `12` to `30` to match prior behavior and style slot capacity.
  - Removed map-local dot-to-pin fallback path (`DOT_FALLBACK_PIN_COUNT` and `effective*` fallback marker/key flow).
  - Restored staged publish + pin transition inputs to canonical `sortedRestaurantMarkers` and `pinsRenderKey` only.
  - Loosened run-one hydration finalize gate so finalize commits are allowed in `h2_marker_reveal` (prevents list from being stranded at initial row limit when h2 is prolonged).
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/components/search-map.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`: `PASS`
- Perf verification:
  - Pending single-run harness capture to confirm marker settle counts and first-stall window after regression repair.

### Follow-up fix: scheduler soft-budget admission no longer blocks first heavy task

- Code: `apps/mobile/src/screens/Search/runtime/scheduler/frame-budget-governor.ts`
- Root cause:
  - `phase_b_materialization` post-h4 task was estimated at `10ms`, but governor denied any task above `SOFT_BUDGET_MS=8` even as the first task in a frame.
  - Result: phase-B apply could be deferred repeatedly and list stayed at phase-A preview (single-card symptom).
- Change:
  - Keep one-heavy-lane-per-frame policy.
  - Treat soft budget as a multi-task admission guard only; allow first task in a frame to exceed soft budget (still bounded by hard/available budget).
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/scheduler/frame-budget-governor.ts apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/components/search-map.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Verification run:
  - Log: `/tmp/perf-shortcut-candidate-20260216T023605Z.log`
  - Run 1 first `>50ms` JS stall: `321.3ms` (`stage=null`, `shortcutElapsedMs=684.4`)
  - Run 1 worst JS stall window: `321.3ms`
  - Run 1 `>50ms` windows: `3`
  - Run 1 `>80ms` windows: `2`
  - Marker/list settle: `finalVisibleCount=40`, `finalSectionedCount=40`, `finalVisiblePinCount=20`, `finalVisibleDotCount=20`
- Outcome:
  - Functional regressions repaired (result list no longer stuck at first card; pins restored beyond 12 in stable settle).
  - Stall remains far above target and still requires root visual-sync overlap reduction.

### Fix: preserve shortcut coverage snapshot through `searchMode=null` handoff + late-bounds recovery path

- Code:
  - `apps/mobile/src/screens/Search/runtime/map/use-shortcut-coverage-owner.ts`
  - `apps/mobile/src/screens/Search/index.tsx`
- Root cause:
  - Coverage snapshot could be stored on response accept, then immediately cleared while run-one was still in `searchMode=null` handoff.
  - This produced run-1 `Shortcut coverage fetch skipped (no bounds snapshot)` for the same request.
- Change summary:
  - Added pending snapshot storage for missing-bounds submissions (`pending` + optional later recovery when viewport bounds arrive).
  - Subscribed coverage owner to viewport-bounds revision updates so late bounds can trigger recovery.
  - Prevented coverage reset during `searchMode=null` when the active request already has a stored/pending snapshot.
  - Wired `viewportBoundsService` into `useShortcutCoverageOwner` from `Search/index.tsx`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/map/use-shortcut-coverage-owner.ts apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Verification run:
  - Log: `/tmp/perf-shortcut-candidate-20260216T024334Z.log`
  - Coverage signals: `skipNoBounds=0`, `fetchStart=1`, `fetchResolved=1`.
  - Marker/list settle: `finalVisibleCount=40`, `finalSectionedCount=40`, `finalVisiblePinCount=30`, `finalVisibleDotCount=80`.
  - First `>50ms` JS stall: `331.9ms` (still far above target).

## 2026-02-16 Stall-Cut Loop (Phase-A Identity Split + Attribution)

### Kept: phase-A identity split with immediate query/tab commit

- Code:
  - `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
  - `apps/mobile/src/screens/Search/index.tsx`
- Change summary:
  - Added `setQuery` to submit hook wiring and set shortcut label into query immediately in phase-A identity preflight.
  - Kept immediate identity writes to: `activeTab`, `submittedQuery`, `query`, `currentPage`, `error`.
  - Deferred heavier runtime/session writes (`searchMode`, `isSearchSessionActive`, pagination flags) to existing session-activation path.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/index.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf gates:
  - 1-run sanity:
    - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T063633Z-49f5.log`
    - first `>50ms` window: `199.3ms` (down from ~`317ms` in nearby prior profile run)
    - worst window: `370.3ms`
  - 3-run gate:
    - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T063717Z-5e36.log`
    - `stallMaxMean`: `380.63ms` (slight improvement vs ~`384.53ms` previous kept state)
    - first `>50ms` by run:
      - run1: `198.2ms`
      - run2: `186.7ms`
      - run3: `411.2ms`
- Interpretation:
  - Early run-1 burst improved materially, but high variance persists and stage `none` still dominates.

### Attribution: profiler span run on kept variant

- Run:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T063831Z-248c.log`
- Key finding (run-1 worst JS window):
  - run-1 worst window: `maxFrameMs=395.6ms` (`stage=none`)
  - intersecting top commit spans:
    - `SearchScreen`: `85.5ms`
    - `SearchResultsSheetTree`: `85.4ms`
    - `SearchMapTree`: `67.8ms`
    - `SearchOverlayChrome`: `66.4ms`
- Interpretation:
  - Dominant overlap remains `SearchScreen` + `SearchResultsSheetTree` during visual-sync/hydration commits.

### Reverted: hold hydration rows at 0 through visual-sync

- Code (reverted): `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- Change tested:
  - Forced pending hydration rows to stay at `0` for all visual-sync-pending states and blocked finalize release during hold.
- Perf result:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T064025Z-2ecb.log`
  - worst window regressed to `516.8ms` (later hot window), run `stallMaxMean=508.6ms` (1-run).
- Action:
  - Reverted.

### Reverted: delay session activation until h4/idle

- Code (reverted): `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change tested:
  - Session activation wait condition expanded to hold through `h3_hydration_ramp`.
- Perf result:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T064230Z-3d1c.log`
  - worst window regressed to `508.6ms` (1-run), with two catastrophic windows.
- Action:
  - Reverted; restored activation timing to post-h2 (existing h3-ready behavior).

### Reverted: pre-h3 marker-hold alignment during null-mode handoff

- Code (reverted): `apps/mobile/src/screens/Search/index.tsx`
- Change tested:
  - Enabled `shouldHoldMapMarkerReveal` during `searchMode=null` when run-one operation was in flight.
  - Goal: avoid extra `shouldHoldMapMarkerReveal` flip at h3 and reduce overlap in visual-sync window.
- Perf result:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T064437Z-032c.log`
  - first `>50ms`: `213.9ms`
  - worst window: `395.8ms` (no meaningful improvement vs prior kept profile window ~`395.6ms`)
- Action:
  - Reverted to keep behavior stable.

## 2026-02-16 Focused JS-Stall Loop (latest)

### Candidate A: hydration release commit shrink (no `0 -> full` jump)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- Change summary:
  - `HYDRATION_PENDING_INITIAL_ROWS` set to `6`.
  - Hydration finalize now always starts with a bounded initial row batch (`rampInitialRows`) and ramps; removed direct full-release fallback for `startRows <= 0`.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf run:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T065139Z-4dd3.log`
  - `stallMaxMean`: `290.10ms` (from `374.13ms`)
  - `stallP95`: `300.06ms` (from `385.44ms`)
  - Catastrophic windows (`>300ms`): `1` (from `3`)
  - First `>50ms` stalls:
    - run-1 `230.7ms`
    - run-2 `304.6ms`
    - run-3 `271.2ms`

### Candidate B: true phase-A split for all shortcut page-1 responses

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - `PHASE_A_RESPONSE_ROW_LIMIT` set to `6`.
  - Shortcut page-1 responses now use phase-A preview path.
  - Phase-A identity split enabled whenever preview is deferred (`hasDeferredPhaseBResponseApply=true`) for shortcut page-1, not only strict run-one branch.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf run:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T065423Z-404f.log`
  - `stallMaxMean`: `218.10ms`
  - `stallP95`: `296.18ms`
  - Catastrophic windows (`>300ms`): `1`
  - First `>50ms` stalls:
    - run-1 `327.1ms`
    - run-2 `52.2ms`
    - run-3 `101.3ms`

### Candidate C: move shortcut session activation earlier into preflight (kept)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - `setSearchMode('shortcut')` + `setIsSearchSessionActive(true)` moved into `shortcut_runtime_identity_bundle` preflight to remove later activation overlap.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf run (best current):
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T065604Z-3c45.log`
  - `stallMaxMean`: `185.97ms`
  - `stallP95`: `259.01ms`
  - Catastrophic windows (`>300ms`): `0`
  - First `>50ms` stalls:
    - run-1 `247.8ms`
    - run-2 `50.5ms`
    - run-3 `98.6ms`

### Candidate D: split `isSearchSessionActive` into transition (reverted)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - Attempted to defer `setIsSearchSessionActive(true)` via `React.startTransition` while keeping `searchMode` preflight.
- Result:
  - Regression; reverted.
- Perf run:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T065738Z-3691.log`
  - `stallMaxMean`: `248.83ms`
  - `stallP95`: `367.45ms`
  - Catastrophic windows (`>300ms`): `2`

## Current Best Known State (this loop)

- Best retained metrics log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T065604Z-3c45.log`
- Best retained code shape combines:
  - hydration release batching/ramp (no full single release commit), and
  - shortcut phase-A split + preview/full apply,
  - shortcut preflight session-mode/session-active activation.

## 2026-02-16 Follow-up Loop (post 07:00Z)

### Candidate E: defer preflight `isSearchSessionActive` (reverted)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- Change summary:
  - Removed `setIsSearchSessionActive(true)` from `shortcut_runtime_identity_bundle` to reduce pre-handoff commit mass.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/hooks/use-search-submit.ts apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf run:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T070720Z-0027.log`
  - Run-1 worst stall: `308.6ms`
  - Later run-1 stall: `260.9ms`
  - Settle snapshot regressed for run-1: `finalVisiblePinCount=0`, `finalVisibleDotCount=0`
- Result:
  - Reverted due settle/output regression and no first-stall win.

### Candidate F: hydration ramp `stepRows=1` pressure lock (reverted)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- Change summary:
  - Forced `resolveStepRows` to `1` under run-one/visual-sync pressure.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Perf run:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T070941Z-43f2.log`
  - `stallMaxMean`: `226.67ms` (regressed vs retained `195.33ms`)
  - `stallP95`: `324.33ms` (regressed vs retained `318.15ms`)
  - Catastrophic runs: `1`
- Result:
  - Reverted.

### Candidate G: pre-h1 freeze window (kept)

- Code:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- Change summary:
  - Added `isRunOnePreflightFreezeActive` (`operationId != null && phase === 'idle'`).
  - Extended deferred-prop freeze to include this pre-h1 window.
  - Froze high-churn map props (`markersRenderKey`, `pinsRenderKey`, marker datasets, visual-ready props) during pre-h1.
  - Froze results-sheet shell props (`overlaySheetSpec`, `overlaySheetKey`, `overlaySheetVisible`) during pre-h1.
- Validation:
  - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: `PASS`
  - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`: `PASS`
- Smoke check:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T071348Z-446a.log`
  - Run-1 worst stall: `285.4ms`
  - Settle snapshot: `finalVisiblePinCount=30`, `finalVisibleDotCount=80`
- Matched 3-run gate:
  - Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T071439Z-12bf.log`
  - `stallMaxMean`: `190.33ms` (improved vs retained `195.33ms`)
  - `stallP95`: `279.66ms` (improved vs retained `318.15ms`)
  - Catastrophic runs: `0` (improved vs `1`)
  - Run max stalls: run-1 `291.1ms`, run-2 `138.8ms`, run-3 `141.1ms`
  - Settle snapshots: all runs `finalVisiblePinCount=30`, `finalVisibleDotCount=80`, `finalVisibleCount=40`

## Current Best Known State (updated)

- Best retained metrics log:
  - `/tmp/perf-shortcut-loop-shortcut-loop-20260216T071439Z-12bf.log`
- Best retained aggregate metrics:
  - `stallMaxMean=190.33ms`
  - `stallP95=279.66ms`
  - Catastrophic runs: `0`

## 2026-02-16 V3 E1/E2 Structural Prep (current pass)

### E1: commit attribution upgrade (kept)

- Candidate tag:
  - `e1-commit-attribution-window-owner-pass1`
- Harness signature:
  - skipped (instrumentation-only slice; no expected direct stall movement per policy)
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - `N/A` (no perf loop run in this slice)
- Per-run worst stall:
  - `N/A` (no perf loop run in this slice)
- Aggregate (`stallP95`, `stallMaxMean`, catastrophic counts):
  - `N/A` (no perf loop run in this slice)
- Parity (`pins/dots/list/sectioned/pagination`):
  - unchanged by scope; validated via:
    - `npx eslint apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts apps/mobile/src/screens/Search/index.tsx`
    - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
- Code changes:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`
    - added run-scoped profiler span capture and per-window owner attribution fields on JS sampler events.
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
    - wired root profiler callback to publish commit-span events into harness observer.
  - `/Users/brandonkimble/crave-search/scripts/perf-shortcut-loop-report.sh`
    - added `firstOver50ByRun` + `worstWindowByRun` with optional owner attribution payloads.
- Decision:
  - `KEEP` (neutral on metrics, required attribution unlock for E3/E4 hotspot ownership).

### E2: shared-state foundation minimal subset (kept)

- Candidate tag:
  - `e2-search-runtime-bus-minimal-foundation-pass1`
- Harness signature:
  - skipped (foundation slice; no expected direct stall movement per policy)
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - `N/A` (no perf loop run in this slice)
- Per-run worst stall:
  - `N/A` (no perf loop run in this slice)
- Aggregate (`stallP95`, `stallMaxMean`, catastrophic counts):
  - `N/A` (no perf loop run in this slice)
- Parity (`pins/dots/list/sectioned/pagination`):
  - unchanged by scope; validated via:
    - `npx eslint apps/mobile/src/screens/Search/index.tsx apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-bus-selector.ts`
    - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
    - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`
    - `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`
- Code changes:
  - added `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts`
  - added `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-bus-selector.ts`
  - updated `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts` to own and expose the bus.
  - updated `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` to publish minimal runtime state into the bus.
- Decision:
  - `KEEP` (neutral on metrics, minimal dependency unlock for E3 subtree isolation).

## 2026-02-16 E3 Evaluation Loop (post plan update: 3.5/3.6/4.2/4.3)

### Reverted-state control (for current branch after E3 revert)

- Candidate tag:
  - `e3-control-after-revert-20260216T200622Z`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{154.8, pre_response_activation, 424.1}`
  - run-2: `{50.1, results_list_ramp, 50.0}`
  - run-3: `{100.8, marker_reveal_state, 566.5}`
- Per-run worst stall:
  - run-1: `408.8ms` (`results_hydration_commit`)
  - run-2: `438.4ms` (`results_hydration_commit`)
  - run-3: `293.9ms` (`marker_reveal_state`)
- Aggregate:
  - `stallP95=423.6ms`
  - `stallMaxMean=380.37ms`
  - catastrophic: `runCount=2`, `windowCount=3`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=40 sectioned=40`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12` (pagination/list parity fail)

### E3 candidate A: memoized results sheet subtree boundary (reverted)

- Candidate tag:
  - `e3-results-sheet-memo-boundary-pass1`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{173.9, pre_response_activation, 445.0}`
  - run-2: `{125.7, marker_reveal_state, 549.9}`
  - run-3: `{114.4, marker_reveal_state, 566.5}`
- Per-run worst stall:
  - run-1: `425.3ms` (`results_hydration_commit`)
  - run-2: `440.7ms` (`results_hydration_commit`)
  - run-3: `423.1ms` (`results_hydration_commit`)
- Aggregate:
  - `stallP95=433.0ms`
  - `stallMaxMean=429.7ms`
  - catastrophic: `runCount=3`, `windowCount=4`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=40 sectioned=40`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12`
- Decision:
  - `REVERT` (catastrophic regression and parity break).

### E3 candidate B: hold map reveal until hydration pressure clears (reverted)

- Candidate tag:
  - `e3-map-hold-until-hydration-pass1`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{304.1, marker_reveal_state, 674.3}`
  - run-2: `{123.2, results_list_ramp, 424.0}`
  - run-3: `{102.4, marker_reveal_state, 632.9}`
- Per-run worst stall:
  - run-1: `357.0ms` (`marker_reveal_state`)
  - run-2: `232.0ms` (`marker_reveal_state`)
  - run-3: `263.8ms` (`marker_reveal_state`)
- Aggregate:
  - `stallP95=330.55ms`
  - `stallMaxMean=284.27ms`
  - catastrophic: `runCount=1`, `windowCount=2`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=12 sectioned=12`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12`
- Decision:
  - `REVERT` (directional stall improvement but parity failure; blocked by visual/parity contract).

### Trigger status (new policy)

- Sections `3.5/3.6/4.2/4.3` adopted.
- Auto-escalation triggers are defined for post-E4 / post-Track gates; E4 not complete yet, so no mandatory Track A/B/C entry triggered in this pass.
- Anti-drift check: two earlier flat kept slices (`E1`, `E2`) followed by reverted E3 attempts; no third flat keep was taken.

### Reverted-state control refresh (post candidate rollback)

- Candidate tag:
  - `e3-control-postrevert-pass2-20260216T203049Z`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{176.3, pre_response_activation, 176.3}`
  - run-2: `{125.3, marker_reveal_state, 549.9}`
  - run-3: `{102.2, marker_reveal_state, 516.5}`
- Per-run worst stall:
  - run-1: `403.2ms` (`results_hydration_commit`)
  - run-2: `297.8ms` (`marker_reveal_state`)
  - run-3: `421.0ms` (`results_hydration_commit`)
- Aggregate:
  - `stallP95=411.21ms`
  - `stallMaxMean=374.0ms`
  - catastrophic: `runCount=2`, `windowCount=3`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=40 sectioned=40`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12`

### E3 candidate C: overlay/results ownership-domain extraction (reverted)

- Candidate tag:
  - `e3-overlay-domain-ownership-pass1`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{165.2, pre_response_activation, 387.5}`
  - run-2: `{60.2, results_list_ramp, 83.3}`
  - run-3: `{55.9, results_hydration_commit, 55.8}`
- Per-run worst stall:
  - run-1: `438.7ms` (`results_hydration_commit`)
  - run-2: `425.2ms` (`results_hydration_commit`)
  - run-3: `438.8ms` (`marker_reveal_state`)
- Aggregate:
  - `stallP95=438.74ms`
  - `stallMaxMean=434.23ms`
  - catastrophic: `runCount=3`, `windowCount=3`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=40 sectioned=40`
  - run-3: `pins=30 dots=80 visible=40 sectioned=40`
- Decision:
  - `REVERT` (catastrophic regression vs control on worst-stall/catastrophic gates despite parity pass).

### E3 candidate D: hold marker reveal through hydration pressure (re-eval, reverted)

- Candidate tag:
  - `e3-map-hold-hydration-pass2`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{311.3, marker_reveal_state, 643.2}`
  - run-2: `{103.9, marker_reveal_state, 446.1}`
  - run-3: `{76.9, marker_reveal_state, 483.2}`
- Per-run worst stall:
  - run-1: `322.3ms` (`marker_reveal_state`)
  - run-2: `307.3ms` (`marker_reveal_state`)
  - run-3: `262.7ms` (`marker_reveal_state`)
- Aggregate:
  - `stallP95=317.9ms`
  - `stallMaxMean=297.43ms`
  - catastrophic: `runCount=2`, `windowCount=3`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=12 sectioned=12`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12`
- Decision:
  - `REVERT` (worst-stall improved, but first-stall regressed severely and parity worsened vs refreshed control).

### E3 candidate E: hold marker reveal only under run-one pressure (reverted)

- Candidate tag:
  - `e3-map-hold-pressure-only-pass1`
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- Per-run first `>50ms` stall `{duration, stage, elapsedMs}`:
  - run-1: `{312.0, marker_reveal_state, 660.5}`
  - run-2: `{134.2, results_list_ramp, 267.4}`
  - run-3: `{100.4, marker_reveal_state, 583.2}`
- Per-run worst stall:
  - run-1: `400.1ms` (`results_hydration_commit`)
  - run-2: `459.9ms` (`results_hydration_commit`)
  - run-3: `451.5ms` (`results_hydration_commit`)
- Aggregate:
  - `stallP95=455.28ms`
  - `stallMaxMean=437.17ms`
  - catastrophic: `runCount=3`, `windowCount=4`
- Parity:
  - run-1: `pins=30 dots=80 visible=40 sectioned=40`
  - run-2: `pins=30 dots=80 visible=40 sectioned=40`
  - run-3: `pins=30 dots=80 visible=12 sectioned=12`
- Decision:
  - `REVERT` (first-stall and worst-stall both regressed; catastrophic windows increased).

## 2026-02-16 E1 Attribution + Determinism Gate (V3)

Harness signature (all sets):
`enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`

### e1-attribution-control-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T210821Z-4526.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T210821Z-4526.report.json`
- First >50ms stalls:
  - run1 `{duration: 180, stage: pre_response_activation, elapsedMs: 180}`
  - run2 `{duration: 172.5, stage: marker_reveal_state, elapsedMs: 468.2}`
  - run3 `{duration: 77.1, stage: results_hydration_commit, elapsedMs: 76.7}`
- Worst stalls:
  - run1 `{duration: 433.8, stage: results_hydration_commit, elapsedMs: 2233.8}`
  - run2 `{duration: 465.8, stage: results_hydration_commit, elapsedMs: 2082.4}`
  - run3 `{duration: 309, stage: results_hydration_commit, elapsedMs: 2232.7}`
- Aggregate: `stallP95=396.375`, `stallMaxMean=402.867`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `visible/sectioned=40/40, pins=30, dots=80`
  - run2 `visible/sectioned=40/40, pins=30, dots=80 (timeout)`
  - run3 `visible/sectioned=12/12, pins=30, dots=80 (timeout)`
- Decision: `REVERT` strict settle gating behavior (timeouts + parity collapse); `KEEP` attribution wiring itself (ownership populated).

### e1-attribution-control-pass2

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211238Z-02e3.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211238Z-02e3.report.json`
- First >50ms stalls:
  - run1 `{duration: 145.3, stage: pre_response_activation, elapsedMs: 369.2}`
  - run2 `{duration: 128.8, stage: marker_reveal_state, elapsedMs: 549.9}`
  - run3 `{duration: 62.3, stage: results_hydration_commit, elapsedMs: 62.1}`
- Worst stalls:
  - run1 `{duration: 482.8, stage: marker_reveal_state, elapsedMs: 902.8}`
  - run2 `{duration: 467.7, stage: results_hydration_commit, elapsedMs: 1934.3}`
  - run3 `{duration: 308.6, stage: marker_reveal_state, elapsedMs: 1725}`
- Aggregate: `stallP95=475.25`, `stallMaxMean=419.7`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12` (pins/dots stayed `30/80`)
- Decision: `KEEP (measurement only)` as baseline evidence; no code promotion decision from this run alone.

### e1-attribution-control-pass3

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211512Z-5164.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211512Z-5164.report.json`
- First >50ms stalls:
  - run1 `{duration: 162.5, stage: pre_response_activation, elapsedMs: 362.1}`
  - run2 `{duration: 60.8, stage: results_list_ramp, elapsedMs: 139.5}`
  - run3 `{duration: 55.1, stage: results_hydration_commit, elapsedMs: 54.9}`
- Worst stalls:
  - run1 `{duration: 432.5, stage: marker_reveal_state, elapsedMs: 2099.1}`
  - run2 `{duration: 450.1, stage: results_hydration_commit, elapsedMs: 1900}`
  - run3 `{duration: 309.5, stage: marker_reveal_state, elapsedMs: 1725.9}`
- Aggregate: `stallP95=441.3`, `stallMaxMean=397.367`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12` (pins/dots `30/80`)
- Decision: `KEEP (measurement only)`; confirms persistent run3 parity instability.

### e1-attribution-control-pass4

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211731Z-3923.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211731Z-3923.report.json`
- Candidate: parity-floor settle experiment in harness observer.
- First >50ms stalls:
  - run1 `{duration: 354.8, stage: marker_reveal_state, elapsedMs: 725.9}`
  - run2 `{duration: 55.1, stage: results_list_ramp, elapsedMs: 55.1}`
  - run3 `{duration: 61.2, stage: results_hydration_commit, elapsedMs: 83}`
- Worst stalls:
  - run1 `{duration: 484.5, stage: results_hydration_commit, elapsedMs: 2117.8}`
  - run2 `{duration: 458.2, stage: results_hydration_commit, elapsedMs: 1908.3}`
  - run3 `{duration: 473.3, stage: results_hydration_commit, elapsedMs: 1889.7}`
- Aggregate: `stallP95=468.77`, `stallMaxMean=472`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12 timeout` (pins/dots `30/80`)
- Decision: `REVERT` parity-floor settle experiment (regression + timeout).

### e1-attribution-control-pass5

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211948Z-0b43.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T211948Z-0b43.report.json`
- First >50ms stalls:
  - run1 `{duration: 166, stage: pre_response_activation, elapsedMs: 383.3}`
  - run2 `{duration: 63, stage: results_list_ramp, elapsedMs: 62.9}`
  - run3 `{duration: 51.1, stage: results_hydration_commit, elapsedMs: 50.9}`
- Worst stalls:
  - run1 `{duration: 486.2, stage: results_hydration_commit, elapsedMs: 2135.9}`
  - run2 `{duration: 456.7, stage: results_hydration_commit, elapsedMs: 1906.5}`
  - run3 `{duration: 384.2, stage: marker_reveal_state, elapsedMs: 1800.5}`
- Aggregate: `stallP95=469.975`, `stallMaxMean=442.367`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `40/40` (pins/dots `30/80`)
- Decision: `KEEP (measurement only)`; single-set parity looked good but stalls remained catastrophic.

### e1-attribution-control-pass6

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212112Z-509e.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212112Z-509e.report.json`
- First >50ms stalls:
  - run1 `{duration: 439.2, stage: marker_reveal_state, elapsedMs: 814.2}`
  - run2 `{duration: 58.3, stage: results_list_ramp, elapsedMs: 99.8}`
  - run3 `{duration: 61.3, stage: results_hydration_commit, elapsedMs: 61}`
- Worst stalls:
  - run1 `{duration: 439.3, stage: results_hydration_commit, elapsedMs: 2072.7}`
  - run2 `{duration: 470.7, stage: results_hydration_commit, elapsedMs: 1920.6}`
  - run3 `{duration: 463.4, stage: results_hydration_commit, elapsedMs: 1879.6}`
- Aggregate: `stallP95=467.05`, `stallMaxMean=457.8`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12` (pins/dots `30/80`)
- Decision: `KEEP (measurement only)`; confirms baseline instability not resolved.

### e1-phaseb-reset-race-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212456Z-0788.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212456Z-0788.report.json`
- Candidate: defer run-one handoff reset until deferred phase-B full apply.
- First >50ms stalls:
  - run1 `{duration: 422.8, stage: marker_reveal_state, elapsedMs: 791.3}`
  - run2 `{duration: 68.3, stage: results_list_ramp, elapsedMs: 99.9}`
  - run3 `{duration: 65.4, stage: results_list_ramp, elapsedMs: 333.3}`
- Worst stalls:
  - run1 `{duration: 459.6, stage: results_hydration_commit, elapsedMs: 2093.4}`
  - run2 `{duration: 68.3, stage: results_list_ramp, elapsedMs: 99.9}`
  - run3 `{duration: 65.4, stage: results_list_ramp, elapsedMs: 333.3}`
- Aggregate: `stallP95=450.4`, `stallMaxMean=197.767`, `catastrophicRuns=1`, `catastrophicWindows=2`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `40/40` (pins/dots `30/80`)
- Decision: `PROVISIONAL KEEP` pending repeatability (promising but phase-order warning observed in log).

### e1-phaseb-reset-race-pass2

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212819Z-6cf2.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T212819Z-6cf2.report.json`
- First >50ms stalls:
  - run1 `{duration: 2581, stage: pre_response_activation, elapsedMs: 2580.8}`
  - run2 `{duration: 50.1, stage: results_list_ramp, elapsedMs: 233.3}`
  - run3 `{duration: none, stage: none, elapsedMs: none}`
- Worst stalls:
  - run1 `{duration: 2756.5, stage: results_list_ramp, elapsedMs: 16957.9}`
  - run2 `{duration: 50.1, stage: results_list_ramp, elapsedMs: 233.3}`
  - run3 `{duration: none, stage: none, elapsedMs: none}`
- Aggregate: `stallP95=2750.76`, `stallMaxMean=1403.3`, `catastrophicRuns=1`, `catastrophicWindows=3`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `40/40` (pins/dots `30/80`)
- Decision: `REJECT PENDING FIX` due extreme instability/catastrophic regression despite parity hold.

### e1-phaseb-reset-race-pass3

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T213115Z-6dca.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T213115Z-6dca.report.json`
- Candidate variant: added phase-B/pagination dependency gate before reset scheduling.
- First >50ms stalls:
  - run1 `{duration: 2624.6, stage: pre_response_activation, elapsedMs: 2624.3}`
  - run2 `{duration: 128.9, stage: results_list_ramp, elapsedMs: 262.2}`
  - run3 `{duration: 54.2, stage: marker_reveal_state, elapsedMs: 5549.5}`
- Worst stalls:
  - run1 `{duration: 2757.4, stage: results_list_ramp, elapsedMs: 16957.7}`
  - run2 `{duration: 2755.1, stage: results_hydration_commit, elapsedMs: 9931.1}`
  - run3 `{duration: 296.6, stage: results_hydration_commit, elapsedMs: 7146.4}`
- Aggregate: `stallP95=2756.135`, `stallMaxMean=1936.367`, `catastrophicRuns=2`, `catastrophicWindows=5`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12` (pins/dots `30/80`)
- Decision: `REVERT` candidate completely (fails stall gate + parity gate).

### E1 Gate Outcome

- `KEEP`: attribution capture plumbing in `Search/index.tsx` and observer settle guard update in `shortcut-harness-observer.ts` (ownership attribution populated; no `owner:null` in dominant first/worst windows).
- `REVERT`: all `phaseb-reset-race` changes in `use-search-submit.ts`.
- Status: control remains non-deterministic (`run3 12/12` recurs), so E1 is attribution-complete but determinism still blocked.

### e1-phaseb-settle-after-apply-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T213802Z-36c0.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T213802Z-36c0.report.json`
- Candidate: settle deferred runtime shadow only after `phase_b_full_apply` executes.
- First >50ms stalls:
  - run1 `{duration: 320.6, stage: marker_reveal_state, elapsedMs: 704.8}`
  - run2 `{duration: 127.9, stage: marker_reveal_state, elapsedMs: 416.5}`
  - run3 `{duration: 81.1, stage: results_hydration_commit, elapsedMs: 80.9}`
- Worst stalls:
  - run1 `{duration: 436.6, stage: marker_reveal_state, elapsedMs: 2095}`
  - run2 `{duration: 458.8, stage: results_hydration_commit, elapsedMs: 1925.3}`
  - run3 `{duration: 494.9, stage: results_hydration_commit, elapsedMs: 2061.4}`
- Aggregate: `stallP95=457.69`, `stallMaxMean=463.433`, `catastrophicRuns=3`, `catastrophicWindows=4`
- Parity:
  - run1 `40/40`, run2 `40/40`, run3 `12/12 timeout` (pins/dots `30/80`)
- Additional trace notes:
  - run1/run2 emitted `phase_b_full_apply` before run complete.
  - run3 never emitted `phase_b_full_apply`; settled by timeout at `45s` with `shadowPhase=phase_b_materializing`.
- Decision: `REVERT` candidate (determinism regression + timeout).

### E2 Minimal Subset Note (no harness run)

- Slice: strengthen shared runtime bus foundation before E3 isolation.
- Code changes:
  - `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts`
    - Added `activeTab` to shared bus state.
    - Added batched notification support (`batchDepth`, deferred notify, `batch()` API).
  - `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus-context.ts`
    - Added stable bus context provider/hook for subtree ownership wiring.
  - `apps/mobile/src/screens/Search/index.tsx`
    - Added `activeTab` to bus publish payload.
- Validation:
  - `eslint` PASS on touched files.
  - `no-bypass` PASS.
  - natural/s4 cutover contracts PASS.
- Harness policy: skipped (mechanical/foundation change, no direct stall metric expectation).

### e3-results-sheet-tree-ownership-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T225708Z-2dc2.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T225708Z-2dc2.report.json`
- Candidate: extract results sheet ownership (`useSearchResultsPanelSpec` + overlay sheet resolution/render) out of `Search/index.tsx` into dedicated subtree component.
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- First `>50ms` stall `{duration, stage, elapsedMs}`:
  - run1 `{194.6, pre_response_activation, 194.5}`
  - run2 `{128.6, marker_reveal_state, 466.5}`
  - run3 `{83.5, results_hydration_commit, 133.2}`
- Worst stall `{duration, stage, elapsedMs}`:
  - run1 `{487.5, marker_reveal_state, 1965.9}`
  - run2 `{499.1, results_hydration_commit, 2064.7}`
  - run3 `{305.0, marker_reveal_state, 1871.5}`
- Aggregate:
  - `stallP95=491.56`
  - `stallMaxMean=430.533`
  - catastrophic: `runCount=3`, `windowCount=4`
- Parity:
  - run1 `pins=30 dots=80 visible=40 sectioned=40`
  - run2 `pins=30 dots=80 visible=40 sectioned=40`
  - run3 `pins=30 dots=80 visible=12 sectioned=12`
- Decision:
  - `REVERT` (stallP95 regressed vs control band, catastrophic overlap unchanged, and run3 parity collapse persisted; no required dependency unlock justified keeping it).
- Revert note:
  - Restored `Search/index.tsx`; deleted temporary `SearchResultsSheetTree.tsx`.

### e3-control-post-revert-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T225947Z-7762.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T225947Z-7762.report.json`
- Purpose: control validation after reverting `e3-results-sheet-tree-ownership-pass1`.
- Harness signature:
  - `enabled:1|scenario:search_shortcut_loop|runs:3|start:3000|cooldown:1800|label:Best restaurants|tab:restaurants|score:coverage_display|preserve:0|dock:1|settleBoundary:shadow_converged_or_quiet_snapshot|sampler:1|window:500|stall:50|fps:58|uiSampler:1|uiWindow:500|uiStall:50|uiFps:58`
- First `>50ms` stall `{duration, stage, elapsedMs}`:
  - run1 `{86.5, submit_intent, 100.1}`
  - run2 `{none, none, none}`
  - run3 `{none, none, none}`
- Worst stall `{duration, stage, elapsedMs}`:
  - run1 `{151.0, submit_intent, 616.6}`
  - run2 `{0.0, submit_intent, 42950.1}`
  - run3 `{0.0, submit_intent, 43500.6}`
- Aggregate:
  - `stallP95=59.82`
  - `stallMaxMean=50.333`
  - catastrophic: `runCount=0`, `windowCount=0`
- Parity:
  - run1 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
  - run2 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
  - run3 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
- Decision:
  - `INVALID` (run-set not admissible for gating due `TypeError: runBestHereRef.current is not a function` and all runs timing out).

### e3-control-post-runbesthere-fix-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T230505Z-19f7.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T230505Z-19f7.report.json`
- Purpose: validate `runBestHere` return-contract fix.
- First `>50ms` stall `{duration, stage, elapsedMs}`:
  - run1 `{50.7, submit_intent, 483.2}`
  - run2 `{none, none, none}`
  - run3 `{none, none, none}`
- Worst stall `{duration, stage, elapsedMs}`:
  - run1 `{50.7, submit_intent, 483.2}`
  - run2 `{0.0, submit_intent, 500.0}`
  - run3 `{none, none, none}`
- Aggregate:
  - `stallP95=20.28`
  - `stallMaxMean=25.35`
  - catastrophic: `runCount=0`, `windowCount=0`
- Parity:
  - run1 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
  - run2 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
  - run3 `pins=0 dots=0 visible=0 sectioned=0` (timeout)
- Decision:
  - `INVALID` (new run errors: `Cannot read property 'dispatch' of undefined` / `Cannot read property 'current' of undefined`; all runs timed out, no parity signal).

### e3-control-post-runtimedeps-fix-pass1

- Log/report: `/tmp/perf-shortcut-loop-shortcut-loop-20260216T230928Z-79d8.log`, `/tmp/perf-shortcut-loop-shortcut-loop-20260216T230928Z-79d8.report.json`
- Purpose: control after wiring runtime dependencies into submit call.
- First `>50ms` stall `{duration, stage, elapsedMs}`:
  - run1 `{262.0, submit_intent, 449.6}`
  - run2 `{53.9, submit_intent, 54.0}`
  - run3 `{59.1, submit_intent, 125.8}`
- Worst stall `{duration, stage, elapsedMs}`:
  - run1 `{374.3, results_list_ramp, 1786.7}`
  - run2 `{739.4, results_list_ramp, 1520.1}`
  - run3 `{678.7, results_list_ramp, 1450.0}`
- Aggregate:
  - `stallP95=715.12`
  - `stallMaxMean=597.467`
  - catastrophic: `runCount=3`, `windowCount=4`
- Parity:
  - run1 `pins=6 dots=0 visible=12 sectioned=12`
  - run2 `pins=30 dots=213 visible=40 sectioned=40`
  - run3 `pins=30 dots=213 visible=40 sectioned=40`
- Decision:
  - `REVERT` (attribution remained `owner:null`, catastrophic stalls worsened, and parity contract regressed `dots=213` / run1 `12/12`).
