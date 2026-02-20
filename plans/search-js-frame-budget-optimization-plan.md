# Search JS Frame-Budget Optimization Plan v2

## Implementation Doctrine

**This plan is the source of truth for all implementation work.** The following rules are non-negotiable:

1. **No deviations from the plan's stated approach.** Each phase specifies the architectural change, the recommended solution, and the files involved. Implementations must follow the plan's intent exactly — do not substitute alternative approaches, skip steps, or "simplify" the design to save time.

2. **No scope reduction for time constraints.** Every solution described in this plan exists because it addresses a measured bottleneck. Cutting a solution because it "takes too long" or "seems like a lot of work" defeats the purpose. If a phase is large, implement it fully rather than shipping a partial version that doesn't move the needle.

3. **No speculative additions or side-quests.** Implement what the plan says, nothing more. Do not refactor surrounding code, add features, or "improve" areas outside the plan's scope. Stay focused on the stated changes.

4. **UX parity is mandatory, with conditional improvements.** The pin layer stack (30 z-slots × 6 layers), label sticky placement system, z-ordering, and pin positioning are off-limits for structural changes. Transition mechanics (fade, scale timing, frequency) may be changed. Visual output must remain identical to the user. However, the following UX improvements are explicitly desired and should be pursued if achievable within the performance budget:

   - **Instant first-page list render:** If the full first page of results (~20 items) can be rendered in a single frame without exceeding the 50ms stall ceiling, do it. Eliminate progressive row ramping in favor of showing all 20 items at once. The current 2 → 6 → 10 → ... ramp is a performance workaround, not a UX choice — users would prefer seeing all results immediately.

   - **Instant pin render:** Same principle for map pins. If all pins for the first page can be committed to the map in a single frame without exceeding the stall ceiling, do it instead of staggering pin reveals. Show all pins at once.

   - **Simultaneous nav slide-out and result sheet slide-up:** The navigation bar slide-out transition and the results sheet slide-up transition should happen at the exact same time if it can be done efficiently. Currently these may be sequenced or gated behind frame budget checks — if the underlying work is cheap enough after optimization, run both transitions concurrently for a snappier feel.

   These are aspirational — pursue them when the performance headroom exists, but never at the cost of exceeding the stall ceiling. If rendering 20 items at once causes a 60ms stall, keep the ramp. If simultaneous transitions cause jank, keep them sequenced.

5. **Validate with the harness after every phase.** No phase is complete until the shortcut-loop harness confirms directional improvement against the exit gate criteria. Do not proceed to the next phase on assumption.

---

## Canonical UX Sequence (Search Shortcut Flow)

This is the **ideal user-visible sequence** when a user taps a search shortcut (e.g. "Best restaurants"). The current implementation does not follow this order correctly. All optimization work should converge toward this sequence.

### Step 1: Overlay switch + query populate (immediate, same frame)

- The overlay sheet switches to the results page with a **loading cover** visible.
- Simultaneously, the **search bar** populates with the shortcut/natural query text.
- The **results sheet header** (tabs, filters) populates with the query context.
- No network request is needed for this step — it's purely local state.
- The user sees: results sheet in loading state, search bar filled in, header ready.

### Step 2: Nav slide-down + sheet slide-up (concurrent animation)

- The **navigation bar slides down** (out of view) and the **results sheet slides up** at the **exact same time**.
- These are concurrent animations, not sequenced. They should start on the same frame.
- Duration should feel snappy (~250-300ms).
- The loading cover remains visible on the results sheet during this transition.
- The user sees: the UI reconfiguring from browse mode to search mode in one fluid motion.

### Step 3: Dots and pins appear (concurrent, after API response)

- Once the API response arrives, **dots and pins transition onto the map at the same time**.
- Dots should NOT appear first and then transition into pins. Both dots and pins should appear together in their final form.
- If rendering all dots + pins simultaneously exceeds the stall ceiling, stagger minimally (dots first by 1-2 frames, then pins), but the ideal is concurrent.
- The loading cover can begin to fade during this step.
- The user sees: the map populating with restaurant markers all at once.

### Step 4: Result cards appear (after markers)

- After dots and pins are on the map, the **first page of result cards** (~20 items) appears in the list.
- Ideally all 20 cards render in a single frame (no progressive ramp). If this exceeds the stall ceiling, render in 2 batches maximum (not 10).
- The loading cover fully removes.
- The user sees: the full first page of results ready to scroll, map fully populated.

### Timing Summary

```
t=0ms    User taps shortcut
         ├─ Sheet switches to results (loading cover on)
         ├─ Search bar + header populate with query
         └─ API request fires

t=0ms    Nav slides down + sheet slides up (concurrent, ~250-300ms)

t=~300ms API response arrives (variable, network-dependent)
         ├─ Dots + pins appear on map (concurrent, ~1-2 frames)
         └─ Loading cover begins fade

t=~350ms First page of cards (20 items) renders
         └─ Loading cover fully gone

t=~400ms Settle — everything interactive
```

Note: If the API response arrives before the slide animations complete, dots/pins/cards should wait for the animations to finish before appearing. The slide transition should never be interrupted by data arriving.

### What This Changes From Current Behavior

1. **Current:** Dots appear first, then transition into pins (dot-to-pin reveal animation). **Ideal:** Dots and pins appear together in final form.
2. **Current:** Cards ramp progressively (2 → 6 → 10 → ... → 40). **Ideal:** All 20 first-page cards appear at once.
3. **Current:** Nav slide and sheet slide may be sequenced or gated. **Ideal:** They are concurrent.
4. **Current:** Markers may appear before or during slide animations. **Ideal:** Markers wait for slide to complete, then appear with cards shortly after.

---

## Target

- **Stall ceiling:** <50ms per JS frame (no single synchronous unit of work exceeds 50ms)
- **FPS floor:** >50 FPS sustained during search shortcut flows
- **UI thread:** Maintain current clean state (0ms stalls)

## Current Reality (Post-Refactor, 2026-02-19)

### Measured Stalls (shortcut-loop harness, 3 runs)

| Run | Settle | Duration | Worst Stall | Floor FPS | Scheduler Yields |
|-----|--------|----------|-------------|-----------|-----------------|
| 1   | settled | 6.0s    | **1,716ms** | **0.6**   | 12              |
| 2   | settled | 6.0s    | **991ms**   | **1.0**   | 12              |
| 3   | settled | 5.3s    | **936ms**   | **1.1**   | 18              |

### Pre-Refactor Baseline (for comparison)

| Run | Settle | Duration | Worst Stall | Floor FPS | Scheduler Yields |
|-----|--------|----------|-------------|-----------|-----------------|
| 1   | settled | 1.47s   | 407ms       | 2.5       | 0               |
| 2   | settled | 0.87s   | 197ms       | 5.1       | 0               |
| 3   | settled | 0.80s   | 129ms       | 7.8       | 0               |

**Verdict:** Refactors made stalls **4x worse** (407ms → 1,716ms peak). The cooperative scheduler/governor framework is not effective because the expensive work happens inside React renders, not in scheduled tasks.

### Stall Breakdown by Stage

| Stage | Worst Stall | Frequency | Primary Component |
|-------|-------------|-----------|-------------------|
| `marker_reveal_state` | **1,716ms** | Once per search (during reveal) | SearchMapTree, SearchMapDots |
| `results_hydration_commit` | **936ms** | Multiple per search (100-400ms each) | SearchScreen, SearchMapTree |
| `results_list_ramp` | **349ms** | 2-3 per search | SearchScreen, SearchResultsSheetTree |
| `pre_response_activation` | **484ms** | Once per cold search | SearchScreen, SearchOverlayChrome |

### Top Component Contributors (from profiler)

1. **SearchScreen** — present in every stall window (root of all cascades)
2. **SearchMapTree** — marker feature derivation, label rebuilds, pin layer updates
3. **SearchMapDots** — dot feature collection updates during reveal
4. **SearchResultsSheetTree** — list hydration row expansion

