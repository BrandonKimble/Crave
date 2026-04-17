# Search Map Overlay-Island Cutover Plan

Last updated: 2026-04-16
Status: active
Owner: Codex execution plan

## Objective

Cut the search map runtime and overlay host runtime over to the most ideal end state:

- the map runtime is an island
- the overlay/tab runtime is an island
- they communicate only through a narrow, stable protocol
- `rootOverlay` changes do not rebuild the map render model unless map-visible state actually changes
- scene-local overlay state does not rebuild the shell host unless shell-visible state actually changes

This plan explicitly prefers the ideal architecture over incremental memoization patches. Tactical stabilizers are allowed only when they are part of the final architecture and not dead-end layering.

## Scope

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchMapRenderSurface.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-map-render-surface-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-scaffold-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-overlay-render-surface-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-profile-action-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-runtime-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchAppShellHost.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchRouteLayerHost.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useResolvedSearchRouteHostModel.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useSearchRouteFrozenOverlayRenderModel.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/searchOverlayRouteHostContract.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/searchResolvedRouteHostModelContract.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/searchRouteMountedSceneRegistryStore.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/OverlaySheetShell.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/BottomSheetWithFlashList.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/BookmarksPanel.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`
- related map / profile / results-presentation runtime files as needed

## Problem Statement

The original problem was that the search root and map render path were forced into overlay-switch frames.
That part is now fixed.

The remaining problem is that the overlay host still owns too much live scene state, so nav switches still drop JS frames inside `SearchRouteOverlayHost`.

### Current status

Completed:

- `rootRuntime:outputs` now reports `mapRenderSurfaceModel: false` and `searchMapProps: false` during pure overlay switches
- `SearchMapTree` no longer participates in nav-switch commits
- the map boundary is now an island in runtime behavior, not just code shape

Still failing:

- `SearchRouteOverlayHost` remains the dominant nav-switch cost at roughly `13-19ms`
- scene readiness, query/loading changes, and shell snap handoffs still rebuild the host render path

### Proven by attribution logs

Observed on `search -> bookmarks`, `bookmarks -> profile`, `profile -> bookmarks`, and `bookmarks -> search`:

- `[ROOT-OVERLAY-ATTRIBUTION] rootRuntime:outputs`
  - `rootOverlay: true`
  - `activeOverlayKey: true`
  - `mapRenderSurfaceModel: true`
  - `searchMapProps: true`
  - `handleProfilerRender: false`
  - `markerEngineRef: false`
  - `isInitialCameraReady: false`

- `[ROOT-OVERLAY-ATTRIBUTION] mapRenderSurface:propDiff`
  - changed every switch:
    - `profileActions`
    - `handleExecutionBatchMountedHidden`
    - `handleMarkerEnterStarted`
    - `handleMarkerEnterSettled`
    - `handleMarkerExitStarted`
    - `handleMarkerExitSettled`
  - stable across switches:
    - `mapCenter`
    - `mapZoom`
    - `mapCameraAnimation`
    - `isFollowingUser`
    - `highlightedRestaurantId`
    - `cameraPadding`

### Architectural reading

Current coupling chain:

1. `use-search-root-runtime.ts` subscribes to `rootOverlay` and `activeOverlayKey` high in the tree.
2. That rebuilds `overlayStoreRuntime`.
3. That rebuilds `overlaySessionRuntime` inside `use-search-root-scaffold-runtime.ts`.
4. That fans into request lanes, action lanes, visual publication, and map render model assembly.
5. `use-search-root-map-render-surface-runtime.ts` passes unstable owner-facing callbacks and profile surfaces into the map props.
6. `SearchMapRenderSurface.tsx` receives a new `mapRenderSurfaceModel` and new `searchMapProps`.

The map dependency problem above is resolved.

The remaining coupling chain is:

1. `useResolvedSearchRouteHostModel.ts` still resolves a live active scene by materializing a merged active scene spec.
2. Bookmarks/profile scene-local query/loading/form state rebuilds `sceneDefinition`.
3. Even when shell-visible state is stable, the host still sees a new active scene path because `sceneSurface` changed.
4. `shellSnapRequest` is still encoded into scene-definition identity, which produces a follow-up host commit when it flips.

This is not the desired boundary. The overlay host currently depends on scene-local render state churn.

## Ideal End State

### Contract

The map domain owns:

- camera / viewport state
- marker presentation
- marker interactions
- map presentation staging / marker enter-exit telemetry

The overlay domain owns:

- `rootOverlay`
- active overlay route
- sheets / tab switches
- overlay scene identities and shell state
- shell snap command execution

The coordination boundary owns only stable protocol ports:

- stable map-to-overlay commands
  - `openProfileFromMarker`
  - `clearProfileSelection`
  - `reportMarkerPresentationLifecycle`
- stable overlay-to-map inputs
  - actual map-visible presentation state only
  - not owner action surfaces
  - not overlay session objects

The overlay host owns only:

- active scene key
- stable shell identity
- snap profile
- visibility policy
- header action mode

Each scene owns:

- its live query/loading/form state
- its header/body/background/overlay surface
- its hidden-scene freeze/live policy

Shell control should flow through stable commands, not scene-spec identity churn.

### Explicit non-goals for the end state

- no map prop should change identity merely because `rootOverlay` changed
- no live overlay owner object should be passed into the map render contract
- no results-presentation owner callback surface should be threaded directly into `searchMapProps`
- no `profileOwner.profileActions` surface should be threaded directly into `searchMapProps`
- no scene-local query/loading/form change should rebuild the active host shell spec
- no `shellSnapRequest` identity change should require scene-spec rematerialization through the host

## Execution Doctrine

1. Do not patch around the current graph if the patch does not survive in the final architecture.
2. Delete legacy paths in the same slice where the new owner/port becomes canonical.
3. Preserve UX parity unless a visible change is explicitly approved.
4. Every phase must end with attribution or profiler evidence, not intuition.

## Phases

### Phase 0: Freeze the Attribution Baseline

Goal:

- keep the current attribution logs until the new boundary is in place

Actions:

- preserve the new root/map attribution logs until the cutover is validated
- use them as acceptance evidence after each phase

Exit gate:

- we can still observe `rootRuntime:outputs` and `mapRenderSurface:propDiff` during switches

Delete gate:

- none yet

### Phase 1: Define the Stable Map Port Boundary

Goal:

- replace unstable owner-shaped map props with a stable command/telemetry port interface

Actions:

- introduce a dedicated map protocol contract near the map runtime
- split current unstable map-facing props into:
  - stable command ports
  - stable telemetry/report ports
  - pure map state inputs
- remove direct dependence on:
  - `profileActions`
  - `resultsPresentationOwner.handleExecutionBatchMountedHidden`
  - `resultsPresentationOwner.handleMarkerEnterStarted`
  - `resultsPresentationOwner.handleMarkerEnterSettled`
  - `resultsPresentationOwner.handleMarkerExitStarted`
  - `resultsPresentationOwner.handleMarkerExitSettled`

Recommended file targets:

- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-map-render-surface-runtime.ts`
- new contract file under `apps/mobile/src/screens/Search/runtime/shared/`
- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`

Exit gate:

- `searchMapProps` no longer contains raw results-presentation owner callbacks or raw `profileActions`

Delete gate:

- remove the legacy direct callback props from the map render contract in the same phase

### Phase 2: Move Protocol Adaptation Out of the Root Map Render Model

Goal:

- make `use-search-root-map-render-surface-runtime.ts` assemble pure map inputs plus stable ports only

Actions:

- adapt profile-opening behavior into a stable map command adapter
- adapt marker lifecycle publication into a stable telemetry adapter
- ensure those adapters are stable across overlay switches unless their actual behavior changes

Recommended file targets:

- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-map-render-surface-runtime.ts`
- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-profile-action-runtime.ts`
- `apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-runtime-owner.ts`

Exit gate:

- attribution logs stop showing those six callback changes and `profileActions` churn at the map boundary

Delete gate:

- delete any no-longer-used pass-through owners or compatibility bags introduced only to preserve the old prop shape

### Phase 3: Separate Overlay Runtime from Map Render Model Construction

Goal:

- a `rootOverlay` switch should not rebuild `mapRenderSurfaceModel` unless map-visible state changes

Actions:

- split the root runtime into:
  - map render runtime lane
  - overlay/app-shell runtime lane
- move the `useOverlayStore` subscription for `rootOverlay` / `activeOverlayKey` out of the map-affecting root path
- ensure the map render lane depends only on:
  - map state
  - runtime bus selectors relevant to map presentation
  - stable command/telemetry ports

Recommended file targets:

- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-runtime.ts`
- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-scaffold-runtime.ts`
- `apps/mobile/src/screens/Search/runtime/shared/use-search-root-overlay-render-surface-runtime.ts`

Exit gate:

- on overlay switches, `rootRuntime:outputs` no longer reports `mapRenderSurfaceModel: true` solely because `rootOverlay` / `activeOverlayKey` changed

Delete gate:

- remove the old coupled assembly path in the same phase

### Phase 4: Tighten Internal Map Selector Dependencies

Goal:

- after parent prop churn is removed, verify whether internal map bus selectors still over-react

Actions:

- inspect `SearchMapWithMarkerEngine.tsx` selectors for `resultsPresentationTransport`, `resultsPresentation`, and pressure gates
- narrow any selector output whose identity or equality contract is still too broad
- do not change visual semantics; only narrow reactivity

Recommended file targets:

- `apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`
- shared selector/equality helper files

Exit gate:

- `SearchMapTree` either drops out of overlay-switch commits or is left with only truly necessary updates

Delete gate:

- remove any temporary compatibility selector helpers added during migration

### Phase 5: Remove Temporary Attribution Instrumentation

Goal:

- clean up proof-only instrumentation after the new boundary is validated

Actions:

- remove the temporary attribution logs from:
  - `use-search-root-runtime.ts`
  - `SearchMapRenderSurface.tsx`
- keep only instrumentation that remains broadly useful

Exit gate:

- architecture is validated without depending on one-off debug probes

Delete gate:

- delete the attribution probes in the same phase

### Phase 6: Cut the Overlay Host Over to a Stable Shell Router

Goal:

- stop materializing a live merged active scene spec in the host
- make the host route between stable scenes using the existing `scene-registry` surface

Actions:

- change `useResolvedSearchRouteHostModel.ts` so it resolves:
  - `activeSceneKey`
  - stable `activeShellSpec`
  - `sceneRegistry`
  - shell visibility policy
  - header action mode
- stop using `materializeSearchRouteSceneSpec(...)` in the host path
- publish a `scene-registry` surface to `OverlaySheetShell`
- keep search/polls/bookmarks/profile scene-local surfaces behind the registry

Recommended file targets:

- `apps/mobile/src/overlays/useResolvedSearchRouteHostModel.ts`
- `apps/mobile/src/overlays/useSearchRouteFrozenOverlayRenderModel.ts`
- `apps/mobile/src/overlays/SearchRouteLayerHost.tsx`
- `apps/mobile/src/overlays/searchOverlayRouteHostContract.ts`
- `apps/mobile/src/overlays/searchResolvedRouteHostModelContract.ts`

Exit gate:

- host shell identity changes only when shell-visible state changes

Delete gate:

- remove the active merged scene-spec materialization path from the host

### Phase 7: Move Scene-Local Ownership Fully Behind Registry Entries

Goal:

- each scene owns its live body/header/background state locally

Actions:

- keep scene definitions split into shell spec plus scene surface
- preserve scene-local memoization so bookmarks/profile query changes do not churn shell identity
- use scene-registry hidden-scene freeze semantics instead of host-level active-scene rematerialization

Recommended file targets:

- `apps/mobile/src/overlays/panels/BookmarksPanel.tsx`
- `apps/mobile/src/overlays/panels/ProfilePanel.tsx`
- `apps/mobile/src/overlays/panels/PollsPanel.tsx`
- search scene publication files as needed

Exit gate:

- scene-local query/loading changes render only the corresponding scene layer, not the host shell path

Delete gate:

- remove compatibility helpers that preserve merged-spec assumptions

### Phase 8: Move Shell Snap Control Out of Scene-Spec Identity

Goal:

- shell snap changes should be commands, not scene-definition identity churn

Actions:

- remove `shellSnapRequest` from any path where it forces shell spec identity changes
- drive snap changes through stable shell command/runtime channels
- keep shell snap state observable for diagnostics without using it as scene-spec identity

Recommended file targets:

- `apps/mobile/src/overlays/OverlaySheetShell.tsx`
- `apps/mobile/src/overlays/useSearchRouteBookmarksPanelSpec.ts`
- `apps/mobile/src/overlays/useSearchRouteProfilePanelSpec.ts`
- polls/search shell command paths as needed

Exit gate:

- `shell_snap_request_change` no longer requires host scene rematerialization

Delete gate:

- delete the legacy scene-spec `shellSnapRequest` coupling where replaced by command flow

## Validation Matrix

After each relevant phase, validate:

1. `eslint`
2. focused `tsc`
3. nav-switch trace
4. root/map attribution logs
5. JS FPS observation on device

### Key acceptance checks

- `mapRenderSurfaceModel` stops changing on pure overlay switches
- unstable callback churn disappears from `mapRenderSurface:propDiff`
- `SearchMapTree` participation in overlay-switch commits shrinks materially
- `SearchRouteOverlayHost` stops rebuilding because scene-local surface data changed while shell-visible state did not
- scene-local query/loading changes render only the corresponding scene-registry layer
- UX remains unchanged

## Risks

- profile open / marker press behavior may regress if command-port cutover is incomplete
- marker lifecycle reporting may regress if telemetry ports are not fully migrated
- hidden dependencies from results-presentation owner may surface during deletion

Mitigation:

- cut over one protocol surface at a time
- keep attribution logs until the architecture is stable
- do not delete legacy paths before the new port is actively serving production flow

## Immediate Next Slice

Start with Phase 6:

- cut the overlay host over from active merged scene materialization to a stable shell spec plus scene registry

Reason:

- the map island is already complete
- the remaining nav-switch cost is concentrated in `SearchRouteOverlayHost`
- the existing `scene-registry` bottom-sheet path provides the correct end-state shape, so the next slice can move directly toward the final architecture instead of layering temporary memoization
