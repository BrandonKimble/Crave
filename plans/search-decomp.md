# SearchScreen Structural Decomposition Plan

## Context

The SearchScreen component (`apps/mobile/src/screens/Search/index.tsx`) is a 6,199-line monolith with **452 hook operations** (63 useState, 121 useRef, 43 useMemo, 78 useCallback, 68 useEffect, 79 custom hooks). Any state change — no matter how small — re-executes all 452 hooks synchronously, costing 150-300ms. On Android (`newArchEnabled=false`), `startTransition` is a no-op, so there is no way to yield mid-render.

Dozens of timing/scheduling experiments over many sessions have failed to get the first JS stall below ~160ms. The ceiling is structural: 452 hooks in one React component is irreducible without splitting the component.

**Target**: Consistently under 50ms for all JS frame stalls during search execution. After the split, each subtree should have <100 hooks, making individual renders fit in a 50ms budget.

---

## Phase 0: Stabilize Memoization

**Goal**: Fix all memo-breaking patterns so `React.memo` actually prevents child re-renders once subtrees exist.

**Risk**: Low. Pure refactors of object identity — no behavior change.

### Changes

**`apps/mobile/src/screens/Search/components/SearchBottomNav.tsx`**

- Line 49: Extract `{ paddingBottom: bottomInset + NAV_BOTTOM_PADDING }` to `useMemo`
- Line 62: Replace inline `() => handleOverlaySelect(item.key)` with a stable pre-built callback map (object keyed by `item.key`, created via `useMemo`)
- Lines 66-69: Extract `{ alignItems: 'center', justifyContent: 'center' }` to a module-level constant

**`apps/mobile/src/screens/Search/components/SearchSuggestionSurface.tsx`**

- Line 113: Extract `{ top: 0 }` to module-level constant
- Lines 143-154: Extract dynamic `contentContainerStyle` inline object to `useMemo` keyed on changing values
- Lines 172-179: Extract `{ left: -X, right: -X }` and `{ top: -Y }` to module-level constants

**`apps/mobile/src/screens/Search/components/SearchStatusBarFade.tsx`**

- Line 19: Extract inline `{ top: ..., height: ... }` to `useMemo`
- Lines 38-39: Extract `start={{ x: 0.5, y: 0 }}` and `end={{ x: 0.5, y: 1 }}` to module-level constants

**`apps/mobile/src/screens/Search/components/SearchOverlayHeaderChrome.tsx`**

- Line 128: Extract `{ top: searchThisAreaTop }` to `useMemo`

**`apps/mobile/src/screens/Search/index.tsx`**

- Line 5999: Extract `edges={['top', 'left', 'right']}` to module-level constant
- Line 5996: Extract conditional `{ zIndex: 200 }` / `{ zIndex: 110 }` to module-level constants, select via ternary on primitive

### Verification

- Run perf harness (`EXPO_PUBLIC_PERF_HARNESS_RUNS=3 bash scripts/perf-shortcut-loop.sh`). Verify no regression.
- Visual QA: pins=30, dots=80, list=40, sectioned=40 unchanged.

---

## Phase 1: Consolidate Zustand Selectors

**Goal**: Replace 29 individual Zustand selector hook calls with 5 combined selectors, cutting ~24 hook slots.

**Risk**: Low. Zustand 5.x supports `useShallow` for stable object references.

### Changes

**Create `apps/mobile/src/screens/Search/hooks/use-search-store-selectors.ts`**

