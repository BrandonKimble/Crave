# Search Commit Overlap Refactor — Multi-Phase Plan

## Problem Statement

JS stalls of 130–410ms during search flows, with floor FPS dropping to 2–5. The root cause is **overlapping React commit windows** across three profiler-tracked component trees (SearchScreen, SearchMapTree, SearchResultsSheetTree) — not algorithmic compute (total runtime attribution is <3.3ms across all runs).

### Baseline Metrics (2026-02-19)

| Metric           | Current | Target |
| ---------------- | ------- | ------ |
| stallP95         | 337ms   | <80ms  |
| stallMaxMean     | 244ms   | <80ms  |
| floorMean        | 5.1 fps | >25fps |
| Run 1 worstStall | 407ms   | <100ms |

### Root Cause Decomposition

Every stall window shows the same signature — **all three trees commit in the same frame window**:

```
Run 1 worst window (407ms stall, results_hydration_commit):
  SearchScreen:         280ms overlap, 10 spans, max 65ms
  SearchMapTree:        209ms overlap,  6 spans, max 65ms
  SearchOverlayChrome:  171ms overlap,  5 spans, max 63ms
```

**Why this happens:**

1. `SearchScreen` (5,558 lines) is a monolithic orchestrator with ~20+ `useState` calls and ~15 `useSearchRuntimeBusSelector` subscriptions.
2. When `SearchRuntimeBus.publish()` fires, all `useSyncExternalStore` subscribers re-evaluate synchronously.
3. React batches the resulting state changes across all three trees into **one commit**.
4. The `FrameBudgetGovernor` and `RuntimeWorkScheduler` schedule user-space tasks but **cannot prevent React's commit batching**.
5. Freeze gates on SearchMapWithMarkerEngine and SearchResultsSheetTree are effective, but SearchScreen itself always participates in every commit because it subscribes to nearly everything.

### Why Incremental Scheduling Can't Fix This

The phase system (RunOneHandoffCoordinator, PhaseBMaterializer) correctly serializes _user-space work_ — hydration ramp, marker reveal, chrome resume. But the stall isn't from user-space compute. It's from React reconciliation + commit of a 5,500-line component that re-renders on every bus change, dragging its children along even when those children are frozen.

---

## Architecture Target

**Before (current):**

```
SearchScreen (subscribes to everything, re-renders on every bus change)
  ├── SearchMapTree (frozen sometimes, but parent re-renders force reconciliation)
  ├── SearchOverlayChrome (no freeze gate)
  ├── SearchResultsSheetTree (frozen sometimes, but parent re-renders)
  └── BottomNav (frozen sometimes)
```

**After (target):**

```
SearchScreenShell (minimal: layout + camera hydration + route params only)
  ├── SearchMapDomain        (subscribes only to map-relevant bus slices)
  ├── SearchChromeDomain     (subscribes only to chrome bus slices)
  ├── SearchResultsDomain    (subscribes only to results bus slices)
  ├── SearchSuggestionDomain (subscribes only to suggestion state)
  └── SearchNavDomain        (subscribes only to nav state)
```

Each domain is a **commit boundary** — when the bus publishes a results change, only SearchResultsDomain re-renders. SearchMapDomain and SearchChromeDomain don't participate in that commit at all.

---

## Phase 0: Measurement Infrastructure (1 day)

Before cutting, establish per-component commit attribution so we can measure each phase's impact.

### Slice 0A: Profiler commit span decomposition

The harness already tracks `firstOver50ByRun` and `worstWindowByRun` with per-component overlap. Add:

1. **Per-component commit-span histogram** — for each profiler ID, track commit span count and total ms per stage (`pre_response_activation`, `results_hydration_commit`, `results_list_ramp`).
2. **Isolated-commit ratio** — percentage of commits where only ONE profiler tree is active (target: >80% by end of refactor).

### Slice 0B: Selector audit

Audit every `useSearchRuntimeBusSelector` call in `index.tsx`. For each one, tag:

- Which domain it belongs to (map / results / chrome / nav / suggestion / lifecycle)
- Whether it causes a `setState` in SearchScreen
- Whether it's passed as a prop to a child tree