---

## Root Cause Analysis

### Why the Scheduler Cannot Fix This

The `RuntimeWorkScheduler` + `FrameBudgetGovernor` system controls ~20% of the work (hydration ramp tasks). The remaining ~80% is **synchronous React render work** that the scheduler cannot interrupt:

```
API response arrives (sync)
  → Bus publishes results
    → 8+ bus selectors fire → each triggers component re-render
      → SearchScreen renders (root cascade)
        → useMapMarkerEngine derives markers (5-15ms useMemo, sync)
        → SearchMap renders (40+ props)
          → restaurantLabelFeaturesWithIds rebuilt (2-8ms useMemo, sync)
          → 180 Mapbox SymbolLayer filter re-evaluations (sync native bridge)
        → SearchResultsSheetTree renders
          → FlashList measures new items (sync)
      → Pin transition starts
        → 18 frames × full feature rebuild (2-8ms each, sync in useMemo)
```

**The scheduler tries to spread work across frames, but useMemo/render work executes synchronously within a single React commit. No cooperative scheduling can break up a single render.**

### The Five Structural Problems

1. **Marker computation on the render path** — `buildMarkerCatalogReadModel`, LOD diff, label features are all `useMemo` inside component render. A single render of SearchMapWithMarkerEngine + SearchMap costs 10-25ms.

2. **Per-frame feature rebuilds during transitions** — `restaurantLabelFeaturesWithIds` depends on `pinTransitionClockMs`. Every animation frame rebuilds 120+ GeoJSON features with new transition properties. 18 frames × 2-8ms = 36-144ms total.

3. **Bus → Component cascade fan-out** — A single `bus.publish()` triggers 8+ selectors. Each new reference causes a re-render. Cascades: SearchScreen → SearchMapWithMarkerEngine → SearchMap → SearchMapDots → SearchMapLabels. One state change → 5+ component re-renders in the same frame.

4. **180-layer pin stack** — 30 z-order slots × 6 layers each = 180 `MapboxGL.SymbolLayer` components. Every feature property change triggers filter re-evaluation across all 180 layers via the native bridge.

5. **Hydration ramp forces sequential re-renders** — Incrementally increasing `rowsForRender` from 2 → 40 causes 4-10 forced FlashList re-renders over 4-10 frames, each blocking for 3-8ms.

---

## Optimization Phases

### Phase 0: Revert Regression & Stabilize Baseline

**Goal:** Get stalls back to pre-refactor levels before attempting further optimization.

**Diagnosis:** The refactors introduced additional re-render cascades. The bus bridge pattern moved state reads from `useState` (batched by React) to `useSyncExternalStore` selectors (fire synchronously on publish). This means every `bus.publish()` now synchronously triggers all subscribed components in the same microtask, before React can batch.

**Changes:**

1. **Audit bus selector granularity in SearchScreen and SearchMap.** Each `useSearchRuntimeBusSelector` call that returns an object/array creates a new reference on every publish unless the equality function is correct. Verify every selector has a proper shallow-equal comparator.

2. **Batch bus publishes in the response handler.** Ensure `handleSearchResponse()` wraps all bus mutations in a single `bus.batch(() => { ... })` call so subscribers only fire once per response, not once per field.

3. **Remove unnecessary effect deps that were added during refactor.** The hydration commit effect had `hydrationOperationId` and `searchRequestIdentity` as deps (now fixed with refs), but audit all other effects for similar over-subscription.

**Files:**
- `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts`
- `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- `apps/mobile/src/screens/Search/index.tsx`

**Exit gate:** Harness stalls return to baseline range (worst <500ms, floor FPS >2.5).

---

### Phase 1: Move Marker Computation Off the Render Path

**Goal:** Eliminate `marker_feature_derivation` as a stall contributor by pre-computing all marker GeoJSON before publishing to the bus.

**Problem in detail:**

Currently, the marker pipeline runs synchronously inside React renders:

```typescript
// useMapMarkerEngine (render path, sync)
const catalogReadModel = React.useMemo(() =>
  buildMarkerCatalogReadModel(results, scoreMode, ...), [results, ...]);

// map-presentation-controller.ts (render path, sync)
const visibleCandidates = React.useMemo(() =>
  queryVisibleCandidates(catalogReadModel, bounds, ...), [catalogReadModel, bounds, ...]);

// map-diff-applier.ts (render path, sync)
const { pinnedMarkers, dotFeatures } = React.useMemo(() =>
  buildMarkerRenderModel(visibleCandidates, pinnedState, ...), [visibleCandidates, ...]);
```

Each of these is 2-8ms. They chain: catalog → viewport query → LOD diff → label features. Total: 10-25ms synchronous in one render.

**Solution: Pre-compute on API response**

Move marker computation into the search response handler (before publishing to bus). The entire `useMemo` chain — `buildMarkerCatalogReadModel`, `queryVisibleCandidates`, `buildMarkerRenderModel`, `buildLabelCandidates`, `buildGeoJSONFeatures` — becomes a plain function call in the response handler:

```typescript
// In use-search-submit.ts, after API response:
const markerFeatures = buildMarkerCatalogReadModel(response.results, scoreMode, ...);
const visibleCandidates = queryVisibleCandidates(markerFeatures, bounds, maxPins);
const { pinnedMarkers, dotFeatures, labelFeatures } = buildMarkerRenderModel(
  visibleCandidates, pinnedState, lodConfig
);
const geoJSON = buildGeoJSONFeatureCollections(pinnedMarkers, dotFeatures, labelFeatures);

bus.publish({
  results: response.results,
  precomputedDotFeatures: geoJSON.dots,
  precomputedPinFeatures: geoJSON.pins,
  precomputedLabelFeatures: geoJSON.labels,
  precomputedSortedMarkers: pinnedMarkers,
});
```

The map component then reads pre-computed GeoJSON directly from the bus — zero computation in render. The response handler takes longer (10-25ms), but it runs exactly once per search (not on every re-render) and the cost is amortized into the already-async response processing window.

**Implementation details:**

1. Extract the `useMemo` chain from `useMapMarkerEngine` into a standalone pure function `computeMarkerPipeline(results, scoreMode, bounds, pinnedState, maxPins, lodConfig)`.

2. Call `computeMarkerPipeline()` in the response handler in `use-search-submit.ts`, before `bus.publish()`.

3. Add new bus fields: `precomputedDotFeatures`, `precomputedPinFeatures`, `precomputedLabelFeatures`, `precomputedSortedMarkers`.

4. Modify `SearchMap` / `SearchMapWithMarkerEngine` to read pre-computed features from bus instead of computing them in `useMemo`. The existing `useMemo` chain becomes a no-op passthrough or is removed entirely.

5. For viewport-driven LOD updates (user pans the map), the LOD recomputation still needs to run on the JS thread since it's triggered by camera changes, not API responses. Keep a lightweight version of `buildMarkerRenderModel` that only re-sorts the already-computed catalog by new viewport bounds. This is the cheap part (~1-2ms) — the expensive catalog build (5-8ms) only runs once per API response.

**Files:**
- `apps/mobile/src/screens/Search/runtime/map/map-read-model-builder.ts`
- `apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
- `apps/mobile/src/screens/Search/hooks/use-map-marker-engine.ts`
- `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`
- `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts` (new bus fields)

**Exit gate:** `marker_feature_derivation` total attribution drops from ~5ms to <1ms per search. No stalls >50ms attributed to marker computation.

---

### Phase 2: Reduce Transition Animation Frequency for LOD Changes

> **Note:** Phase 9 introduces a dual-mode transition system — initial search commit skips the rAF animation loop entirely (pins appear at steady state), but **post-search viewport pans** still use the full animated promote/demote system. Phase 2 directly benefits these post-search LOD transitions by making each animation frame cheaper. The changes below apply to all animated transitions (viewport pan promote/demote), which remain the only scenario where the rAF loop fires after Phase 9.