```typescript
import { useShallow } from 'zustand/react/shallow';
import { useSearchStore } from '../../../store/searchStore';
import { useOverlayStore } from '../../../store/overlayStore';
import { useOverlaySheetPositionStore } from '../../../store/overlaySheetPositionStore';
import { useSystemStatusStore } from '../../../store/systemStatusStore';

export const useSearchTabSlice = () =>
  useSearchStore(
    useShallow((s) => ({
      activeTab: s.activeTab,
      preferredActiveTab: s.preferredActiveTab,
      setActiveTab: s.setActiveTab,
      hasActiveTabPreference: s.hasActiveTabPreference,
      setPreferredActiveTab: s.setPreferredActiveTab,
    }))
  );

export const useSearchFiltersSlice = () =>
  useSearchStore(
    useShallow((s) => ({
      openNow: s.openNow,
      setOpenNow: s.setOpenNow,
      priceLevels: s.priceLevels,
      setPriceLevels: s.setPriceLevels,
      votes100Plus: s.votes100Plus,
      setVotes100Plus: s.setVotes100Plus,
      resetFilters: s.resetFilters,
      scoreMode: s.scoreMode,
      setPreferredScoreMode: s.setPreferredScoreMode,
    }))
  );

export const useOverlaySlice = () =>
  useOverlayStore(
    useShallow((s) => ({
      activeOverlay: s.activeOverlay,
      overlayStack: s.overlayStack,
      overlayParams: s.overlayParams,
      registerTransientDismissor: s.registerTransientDismissor,
      dismissTransientOverlays: s.dismissTransientOverlays,
    }))
  );

export const useSheetPositionSlice = () =>
  useOverlaySheetPositionStore(
    useShallow((s) => ({
      hasUserSharedSnap: s.hasUserSharedSnap,
      sharedSnap: s.sharedSnap,
    }))
  );

export const useSystemStatusSlice = () =>
  useSystemStatusStore(
    useShallow((s) => ({
      isOffline: s.isOffline,
      serviceIssue: s.serviceIssue,
    }))
  );
```

**Modify `apps/mobile/src/screens/Search/index.tsx`**

- Replace all 29 individual `useSearchStore(s => s.X)` calls with the 5 combined selectors
- Destructure at call site: `const { activeTab, setActiveTab, ... } = useSearchTabSlice();`

### Verification

- Run perf harness. Verify no regression.
- Verify store subscriptions fire correctly — change a filter, confirm UI updates.

---

## Phase 2: Create SearchSessionBus (Shared State Layer)

**Goal**: Build the ref-based pub/sub that connects independent subtrees without React re-renders. This is the foundation for all subsequent splits.

**Risk**: Medium. Additive — doesn't modify existing code until Phase 3.

### Design

The bus is NOT a React Context (which would re-render all consumers). It's a plain TypeScript class with `useSyncExternalStore` adapters for selective subscription.

### Changes

**Create `apps/mobile/src/screens/Search/session/search-session-bus.ts`**

Core API:

```typescript
class SearchSessionBus {
  // State fields (cross-cutting, read by 3+ subtrees)
  private _results: SearchResponse | null = null;
  private _isLoading = false;
  private _isSearchSessionActive = false;
  private _query = '';
  private _submittedQuery = '';
  private _searchMode: SearchMode = null;

  // Stable refs (already ref-based, centralized here)
  readonly runtimeWorkSchedulerRef: MutableRefObject<RuntimeWorkScheduler>;
  readonly runOneHandoffCoordinatorRef: MutableRefObject<RunOneHandoffCoordinator>;
  readonly mapRef: MutableRefObject<MapboxMapRef | null>;
  readonly latestBoundsRef: MutableRefObject<MapBounds | null>;

  // Imperative actions (set by coordinator, called by subtrees)
  submitSearch: ((query: string, options?: SubmitSearchOptions) => void) | null = null;

  // Pub/sub
  private _version = 0;
  private _listeners = new Set<() => void>();
  private _batchDepth = 0;

  batch(fn: () => void): void {
    this._batchDepth++;
    fn();
    this._batchDepth--;
    if (this._batchDepth === 0) this._notify();
  }
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
  getSnapshot(): number {
    return this._version;
  }

  // Typed getters (for selectors)
  get results() {
    return this._results;
  }
  get isLoading() {
    return this._isLoading;
  }
  // ... etc

  // Typed setters (increment version + notify)
  setResults(v: SearchResponse | null) {
    this._results = v;
    this._bump();
  }
  setIsLoading(v: boolean) {
    this._isLoading = v;
    this._bump();
  }
  // ... etc

  private _bump() {
    this._version++;
    if (this._batchDepth === 0) this._notify();
  }
  private _notify() {
    this._listeners.forEach((l) => l());
  }
}
```