Deliverable: a table mapping every selector to its domain, which will drive the decomposition.

---

## Phase 1: Extract Chrome Domain (2–3 days)

**Goal:** Remove SearchOverlayChrome from SearchScreen's commit path.

SearchOverlayChrome currently appears with 171ms overlap in the worst window. It renders the search bar, shortcut chips, and "search this area" button. It receives ~15 props from SearchScreen, most of which are derived from bus state or animation values.

### Slice 1A: Create SearchChromeDomain component

Extract from SearchScreen:

- `SearchOverlayHeaderChrome` render + all its props
- `SearchSuggestionSurface` render + all its props
- The frozen suggestion/chrome prop refs (`frozenSuggestionSurfacePropsRef`, `frozenOverlayHeaderChromePropsRef`)
- Related state: `query`, `isSearchFocused`, `isSuggestionPanelActive`, `suggestions`, `searchTransitionVariant`
- Related hooks: `useAutocompleteController`, `useSuggestionDisplayModel`, `useSuggestionInteractionController`, `useSuggestionLayoutWarmth`, `useSuggestionHistoryBuffer`, `useSuggestionTransitionHold`, `useSearchFocusController`

SearchChromeDomain reads directly from the bus for:

- `isSearchSessionActive`, `searchMode`, `submittedQuery` (currently proxied through SearchScreen)
- `isRunOnePreflightFreezeActive`, `isResponseFrameFreezeActive` (freeze gate inputs)

### Slice 1B: Move search bar callbacks to ref-stable pattern

Currently SearchScreen creates callbacks like `handleQueryChange`, `handleSubmit`, `handleClear` that close over SearchScreen state. These need to become ref-stable or move into SearchChromeDomain.

For callbacks that need to trigger results (like `handleSubmit`), use the bus:

- `handleSubmit` → publishes a submit intent to the bus → `useSearchSubmit` (which can live at shell level) picks it up
- `handleClear` → publishes clear intent → `useSearchClearController` picks it up

### Slice 1C: Validate chrome isolation

Run harness. Verify:

- SearchOverlayChrome no longer appears in `worstWindowByRun` top components when the stall stage is `results_hydration_commit` or `results_list_ramp`
- Chrome transitions (suggestion panel open/close, shortcut chip visibility) still work correctly
- No UX regression on search bar focus, typing, submit, clear, back

**Expected impact:** Remove ~170ms overlap from worst-case stall windows where chrome was participating.

---

## Phase 2: Isolate Results Domain (2–3 days)

**Goal:** Remove SearchScreen from the SearchResultsSheetTree commit path.

SearchResultsSheetTree is already a separate component with freeze gates, but it receives `searchPanelSpecArgs` and `searchOverlayPanelsArgs` from SearchScreen — both are large `useMemo` objects (lines 4896–4992 and 5151–5199) with ~40 combined dependencies. When ANY dependency changes, the memo invalidates, the prop changes, and SearchResultsSheetTree re-renders.

### Slice 2A: Move results read model to bus-direct

Currently the data flow is:

```
Bus → SearchScreen (reads results, hydrationKey, etc.) → passes to searchPanelSpecArgs → SearchResultsSheetTree → useSearchResultsPanelSpec → useSearchResultsReadModelSelectors
```

Change to:

```
Bus → SearchResultsDomain (reads results directly from bus) → useSearchResultsReadModelSelectors
```

This means `useSearchResultsReadModelSelectors` subscribes to the bus directly for:

- `results`, `resultsHydrationKey`, `hydratedResultsKey`, `shouldHydrateResultsForRender`
- `runOneCommitSpanPressureActive`, `allowHydrationFinalizeCommit`
- `activeTab`, `isLoadingMore`, `canLoadMore`
- `isFilterTogglePending`

### Slice 2B: Move overlay panel orchestration to bus-direct

The `searchOverlayPanelsArgs` memo depends on overlay state that should be managed by the results domain directly:

- Poll/bookmark/profile panel visibility and snap state
- Restaurant overlay state
- Save sheet state

