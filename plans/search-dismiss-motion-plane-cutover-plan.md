# Search Dismiss / Nav Silhouette Cutover Plan

> MERGED: the dismiss mechanics here are superseded by the resident-data + dormant-layers model in search-map-reveal-dismiss-smooth-cutover-plan.md; the three-authority (SearchSurfaceRuntime / Sheet Motion / NavSilhouette) framing remains useful background.

## Current Diagnosis

The current implementation is better than the first broken state, but it is still an intermediate architecture with too many visual owners.

The main failures are:

- Dismiss can feel slower or hijacked because the Search dismiss motion plane can command the sheet to `collapsed` and write `sheetTranslateY` at boundary.
- Submit and dismiss are not symmetric because the nav silhouette can be driven by one progress source while the sheet is driven by another.
- The nav silhouette is still effectively split between nav translation, frosty material, cutout geometry, sheet exclusion, and bottom-band ownership.
- Search text clearing is split between immediate typed-query clear and later full search-state cleanup, so the visible search display can appear to clear late.
- Redraw is not authoritative enough. Cards, map sources, marker fade-in, marker fade-out, and marker unmount can still be admitted by separate paths.
- Search This Area and toggle redraws can diverge from the active request key, which can leave the loading cover stuck or pins behind.

This plan replaces the old “dismiss motion plane owns sheet Y” idea. That shape was too invasive. The sheet must remain the physical motion source.

## Target Architecture

The final shape has three authorities.

### 1. SearchSurfaceRuntime

Owns page transactions and lifecycle state:

- poll page bundle: poll header + poll body
- results page bundle: result header + toggle strip + cards/body + loading cover
- active redraw transaction
- active dismiss transaction
- frozen outgoing results bundle during dismiss
- atomic boundary handoff from results page to poll page

It does not directly animate sheet Y.

### 2. Sheet Motion Source

The existing bottom sheet/native sheet runtime owns physical Y motion:

- submit/open sheet slide
- dismiss/collapse sheet slide
- gesture/programmatic snap motion
- spring/timing characteristics

Search dismiss must not install a competing sheet animation. It may request the normal sheet snap through the existing route/sheet command path, but it must not write `sheetTranslateY` or run a parallel timing curve that changes the apparent sheet speed.

### 3. NavSilhouetteRuntime Projection

Owns the nav visual projection as one object:

- bottom nav translate
- frosty nav material
- concave/negative shape
- sheet exclusion geometry
- bottom-band ownership
- material sampling semantic

It is a follower of sheet/search-surface state. During submit and dismiss, it derives its progress from the same sheet Y/snap progress that is moving the sheet.

The frosty nav fill samples the map only. The concave illusion composes with the active sheet/page where intended. These are separate semantics inside one silhouette system; they are not separate owners.

The sheet exclusion is part of the nav object. It is not an optional sheet-host policy and not a route-specific override. Sheets consume the nav silhouette projection and respect its exclusion geometry. No sheet host may independently set exclusion to `0`, `static`, or `animated` while the nav silhouette is visible unless that value is the nav projection itself.

The nav silhouette projection must therefore publish:

- `navTranslateY`
- `cutoutGeometry`
- `sheetExclusionHeight`
- `materialSampling: 'map'`
- `activeBottomBandOwner`
- active page relation for the concave illusion

## Required Behavioral Contract

This contract is the product behavior. Source structure only matters insofar as it makes these frames reliable, reversible, interruptible, and performant.

### Idle / Poll

- Persistent poll page is complete: header and body are both present.
- Nav, frost, cutout, and exclusion read as one stable silhouette.
- No clear band below poll header.
- No poll body clipped out by the nav mask.
- Bottom nav is present and stable.
- Search shortcuts are visible/interactive on the home state.
- If the persistent poll sheet is manually dragged down/dismissed, tapping the Search/home tab brings it back with a normal slide-up motion, not a snap.