**Create `apps/mobile/src/screens/Search/session/use-session-bus-selector.ts`**

```typescript
import { useSyncExternalStore } from 'react';

export function useSessionBus<T>(
  bus: SearchSessionBus,
  selector: (bus: SearchSessionBus) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const cachedRef = useRef<{ value: T; version: number }>({ value: selector(bus), version: -1 });

  return useSyncExternalStore(bus.subscribe.bind(bus), () => {
    const version = bus.getSnapshot();
    if (version !== cachedRef.current.version) {
      const next = selector(bus);
      if (!isEqual(cachedRef.current.value, next)) {
        cachedRef.current = { value: next, version };
      } else {
        cachedRef.current.version = version;
      }
    }
    return cachedRef.current.value;
  });
}
```

**Create `apps/mobile/src/screens/Search/session/SearchSessionBusContext.ts`**

```typescript
import { createContext, useContext } from 'react';
export const SearchSessionBusContext = createContext<SearchSessionBus>(null!);
export const useSearchSessionBus = () => useContext(SearchSessionBusContext);
```

The Context here holds the bus _instance_ (stable ref, never changes) — not the bus _state_. This Context never triggers re-renders because its value never changes after mount.

### Verification

- Unit test the bus: batch, subscribe, selector equality skipping.
- No integration yet — existing code unchanged.

---

## Phase 3: Extract MapSubtree

**Goal**: Move all map-only state and hooks into `SearchMapSubtree`. Map state changes (camera moves, marker reveals) will no longer re-render results/suggestions/chrome.

**Risk**: High. Most complex extraction due to map interactions with profile, submit bounds, and marker reveal.

### State Moving to MapSubtree

- `mapCenter`, `mapZoom`, `mapCameraPadding`
- `isInitialCameraHydrated`, `isInitialCameraReady`, `isMapStyleReady`
- `isFollowingUser`
- `markerRestaurants`, `setMarkerRestaurants`
- `mapHighlightedRestaurantId`, `setMapHighlightedRestaurantId`
- `markerRevealCommitId`, `setMarkerRevealCommitId`
- `mapMovedSinceSearch`, `setMapMovedSinceSearch`
- All map-related refs (~25 useRef calls)
- All camera hydration effects
- `useStableMapHandlers`, `useShortcutCoverageOwner`
- Marker derivation logic (sortedRestaurantMarkers, dotRestaurantFeatures, etc.)

### Hooks Moving to MapSubtree

- Camera hydration effects (lines 544-714)
- Marker generation logic (lines 3125-3200)
- Map idle / camera changed handlers
- Map gesture tracking
- Marker reveal logic and visual-ready signaling

### Cross-Cutting Reads (from bus)

- `results` — to derive markers
- `isSearchSessionActive`, `searchMode` — to gate marker visibility
- `activeTab` — part of `markersRenderKey` (from Zustand, direct subscription)

### Cross-Cutting Writes (to bus)

- `latestBoundsRef` — updated on camera change, read by submit flow for bounds
- `mapRef` — read by submit flow and profile camera orchestration

### Changes

**Create `apps/mobile/src/screens/Search/subtrees/SearchMapSubtree.tsx`**

- Accept `bus: SearchSessionBus` as only prop (plus forwarded imperative ref)
- Use `useSessionBus(bus, b => b.results)` for results subscription
- Own all map useState/useRef/useEffect
- Render `<SearchMap>` and `<SearchMapLoadingGrid>`
- Expose imperative methods via `useImperativeHandle`: `fitBounds()`, `setCamera()`, `getVisibleBounds()`