**Goal:** Reduce the per-frame JS cost of LOD promote/demote animations from 18 frames × full feature rebuild to 3 frames × dirty features only.

**Problem in detail:**

```typescript
// search-map.tsx — runs EVERY ANIMATION FRAME for 300ms
const restaurantLabelFeaturesWithIds = React.useMemo(() => {
  const transitionNowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
  return restaurantFeatures.features.map((feature) => {
    const transitionVisual = getPinTransitionVisual(startedAtMs, transitionNowMs, 'promote');
    return {
      ...feature,
      properties: {
        ...feature.properties,
        pinTransitionScale: transitionVisual.scale,
        pinTransitionOpacity: transitionVisual.opacity,
        // ... more transition properties
      },
    };
  });
}, [pinTransitionClockMs, /* ... */]);  // ← Invalidated every frame!
```

For 30 pins with 4 label candidates each = 120 features rebuilt 18 times = 2,160 object allocations per transition.

**Solution: Hybrid — native GL-thread opacity transitions + 10Hz JS-driven scale updates**

The Mapbox style spec distinguishes between **paint** and **layout** properties. Transitions only apply to paint properties. For SymbolLayer:

- `icon-opacity` → **paint** property → `iconOpacityTransition` **available** (GL-thread, zero JS cost)
- `text-opacity` → **paint** property → `textOpacityTransition` **available** (GL-thread, zero JS cost)
- `icon-size` → **layout** property → `iconSizeTransition` **does not exist** (must be driven from JS)

This means we use a hybrid approach:

**1. Native GL-thread transitions for opacity (zero JS cost):**

Set `iconOpacityTransition` and `textOpacityTransition` on the transition SymbolLayers. When a pin is promoted, set its opacity property to the final value once — Mapbox animates the interpolation on the GL thread:

```typescript
// On the transition SymbolLayer slots:
<MapboxGL.SymbolLayer
  id={`pin-transition-slot-${slotIndex}`}
  style={{
    iconOpacity: ['get', 'pinTransitionOpacity'],  // Set to 1.0 once on promote
    iconOpacityTransition: { duration: 300, delay: 0 },  // GL-thread animation
    textOpacity: ['get', 'pinLabelOpacity'],
    textOpacityTransition: { duration: 300, delay: 0 },
    // ... other style props
  }}
/>
```

No JS work needed for opacity — set the final value and Mapbox handles the 300ms fade-in natively.

**2. 10Hz JS-driven updates for scale only:**

Since `iconSize` is a layout property with no transition support, drive scale at 10Hz from JS:

```typescript
const TRANSITION_UPDATE_INTERVAL_MS = 100; // 10 Hz instead of 60 Hz

React.useEffect(() => {
  if (!hasActiveTransitions) return;
  const interval = setInterval(() => {
    const now = getNowMs();
    // Only update scale properties — opacity is handled by GL thread
    setTransitionScaleProgress(now);
  }, TRANSITION_UPDATE_INTERVAL_MS);
  return () => clearInterval(interval);
}, [hasActiveTransitions]);
```

The 10Hz interval only updates `pinTransitionScale` (and `pinRankOpacity` for rank number fade-in, which has a delayed start). Opacity properties are set once and never touched by the interval.

**Net result:** Per-frame feature rebuilds only modify 1 property (scale) on 1-3 dirty features, 3 times per transition. Combined with Phase 4's dirty tracking: 3 frames × 1-3 features × 1 property = 3-9 property updates per LOD transition, down from 18 frames × 30 features × 4 properties = 2,160.

**Implementation details:**

1. Replace the `requestAnimationFrame` loop in `usePinTransitionController` with `setInterval(fn, 100)`.

2. Add `iconOpacityTransition: { duration: 300, delay: 0 }` and `textOpacityTransition: { duration: 300, delay: 0 }` to all transition-mode SymbolLayer slots.

3. When a pin enters `promoteStartedAtByMarkerKey`, set `pinTransitionOpacity: 1.0` and `pinLabelOpacity: 1.0` immediately (one-time write). Mapbox handles the fade-in natively.

4. The 10Hz interval only updates `pinTransitionScale` (0.48→1.0 over 300ms via `easeOutQuart`) and `pinRankOpacity` (delayed fade-in starting at 50% progress).

5. Keep the existing `getPinTransitionVisual()` function — just stop reading its `opacity` and `labelOpacity` outputs for feature property writes. Only use `scale` and `rankOpacity`.

6. The transition still lasts 300ms. The interval fires at t=0, t=100, t=200. A final cleanup fires at t=300 to set all features to steady state and stop the interval.

**Files:**
- `apps/mobile/src/screens/Search/components/search-map.tsx` (transition loop, feature builder)
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`

**Exit gate:** No stall windows attributed to `marker_reveal_state` exceed 50ms. Feature rebuild count per LOD transition drops from 18+ to ≤3.

---

### Phase 3: Flatten the Bus → Component Cascade

**Goal:** Reduce component re-render fan-out from 5+ to 1-2 per state change.

**Problem in detail:**

Current data flow requires everything to route through SearchScreen:

```
Bus publishes results
  → SearchScreen re-renders (reads 20+ selectors)
    → Passes 50+ props to SearchMapWithMarkerEngine
      → Passes 40+ props to SearchMap
    → Passes props to SearchResultsSheetTree
    → Passes props to SearchOverlayChrome
```

If ANY of the 20+ selectors return a new reference, SearchScreen re-renders ALL children. Even with React.memo on children, the prop comparison for 40-50 props is itself expensive, and any single prop change defeats the memo.

**Solution: Direct bus subscriptions in leaf components**

Make SearchMap and SearchResultsSheetTree subscribe directly to the bus, bypassing SearchScreen:

```
Current:
  Bus → SearchScreen → SearchMapWithMarkerEngine → SearchMap
  Bus → SearchScreen → SearchResultsSheetTree

After:
  Bus → SearchMap (subscribes to marker-specific fields only)
  Bus → SearchResultsList (subscribes to results-specific fields only)
  Bus → SearchScreen (subscribes to chrome/overlay state only)