### Submit / Shortcut / Toggle / Search This Area

On press-up:

- old pins, labels, and dots begin fading out immediately
- old annotation layers unmount after opacity reaches zero
- one redraw transaction starts with the request key that cards and marker sources will both report against
- sheet opens/slides normally
- nav silhouette follows the same motion and exits as one object
- shortcut buttons fade out with the transition and fade back in when returning home/poll
- loading cover stays until both cards and marker sources are ready
- cover removal and fresh marker fade-in start in the same transaction commit

Forbidden:

- cards revealed before pins are ready
- pins fading in before cards reveal
- loading cover stuck after both sides are ready
- stale bounds for Search This Area
- invisible old pins still blocking native map labels

### Results Open

- Results page is indivisible: result header + toggle strip + cards/body + loading cover.
- Toggle strip is not an independent lane.
- No first card in header area.
- No header-only or toggle-only state.

### Dismiss

On close press-up:

- exactly one dismiss transaction starts
- visible search display clears immediately
- outgoing results page freezes as a complete bundle
- pins, labels, and dots begin fading out immediately
- sheet uses normal sheet motion to slide down; it should feel as natural and fast as normal sheet motion
- nav silhouette rises in parallel as a projection of sheet progress
- shortcut buttons prepare to return with the home/poll state and must not pop independently
- no Search-owned writer changes `sheetTranslateY`

Before boundary:

- outgoing results page remains complete
- poll page may be prewarmed, but it is not partially visible
- nav silhouette stays welded to nav/frost/cutout as one projection
- frosty nav fill samples map, not sheet

At boundary:

- result page disappears as one complete page
- poll page appears as one complete page
- nav silhouette ownership switches at the same instant
- no clear body, no strip-only frame, no delayed nav return
- the runtime may arm the handoff with only a small visual-frame tolerance before
  the numeric collapsed Y so the rendered frame at the bottom already shows the
  complete poll page; it must not switch during mid-dismiss travel

After boundary:

- poll page and nav silhouette are stable
- old annotations have faded out and unmounted
- native map labels can return naturally
- shortcut buttons are visible/interactive on home state

### Navigation / Sheet Heuristics

- Bottom nav is present for idle/poll/home and non-results states.
- Bottom nav is absent only while the result sheet owns the visible surface.
- Bottom nav exits during submit/open and returns during dismiss using sheet-derived progress.
- Bottom nav must not appear, disappear, and reappear during one transaction.
- The heuristic is not route text, timers, or delayed cleanup. It is derived from SearchSurfaceRuntime page state plus sheet motion progress.
- Search bar display clears on dismiss press-up, while frozen results content remains visible until boundary.
- Searches are reversible and interruptible: a new submit/toggle/Search This Area transaction supersedes the previous redraw cleanly, fades old annotations out, and only reveals the new frame when both cards and markers are ready.
- All animation curves should be simple, native-driven, and consistent. The sheet keeps its native spring/timing; nav/shortcut opacity/silhouette projection should follow that motion or use short cubic opacity transitions when not sheet-coupled.

## Rejected Architecture

Do not keep these active paths:

- a Search dismiss motion plane that writes `sheetTranslateY`
- a Search dismiss motion plane that defines its own apparent sheet timing
- independent bottom nav return timing during Search submit/dismiss
- independent cutout/mask progress during Search submit/dismiss
- sheet-host-owned exclusion formulas for active Search nav geometry
- route/search-specific `sheetClipMode` overrides that can desync from the nav projection
- snap-callback-only poll handoff ownership
- header-only, toggle-only, or body-only result page lanes
- redraw paths where transaction id and request key can diverge
- marker sources admitted outside the active redraw/dismiss transaction
- compatibility branches preserving old Search dismiss/presentation handoff logic

Low-level utilities may stay only if they are not owners:

- geometry math
- generic bottom sheet snap execution
- card rendering
- poll rendering
- marker source builders
- telemetry helpers

