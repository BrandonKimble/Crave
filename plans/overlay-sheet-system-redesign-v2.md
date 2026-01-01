# Overlay Sheet System Redesign Plan v2

## Decision Summary

- Do not restart from scratch yet. The custom UI-thread sheet core is close to the right shape; the remaining issues are JS-thread churn and a few layering/measurement bugs.
- Focus on targeted changes that eliminate JS work during sheet motion, isolate the map from overlay re-renders, and fix the frosted toggle cutouts.
- Only consider a library switch if we still cannot keep JS >= 50fps after the isolation + refactor steps below.

## Constraints (Confirmed)

- Keep blur layer for header and toggle areas (frosted effect stays).
- Keep toggle strip scrollable.
- Marker pins must remain Mapbox `MarkerView` (no SymbolLayer/ShapeSource for pins).
- Preserve continuous swipe from middle to top with smooth handoff into list scroll.
- Map must remain interactive (do not freeze or throttle FPS).

## Current Implementation Gaps vs v1 Plan

1. JS state updates still fire on drag/snap transitions.

   - `apps/mobile/src/overlays/BottomSheetWithFlashList.tsx` runs `runOnJS` for drag/settle state changes.
   - `apps/mobile/src/screens/Search/index.tsx` updates React state for `isResultsSheetDragging` and `isResultsSheetSettling`.
   - Effect: full Search screen re-render at the exact moment the spring starts, which is when JS FPS drops during flicks.

2. Map processing still runs frequently when not interacting.

   - `apps/mobile/src/screens/Search/index.tsx` `handleCameraChanged` sets timers and persists state for every camera event.
   - Effect: high-frequency JS work whenever the map moves; with MarkerViews in play, this can still starve JS even if UI is ~60.

3. Per-row measurement work is still queued on JS.

   - `apps/mobile/src/screens/Search/components/restaurant-result-card.tsx` uses `useTopFoodMeasurement`.
   - `apps/mobile/src/screens/Search/hooks/use-top-food-measurement.ts` batches layout measurements with `setTimeout`.
   - Effect: when the sheet settles, measurement work can run immediately, stealing JS time during snap/settle transitions.

4. Frosted toggle cutouts are still visually wrong (light gray).

   - `apps/mobile/src/screens/Search/components/SearchFilters.tsx` uses a masked `whiteFill`.
   - `apps/mobile/src/screens/Search/index.tsx` `resultsListBackground` can still sit behind the header when top offsets are zero.
   - Effect: blur is washed out by white underlay or by the mask fill.

5. One overlay still uses a non-core sheet implementation.
   - `apps/mobile/src/overlays/SecondaryBottomSheet.tsx` (used by `apps/mobile/src/overlays/PollCreationSheet.tsx`).
   - Effect: inconsistent animation stack and potential UI-thread work outside the shared core.

## V2 Strategy

### Phase 0: Measure and Isolate (No Behavior Changes)

- Baseline scenarios:
  - Rapid flick from middle -> expanded -> middle.
  - Drag + release while the list is mid-scroll.
  - Map pan after results appear (no sheet movement).
- Instrumentation:
  - RN Perf Monitor (UI/JS FPS).
  - Hermes profiling to identify hot functions on release.
  - React DevTools “Highlight updates” to catch re-renders during drag.
- Quick isolation toggles (temporary, not shippable):
  - Render placeholder rows instead of real cards.
  - Disable top-food measurement block.
  - Hide markers (still keep map interactive).
  - Disable blur layer (to confirm it is not the JS bottleneck).

### Phase 1: Eliminate JS Work During Sheet Motion

- Goal: zero React state updates while the sheet is dragging or settling.
- Changes:
  - In `apps/mobile/src/overlays/BottomSheetWithFlashList.tsx`, stop calling `runOnJS` for drag/settle state changes. Keep drag/settle as shared values.
  - In `apps/mobile/src/screens/Search/index.tsx`, remove `setIsResultsSheetDragging` and `setIsResultsSheetSettling` from drag callbacks. Keep only ref updates (`searchInteractionRef`).
  - Move any UI that depends on drag/settle (e.g., search chrome visibility) to use shared values or a small isolated component that reads from a ref or UI-thread value.
  - Keep `onSnapChange` JS notification only after the spring completes (already true).