Create `useSearchOverlayOrchestration` that reads overlay state from Zustand stores directly rather than receiving it from SearchScreen.

### Slice 2C: Eliminate SearchScreen as results prop intermediary

After 2A and 2B, SearchScreen should not need to pass any results-related props to SearchResultsSheetTree. The only remaining props should be:

- `sheetTranslateY` (shared animation value — can be provided via context)
- `resultsScrollOffset` / `resultsMomentum` (shared animation values)
- `onProfilerRender` (static callback)

Move shared animation values to a `SearchAnimationContext` provided by the shell.

### Slice 2D: Validate results isolation

Run harness. Verify:

- SearchScreen no longer appears in `worstWindowByRun` when the stall stage is `results_hydration_commit` or `results_list_ramp`
- Results list rendering, hydration ramp, pagination, tab switching all work
- Sheet snap transitions, drag, scroll all work
- Restaurant profile open from results card works

**Expected impact:** Remove SearchScreen's 160–280ms overlap from results-stage stall windows.

---

## Phase 3: Isolate Map Domain (1–2 days)

**Goal:** Make SearchMapTree commits independent of SearchScreen state changes.

SearchMapWithMarkerEngine already reads from the bus directly for `mapHighlightedRestaurantId` and publishes marker counts. But it receives ~40 props from SearchScreen, many of which change on every search.

### Slice 3A: Move map-lifecycle state out of SearchScreen

Currently SearchScreen manages:

- `mapCenter`, `mapZoom`, `mapCameraPadding`, `isInitialCameraReady`, `isInitialCameraHydrated`, `isMapStyleReady`, `isFollowingUser`
- Camera persistence (AsyncStorage read/write)
- `suppressMapMoved`, `mapMovedSinceSearch`
- Map bounds tracking (`viewportBoundsService`, `latestBoundsRef`)

Extract to `SearchMapDomain` which:

- Owns camera hydration (currently lines 503–600)
- Owns camera persistence
- Owns map-moved detection
- Reads freeze gate state from bus instead of props
- Provides `commitCameraViewport` to other domains via ref/context

### Slice 3B: Move map event handlers to map domain

Move from SearchScreen to SearchMapDomain:

- `handleMapPress`, `handleCameraChanged`, `handleMapIdle`, `handleMapLoaded`
- `handleMapVisualReady`, `handleMarkerRevealSettled`
- `handleMapTouchStart`, `handleMapTouchEnd`
- `useStableMapHandlers`

These currently reference SearchScreen state (bounds, profile transition, results). Replace with bus reads for the state they need.

### Slice 3C: Validate map isolation

Run harness. Verify:

- SearchMapTree no longer appears in `worstWindowByRun` when the stall stage is `results_hydration_commit` or `results_list_ramp`
- Map camera, pins, dots, labels all render correctly
- Pin tap → profile open works
- "Search this area" works
- Map gesture handling (pan, zoom) works

**Expected impact:** Remove SearchMapTree's 45–209ms overlap from non-map stall windows.

---

## Phase 4: Reduce SearchScreen to Shell (1–2 days)

After phases 1–3, SearchScreen should be dramatically smaller. This phase removes remaining cross-domain state.

### Slice 4A: Extract profile orchestration

Move restaurant profile state and lifecycle to a dedicated `SearchProfileDomain`:

- `restaurantProfile`, `isRestaurantOverlayVisible`, `profileTransitionStatus`
- `useProfileRuntimeController`, `useProfileAutoOpenController`, `useProfileCameraOrchestration`
- Profile transition state machine

### Slice 4B: Extract nav domain

Move bottom nav state to `SearchNavDomain`:

- `activeTab` selector and handlers
- Overlay switching (polls/bookmarks/profile tabs)
- Bottom nav freeze props

### Slice 4C: Audit remaining SearchScreen state

After all extractions, SearchScreen should contain only:

- Runtime composition initialization (`useSearchRuntimeComposition`)
- Route params
- Domain component rendering
- Profiler wrappers

Target: SearchScreen < 500 lines, 0 `useSearchRuntimeBusSelector` calls, 0 domain-specific `useState` calls.