## Code Areas To Cut Over

Inspect and simplify these first:

- `apps/mobile/src/screens/Search/runtime/surface/search-surface-runtime.ts`
  - should own page transactions, redraw join, dismiss lifecycle, and nav silhouette projection state
  - should not animate sheet Y

- `apps/mobile/src/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts`
  - current command-style motion plane is rejected if it commands sheet Y or writes `sheetTranslateY`
  - replace with a follower/telemetry bridge or delete it

- `apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-close-transition-state-runtime.ts`
  - should consume boundary state, not own handoff timing through delayed snap callbacks

- `apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-close-actions-runtime.ts`
  - press-up should clear visible search display immediately while freezing result page independently

- `apps/mobile/src/screens/Search/runtime/shared/use-search-foreground-bottom-nav-visual-runtime.ts`
  - remove independent Search nav timing
  - nav projection should follow sheet/search-surface progress

- `apps/mobile/src/navigation/runtime/app-route-nav-silhouette-authority.ts`
  - should remain geometry/projection utility
  - should not encode independent ownership assumptions

- `apps/mobile/src/navigation/runtime/app-route-sheet-host-authority-controller.ts`
- `apps/mobile/src/overlays/useSearchRouteSceneStackSheetChromeRuntime.ts`
- `apps/mobile/src/navigation/runtime/use-app-route-sheet-frame-host-authority.ts`
  - remove competing sheet exclusion/mask decisions for active Search motion

- `apps/mobile/src/overlays/SearchMountedSceneBody.tsx`
- `apps/mobile/src/overlays/SearchResultsHeaderChromeAuthority.tsx`
- `apps/mobile/src/overlays/panels/PollsPanel.tsx`
  - enforce complete page bundles

- `apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts`
- `apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-marker-enter-runtime.ts`
- `apps/mobile/src/screens/Search/components/search-map.tsx`
- `apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts`
  - unify redraw request key, cards readiness, marker readiness, fade-out, fade-in, and unmount

## Implementation Order

1. Draw the current owner graph.
   - sheet Y writers
   - nav translate writers
   - cutout/sheet exclusion writers
   - page bundle writers
   - search clear writers
   - redraw/cards/marker writers

2. Delete or demote the command-style Search dismiss motion plane.
   - No active Search path may write `sheetTranslateY`.
   - No active Search path may force boundary Y.
   - The replacement may observe sheet Y and publish progress.

3. Make nav silhouette a follower projection.
   - One projection value for active Search motion.
   - Nav, frost, cutout, and exclusion consume that projection.
   - Sheet hosts consume the projection's `sheetExclusionHeight`; they do not compute exclusion ownership themselves.
   - Frost material sampling is map-only; exclusion keeps sheet content out of the nav blur sampling area.
   - Remove independent bottom-nav Search timing.

4. Make result and poll pages indivisible bundles.
   - Results page owns header + toggle strip + body + cover.
   - Poll page owns header + body.
   - Boundary swaps complete bundles only.

5. Fix dismiss press-up.
   - Clear visible search display immediately.
   - Freeze complete results page separately from search display text.
   - Start marker exit immediately.
   - Let sheet slide down through normal sheet runtime.

6. Fix redraw.
   - Submit, shortcut rerun, toggles, and Search This Area all start one RedrawTransaction.
   - Transaction id and request key must match or be explicitly mapped once in SearchSurfaceRuntime.
   - Cards ready and marker sources ready join in one place.
   - Reveal cards and start fresh marker fade-in together.
   - Unmount old marker layers at fade-zero.

7. Delete displaced paths in the same wave.
   - No fallback branches.
   - No legacy compatibility modes.
   - No duplicate frosty/nav/cutout layers.

8. Strengthen contracts after the real cutover.
   - Contracts should catch missing reveal, duplicate frost, wrong material sampling, nav non-monotonicity, sheet jump, header-only frame, toggle-only frame, clear poll body, stale Search This Area bounds, and pins left behind.

