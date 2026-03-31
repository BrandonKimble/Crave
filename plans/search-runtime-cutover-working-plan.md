# Search Runtime Cutover Working Plan

Last updated: 2026-03-28
Status: active
Scope: `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

## Objective

Reduce search submit/dismiss JS stalls by cutting root-owned cross-domain coupling slice-by-slice while preserving current UX behavior.

## Ground Rules

- Keep UX parity unless a behavior change is explicitly chosen.
- Prefer ownership cutover over compatibility layering.
- Delete legacy root intermediaries in the same slice that replaces them.
- Validate each slice before moving on.

## Target Shape

- `SearchScreen` becomes a shell.
- Results, chrome, map, nav, and profile become independent commit boundaries.
- Submit/dismiss orchestration writes into narrow domain owners instead of forcing a root-wide React commit.
- Marker derivation moves off the render path where possible.

## Slice Order

1. Results domain isolation
2. Dismiss stabilization during active motion
3. Chrome domain isolation
4. Map domain isolation
5. Marker pipeline render-path reduction
6. Nav/profile cleanup

## Completed Slices

### R1: Results sheet visual context extraction

Goal:

- Stop prop-drilling the sheet-motion visual cluster through `SearchScreen -> SearchResultsSheetTree`.
- Move sheet translate/scroll/momentum/cutout visuals behind a narrow context local to the results path.

Why this slice first:

- It is low-risk and does not change the existing bundled-props results architecture.
- It reduces one high-churn prop cluster without touching behavior-heavy overlay resolution.
- It creates a reusable boundary for later results-domain extraction.

Exit gate:

- `SearchResultsSheetTree` reads sheet-motion visuals from context.
- The root no longer passes those visual props directly to `SearchResultsSheetTree`.
- Touched files validate against the current mobile baseline.

Delete gate:

- Remove the direct sheet visual props from the results tree call site and prop type.

Status:

- Completed and validated on 2026-03-28.

### R2a: Localize bus/store-owned results inputs

Goal:

- Stop passing runtime-bus and overlay-store-owned values from the root into the results domain.
- Let the results and overlay-resolution hooks read bus/store state directly where they already own the behavior.

What changed:

- `useSearchResultsPanelSpec` now reads the runtime bus from context and the active overlay from `overlayStore`.
- `useSearchOverlaySheetResolution` now derives root/active overlay state internally instead of receiving root-owned booleans.
- `useSearchOverlayPanels` no longer accepts overlay-store-owned flags that can be derived locally.

Exit gate:

- Root no longer passes runtime bus or overlay-store-derived booleans into these results/overlay hooks.
- Touched files validate against the current mobile baseline.

Delete gate:

- Remove the legacy root-owned hook arguments in the same promotion.

Status:

- Completed and validated on 2026-03-28.

### R2b: Delete the root-owned overlay panels bundle

Goal:

- Remove `searchOverlayPanelsArgs` so the root no longer assembles a single overlay bundle for the results subtree.
- Replace the bundle with explicit ownership edges on `SearchResultsSheetTree`.

Why this slice:

- It deletes one large root memo bundle without changing overlay resolution behavior.
- It keeps the next cut straightforward: the remaining large bundle is now `searchResultsPanelSpecArgs`.

Exit gate:

- `SearchResultsSheetTree` no longer accepts `overlayPanelsArgs`.
- `SearchScreen` no longer builds `searchOverlayPanelsArgs`.
- Existing overlay resolution and close-handoff behavior remain unchanged.

Delete gate:

- Remove the bundle type and the root `useMemo` that assembled it.

Status:

- Completed and validated on 2026-03-28.

### R3: Results panel spec bundle breakup

Goal:

- Break up `searchResultsPanelSpecArgs` so `SearchResultsSheetTree` stops depending on the remaining giant root-owned results bundle.
- Replace bundle fields with narrower ownership edges, starting with values that can move to local reads, dedicated contexts, or direct ownership props.

Likely focus:

- localize any remaining context/store-owned fields
- delete root-owned helper bundles instead of recreating them under new names
- keep results close-handoff and overlay chrome behavior unchanged while shrinking the prop surface

Exit gate:

- `SearchResultsSheetTree` no longer accepts `searchPanelSpecArgs`.
- `SearchScreen` no longer builds `searchResultsPanelSpecArgs`.
- The results subtree still resolves the same results panel and overlay behavior.

Delete gate:

- Remove the root `useMemo` bundle and the bundle prop in the same promotion.

Status:

- Completed and validated on 2026-03-28.

## Current Slice

### D1: Dismiss presentation stabilization

Goal:

- Keep the overlay sheet’s React-owned visual tree stable during active dismiss motion.
- Stop close-time owner swaps and live header/content reconfiguration from competing with the animation.

Likely focus:

- audit `SearchResultsSheetTree` close-handoff branching against `use-search-presentation-controller`
- freeze structural overlay ownership at dismiss start and defer restoration/cleanup until settle
- preserve the current visual handoff while deleting branches that mutate mounted sheet structure mid-close

Exit gate:

- Active dismiss no longer flips the sheet lane to `persistent_poll` before close finalization.
- `SearchResultsSheetTree` freezes the mounted overlay spec/header structure during close.
- Redundant close-only bridge paths are deleted instead of layered on top of the freeze behavior.

Delete gate:

- Remove close-time compatibility branches that only exist to keep a mutated tree alive mid-dismiss.

Status:

- Completed and validated on 2026-03-28.

## Current Slice

### C1: Chrome subtree isolation

Goal:

- Pull the suggestion surface and overlay header freeze/render logic out of `SearchScreen`.
- Make chrome a distinct subtree so root stops staging those visual trees directly.

Likely focus:

- move run-one freeze refs for suggestion/header chrome out of `index.tsx`
- introduce a dedicated chrome tree component or local owner around `SearchSuggestionSurface` and `SearchOverlayHeaderChrome`
- preserve autocomplete, shortcut, and search-this-area behavior while shrinking root-owned render logic

Exit gate:

- `SearchScreen` no longer owns the run-one freeze refs for suggestion/header chrome.
- The overlay chrome subtree renders behind a dedicated component boundary.
- Hidden chrome warmup rendering lives with the chrome subtree instead of inline in the root.

Delete gate:

- Remove the root-owned freeze refs and inline overlay chrome subtree markup in the same promotion.

Status:

- Completed and validated on 2026-03-28.

### M1: Map subtree shell extraction

Goal:

- Move the map-vs-placeholder branch and profiler boundary out of `SearchScreen`.
- Establish a dedicated map subtree shell before deeper map ownership changes.

Exit gate:

- `SearchScreen` no longer directly renders the conditional map/placeholder branch.
- The map subtree lives behind a dedicated shell component without changing marker/runtime behavior.

Delete gate:

- Remove the inline root branch that swapped between `SearchMapWithMarkerEngine` and the placeholder view.

Status:

- Completed and validated on 2026-03-28.

### M2: Map ownership reduction

Goal:

- Start shrinking the root-owned map prop surface after the map subtree shell extraction.
- Identify which map inputs can move behind dedicated owners or local derivation without changing behavior.

Likely focus:

- group map-only render concerns behind the map shell instead of building them in `index.tsx`
- localize any context/store-owned map inputs that do not need to be root-owned
- keep marker runtime behavior identical while shrinking root invalidation pressure

Progress:

- `SearchMapStage` now owns static engine config (`maxFullPins`, LOD timings/buffer, quality-color utility).
- `SearchMapStage` now owns map presentation defaults for `mapZoom` fallback and marker-disable defaulting.
- `SearchMapStage` now owns `styleURL` construction from the Mapbox access token.
- Root map call-site surface is smaller, but live map presentation/callback ownership is still mostly in `index.tsx`.

Status:

- Completed and validated on 2026-03-28.

## Notes

- A short-lived `M3` experiment froze motion-time LOD/label refresh during active camera movement.
- That experiment was reverted on 2026-03-28 because it did not improve the crash/choppiness and it violated the required live-motion behavior for labels/pin LOD.
- The next map-performance cuts must preserve live label and LOD behavior during movement.
- Current active map/runtime work is focused on render-path store ownership: move label/marker source-store construction away from render-time mutable ref mutation and toward whole-store snapshot replacement.
- On 2026-03-28, the label-source path in `use-search-map-label-sources.ts` was cut over from render-time mutable store mutation to builder-based snapshot construction after a crash surfaced as:
  `[SearchMapSourceStore] Incomplete committed feature state for "...::label::bottom" during commit`.
- On 2026-03-28, `use-map-marker-engine.ts` was also cut over so pin/dot/interaction source-store refs are no longer promoted during render; the engine now promotes committed source-store snapshots after render instead of mutating baseline refs mid-render.

## Validation

Always:

- relevant lint/type-check for touched files
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When mode / cutover paths are touched:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`

- This is execution memory, not a speculative redesign doc.
- Update only when the active slice, exit gate, or next cut materially changes.