**Modify `apps/mobile/src/screens/Search/index.tsx`**

- Remove ~800 lines of map state/hooks/effects/JSX
- Replace with `<SearchMapSubtree bus={bus} ref={mapSubtreeRef} />`
- Wire `mapRef` and `latestBoundsRef` from bus into `useSearchSubmit`

**Modify `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`**

- Read `mapRef` and `latestBoundsRef` from bus refs instead of parent-passed refs

### Migration Strategy

1. Add feature flag: `const USE_MAP_SUBTREE = true;`
2. Create subtree component with all moved state
3. Conditionally render old path vs new path
4. Validate with harness, then remove old path

### Verification

- Perf harness: pins=30, dots=80 unchanged
- Camera hydration from AsyncStorage still works
- Marker reveal timing identical (`marker_reveal_settled` timestamps)
- Profile camera navigation still works
- **Key test**: change a filter (openNow toggle) and verify via React Profiler that MapSubtree does NOT re-render (only OverlaySubtree should)

---

## Phase 4: Extract SuggestionsSubtree

**Goal**: Move suggestion/autocomplete/search-chrome state into an independent subtree. Typing in the search bar will no longer trigger map or results re-renders.

**Risk**: Medium. Input + autocomplete + shortcuts are tightly coupled but isolated from other domains.

### State Moving to SuggestionsSubtree

- `suggestions`, `setSuggestions`
- `suggestionContentHeight`, `setSuggestionContentHeight`
- `isSearchFocused`, `setIsSearchFocused`
- `isSuggestionPanelActive`, `setIsSuggestionPanelActive`
- `isAutocompleteSuppressed`, `setIsAutocompleteSuppressed`
- `showSuggestions`, `setShowSuggestions`
- `query`, `setQuery` (input lives here)
- All suggestion-related refs (~15 useRef calls)

### Hooks Moving to SuggestionsSubtree

- `useAutocompleteController`
- `useSuggestionDisplayModel`, `useSuggestionLayoutWarmth`, `useSuggestionTransitionHold`
- `useSuggestionHistoryBuffer`, `useSuggestionInteractionController`
- `useRecentSearchActions`
- `useSearchFocusController`, `useSearchClearController`
- Search chrome transition logic

### Cross-Cutting Reads (from bus)

- `isSearchSessionActive`, `submittedQuery` — for display state
- `isLoading` — for spinner in search bar

### Cross-Cutting Writes (to bus)

- `query` — published on every keystroke (other subtrees read from bus)
- `isSuggestionPanelActive` — read by BottomNav to hide

### Changes

**Create `apps/mobile/src/screens/Search/subtrees/SearchSuggestionsSubtree.tsx`**

- Accept `bus: SearchSessionBus` as prop
- Render `<SearchSuggestionSurface>` and `<SearchOverlayHeaderChrome>`
- Own all suggestion/input state and hooks

**Modify `apps/mobile/src/screens/Search/index.tsx`**

- Remove ~600 lines of suggestion state/hooks/effects/JSX
- Replace with `<SearchSuggestionsSubtree bus={bus} />`

### Verification

- Autocomplete suggestions appear when typing
- Recent searches and recently viewed display correctly
- Suggestion panel animation timing identical
- Search shortcuts row appears/disappears correctly
- **Key test**: type in search bar and verify via React Profiler that MapSubtree and OverlaySubtree do NOT re-render

---

## Phase 5: Extract OverlaySubtree

**Goal**: Move overlay/sheet/profile state into an independent subtree. Sheet dragging and snap animations will no longer re-render map or suggestions.

**Risk**: Medium. Profile camera orchestration bridges overlay and map.

### State Moving to OverlaySubtree