## Objective Validation

Passing logs is not enough. The final pass must include video/frame review.

Run:

```sh
npx tsc --noEmit --project apps/mobile/tsconfig.json
yarn app-route:delete-gate
git diff --check
PERF_SCENARIO_RECORD_VIDEO=1 scripts/perf-scenario-ios.sh maestro/perf/flows/search-submit-visual-parity.yaml search_submit_visual_parity
PERF_SCENARIO_RECORD_VIDEO=1 scripts/perf-scenario-ios.sh maestro/perf/flows/search-submit-search-this-area.yaml search_submit_search_this_area
```

Review these frames yourself:

- submit press-up
- submit mid-motion
- results open settled
- Search This Area press-up
- Search This Area loading
- Search This Area reveal
- dismiss press-up
- early dismiss
- mid dismiss
- boundary handoff
- settled poll

Reject if any frame shows:

- sheet jump instead of slide
- nav, frost, and cutout moving separately
- duplicate frosty layer
- frosty nav fill sampling sheet content
- map visible where sheet illusion should be visible
- sheet visible through frosty nav fill
- stale cutout left behind
- header-only results
- toggle-only results
- clear/empty poll body
- delayed search clear
- loading cover stuck after cards and markers are ready
- pins fading in before cards reveal
- pins left behind after dismiss/fade-out
- Search This Area using stale bounds or failing to repopulate

## Worker Prompt

Use this for the single implementation worker:

```text
Continue the Crave Search dismiss/nav silhouette cutover using /Users/brandonkimble/Crave/plans/search-dismiss-motion-plane-cutover-plan.md as the canonical target.

This is an aggressive clean cutover. Do not preserve backwards compatibility paths.

The key correction is: the sheet is the physical motion source. Search dismiss must not hijack sheet speed, write sheetTranslateY, or force boundary Y. NavSilhouetteRuntime follows sheet/search-surface progress as one projection. SearchSurfaceRuntime owns page transactions and redraw joins, not physical sheet animation.

Before editing, report the competing owner graph by file:
- sheet Y writers
- nav return writers
- cutout/sheet exclusion writers
- page bundle/handoff writers
- search clear writers
- redraw/cards/marker writers

Then implement:
- remove or demote command-style dismiss motion plane into follower/telemetry only
- one nav silhouette projection for nav, frost, cutout, and exclusion
- immediate visible search clear on dismiss press-up while complete results page freezes
- normal sheet dismiss motion with nav projection following it
- atomic complete-results to complete-polls boundary swap
- one redraw transaction for submit, shortcuts, toggles, and Search This Area
- cards and marker sources join before reveal
- old markers fade out immediately and unmount at opacity zero
- delete displaced legacy/fallback paths in the same wave

Validation required:
- npx tsc --noEmit --project apps/mobile/tsconfig.json
- yarn app-route:delete-gate
- git diff --check
- recorded visual parity scenario
- recorded Search This Area scenario
- frame review proving submit, redraw, dismiss, and poll settle match the plan

Do not call it done if any frame has duplicate frost, wrong material sampling, a gap, a sheet jump, delayed search clear, stuck cover, strip-only/header-only page, clear poll body, stale Search This Area bounds, or pins left behind.
```

## Parent Review Loop

The parent cannot see sub-agent private reasoning. The parent can only see:

- explicit sub-agent messages
- changed files
- running processes
- logs and generated artifacts
- final sub-agent report

Therefore parent review must be evidence-based:

1. Wait for worker update or inspect repo artifacts.
2. Verify the owner graph explanation matches the code.
3. Reject source changes that leave active competing owners.
4. Run required commands and simulator scenarios.
5. Review frames personally.
6. If frames fail, identify the owner that produced the bad frame and send a precise correction back to the worker.

Do not accept a pass because source contracts or logs pass. Accept only when captured frames match this plan.