### Slice 4D: Final validation

Run harness. Verify:

- SearchScreen no longer appears as primary component in ANY stall window
- All existing UX flows work: search, clear, shortcuts, tab switch, profile, polls, bookmarks, price/rank filters, save, suggestions
- stallP95 target <80ms
- floorMean target >25fps

---

## Phase 5: Bus Notification Timing (1 day, if needed)

If phases 1–4 don't reach targets because React still batches across sibling domains, add notification timing to the bus.

### Slice 5A: Domain-scoped notification channels

Instead of one `listeners` set that notifies all subscribers on any change, add domain-scoped channels:

```typescript
class SearchRuntimeBus {
  private channels = new Map<string, Set<() => void>>();

  subscribeToDomain(domain: 'results' | 'map' | 'chrome' | 'nav', listener: () => void) { ... }

  publish(patch: Partial<SearchRuntimeBusState>) {
    // Determine which domains are affected by the patch keys
    // Only notify affected domain channels
  }
}
```

This prevents React from batching unrelated domain re-renders because they're triggered in separate microtasks.

### Slice 5B: Phase-gated notification delivery

For the `results_hydration_commit` and `results_list_ramp` stages, defer non-results domain notifications to the next `requestAnimationFrame`. This ensures the results domain commits alone, then map/chrome commit in the next frame.

---

## Phase 6: Cleanup & Dead Code Removal (1 day)

### Slice 6A: Remove legacy freeze gates

After domain isolation, the freeze gates in SearchMapWithMarkerEngine and SearchResultsSheetTree become unnecessary (they won't receive changing props during other domains' commits). Remove:

- `shouldFreezeMapTreePropsBase` and frozen ref pattern in SearchMapWithMarkerEngine
- `shouldFreezeOverlaySheetProps` and frozen ref pattern in SearchResultsSheetTree
- `frozenSuggestionSurfacePropsRef`, `frozenBottomNavPropsRef`, `frozenOverlayHeaderChromePropsRef` in SearchScreen

### Slice 6B: Remove orphaned state variables

Clean up any state variables, refs, and callbacks that were only needed to pass state through SearchScreen to children.

### Slice 6C: Final harness run + baseline promotion

Record new baseline. Document final metrics vs. original baseline.

---

## Execution Order & Dependencies

```
Phase 0 (measurement) ──┐
                         ├── Phase 1 (chrome)  ──┐
                         ├── Phase 2 (results) ──┤── Phase 4 (shell) ── Phase 5 (bus timing, if needed) ── Phase 6 (cleanup)
                         └── Phase 3 (map)     ──┘
```

Phases 1, 2, 3 can be done in any order but not in parallel (each changes SearchScreen significantly). Phase 4 depends on all three. Phase 5 is contingent.

## Risk Assessment

| Risk                                                   | Mitigation                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Domain extraction breaks callback chains               | Use bus publish/subscribe for cross-domain communication instead of callback props |
| Shared animation values need a parent                  | Provide via React context from shell, not props                                    |
| Profile open from results card needs map camera        | Profile domain reads map state from bus/ref, doesn't need SearchScreen             |
| Suggestion panel dismiss needs to trigger search focus | Chrome domain handles this internally                                              |
| Large PR size per phase                                | Each phase has 3–4 slices that can be individual PRs                               |
| Regression in poll/bookmark/save overlays              | These are lower-traffic paths; test manually each phase                            |

## Estimated Timeline

| Phase                           | Duration | Cumulative |
| ------------------------------- | -------- | ---------- |
| Phase 0: Measurement            | 1 day    | 1 day      |
| Phase 1: Chrome extraction      | 2–3 days | 3–4 days   |
| Phase 2: Results extraction     | 2–3 days | 5–7 days   |
| Phase 3: Map extraction         | 1–2 days | 6–9 days   |
| Phase 4: Shell reduction        | 1–2 days | 7–11 days  |
| Phase 5: Bus timing (if needed) | 1 day    | 8–12 days  |
| Phase 6: Cleanup                | 1 day    | 9–13 days  |

Total: **9–13 working days** for the full refactor.