- All overlay sheet snap states (~15 useState): `pollsSheetSnap`, `bookmarksSheetSnap`, `profileSheetSnap`, `tabOverlaySnapRequest`, `restaurantSnapRequest`, `profileTransitionStatus`, etc.
- `isPriceSelectorVisible`, `isRankSelectorVisible`, `isPriceSheetContentReady`
- `restaurantProfile`, `setRestaurantProfile`
- `isRestaurantOverlayVisible`, `setRestaurantOverlayVisible`
- `resultsSheetHeaderHeight`, `filtersHeaderHeight`
- Pagination state cluster: `currentPage`, `hasMoreFood`, `hasMoreRestaurants`, `isLoadingMore`, `isPaginationExhausted`
- All overlay-related refs (~30 useRef calls)

### Hooks Moving to OverlaySubtree

- `useSearchOverlayPanels`, `usePollCreationPanelController`
- `useOverlaySnapOrchestration`, `useSearchOverlaySheetResolution`
- `useProfileRuntimeController`, `useProfileCameraOrchestration`, `useProfileAutoOpenController`
- `useSearchResultsPanelSpec`, `useSearchResultsReadModel`
- `useSearchPriceSheetController`, `useSearchViewMoreController`
- `useSaveSheetState`, `useResultsSheetInteraction`

### Cross-Cutting Reads (from bus)

- `results`, `isLoading` — for sheet spec and list rendering
- `searchMode`, `submittedQuery`, `activeTab` — for header/filters
- `mapRef` — for profile camera orchestration (read via bus ref)

### Cross-Cutting Writes (to bus)

- `isRestaurantOverlayVisible` — read by map for highlight behavior
- `selectedRestaurantId` — read by map for pin selection

### Changes

**Create `apps/mobile/src/screens/Search/subtrees/SearchOverlaySubtree.tsx`**

- Accept `bus: SearchSessionBus` as prop
- Render `<OverlaySheetShell>`, `<SearchRankAndScoreSheets>`, `<SearchPriceSheet>`
- Wrap results content with `<SearchInteractionProvider>`
- Own all overlay/sheet/profile/pagination state and hooks

**Modify `apps/mobile/src/screens/Search/index.tsx`**

- Remove ~1200 lines of overlay state/hooks/effects/JSX
- Replace with `<SearchOverlaySubtree bus={bus} />`

### Verification

- Sheet snap animations work correctly
- Profile open/close with camera navigation works
- Polls/bookmarks panels function
- Filter sheets (price, rank) work
- Pagination (load more) works
- **Key test**: drag the results sheet and verify MapSubtree and SuggestionsSubtree do NOT re-render

---

## Phase 6: Slim the Coordinator

**Goal**: After all extractions, `index.tsx` becomes a thin coordinator (~300-500 lines).

### What Remains in Coordinator

- Instantiate `SearchSessionBus`
- Provide bus via `SearchSessionBusContext.Provider`
- Own `useSearchSubmit` (writes `results`, `isLoading`, `submittedQuery` to bus)
- Own `useSearchClearController` (clears session state)
- Render 4 subtrees + `<SearchBottomNav>` + `<SearchStatusBarFade>` as siblings
- Reanimated shared values that span subtrees (`sheetTranslateY`)

### Coordinator State (~8 useState, ~5 useRef)

- Results state (writes to bus): `results`, `isLoading`, `submittedQuery`, `isSearchSessionActive`, `searchMode`
- The bus is the single source of truth — coordinator setState calls also publish to bus

### Submit Flow in New Architecture

1. User taps submit in SuggestionsSubtree → calls `bus.submitSearch(query, options)` (imperative method set by coordinator)
2. Coordinator's `useSearchSubmit` fires API call
3. On response: `bus.batch(() => { bus.setResults(response); bus.setIsLoading(false); ... })`
4. Each subtree's `useSyncExternalStore` fires selectively:
   - MapSubtree: derives new markers from `results`
   - OverlaySubtree: builds new sheet spec from `results`
   - SuggestionsSubtree: sees `isLoading=false`, hides spinner
   - BottomNav: no change, skips re-render

