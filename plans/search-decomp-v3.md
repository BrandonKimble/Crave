# SearchScreen Structural Decomposition Plan V3 (Detailed + Gate-Controlled)

Last updated: 2026-02-16  
Owner: Codex + Brandon  
Purpose: preserve the full detailed decomposition plan while adding hard performance gates, matched-run decision policy, and leverage-first execution order to maximize probability of reaching sub-50ms stalls.

---

## 0) How To Use This Plan

This V3 document is intentionally longer than prior versions and has two layers:

1. **Execution Control Layer (new in V3)**

- Stall-first gates and keep/revert policy.
- Matched harness run requirements.
- High-leverage execution order override.

2. **Detailed Implementation Layer (verbatim from original plan)**

- Full original step-by-step details are preserved unchanged in Section 10.
- If any ordering conflict exists, **V3 execution order in Section 3 wins**.

---

## 1) Stall-First Reality (Why This Upgrade Exists)

Recent iterations improved first-stall windows (some runs around ~160ms), but repeated catastrophic windows remain in:

- `marker_reveal_state`
- `results_hydration_commit`

Current bottleneck pattern:

- Runtime helper spans are generally small.
- Large JS stall windows come from overlapping React commits and subtree invalidation.

Implication:

- Timing/scheduler tuning alone has diminishing returns.
- Structural render isolation + commit-size reduction must drive execution.

---

## 2) Performance Gates (Mandatory)

### 2.1 Target ladder

1. **Gate A**: first `>50ms` stall p95 `<150ms`
2. **Gate B**: worst-stall p95 `<120ms`
3. **Gate C**: catastrophic windows (`>300ms`) eliminated
4. **Gate D (final)**: all JS sampler windows `<50ms`

### 2.2 Matched-run policy

- Dev keep/revert decisions: **minimum 3 matched runs**.
- Promotion-quality proof: **minimum 6 matched runs**.
- “Matched” means same harness signature/settings/environment class.

### 2.3 Decision policy

A slice can be kept only if one of these is true:

- Improves targeted gate metric(s) with no catastrophic regression, or
- Is neutral on metrics but materially improves attribution/ownership required for next high-leverage slice.

A slice must be reverted if:

- It causes catastrophic regression, or
- It fails to improve target metrics and does not unlock a necessary structural dependency.

### 2.4 Metrics to record every run set

- Per-run first `>50ms` stall: `{duration, stage, elapsedMs}`
- Per-run worst stall
- `stallP95`, `stallMaxMean`, catastrophic run/window counts
- Stage attribution top contributors
- Final parity snapshot (`pins/dots/list/sectioned counts`)

### 2.5 Metric semantics (so decisions are consistent)

- `first >50ms stall`: earliest sampler window above `50ms` after shortcut submit handoff for that run.
- `worst stall`: maximum sampler window duration in that run.
- `stallP95`: 95th percentile over per-run values within the matched run set, used to reduce outlier noise.
- `stallMaxMean`: arithmetic mean of per-run worst stalls in the matched run set.
- `catastrophic window`: any sampler window above `300ms`.

### 2.6 Gate evaluation protocol

- For `runs=3` keep/revert checks: evaluate directionality first (better/worse/flat) on first-stall and worst-stall, then check catastrophic count.
- For `runs=6` promotion checks: use gate thresholds in Section 2.1 as hard pass/fail.
- A result is `flat` only when delta is within noise band (<= `10ms`) and stage attribution remains unchanged.
- Never keep a slice that improves one metric while increasing catastrophic windows.

---

## 3) High-Leverage Execution Order Override (V3)

This order overrides the original sequential order when conflicts exist.

### 3.1 Order

1. **E1: Commit attribution upgrade**

- Add/verify subtree-level commit attribution so each bad window can be tied to dominant subtree commit cost.
- Goal: avoid blind optimization.

2. **E2: Shared state foundation (minimal bus only)**

- Execute the minimal subset of original Phase 2 required for subtree isolation.
- Keep scope tight: only what is needed to split ownership.

3. **E3: Results/overlay isolation first**

- Prioritize extraction that isolates results hydration + sheet commits from root/map churn.
- This targets one dominant catastrophic stage directly.

4. **E4: Map isolation second**

- Move map-heavy commit domain behind stable boundaries.
- Eliminate shared-frame overlap with hydration/chrome.

5. **E5: Suggestions/chrome isolation third**

- Remove search input/suggestion churn from map/results commit paths.

6. **E6: Coordinator slimming and ownership cleanup**

- Delete legacy dual-control paths; enforce clean ownership boundaries.

7. **E7: Memoization and selector consolidation pass**

- Apply broad memo/selector optimizations after boundaries exist so gains are measurable and durable.