```

**Implementation:**

1. **SearchMap direct subscription:**
   ```typescript
   // SearchMap reads its own data from bus:
   const { sortedMarkers, dotFeatures, markersRenderKey } =
     useSearchRuntimeBusSelector(bus, (state) => ({
       sortedMarkers: state.precomputedSortedMarkers,
       dotFeatures: state.precomputedDotFeatures,
       markersRenderKey: state.markersRenderKey,
     }), shallowEqual);
   ```
   SearchScreen no longer passes marker data as props.

2. **SearchResultsSheetTree direct subscription:**
   ```typescript
   const { rowsForRender, isHydrationSettled } =
     useSearchRuntimeBusSelector(bus, (state) => ({
       rowsForRender: state.rowsForRender,
       isHydrationSettled: state.isResultsHydrationSettled,
     }), shallowEqual);
   ```

3. **SearchScreen becomes a layout shell:**
   ```typescript
   // SearchScreen only manages:
   // - Overlay visibility (which sheet is open)
   // - Chrome state (search bar, suggestion surface)
   // - Camera/map ref forwarding
   // - NO data flow for markers or results
   ```

4. **Reduce SearchScreen selectors** from 20+ to ~5 (overlay state, chrome state, loading state).

5. **Pass the bus instance via context, not props.** SearchMap and SearchResultsSheetTree access the bus from a `SearchRuntimeBusContext` provider placed at the SearchScreen level. This avoids threading the bus object through intermediate components.

**Files:**
- `apps/mobile/src/screens/Search/index.tsx` (remove data-flow props, add bus context provider)
- `apps/mobile/src/screens/Search/components/search-map.tsx` (add direct bus subscription)
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx` (simplify props, consume bus from context)
- `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts` (export context)
- `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- `apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx` (direct bus subscription)

**Exit gate:** SearchScreen `React.Profiler` render count per search drops by >50%. No single component receives >15 props from its parent.

---

### Phase 4: Reduce JS Cost of Feeding the Pin Layer Stack

**Goal:** Minimize JS-thread time spent building and updating feature data for the existing 180-layer pin stack, without changing the layer structure, z-ordering, positioning, or label placement.

**UX Constraint:** The 30-slot × 6-layer pin stack is UX-critical for correct z-ordering and visual fidelity. The label sticky placement system is similarly off-limits. This phase focuses purely on reducing the JS work that *feeds* these layers — fewer feature rebuilds, cheaper GeoJSON construction, and smarter change detection so the native bridge only receives updates when features actually changed.

**Problem in detail:**

The 180 layers themselves are static React elements — they don't remount per search. The JS cost comes from:

1. **Feature collection rebuilds:** Every time `stylePinFeaturesWithTransitions` changes, a new `FeatureCollection` object is created and passed to the `ShapeSource`. The native bridge serializes the entire collection even if only 1 of 30 features changed.

2. **Redundant feature property spreading:** During transitions, every feature gets `{ ...feature, properties: { ...feature.properties, pinTransitionScale, pinTransitionOpacity, ... } }` — creating 30+ new objects per frame even for features not in transition.

3. **Label candidate multiplication:** Each pin generates 4 label candidates (bottom/right/top/left). Rebuilding all 120 label features when only 1 pin's transition progress changed.

4. **Full GeoJSON serialization on every ShapeSource update:** `@rnmapbox/maps` serializes the entire `shape` prop to JSON on every render, even if only a single feature's property changed.

**Solution (four complementary parts):**

#### Part A: Incremental feature updates with dirty tracking

Only rebuild features that actually changed, and only serialize the delta:

```typescript
// Track which features are "dirty" (in active transition or data changed)
const dirtyMarkerKeysRef = React.useRef<Set<string>>(new Set());

// When transition starts, mark those specific features dirty:
const startTransition = (markerKey: string) => {
  dirtyMarkerKeysRef.current.add(markerKey);
};

// Feature rebuild only touches dirty features:
const updatedFeatures = React.useMemo(() => {
  const dirtyKeys = dirtyMarkerKeysRef.current;
  if (dirtyKeys.size === 0) return previousFeaturesRef.current;

  const next = previousFeaturesRef.current.map((feature) => {
    const key = buildMarkerKey(feature);
    if (!dirtyKeys.has(key)) return feature; // Reuse same object reference

    // Only rebuild this one feature:
    return {
      ...feature,
      properties: {
        ...feature.properties,
        ...computeTransitionProperties(key, nowMs),
      },
    };
  });

  dirtyMarkerKeysRef.current = new Set(); // Reset for next frame
  previousFeaturesRef.current = next;
  return next;
}, [transitionClockMs, /* only when dirty features exist */]);
```

This reduces object allocation from 30 features/frame to only the 1-3 features actively transitioning.

#### Part B: Separate transition features from steady features

Split the pin feature collection into two stable partitions:

```typescript
// Partition 1: Steady features (not transitioning) — rarely changes
const steadyPinFeatures = React.useMemo(() => {
  return allPinFeatures.filter(f => !activeTransitionKeys.has(buildMarkerKey(f)));
}, [allPinFeatures, activeTransitionKeySetIdentity]);

// Partition 2: Transitioning features (1-3 pins) — changes every frame
const transitioningPinFeatures = React.useMemo(() => {
  return activeTransitionKeys.size === 0
    ? EMPTY_FEATURE_COLLECTION
    : {
        type: 'FeatureCollection',
        features: Array.from(activeTransitionKeys).map(key => {
          const base = featureByKeyRef.current.get(key);
          return {
            ...base,
            properties: {
              ...base.properties,
              ...computeTransitionProperties(key, transitionClockMs),
            },
          };
        }),
      };
}, [transitionClockMs, activeTransitionKeys]);
```

The steady partition is a stable reference (same object across frames). Only the transitioning partition (1-3 features) rebuilds per frame. The native bridge serializes the small partition every frame, but the large partition only on data changes.

Implementation detail: The existing layer filter expressions (`['==', ['get', 'lodZ'], slotIndex]`) work unchanged — features from both partitions flow through the same ShapeSource. The only change is *how* the JS side constructs the FeatureCollection.

#### Part C: Coalesce transition updates with frame skipping

Rather than updating transition properties every animation frame (60Hz), batch updates at a lower frequency and let the native side interpolate visually:

```typescript
const TRANSITION_COALESCE_MS = 48; // ~20Hz instead of 60Hz
const lastTransitionUpdateMsRef = React.useRef(0);

const shouldUpdateTransitions = React.useCallback((nowMs: number) => {
  if (nowMs - lastTransitionUpdateMsRef.current < TRANSITION_COALESCE_MS) {
    return false; // Skip this frame, reuse previous features
  }
  lastTransitionUpdateMsRef.current = nowMs;
  return true;
}, []);

// In the transition frame callback:
if (!shouldUpdateTransitions(getNowMs())) return; // Skip rebuild entirely
```

This reduces feature rebuilds from 18 per transition to ~6 (300ms / 48ms). Combined with Part A's dirty tracking, each rebuild only touches 1-3 features. Net: 6 frames × 1-3 features = 6-18 object allocations per transition (vs current 18 frames × 30 features = 540).

#### Part D: Memoize label candidates independently from pin transitions

Currently `restaurantLabelCandidateFeaturesWithIds` depends on `pinTransitionClockMs` through the feature properties. Separate label candidate geometry (position, anchor side) from transition visual properties (opacity, scale):

```typescript
// Step 1: Label candidate GEOMETRY — stable across transitions
const labelCandidateGeometry = React.useMemo(() => {
  return buildLabelCandidates(sortedMarkers, labelConfig);
  // Only rebuilds when marker set or label config changes
}, [sortedMarkers, labelConfig]);

// Step 2: Label candidate VISUALS — only transition properties
const labelCandidateVisuals = React.useMemo(() => {
  if (!hasActiveTransitions) return labelCandidateGeometry; // Same reference
  return applyTransitionVisuals(labelCandidateGeometry, transitionState);
  // Only rebuilds during active transitions, and only updates opacity/scale
}, [labelCandidateGeometry, hasActiveTransitions ? transitionClockMs : 0]);
```

When no transitions are active (the common case after reveal settles), `labelCandidateVisuals` is the exact same object reference as `labelCandidateGeometry` — zero allocation, zero serialization delta.

**Files:**
- `apps/mobile/src/screens/Search/components/search-map.tsx` (feature construction, transition updates)
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx` (feature pass-through)
- `apps/mobile/src/screens/Search/hooks/use-map-marker-engine.ts` (feature derivation)

**Exit gate:** Feature rebuild count during transitions drops from 18×30=540 objects to <50 total. Stall windows during `marker_reveal_state` drop below 100ms. No visual change to pin rendering, z-ordering, label placement, or transition appearance.

---

### Phase 5: Simplify Hydration Ramp

**Goal:** Eliminate `results_list_ramp` stalls by removing incremental row expansion.

**Problem in detail:**

The hydration ramp progressively increases `rowsForRender` from 2 → 6 → 10 → ... → 40 over 4-10 frames. Each step triggers a FlashList re-render that synchronously measures new items (3-8ms per step). Total: 30-80ms spread across frames, with individual stalls of 3-8ms.

The ramp exists to prevent a single large render, but FlashList already virtualizes — it only renders items within `drawDistance` of the viewport. The ramp is duplicating FlashList's own virtualization.

**Solution: Remove the ramp and provide pre-computed item heights**

Two changes, implemented together:

**1. Remove the ramp — give FlashList all items immediately:**

```typescript
// Remove the ramp entirely:
const rowsForRender = sectionedResults; // All rows, always

<FlashList
  data={rowsForRender}
  estimatedItemSize={88}  // Good-enough estimate for row height
  drawDistance={260}       // Only render items within 260px of viewport
  // FlashList handles virtualization natively
/>
```