### Changes

**Modify `apps/mobile/src/screens/Search/index.tsx`**

- Final cleanup: remove any remaining dead state/refs/effects
- Target: ~300-500 lines total

### Verification

- Full visual QA pass
- Perf harness: 3-run with matched settings
- React Profiler: verify each subtree renders independently

---

## Phase 7: Move Animation-Frame-Rate State to Refs

**Goal**: Values that change every animation frame should not be React state, avoiding renders during gestures.

**Risk**: Medium. Subtle — animations that read state need to switch to shared values.

### Candidates (all now inside MapSubtree after Phase 3)

- `mapCenter`, `mapZoom` — set on every camera change event. Convert from `useState` to `useRef`. The camera intent arbiter already writes imperatively — just stop triggering React renders.
- `markerRevealCommitId` — changes during marker animation. Convert to ref, signal via bus event.
- `suggestionContentHeight` (in SuggestionsSubtree) — changes during scroll. Convert to ref + Reanimated shared value.

### Changes

**Modify `apps/mobile/src/screens/Search/subtrees/SearchMapSubtree.tsx`**

- `mapCenter`: `useState` → `useRef` (consumers read `mapCenterRef.current`)
- `mapZoom`: `useState` → `useRef`
- `markerRevealCommitId`: `useState` → `useRef` + bus event notification

**Modify `apps/mobile/src/screens/Search/subtrees/SearchSuggestionsSubtree.tsx`**

- `suggestionContentHeight`: `useState` → `useRef` where only layout-driven

### Verification

- Map panning is smooth (no jank from removed renders)
- Marker reveal animation still triggers visual-ready
- Suggestion panel sizing still correct

---

## Phase 8: Enable New Architecture on Android

**Goal**: Enable `newArchEnabled=true` so `React.startTransition` actually yields, making concurrent rendering available.

**Risk**: High. Native module compatibility.

### Compatibility Check Required

- `@rnmapbox/maps@10.2.9` — verify Fabric support (has Fabric adapter since v10)
- `react-native-reanimated` — Fabric-compatible on 3.x
- `@clerk/clerk-expo` — check release notes for new arch support
- All other native modules in `package.json`

### Changes

**Modify `apps/mobile/android/gradle.properties`**

```
newArchEnabled=true
```

### Migration Strategy

- Do this on a **separate branch**
- Test every screen, not just Search
- Run full test suite
- If any native module breaks, identify the compatible version or defer

### Verification

- Full app QA on Android
- Perf harness: verify `startTransition` in submit flow actually yields (stall should be lower than iOS-parity baseline)
- All existing functionality works

---

## Sequencing & Dependencies

```
Phase 0 (memo fixes) ────────┐
Phase 1 (Zustand selectors) ──┤
Phase 2 (session bus) ─────────┼──> Phase 3 (map subtree) ──┐
                               │                             ├──> Phase 6 (slim coordinator)
                               └──> Phase 4 (suggestions) ──┤         │
                                                             │         v
                                    Phase 5 (overlay) ───────┘    Phase 7 (refs for frame-rate)

Phase 8 (new arch) ── independent, separate branch
```

Phases 0, 1, 2 have no dependencies and can proceed in parallel. Phase 3 is the critical path (most complex). Phases 4 and 5 can proceed in parallel after Phase 2. Phase 6 is cleanup after 3+4+5. Phase 7 requires subtrees to exist. Phase 8 is independent.

---

## Expected Outcome

After all phases, the hook distribution per subtree:

| Subtree            | useState | useRef  | useMemo | useCallback | useEffect | Custom | Total   |
| ------------------ | -------- | ------- | ------- | ----------- | --------- | ------ | ------- |
| Coordinator        | ~8       | ~5      | ~3      | ~5          | ~3        | ~5     | ~29     |
| MapSubtree         | ~10      | ~30     | ~8      | ~15         | ~12       | ~15    | ~90     |
| SuggestionsSubtree | ~8       | ~15     | ~5      | ~12         | ~8        | ~10    | ~58     |
| OverlaySubtree     | ~20      | ~30     | ~10     | ~20         | ~15       | ~20    | ~115    |
| **Old monolith**   | **63**   | **121** | **43**  | **78**      | **68**    | **79** | **452** |

