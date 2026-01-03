# Performance Playbook (Mobile Overlay + Search)

## Goal

Keep sheet + map interactions smooth (UI ~60fps) and prevent JS stalls during gestures. Target:
- No React commit > 20ms during drag/settle.
- JS stall < 40ms during interactions; short one-off stalls on submit are acceptable but should be explainable.

## Core Principles

- UI thread owns motion: animate via translateY and shared values, not layout changes.
- No React state churn during drag/settle: use refs or shared values for interaction flags.
- Stable props: memoize subtrees, keep renderItem/keyExtractor/header/footer stable.
- Defer heavy work until idle: InteractionManager or idle timers for expensive updates.
- Map isolation: keep map props stable; avoid re-mounting marker arrays unless data changed.
- Keep map layout stable; adjust padding/overlays instead of resizing the map on sheet movement.

## Instrumentation Toolkit

Use these when perf is shaky:

- SearchPerf flags: `apps/mobile/src/screens/Search/search-perf-debug.ts`
  - `logCommitInfo`, `logJsStalls`, `logSearchComputes`, `logSearchStateChanges`, `logSearchResponseTimings`.
  - Isolation toggles: `disableFiltersHeader`, `disableResultsHeader`, `disableSearchShortcuts`, `disableTopFoodMeasurement`, `usePlaceholderRows`.
- React Profiler wrappers (log only above a threshold):
  - `SearchScreen`, `SearchMap`, `SearchMapMarkers`, `SearchResultsSheetTree`, `SearchResultsSheetCore`, overlays.
- Prop change logger: `SearchResultsSheet` logs which props changed per commit.
- JS stall logger: logs stalls with interaction state context.
- Phase timing logs: `[SearchPerf] phase ...` in `use-search-submit.ts` to correlate UI prep with stalls.
- Parse timing logs: enable `debugParse`/`debugLabel` in `useSearchRequests` to log JSON parse cost via `searchService` transformResponse.
- Map event rate logs: `cameraChanged`/`mapIdle` counters to spot event storms.
- Top-food measurement logs: `use-top-food-measurement.ts` logs flush/compute timing.
- Response logging: `EXPO_PUBLIC_SEARCH_LOG_RESPONSE_PAYLOAD` toggles full response payload logs in dev.
- Hermes profiling + React DevTools “Highlight updates” to verify commits during drag.
- Env switches: `EXPO_PUBLIC_SEARCH_PERF_LOGS` (enable perf logs), `EXPO_PUBLIC_SEARCH_LOG_RESPONSE_PAYLOAD` (log full response payloads in dev).

## Baseline Scenarios (Always Measure)

- Search submit: tap Best restaurants.
- Sheet drag + flick (middle <-> expanded).
- Map pan after results appear.
- Sheet snap on navigation changes.

## Diagnostic Flow

1) Check UI vs JS FPS (Perf Monitor).
   - UI FPS low + JS OK => compositing/layout issue.
   - JS FPS low => React/state churn or heavy JS work.
2) Identify the subtree committing via profiler logs.
3) Use prop-change logs to see which props are unstable.
4) Flip perf flags (placeholder rows, disable markers, disable headers/shortcuts, disable top-food measurement) to isolate the culprit. Blur stays on; only de-duplicate overlapping blur layers for the same region.
5) Apply the relevant fix from the patterns below.

## Patterns Applied (Search Case Study)

- Batch state updates with `unstable_batchedUpdates` in `use-search-submit.ts`.
- Memoize overlays while hidden to avoid re-renders.
- Keep map markers stable and append-only during reveal (no mode switching).
- Reveal markers in rank order with a chunked loop; add a small within-chunk fade/scale stagger for a “domino” feel.
- Defer heavy updates with `InteractionManager.runAfterInteractions`.
- Defer UI-only state (tab, sheet, submittedQuery) to the next frame after response to keep the main commit smaller.
- If pre-submit stalls persist, use `deferBestHereUi` to apply UI prep after the response.
- Use stable marker keys (`markersRenderKey`) to avoid re-mounting.
- Show the results sheet with animation (`showPanel`) instead of instant snap.
- Add profiler wrappers and targeted logs to pinpoint hot subtrees.
- Keep the results sheet mounted (no early `return null`); rely on the `visible` prop to avoid mount/unmount spikes.
- Use `flashListProps` + `removeClippedSubviews` for list perf and consistent item layout overrides.
- Log full response payloads only when `EXPO_PUBLIC_SEARCH_LOG_RESPONSE_PAYLOAD` is enabled; otherwise skip response logging.
- Hydrate heavy lists in phases (e.g., show first N items, then fill) to shrink the initial commit.
- Skip layout measurement work while interacting; debounce + flush on idle (see `use-top-food-measurement.ts`).
- Use placeholder overlays (e.g., `MaskedHoleOverlay` with `renderWhenEmpty`) instead of unmounting.

## Standard Overlay Checklist (New Screens)

- Use shared sheet core (`BottomSheetWithFlashList`) and avoid layout animation.
- Do not set React state during drag/settle; use refs/shared values.
- Avoid `runOnJS` during drag; only notify JS after settle.
- Freeze heavy list rows while interacting; resume when idle.
- Blur is non-negotiable: keep all blur layers unless they are duplicated for the same area; de-duplicate overlaps instead of disabling blur.
- Memoize renderItem, headers/footers, and content container styles.
- Keep map-related props stable; isolate map component with a custom memo equality.
- Throttle map cameraChanged work; persist state on mapIdle or low frequency.
- Defer measurement work until idle (InteractionManager or post-settle timer).
- Prefer placeholders over unmounts (e.g., `renderWhenEmpty`) to keep overlays stable.
- While loading, swap heavy header/body for a lightweight background + spinner and disable interactions.

## Single Overlay Shell Approach (Recommended Direction)

- Keep one overlay container mounted across tabs.
- Swap content instantly within the shell; no slide-out between tabs.
- Share sheet state across overlays to preserve perf wins.
- Add a content slot boundary with memoization to avoid re-rendering the shell.

## Metrics and Guardrails

- Commit time < 20ms during drag/settle.
- JS stalls < 40ms during interactions; explain any larger spikes.
- Map marker updates < 20ms per chunk.
- Add a perf smoke test to PRs that touch overlays, lists, or map.

## Where to Look (Search)

- `apps/mobile/src/screens/Search/index.tsx`: map/overlay orchestration, markers, profilers.
- `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`: batching, phase logs.
- `apps/mobile/src/screens/Search/components/search-results-sheet.tsx`: sheet core profiler + prop logs.
- `apps/mobile/src/screens/Search/search-perf-debug.ts`: perf flags.
- `apps/mobile/src/screens/Search/hooks/use-top-food-measurement.ts`: measurement debouncing + logs.
- `apps/mobile/src/hooks/useSearchRequests.ts` and `apps/mobile/src/services/search.ts`: parse timing debug hooks.
- `apps/mobile/src/components/MaskedHoleOverlay.tsx`: placeholder rendering to avoid mount churn.