FlashList already only renders visible + buffer items. Giving it all 40 rows doesn't mean it renders all 40 — it measures and renders ~8-12 visible items, then lazily renders more as the user scrolls.

**2. Provide pre-computed heights via `overrideItemLayout`:**

```typescript
<FlashList
  data={rowsForRender}
  estimatedItemSize={88}
  overrideItemLayout={(layout, item) => {
    // Pre-compute exact height based on item type:
    layout.size = item.type === 'section_header' ? 44
      : item.type === 'restaurant_card' ? 96
      : item.type === 'dish_card' ? 80
      : 88; // fallback
  }}
/>
```

This eliminates FlashList's synchronous measurement pass entirely. Items are positioned by pre-computed heights, and only rendered when scrolled into view. Combined with removing the ramp, FlashList renders exactly once per search with zero measurement stalls.

**What to remove:**
- `PhaseBMaterializer.scheduleHydrationRamp()` — no longer needed
- `hydrationRowsLimit` state — no longer needed
- `effectiveHydrationRowsLimit` computation — no longer needed
- `HYDRATION_RAMP_FRAME_BUDGET_MS` — no longer needed
- `HydrationRampPressure` type and resolution logic — no longer needed

**What to keep:**
- `PhaseBMaterializer.syncHydrationCommit()` — still needed for the key commit handshake
- `resultsHydrationKey` / `hydratedResultsKey` — still needed for staleness detection
- `isResultsHydrationSettled` — still needed for settle detection

**Files:**
- `apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`
- `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- `apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx`

**Exit gate:** `results_list_ramp` no longer appears as a stall stage in harness output. FlashList renders ≤2 times per search (initial + data update).

---

### Phase 6: Decouple Map Label Bootstrap from Request Identity

**Goal:** Prevent map label/pin layer remounts when only the data changes, not the topology.

**Problem in detail:**

`markersRenderKey` changes on every search request because it includes the request ID. This causes Mapbox source/layer components to unmount and remount, triggering a full label bootstrap cycle (cold start for sticky label placement).

**Solution:**

Make `markersRenderKey` a function of **topology** (which markers, what z-order), not **identity** (which request produced them):

```typescript
// Current (changes every request):
const markersRenderKey = `${searchMode}::${tab}::${scoreMode}::pins:${pinCount}:${firstPinId}:${lastPinId}:${hash}`;

// Proposed (changes only when marker SET changes):
const markersRenderKey = React.useMemo(() => {
  const pinIds = sortedMarkers.map(m => m.properties.id).sort().join(',');
  return `pins:${fnv1a(pinIds)}`;
}, [sortedMarkers]);
```

If consecutive searches return the same restaurants (common for nearby searches), the render key stays stable and no remount occurs.

**Files:**
- `apps/mobile/src/screens/Search/hooks/use-map-marker-engine.ts` (render key generation)
- `apps/mobile/src/screens/Search/components/search-map.tsx` (remount gate)

**Exit gate:** Label bootstrap only fires when marker set actually changes. Harness shows `map_label_bootstrap` attribution drops by >50%.

---

### Phase 7: Eliminate Pre-Response Activation Stall

**Goal:** Reduce the 484ms stall that happens *before the API response arrives* when the user taps a shortcut.

**Problem in detail:**

The `pre_response_activation` stage is the window between "user taps shortcut" and "API response arrives." During this window, the current code triggers massive synchronous re-render cascades:

- `runBestHere()` calls `scheduleSubmitUiLanes()` which publishes multiple bus updates
- Each bus publish triggers 8+ selectors across SearchScreen, SearchMapTree, SearchResultsSheetTree
- Sheet animation setup (`animateSheetTo('middle')`) triggers layout computation
- Profiler shows: SearchScreen 6 commits (76.7ms max), SearchMapTree 4 commits (76.5ms max), SearchResultsSheetTree 6 commits (42ms max)

All of this happens before any data arrives — it's purely UI state transitions causing a ~484ms stall.

**Solution: Batch publishes + defer non-essential renders**

Two changes, implemented together:

**1. Batch all pre-response bus publishes into a single notification:**

Audit every bus publish between shortcut tap and API response. Wrap them in `bus.batch()` so subscribers fire exactly once with the accumulated state:

```typescript
// Current: multiple publishes → multiple notification rounds
bus.publish({ isSearchLoading: true });
bus.publish({ activeOperationLane: 'lane_a_ack' });
bus.publish({ isMapActivationDeferred: true });
// → 3 notification rounds → 3 × 5+ component re-renders = 15+ re-renders

// After: single batched publish → one notification round
bus.batch(() => {
  bus.publish({ isSearchLoading: true });
  bus.publish({ activeOperationLane: 'lane_a_ack' });
  bus.publish({ isMapActivationDeferred: true });
});
// → 1 notification round → 5 component re-renders = 5 re-renders
```

**2. Defer non-essential renders during pre-response:**

Not everything needs to render before the API response. Split the shortcut activation into essential (must happen immediately) and deferrable (can wait):

```
Essential (same frame as tap):
  - Search bar text update
  - Sheet overlay switch to results page (with loading cover)
  - Loading state indicator

Deferrable (can happen on next frame or after response):
  - Map tree re-render (nothing to show yet anyway)
  - Results sheet tree re-render (loading cover is showing)
  - Bottom nav updates
```

Use `requestAnimationFrame` for deferrable work:

```typescript
// Essential: immediate
bus.batch(() => {
  bus.publish({ submittedQuery: query, isSearchLoading: true });
  bus.publish({ activeOverlayKey: 'search' });
});

// Deferrable: next frame
requestAnimationFrame(() => {
  bus.batch(() => {
    bus.publish({ activeOperationLane: 'lane_a_ack', isMapActivationDeferred: true });
  });
});
```

The essential publishes trigger only the overlay switch and search bar — the components the user sees immediately. The map and results trees don't re-render until the next frame, by which point the overlay switch is already painted.

**Files:**
- `apps/mobile/src/screens/Search/hooks/use-search-submit.ts` (submitUiLanes, runBestHere)
- `apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts` (batch API)
- `apps/mobile/src/screens/Search/index.tsx` (shortcut activation handler)

**Exit gate:** `pre_response_activation` stall drops below 100ms. Component commit count during pre-response window drops from 16+ to ≤6.

---

### Phase 8: Reduce Bridge Serialization Cost for Map Updates

**Goal:** Minimize the cost of sending GeoJSON to Mapbox's native layer, which currently does full `JSON.stringify` on every ShapeSource `shape` prop update.

**Problem in detail:**

`@rnmapbox/maps` ShapeSource serialization path:
1. JS: `JSON.stringify(featureCollection)` — O(n) where n = total properties across all features
2. Bridge: send string to native
3. Native (iOS): `try parse(shape)` — parse JSON back to objects
4. Native: `style.updateGeoJSONSource(withId:, geoJSON:)` — replace entire source

There are **9 ShapeSources** in SearchMap. Several receive duplicate data:
- `DOT_SOURCE_ID` + `DOT_INTERACTION_SOURCE_ID` both receive `dotRestaurantFeatures` (~229 features)
- `STYLE_PINS_SOURCE_ID` + `PIN_INTERACTION_SOURCE_ID` + `RESTAURANT_LABEL_COLLISION_SOURCE_ID` all receive `stylePinFeaturesWithTransitions` (~30 features)

When the canonical UX shows all markers at once, 5-7 sources update simultaneously. Estimated bridge cost: **5-15ms** per map update, purely from serialization.

**Solution: Strip properties + deduplicate interaction sources + stagger updates across frames**

Three changes, implemented together:

**1. Strip feature properties to only what each source's layers consume:**

Audit each ShapeSource's SymbolLayer/CircleLayer `style` expressions to determine which feature properties they reference. Build source-specific feature collections with only the required properties:

```typescript
// Dot features only need: id, geometry, color, rank, restaurantId (for symbol layer + hit test)
// They don't need: pinTransitionScale, pinTransitionOpacity, lodZ, etc.
const dotOnlyProperties = ['id', 'color', 'rank', 'restaurantId'];