8. **E8: Frame-rate state to refs/shared values**

- Move high-frequency state off React render paths where appropriate.

9. **E9: Android new architecture stream (separate branch)**

- Important for Android path, but not primary fix for current iOS harness bottleneck.

### 3.2 Why this order

- It attacks known catastrophic sources first.
- It avoids long up-front prep work that can consume time without moving stall metrics.
- It preserves dependency safety by keeping minimal bus work early.

### 3.3 Minimum prep before dominant hotspot cuts

Only do this prep before E3/E4:

- Commit attribution required for stage-to-subtree ownership (`E1`).
- Minimal bus primitives required to isolate ownership (`E2` subset only).
- Safety checks needed to avoid runtime contract breakage.

Do not block E3/E4 on:

- Broad memo sweeps across untouched areas.
- Full selector consolidation rollout.
- Android new architecture workstream.

Rationale: broad prep has value, but it does not directly cut the known catastrophic windows.

### 3.4 Mapping from original phases to V3 leverage order

| V3 step                         | Primary original phase linkage                  | Notes                                                  |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| E1 commit attribution           | Cross-cutting (not explicit in original phases) | Add first so hotspot ownership is measurable.          |
| E2 minimal bus foundation       | Phase 2 (partial)                               | Use only the subset required for isolation.            |
| E3 results/overlay isolation    | Phase 5 + parts of Phase 6                      | Prioritize hydration/sheet split before broad cleanup. |
| E4 map isolation                | Phase 3                                         | Execute after E3 to remove map overlap with hydration. |
| E5 suggestions/chrome isolation | Phase 4 + parts of Phase 5                      | Keep search input churn off critical frames.           |
| E6 coordinator slimming         | Phase 6                                         | Enforce delete gate and remove dual paths.             |
| E7 memo + selectors             | Phase 0 + Phase 1                               | Apply after boundaries so wins are durable.            |
| E8 frame-rate refs              | Phase 7                                         | Move high-frequency updates off React render path.     |
| E9 Android new architecture     | Phase 8                                         | Separate stream; not blocking iOS hotspot reduction.   |

### 3.5 Pre-committed escalation tracks (mandatory if triggers hit)

These tracks are part of V3 now. They are not optional “later” ideas.

#### Track A: Off-render result shaping + incremental commit

Objective:

- Remove expensive result shaping from synchronous render/submit path.
- Keep render commits thin by committing already-shaped chunks.

Scope:

- Move heavy transforms (ranking flattening, section grouping, derived badges/metadata, map/list projection shaping) into background chunk pipeline.
- Prefer worker/JSI/background task path where feasible; fallback to frame-sliced async chunks if worker path is blocked.
- Build deterministic chunk contract: `chunkIndex`, `totalChunks`, `requestKey`, `isFinal`.
- Commit list and map payload in small batches with bounded per-frame chunk size.

Rules:

- No one-shot full payload commit during pressure.
- First paint chunk must include enough items for initial parity behavior, then expand incrementally.
- Abort stale chunk streams when request key changes.

Exit criteria:

- `results_hydration_commit` no longer dominates top stall windows.
- First-stall and worst-stall both improve in matched runs with no parity regression.

#### Track B: Hard phase pipeline (map/list independent finalize lanes)

Objective:

- Prevent map finalize and list hydration finalize from sharing a hot frame.

Scope:

- Define explicit submit lifecycle phases:
  1. `phase_0_shell_activate` (search bar/header/loading shell)
  2. `phase_1_data_ready` (first chunk shaped)
  3. `phase_2_list_commit`
  4. `phase_3_map_commit`
  5. `phase_4_chrome_finalize`
- Enforce one heavy lane per frame in critical pressure windows.
- Remove starvation override during critical pressure; late lanes wait for next frame.

Rules:

- Map and list can appear visually synchronized but must not require same-frame heavy finalize.
- Chrome finalize is strictly after list/map heavy lanes settle.
- Any override requires explicit metric proof and rollback path.

Exit criteria:

- No catastrophic overlap between `marker_reveal_state` and `results_hydration_commit`.
- Catastrophic (`>300ms`) windows reduced to zero in matched sets.

#### Track C: Hard architecture cut (if A/B are insufficient)

Objective:

- Eliminate remaining structural floor by removing root-level coupling entirely.

Scope:

- Split monolithic coordinator into strict owners:
  - `SearchShellCoordinator`
  - `ResultsHydrationDomain`
  - `MapPresentationDomain`
  - `ChromeSuggestionsDomain`
- Domain-local subscriptions/selectors only; no broad root subscription fan-out.
- Remove all dual-control legacy writers in the same promotion where new owner becomes source of truth.

Rules:

- No long-lived compatibility bridge beyond one promotion cycle.
- Promotion blocked until delete gate is complete.

Exit criteria:

- Dominant stall attribution no longer points to root-level coordinator commits.
- Remaining stalls are small enough for final memo/selector/ref cleanup to achieve Gate D.

### 3.6 Visual simultaneity contract (without same-frame heavy commit)

Goal:

- Preserve “map + list appear together” user perception while splitting JS-heavy work.

Contract:

- UI shell transition (nav slide/result sheet rise/loading overlay) starts immediately.
- First visible data for list and map can reveal in the same visual interval, but data finalize commits are lane-separated.
- Use placeholders/opacity gates only as synchronization aids, not as fallback masking.
- Reveal policy must preserve parity counts and pagination correctness.

Non-negotiable:

- Do not reintroduce intentionally first-card-only staging to hide stalls.
- Do not collapse back to shared-frame map+list finalize under pressure.

---

## 4) Keep/Revert Checklist Per Slice

Before coding:

- Define target stage(s) this slice is expected to improve.
- Define exact acceptance metrics from Section 2.

After coding:

1. Lint + runtime guard scripts pass.
2. Run matched harness set (`runs=3`).
3. Compare against previous kept candidate.
4. Decide keep/revert by Section 2.3 policy.
5. Log outcomes in first-stall worklog and this plan’s running notes.

### 4.1 Run-set logging template (required)

- `candidate`: short slice tag (example: `e3-results-isolation-pass1`)
- `harness signature`: run count, device class, build mode
- `first-stall`: per run `{duration, stage, elapsedMs}`
- `worst-stall`: per run duration
- `aggregate`: `stallP95`, `stallMaxMean`, catastrophic counts
- `parity`: `pins`, `dots`, `visibleCount`, `sectioned`, pagination status
- `decision`: `keep` or `revert` with one-sentence reason

### 4.2 Escalation triggers and auto-advance policy

Use these triggers to avoid endless micro-optimization loops:

1. After E4 completion:

- If first-stall p95 remains `>120ms`, or
- Catastrophic overlap still appears in dominant stages,
- Then automatically enter Track A.

2. After Track A promotion:

- If first-stall p95 remains `>90ms` or worst-stall p95 remains `>120ms`,
- Then automatically enter Track B.

3. After Track B promotion:

- If first-stall p95 remains `>60ms` or catastrophic windows recur,
- Then automatically enter Track C (hard architecture cut).

4. Abort condition for a candidate slice:

- Revert immediately if parity breaks and cannot be fixed inside the same slice.
- Revert immediately if catastrophic count increases without a required dependency unlock.

### 4.3 Anti-drift rules

- No more than two consecutive “flat” kept slices (flat per Section 2.6); third flat slice forces escalation or replanning.
- Every kept slice must state which trigger it is expected to satisfy next.
- If attribution confidence is low, run E1 instrumentation upgrade before additional structural edits.

---

## 5) Validation Commands

Always:

- `npx eslint <touched files>`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When contracts are touched:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`

Perf loop:

- `EXPO_PUBLIC_PERF_HARNESS_RUNS=3 bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-loop.sh <tag>`
- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-loop-report.sh <log>`

Promotion proof:

- Repeat with `EXPO_PUBLIC_PERF_HARNESS_RUNS=6`

---

## 6) UX Parity Contract (No Regressions)

Every kept slice must preserve:

- Pins/dots/list rendering parity (`pins=30`, `dots=80`, `visibleCount=40`, `sectioned=40` when applicable)
- Shortcut behavior parity
- Pagination behavior parity
- Overlay/sheet/profile interactions parity

No fallback-only behavior to mask regressions.

---

## 7) Risks and Controls

Primary risk:

- Large structural slices can regress UX while chasing stall gains.

Controls:

- Smaller ownership slices with hard keep/revert gates.
- Matched runs only.
- Mandatory parity checks and delete-gate cleanup.

---

## 8) Definition of Done

Done requires all:

1. Matched harness runs show no JS sampler window above `50ms`.
2. Stage attribution no longer dominated by catastrophic map/hydration windows.
3. UX parity passes (pins/dots/list/pagination/overlay behavior).
4. Ownership is clean (no long-lived dual control paths).
5. Escalation tracks were either proven unnecessary by passing gates early or executed per trigger policy with documented outcomes.

---

## 9) Running Notes (V3 additions)

- V3 intentionally keeps original details intact while controlling execution with gates.
- If a detailed phase step conflicts with stall-first gates or leverage order, apply V3 control layer first and retain the detailed step as implementation reference.

---

## 10) Original Detailed Plan (Verbatim)

> The following section is preserved as-is from `plans/search-decomp.md` so no original detail is lost.

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
