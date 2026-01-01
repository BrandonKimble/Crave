# Overlay Sheet System Redesign Plan v3 (Post-Hermes Trace)

## Key Evidence
- Hermes trace captured during swipes shows heavy React reconciliation:
  - `completeRoot`, `completeWork`, `diffProperties`, `createNode` dominate JS time.
  - This means **React renders are happening during sheet motion**, not just UI-thread animations.
- React Profiler logs during swipes show repeated commits in:
  - `SearchResultsSheet` (30–70ms)
  - `SearchMap` (~30ms)
  - Both occur while `drag=true` / `settle=true`.
- Conclusion: the next focus is **eliminating React commits during interactions** and **isolating which subtree is re-rendering**.

## Immediate Action (Instrumentation First)
1) Add dev-only React Profiler wrappers around the heaviest subtrees:
   - `SearchMap`
   - `SearchResultsSheet`
2) Log only when `searchInteractionRef.current.isInteracting` and when commit time exceeds a threshold.
3) Reproduce flicks and note which profiler IDs log commits.

## Decision Pivot (What This Changes)
- Phase 2 from v2 is still valid, but we must **prove which subtree is committing** first.
- If commits are isolated to the results sheet, prioritize list/row freezing.
- If commits are isolated to the map, prioritize map memoization + prop stability.
- If commits are happening at the root, track the specific state updates causing it.

## Targeted Follow-Up Plan

### Phase A: Identify the Commit Source (Done)
- Logs show both ResultsSheet and SearchMap commit during swipes.
- Move directly to Phase B + Phase C in parallel.

### Phase B: Results Sheet + List Isolation (Likely)
- Freeze heavy row subtrees during `isInteracting`:
  - Render cached or reduced content while dragging/settling.
  - Only re-enable full rows when idle for N ms.
- Memoize `RestaurantResultCard` and `DishResultCard` with stable props.
- Ensure `renderItem`, `ListHeaderComponent`, `ListFooterComponent`, and `extraData` are stable.
- Keep all measurement work idle-only (already partially done with `useTopFoodMeasurement`).

### Phase C: SearchMap Isolation
- Memoize `SearchMap` with a custom equality function:
  - Ignore props unrelated to map rendering.
  - Ensure marker arrays and label styles are stable across sheet motion.
- Gate `handleCameraChanged` work to idle or map gestures only.
- Cancel any pending map update timeouts when the sheet starts dragging or settling.

### Phase D: Root-Level State Churn
- Add temporary logs for state changes while `isInteracting`:
  - `sheetState`, `panelVisible`, `filtersHeaderHeight`, `resultsSheetHeaderHeight`
  - `mapMovedSinceSearch`, `pollBounds`, `isFilterTogglePending`
- Convert any interaction-driven state to refs or UI-thread values.
- Move layout-driven updates to idle-only (InteractionManager / timeout gates).

## Success Criteria
- No profiler logs during swipes (or only tiny commits < 3–5ms).
- JS FPS remains >= 50 during flicks.
- UI stays smooth; map remains responsive.