const lightDotFeatures = React.useMemo(() => ({
  type: 'FeatureCollection',
  features: fullFeatures.features.map(f => ({
    type: 'Feature',
    id: f.id,
    geometry: f.geometry,
    properties: pick(f.properties, dotOnlyProperties),
  })),
}), [fullFeatures]);
```

Fewer properties per feature = smaller JSON string = faster `JSON.stringify` + bridge transfer + native `JSON.parse`.

**2. Deduplicate interaction source data:**

The interaction sources (`DOT_INTERACTION_SOURCE_ID`, `PIN_INTERACTION_SOURCE_ID`, `LABEL_INTERACTION_SOURCE_ID`) exist for hit-testing. They receive the same full feature data as their visual counterparts but only need `id` + `geometry` for hit detection:

```typescript
// Current: interaction source receives full feature data
<MapboxGL.ShapeSource id={DOT_INTERACTION_SOURCE_ID} shape={dotRestaurantFeatures}>
  <MapboxGL.CircleLayer ... />
</MapboxGL.ShapeSource>

// After: interaction source receives minimal features (id + geometry only)
const dotInteractionFeatures = React.useMemo(() => {
  if (dotRestaurantFeatures === prevDotFeaturesRef.current) {
    return prevDotInteractionRef.current; // Same reference if unchanged
  }
  return {
    type: 'FeatureCollection',
    features: dotRestaurantFeatures.features.map(f => ({
      type: 'Feature',
      id: f.id,
      geometry: f.geometry,
      properties: { id: f.properties.id }, // Minimal — just enough for hit test
    })),
  };
}, [dotRestaurantFeatures]);
```

Stripping properties from interaction sources reduces serialization size by ~60-70% for those sources. With 229 dot features × 10+ properties each, this saves significant serialization time.

**3. Stagger ShapeSource updates across frames:**

Instead of updating all 7 sources in one frame, stagger them:

```typescript
// Frame 1: Update dots (visual + interaction) — highest visual impact
setDotFeatures(newDotFeatures);

// Frame 2: Update pins (visual + interaction + collision)
requestAnimationFrame(() => {
  setPinFeatures(newPinFeatures);
});

// Frame 3: Update labels
requestAnimationFrame(() => {
  setLabelFeatures(newLabelFeatures);
});
```

Each frame serializes 2-3 sources instead of 7. Per-frame bridge cost drops from 15ms to ~5ms. The visual stagger is 2 frames (~33ms) which is imperceptible.

This aligns with the canonical UX — dots and pins can appear on the same frame (frames 1-2), with labels following immediately (frame 3).

**Files:**
- `apps/mobile/src/screens/Search/components/search-map.tsx` (ShapeSource usage, feature construction)
- `apps/mobile/src/screens/Search/hooks/use-map-marker-engine.ts` (feature property generation)

**Exit gate:** Total bridge serialization time for a full map update (all sources) drops below 8ms. Measured by adding `performance.now()` around the render that triggers ShapeSource updates.

---

### Phase 9: Align Implementation With Canonical UX Sequence

**Goal:** Reorder the search flow to match the canonical UX sequence defined in this plan, and introduce a dual-mode transition system that skips animation on initial search commit while preserving animated LOD transitions for post-search viewport pans.

**Problem in detail:**

The current implementation has two categories of issues:

**A. Ordering issues vs the canonical UX:**

1. **Current:** Dots appear first, then transition into pins over 300ms. **Canonical:** Dots and pins appear together in final form.
2. **Current:** Nav slide and sheet slide may be sequenced or gated behind frame budget. **Canonical:** They are concurrent.
3. **Current:** Markers may appear before slide animations complete. **Canonical:** Markers wait for slide to finish.
4. **Current:** Cards ramp progressively. **Canonical:** All 20 first-page cards appear at once after markers.

**B. The transition system makes no distinction between initial commit and LOD change:**

The pin transition controller (`usePinTransitionController`) treats every new pin identically — whether it's appearing for the first time on search results or being promoted because the user panned the map. Every new pin enters `promoteStartedAtByMarkerKey` and triggers a 300ms `requestAnimationFrame` loop that rebuilds ALL pin features per-frame (18 frames × full feature rebuild). This is the single most expensive stall source during initial search.

The transition system handles two fundamentally different scenarios:

```
Scenario A — Initial search commit:
  - 30 pins appear for the first time
  - All 30 enter promoteStartedAtByMarkerKey simultaneously
  - 18 rAF frames fire, each rebuilding all 30 pin features
  - Cost: ~18 frames × 5-8ms = 90-144ms of JS stalls
  - User sees: dots pop in, then pins grow/fade in over 300ms
  - This animation adds NO value — the user has never seen these as dots

Scenario B — Viewport pan LOD change:
  - User pans map, 2-3 restaurants cross LOD rank threshold
  - 2-3 new pins enter promoteStartedAtByMarkerKey
  - 2-3 old pins enter demoteFeatureByMarkerKey
  - 18 rAF frames fire, but only 2-3 features are actively transitioning
  - Cost: ~18 frames × 1-2ms = 18-36ms of JS stalls
  - User sees: smooth promote/demote of individual pins
  - This animation IS valuable — the user is watching the map and expects continuity
```

**Solution: Dual-mode transition system + canonical handoff coordinator**

#### Part 1: Dual-Mode Transition Controller

Add an `isInitialCommit` flag to the pin transition controller that distinguishes first-render pins from LOD-change pins:

```typescript
// In usePinTransitionController:
const isInitialCommitRef = useRef(true);

// When new pinned restaurants are detected:
const onPinnedSetChanged = (nextPinnedFeatures: Map<string, Feature>) => {
  if (isInitialCommitRef.current) {
    // MODE 1: INITIAL COMMIT — skip animation entirely
    // Set all pins directly to steady state
    for (const [key, feature] of nextPinnedFeatures) {
      feature.properties.pinTransitionActive = 0;   // steady (not animating)
      feature.properties.pinTransitionScale = 1;     // full size
      feature.properties.pinTransitionOpacity = 1;   // fully opaque
      feature.properties.pinRankOpacity = 1;         // rank number visible
      feature.properties.pinLabelOpacity = 1;        // label visible
    }
    isInitialCommitRef.current = false;
    // Do NOT add entries to promoteStartedAtByMarkerKey
    // Do NOT start the requestAnimationFrame loop
    // Do NOT populate pendingPromoteDelayByMarkerKey (no stagger)
    return;
  }

  // MODE 2: LOD CHANGE — animate as today (existing logic unchanged)
  for (const [key, feature] of nextPinnedFeatures) {
    if (!previousPinnedFeatures.has(key)) {
      promoteStartedAtByMarkerKey.set(key, getNowMs());
    }
  }
  for (const [key, feature] of previousPinnedFeatures) {
    if (!nextPinnedFeatures.has(key)) {
      demoteFeatureByMarkerKey.set(key, { startedAtMs: getNowMs(), feature });
    }
  }
  if (promoteStartedAtByMarkerKey.size > 0 || demoteFeatureByMarkerKey.size > 0) {
    startAnimationLoop(); // existing rAF loop
  }
};
```

The flag resets to `true` whenever `searchRequestIdentity` changes (new search):

```typescript
useEffect(() => {
  isInitialCommitRef.current = true;
}, [searchRequestIdentity]);
```

**What this preserves (LOD change mode):**
- `promoteStartedAtByMarkerKey` / `demoteFeatureByMarkerKey` maps — unchanged
- `getPinTransitionVisual()` function — unchanged (scale 0.48→1.0, opacity 0→1, easeOutQuart)
- `pinTransitionClockMs` state + `requestAnimationFrame` loop — unchanged
- Steady vs transition layer filters (`pinTransitionActive === 0` vs `=== 1`) — unchanged
- `hiddenDotRestaurantIdList` hiding dots during transitions — unchanged
- `DOT_TO_PIN_TRANSITION_DURATION_MS` (300ms) — unchanged
- `demoteFeatureByMarkerKey` for reverse animations — unchanged
- Temporal hysteresis in `buildMarkerRenderModel` (`stableMsMoving`, `stableMsIdle`) — unchanged

**What this removes (initial commit mode only):**
- `pendingPromoteDelayByMarkerKey` stagger system for initial reveals (no staggered appearance)
- `MARKER_REVEAL_CHUNK` / `MARKER_REVEAL_STAGGER_MS` constants
- The staged publish mode (`SEARCH_MAP_STAGED_PUBLISH_MODE`) — dots and pins render together on initial commit
- 18 rAF frames of feature rebuilds on initial search (the primary stall source)

**What is NOT removed:**
- The transition animation infrastructure stays fully intact for post-search LOD changes
- `getPinTransitionVisual()`, the rAF loop, the promote/demote maps, the steady/transition layer filters — all preserved
- The 180-layer pin stack, label sticky placement, z-ordering via `lodZ` — all preserved

#### Part 2: Canonical Handoff Coordinator

The `RunOneHandoffCoordinator` currently manages phases: `idle → h1_phase_a_committed → h2_marker_reveal → h3_hydration_ramp → h4_chrome_resume`. Replace with:

```
idle
  → s1_overlay_switch        (sheet switches to results, loading cover on, query populates)
  → s2_slide_transition      (nav slides down + sheet slides up, concurrent)
  → s3_await_response        (waiting for API, slide may still be animating)
  → s4_marker_commit         (dots + steady pins appear simultaneously via initial-commit mode)
  → s5_cards_commit          (20 cards appear in single render)
  → settled