Each subtree is 3-5x cheaper to render than the monolith. A state change in one subtree does not re-render siblings. With ~90 hooks max per subtree (and many of those being stable useRef/useCallback), individual render times should be well under 50ms.

---

## Verification Strategy (All Phases)

1. **Perf harness**: `EXPO_PUBLIC_PERF_HARNESS_RUNS=3 bash scripts/perf-shortcut-loop.sh` after each phase
2. **React Profiler**: Verify sibling subtrees do NOT render when state changes in another subtree
3. **Visual QA checklist** (per phase):
   - Pins (30) and dots (80) render correctly
   - List items (40) and sectioned items (40) display
   - Marker reveal animation plays
   - Sheet snap animations work
   - Suggestion panel opens/closes smoothly
   - Search shortcuts appear
   - Profile camera navigation works
   - Docked polls restore correctly
4. **Harness settle metrics**: `finalVisiblePinCount=30`, `finalVisibleDotCount=80`, `finalVisibleCount=40`, `finalSectionedCount=40`
5. **Runtime contracts**: `scripts/no-bypass-search-runtime.sh`, `scripts/search-runtime-s4-mode-cutover-contract.sh`, `scripts/search-runtime-natural-cutover-contract.sh`

---

## Critical Files

| File                                                                      | Role                                       | Phases |
| ------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| `apps/mobile/src/screens/Search/index.tsx`                                | Monolith being decomposed                  | 0-7    |
| `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`               | Submit orchestrator (stays in coordinator) | 3, 6   |
| `apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts`  | Runtime service instantiation              | 2, 3   |
| `apps/mobile/src/screens/Search/components/search-map.tsx`                | Map component (40+ props define boundary)  | 3      |
| `apps/mobile/src/screens/Search/components/SearchBottomNav.tsx`           | Memo-breaking fixes                        | 0      |
| `apps/mobile/src/screens/Search/components/SearchSuggestionSurface.tsx`   | Memo-breaking fixes                        | 0      |
| `apps/mobile/src/screens/Search/components/SearchOverlayHeaderChrome.tsx` | Memo-breaking fixes                        | 0      |
| `apps/mobile/src/screens/Search/components/SearchStatusBarFade.tsx`       | Memo-breaking fixes                        | 0      |
| `apps/mobile/src/screens/Search/context/SearchInteractionContext.tsx`     | Existing context pattern to follow         | 2      |
| `apps/mobile/src/store/searchStore.ts`                                    | Zustand store for selector consolidation   | 1      |
| `apps/mobile/src/store/overlayStore.ts`                                   | Zustand store for selector consolidation   | 1      |
| `apps/mobile/android/gradle.properties`                                   | New architecture flag                      | 8      |

### New Files to Create

| File                                                                   | Phase |
| ---------------------------------------------------------------------- | ----- |
| `apps/mobile/src/screens/Search/hooks/use-search-store-selectors.ts`   | 1     |
| `apps/mobile/src/screens/Search/session/search-session-bus.ts`         | 2     |
| `apps/mobile/src/screens/Search/session/use-session-bus-selector.ts`   | 2     |
| `apps/mobile/src/screens/Search/session/SearchSessionBusContext.ts`    | 2     |
| `apps/mobile/src/screens/Search/subtrees/SearchMapSubtree.tsx`         | 3     |
| `apps/mobile/src/screens/Search/subtrees/SearchSuggestionsSubtree.tsx` | 4     |
| `apps/mobile/src/screens/Search/subtrees/SearchOverlaySubtree.tsx`     | 5     |
