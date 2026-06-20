# Toggle Strip Regression + Rising→Sort Modal (EXECUTION SPEC)

> Two coupled pieces of work on the search filter toggle strip. Investigated 2026-06-19; this is the
> grounded fix spec so it can be implemented cleanly without regressing a perf-critical surface.

## Part 1 — The loading-cover regression (the bug)

**Symptoms (user):** when toggling, the loading cover covers the toggle strip so you can't toggle
more than once; sometimes the toggle strip disappears completely. It used to let you rapid-tap any
toggle and the loading state waited until the taps settled.

**Root cause (verified):**

- The rapid-tap **settle** logic is INTACT — `scheduleToggleCommit` → seq-tracked
  `interactionSeqRef` → `finalizeInteraction(awaitVisualSync)`
  ([use-results-presentation-toggle-state-runtime.ts](apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-toggle-state-runtime.ts),
  [use-results-presentation-toggle-commit-runtime.ts](apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-toggle-commit-runtime.ts)).
  This is NOT the bug.
- The bug is the **loading-surface state machine** (introduced in `9fa642d7` "Finalize runtime and
  demand cutovers", May 19; surfaced — not caused — by `acc01f3d` Rising, Jun 19):
  - The loading cover (`resultsLoadingCoverSurface`, rendered in
    [use-search-root-search-scene-panel-surface-overlay-runtime.tsx](apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-panel-surface-overlay-runtime.tsx))
    is `pointerEvents="none"` (so it never _blocks_ touches) but renders at
    `top: headerTopValue (= resolvedResultsHeaderHeightForRender)`, full height. When the header
    height is unmeasured/stale it rides to `top: 0` and visually buries the strip.
  - The toggle strip is the **list header**, render-gated:
    `resultsToggleStripForRenderBase = (shouldShowInteractionLoadingState || shouldShowResultsSurface) ? listHeader : null`
    ([use-search-root-search-scene-surface-render-header-source-runtime.tsx:30-37](apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-surface-render-header-source-runtime.tsx)).
    In modes where neither is true, the strip is **null → "disappears completely."**
  - The codebase already KNOWS: telemetry `stableHeaderChromeCoveredByLoadingCover` fires when
    `surfaceMode === 'initial_loading' && resultsToggleStripForRenderLive != null`.

**The fix (clean, non-regressing):** make the toggle strip a **persistent chrome layer** — always
mounted, above the loading cover — instead of a render-gated list header. Concretely:

1. Render the toggle strip in a stable chrome lane that is **never** nulled by surface mode and sits
   at a z-order **above** `resultsLoadingCoverSurface`.
2. Keep a **cached/stable** filters-header height so the cover's `top` never collapses to 0 (v2 plan
   Phase 4 intent — "use cached header heights when live measurements are unavailable; delay the
   background until valid header heights exist").
3. Verify against `surface-panel-state-runtime` mode transitions during a toggle (interaction_loading)
   so the strip stays live + tappable while results reload.

- Validate with a maestro flow: results up → rapid-tap a toggle 3× → assert the strip stays
  visible/tappable and only one settled search fires.

## Part 2 — Rising → Sort modal (the restructure)

**Decisions (confirmed 2026-06-19):**

- Replace the standalone "Rising" pill with a **Sort** control, moved to the **far left** of the
  dish/restaurant segment toggle.
- It opens a **modal** (the old global/local "Rank" pattern — recovered below — via `OverlayModalSheet`,
  same family as the live Price + Score sheets).
- Two options: **Best** (default, ranked by Crave Score) · **Rising** (7-day momentum).
- Button label: reads **"Sort"** when default (Best); reads **"Rising"** when Rising is selected.
  Accent ON only when non-default (Rising) — same convention as the other toggles. Chevron like Price.

**Recovered template (old global/local rank modal, pre-`3f9035de`):**
`SearchRankAndScoreSheets.tsx` had `RankMode = 'coverage_display' | 'global_quality'`
(Local/Global) in an `OverlayModalSheet`: a "Rank" header + `RANK_MODE_OPTIONS.map` selectable rows
with a selected checkmark; props `isRankSelectorVisible`/`closeRankSelector`/`pendingScoreMode`/
`setPendingScoreMode`/`handleRankDone`. Mirror this shape for Sort (it's simpler — 2 mutually-exclusive
options → sets `risingActive`). Use the **score-sheet's lighter visibility wiring**
([SearchRankAndScoreSheets.tsx](apps/mobile/src/screens/Search/components/SearchRankAndScoreSheets.tsx)),
NOT the heavy price-modal bus chain (price needs multi-value state; sort doesn't).

**Files:**

- New `SearchSortSheet.tsx` (OverlayModalSheet, "Sort" title, Best/Rising rows + checkmark).
- `SearchFilters.tsx`: add the Sort button far-left (before the `GestureDetector` segment); remove the
  Rising pill (current lines ~672-690); thread `sortLabel`/`sortActive`/`onToggleSortSelector`/
  `isSortSelectorVisible`.
- Parent that renders `SearchFilters` + the score sheet: add `isSortSelectorVisible` state + render
  `SearchSortSheet`; on select → commit via the existing `toggleRising`/`scheduleToggleCommit`
  (sets `risingActive`), so it inherits the settle-safe behavior.

## Sequence

1. Part 1 (loading-cover fix) — restore best-in-class rapid-toggle. (The active bug.)
2. Part 2 (Sort modal restructure).
   Both behind a maestro toggle-rapid-tap flow as the regression guard.