```

**S1 → S2: Overlay switch and slide (immediate on tap)**

```typescript
// On shortcut tap:
// 1. Switch overlay to results page with loading cover
bus.batch(() => {
  bus.publish({ activeOverlayKey: 'search', isSearchLoading: true });
  bus.publish({ submittedQuery: query, submittedLabel: label });
});

// 2. Start concurrent animations (same frame)
// Both use Reanimated native driver — zero JS thread cost during animation
runOnUI(() => {
  navBarTranslateY.value = withTiming(NAV_HIDDEN_Y, { duration: 280 });
  sheetTranslateY.value = withTiming(SHEET_MIDDLE_Y, { duration: 280 });
})();
```

Verify both animations use `runOnUI` worklets so they execute entirely on the UI thread with no JS thread callbacks during animation.

**S3: Await response (no JS work)**

While the API request is in flight and animations are running, the JS thread should be idle. No bus publishes, no re-renders. The loading cover is visible.

Gate: if the API response arrives before the slide animation completes, buffer the response and don't process it until the animation finishes:

```typescript
const slideCompleteRef = React.useRef(false);
const bufferedResponseRef = React.useRef(null);

// Animation completion callback (via runOnJS):
const onSlideComplete = () => {
  slideCompleteRef.current = true;
  if (bufferedResponseRef.current) {
    processSearchResponse(bufferedResponseRef.current);
    bufferedResponseRef.current = null;
  }
};

// Response handler:
const handleResponse = (response) => {
  if (!slideCompleteRef.current) {
    bufferedResponseRef.current = response; // Buffer until slide done
    return;
  }
  processSearchResponse(response);
};
```

**S4: Marker commit (after slide + response)**

Because `isInitialCommitRef.current === true`, the transition controller skips animation. Dots and pins appear in their final steady state on the same frame:

```typescript
// Pre-compute all marker features (Phase 1 worker or deferred RAF)
const { dotFeatures, pinFeatures, labelFeatures } = precomputedMarkers;

// All pin features have pinTransitionActive=0, full scale/opacity (set by initial-commit mode)
// hiddenDotRestaurantIdList is pre-computed from the pinned set

// Commit all at once (or staggered across 2-3 frames per Phase 8):
bus.batch(() => {
  bus.publish({
    precomputedDotFeatures: dotFeatures,
    precomputedPinFeatures: pinFeatures,
    precomputedLabelFeatures: labelFeatures,
    isSearchLoading: false,
  });
});

// isInitialCommitRef flips to false after this commit.
// Any subsequent LOD changes from viewport panning will use animated mode.
```

**S5: Cards commit (after markers)**

```typescript
// After marker commit settles (1-2 frames), commit the list:
requestAnimationFrame(() => {
  bus.publish({
    hydratedResultsKey: resultsHydrationKey, // Unlock all rows
    isResultsHydrationSettled: true,
  });
});
```

**Files:**
- `apps/mobile/src/screens/Search/components/search-map.tsx` (dual-mode transition controller, remove stagger system, remove staged publish for initial commit)
- `apps/mobile/src/screens/Search/runtime/map/use-shortcut-coverage-owner.ts` (handoff phases → canonical sequence)
- `apps/mobile/src/screens/Search/hooks/use-search-submit.ts` (response buffering, slide gating)
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx` (pass isInitialCommit signal)
- `apps/mobile/src/screens/Search/index.tsx` (animation coordination, slide completion callback)
- `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx` (simplify hydration commit)
- `apps/mobile/src/screens/Search/utils/map-render-model.ts` (no changes — LOD logic stays intact)

**Exit gate:** Harness shows canonical sequence: overlay switch → concurrent slides → markers appear (dots+pins together, steady state, no rAF loop) → cards appear. Post-search viewport panning still triggers animated promote/demote transitions. Total settle time <1s for warm runs. Zero rAF frames during initial marker commit.

---

## Architecture Target State

After all phases, the search flow looks like:

```
API Response (async)
  │
  ├─► Bus.publish({ results, precomputedMarkerGeoJSON })
  │     │
  │     ├─► SearchMap (direct subscription, 1 render)
  │     │     └─ 180-layer pin stack (PRESERVED — UX critical)
  │     │     └─ Dirty-tracked feature updates (only changed pins rebuilt)
  │     │     └─ Reduced-frequency transition updates (~20Hz not 60Hz)
  │     │     └─ Label geometry memoized separately from transition visuals
  │     │
  │     ├─► SearchResultsList (direct subscription, 1 render)
  │     │     └─ FlashList with all rows (native virtualization)
  │     │     └─ Pre-computed item heights (no sync measurement)
  │     │
  │     └─► SearchScreen (overlay/chrome only, 1 render)
  │           └─ Search bar, suggestion surface, overlays
  │
  └─► Worker thread (marker computation, if not pre-computed)
        └─ Results → Catalog → LOD → GeoJSON → postMessage back
```

**Per-search JS thread budget:**

| Work Item | Current Cost | Target Cost |
|-----------|-------------|-------------|
| Bus publish + notify | 1-2ms | 1-2ms (unchanged) |
| SearchMap render | 15-25ms | **<3ms** (no marker computation) |
| Pin transition frames | 36-144ms total | **<10ms** (dirty tracking + 20Hz coalescing) |
| SearchResultsList render | 30-80ms total | **<5ms** (single render, no ramp) |
| SearchScreen render | 5-10ms | **<2ms** (no data flow) |
| Mapbox layer updates | 1-3ms/frame | **<1ms** (same 180 layers, fewer feature rebuilds) |
| **Total per search** | **~100-270ms** | **~15-25ms** |

---

## Measurement & Validation

### Harness Metrics to Track

For each phase, run the shortcut-loop harness (3 runs) and compare:

1. **Stall ceiling:** `stallLongestMs` per run (target: <50ms)
2. **FPS floor:** `floorFps` per run (target: >50)
3. **Settle time:** `durationMs` per run (target: <1s for runs 2-3)
4. **Scheduler yields:** `schedulerYieldCount` (target: <5)
5. **Stage attribution:** Which stages still appear in stall windows
6. **Component attribution:** Which components show in `windowOwnerTopComponents`