### Phase 2: List and Row Optimization (JS Budget)

- Goal: no heavy work during settle, and minimal JS on fling.
- Changes:
  - Freeze complex row subtrees while `isInteracting` is true (render cached or reduced content).
  - In `apps/mobile/src/screens/Search/components/restaurant-result-card.tsx`, move top-food measurement to an idle-only pipeline:
    - Use cached widths when `isInteracting` or `isSettling`.
    - Only measure when idle and stable for N frames (e.g., 200-300ms after settle).
  - In `apps/mobile/src/screens/Search/hooks/use-top-food-measurement.ts`, replace `setTimeout`-based retry with an explicit “idle gate” driven by the shared interaction flag.
  - Tighten FlashList tuning:
    - Confirm `estimatedItemSize`, `overrideItemLayout`, and `getItemType` are stable.
    - Reduce `drawDistance` and `maxToRenderPerBatch` if it lowers JS load without visible pop-in.
    - Keep `renderItem` and `keyExtractor` stable across sheet state changes.

### Phase 3: Map Isolation and Throttling (JS + Map Responsiveness)

- Goal: map remains smooth and is not affected by sheet flicks.
- Changes:
  - Isolate `SearchMap` into a memoized child that only re-renders on map-specific props.
    - Add a custom `React.memo` equality to ignore unrelated props.
  - In `apps/mobile/src/screens/Search/index.tsx`, throttle `handleCameraChanged`:
    - Process bounds and persistence only on `onMapIdle` or at a low frequency.
    - Skip heavy work if sheet is settling or list is scrolling.
  - Keep MarkerView arrays stable:
    - Ensure `sortedRestaurantMarkers` and `markersRenderKey` only change when results change, not when sheet state changes.
    - Avoid re-mounting all markers unless data changed.

### Phase 4: Frosted Toggle Cutout Fix (Visual + Layering)

- Goal: toggle strip shows true frosted blur, not gray.
- Changes:
  - In `apps/mobile/src/screens/Search/components/SearchFilters.tsx`, replace `whiteFill` with a transparent or frosted fill, or use `MaskedHoleOverlay` with a blur-backed layer.
  - In `apps/mobile/src/screens/Search/index.tsx`, ensure `resultsListBackground` and `resultsWashOverlay` never cover the header/toggle area:
    - Use cached header heights when live measurements are unavailable.
    - Delay rendering the background until valid header heights exist.

### Phase 5: Full Overlay Unification

- Goal: consistent UI-thread animation behavior across all overlays.
- Changes:
  - Migrate `apps/mobile/src/overlays/SecondaryBottomSheet.tsx` to the shared sheet core.
  - Ensure all overlays share the same drag/settle and scroll handoff behavior.

### Phase 6: Validation and Regression Guardrails

- Success metrics:
  - UI FPS ~60 during drag and snap.
  - JS FPS >= 50 during flicks, no drops to 0.
  - Map remains responsive during and after sheet interactions.
  - Continuous swipe handoff still works (middle -> expanded -> list scroll in one gesture).
  - Frosted toggle area is visually correct (blur visible through cutouts).
- Add a perf checklist doc and a “perf smoke test” script for future changes.

## Ideal Implementation Sketch (Target State)

- SheetCore:
  - UI-thread pan + snap, no JS callbacks except after settle or hidden.
  - Shared values for `isDragging` and `isSettling`.
- Search overlay:
  - All interaction flags are ref-based; no full-screen re-renders during drag.
  - List rows render a stable “interaction mode” layout while interacting.
  - Layout measurement and expensive work only after idle.
- Map:
  - Map component isolated and memoized.
  - Camera persistence and bounds updates are throttled and idle-only.

## Recommendation

- Continue with targeted refactors. Switching libraries or restarting is not necessary unless Phase 1-3 fail to restore JS >= 50fps.
- Use Phase 0 instrumentation first so we can prove which subsystem is driving JS drops before we change behavior.