### Promotion Gates

Each phase must demonstrate:
- No regression in settle status (all runs must settle)
- Directional improvement in worst stall
- No new stall stages introduced
- UI thread remains clean (uiStallP95 = 0)

### Rollback Strategy

Each phase is independently revertable:
- Phase 0: Revert selector changes
- Phase 1: Move marker computation back to inline useMemo chain
- Phase 2: Revert to 60Hz rAF transition loop
- Phase 3: Revert to prop-passing through SearchScreen, remove bus context
- Phase 4: Revert to full feature rebuilds (remove dirty tracking, partitioning, coalescing, label memoization)
- Phase 5: Restore hydration ramp and remove overrideItemLayout
- Phase 6: Revert render key to include request identity
- Phase 7: Unwrap batch() calls, remove RAF deferrals
- Phase 8: Revert to full-property ShapeSources, remove staggering, restore duplicate interaction data
- Phase 9: Revert to current handoff coordinator phases, remove dual-mode flag, restore initial-commit animation

---

## Phase Ordering & Dependencies

```
Phase 0 (revert regression)
  │
  ├─► Phase 1 (marker off render path) ─── independent
  ├─► Phase 2 (transition rebuilds) ─────── independent
  ├─► Phase 5 (hydration ramp) ──────────── independent
  ├─► Phase 7 (pre-response stall) ──────── independent
  │
  └─► Phase 3 (bus cascade) ─────────────── depends on Phase 1
  │     │                                    (SearchMap needs direct
  │     │                                     bus subscription for
  │     │                                     pre-computed markers)
  │     │
  │     └─► Phase 4 (pin feed cost) ────── depends on Phase 2
  │           │                              (dirty tracking benefits
  │           │                               from reduced transition
  │           │                               frequency)
  │           │
  │           └─► Phase 6 (label bootstrap)─ depends on Phase 4
  │                                           (stable render keys
  │                                            compound with fewer
  │                                            feature rebuilds)
  │
  └─► Phase 8 (bridge serialization) ────── depends on Phase 1
        │                                    (deduplicated sources need
        │                                     pre-computed marker data
        │                                     to strip properties correctly)
        │
        └─► Phase 9 (canonical UX) ──────── depends on Phase 7 + 8
                                              (canonical sequence requires
                                               batched publishes from P7
                                               and staggered sources from P8
                                               to meet frame budget during
                                               marker commit)
```

**Recommended execution order:** 0 → 7 → 1 → 5 → 2 → 3 → 8 → 4 → 6 → 9

Phase 7 (pre-response stall) is independent and yields immediate gains — do it first since batch() is foundational for later phases. Phases 1, 2, and 5 are independent and can be parallelized. Phase 3 benefits from Phase 1's pre-computed markers. Phase 8 depends on Phase 1's marker pre-computation to strip properties correctly. Phase 4 benefits from Phase 2's reduced transition frequency. Phase 6 is a polish step after feature rebuilds are minimized. Phase 9 is the capstone — it rewrites the handoff coordinator to implement the canonical UX sequence, requiring the batched publishes (P7), staggered sources (P8), and deferred markers (P1) to all be in place.

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 0 | Low | Only changes selector equality functions |
| 1 | Low | Moving useMemo chain to response handler is a straightforward code move; no new dependencies |
| 2 | Low | 10Hz interval is visually indistinguishable from 60Hz rAF for pin scale animations |
| 3 | Medium — large refactor of data flow | Incremental: start with SearchMap direct subscription, then SearchResultsSheetTree, then reduce SearchScreen selectors. Validate each step with harness. |
| 4 | Low | All four parts are additive changes to feature construction; layer stack, z-order, labels untouched |
| 5 | Low | FlashList already virtualizes; ramp was duplicating built-in behavior |
| 6 | Low | Only affects when remount occurs, not visual output |
| 7 | Low | batch() already exists in bus API; RAF deferral is safe and additive |
| 8 | Medium — stripping properties may break layer expressions | Audit each SymbolLayer's `style` prop to confirm which properties are consumed before stripping |
| 9 | Medium — handoff coordinator rewrite | The dual-mode flag is additive (single boolean). Implement new coordinator behind a feature flag, keep old coordinator as fallback until harness confirms. |

---

## Open Questions

All questions resolved. No remaining blockers.

## Resolved Questions

1. **~~Native Mapbox transitions for Phase 2:~~** `iconSizeTransition` does not exist — `icon-size` is a layout property, and Mapbox transitions only apply to paint properties. However, `iconOpacityTransition` and `textOpacityTransition` are available. Phase 2 now uses a hybrid approach: native GL-thread opacity transitions + 10Hz JS-driven scale updates.

2. **~~Per-source property audit for Phase 8:~~** Complete audit performed. See "ShapeSource Property Map" appendix below. Key wins: collision source can strip ALL properties (geometry only), dot interaction source strips to `restaurantId` only (229 features), pin interaction source strips to `lodZ` + `pinTransitionActive` only.

3. **~~Reanimated `withTiming` completion callback for Phase 9:~~** Pattern is fully proven in this codebase (Reanimated 4.1.0). The exact `withTiming(value, config, (finished) => { runOnJS(callback)() })` pattern is actively used in 5+ production components: `use-transition-driver.ts`, `price-range-slider.tsx`, `useOverlayHeaderActionProgress.ts`, `BottomSheetWithFlashList.tsx`. Best practice: always check `finished`, use ID tracking for deduplication.

---

## Appendix: ShapeSource Property Map (Phase 8 Reference)

Required feature properties per ShapeSource, based on audit of all SymbolLayer/CircleLayer style expressions in `search-map.tsx`:

| ShapeSource | Source ID String | Feature Count | Required Properties | Strip Target |
|---|---|---|---|---|
| `DOT_SOURCE_ID` | `restaurant-dot-source` | ~229 | `restaurantId`, `pinColor`, `pinColorLocal`, `pinColorGlobal` | Strip all others |
| `DOT_INTERACTION_SOURCE_ID` | `restaurant-dot-interaction-source` | ~229 | `restaurantId` | Strip all others (biggest win — 229 features × ~10 unused props) |
| `STYLE_PINS_SOURCE_ID` | `restaurant-style-pins-source` | ~30 | `lodZ`, `pinTransitionActive`, `pinTransitionScale`, `pinTransitionOpacity`, `pinRankOpacity`, `pinLabelOpacity`, `rank` | Strip all others |
| `PIN_INTERACTION_SOURCE_ID` | `restaurant-pin-interaction-source` | ~30 | `lodZ`, `pinTransitionActive` | Strip all others (5 unused transition props per feature) |
| `RESTAURANT_LABEL_SOURCE_ID` | `restaurant-source` | ~120 | `labelCandidate`, `labelOrder`, `rank`, `markerKey` | Strip all others |
| `LABEL_INTERACTION_SOURCE_ID` | `restaurant-label-interaction-source` | ~120 | `labelCandidate` | Strip all others |
| `RESTAURANT_LABEL_COLLISION_SOURCE_ID` | `restaurant-label-collision-source` | ~30 | **NONE** (geometry only) | Strip ALL properties |
| `OVERLAY_Z_ANCHOR_SOURCE_ID` | `search-overlay-z-anchor-source` | 0 | N/A (empty features) | N/A |

---

## References

- Pre-refactor baseline: `plans/perf-baselines/perf-shortcut-live-baseline.json`
- Post-refactor harness: `/tmp/expo-metro-shortcut-loop-20260219T172517Z-0559.log`
- Previous optimization plan (superseded): this file's git history
- Shortcut submit architecture: `plans/shortcut-submit-architecture-refactor-plan.md`
- Stall investigation log: `plans/shortcut-submit-investigation-log.md`
