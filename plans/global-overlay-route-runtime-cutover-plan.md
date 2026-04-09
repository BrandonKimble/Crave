# Global Overlay Route Runtime Cutover Plan

Last updated: 2026-04-07
Status: active
Rough doneness: ~90%
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/store/overlayStore.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Profile/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/search-runtime-ideal-shape-master-plan.md`
- `/Users/brandonkimble/crave-search/plans/prepared-snapshot-presentation-architecture-audit.md`
- `/Users/brandonkimble/crave-search/plans/shortcut-submit-architecture-refactor-plan.md`

## Objective

Promote overlays from a Search-owned sheet tree into an app-level overlay route runtime:

- one global overlay route stack for the app
- one shared native sheet host underneath it
- route-specific overlay content on top of that host
- restaurant profile becomes an app-level overlay route, not a Search-owned exception
- Search, Favorites, Polls, Bookmarks, and Profile become producers of overlay intents, not owners of the overlay surface

## Current Reality

What is materially true today:

- overlay state already lives in a global zustand store in `/Users/brandonkimble/crave-search/apps/mobile/src/store/overlayStore.ts`
- overlay state is now route-entry based through `activeOverlayRoute`, `previousOverlayRoute`, and `overlayRouteStack`
- the shared sheet primitive is now native-host-first on iOS/Android
- restaurant visible content is native-hosted
- the app-level host is mounted from `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`

What is still wrong for the long-term shape:

1. Search still publishes Search-route-specific content/render inputs, because search results content and Search chrome are still Search-owned.
2. Restaurant is now globally routable and the reusable non-Search producer is live in Favorites list detail for both restaurant cards and dish cards, but the same producer contract is not yet reused across every future non-Search screen.
3. The app-level host still reads some Search-scoped inputs for search-sheet behavior, even though non-restaurant route-spec assembly now lives in the overlay layer, non-Search routes no longer instantiate the Search results route path or require a separate Search interaction-context channel, Search-route freeze/resolution policy now lives in `searchRouteOverlayRuntimeStore.ts` instead of a Search-published execution bag, the search-header action override now lives under the app host instead of the Search snapshot, docked tab/polls snap commands plus docked-polls visibility/snap state now live in an overlay-layer command store instead of the Search snapshot, polls-route visibility is now derived from the global route stack instead of a Search-published `shouldShowPollsSheet` input, the save-list visible payload and close behavior now also live in that overlay-layer store instead of Search-local `useState`, poll-creation panel spec construction now also lives in `useSearchRouteOverlaySpecs.ts` instead of a Search hook, the duplicate search-results drag/settle handler path through the overlay resolver is deleted, and the app host now mounts a dedicated search-route host path only when the resolved route is actually `search`.
4. Restaurant is no longer resolved through a generic overlay-spec entry just to tell the host that the active route is `restaurant`, and the app host store no longer retains a single Search-route snapshot object. Restaurant now rides a dedicated host-model path and the Search-route store channels are published separately. The overlay-layer command store also now owns the full sheet-command cluster, save-list visible/close payload, and transient switch/restore flags for Search-route overlays (`tabOverlaySnapRequest`, `pollsDockedSnapRequest`, `pollsHeaderActionAnimationToken`, `pollsSheetSnap`, `isDockedPollsDismissed`, `isNavRestorePending`, `overlaySwitchInFlight`, `dockedPollsRestoreInFlight`, `ignoreDockedPollsHiddenUntilMs`, `bookmarksSheetSnap`, `profileSheetSnap`, `saveSheetState`, `saveSheetSnap`, and `pollCreationSnapRequest`). `overlay-runtime-controller.ts` also now owns the Search-root docked restore operation directly instead of accepting a Search callback, Search session-origin capture/pending-restore state now lives under `useSearchRouteSessionController.ts` + `searchRouteSessionStore.ts` in the overlay layer instead of a Search-local hook, and Search-route docked restore request generation is centralized in `searchRouteOverlayCommandStore.ts` instead of being duplicated in Search hooks/controllers. Search-route resolution/runtime policy plus Search-route content/spec state now live in `searchRouteOverlayRuntimeStore.ts`, and the old separate app host store is gone entirely because even `searchSheetVisualContextValue` now lives with the rest of the Search-route host/runtime state there. Polls-only route inputs, including the narrowed interaction gate, now ride `SearchRoutePollsPanelInputs` in `searchRouteOverlayRuntimeStore.ts` and are consumed directly by `SearchRouteLayerHost.tsx`, and Search-only host render state (`shouldFreezeOverlaySheetForCloseHandoff`, `shouldFreezeOverlayHeaderActionForRunOne`, `isSuggestionPanelActive`, `isForegroundEditing`, and the search-header reset token) also lives in that Search-route runtime store. The restaurant path is narrower too: restaurant route types no longer hang off `searchOverlayRouteHostContract.ts`, `RestaurantRouteLayerHost.tsx` no longer reads Search-origin restaurant visual context from `searchRouteOverlayRuntimeStore.ts`, host-only freeze behavior now lives in `RestaurantRoutePanelHostConfig` instead of the route contract, and the separate global restaurant route store is gone. `restaurantRouteRuntimeStore.ts` now owns both the global restaurant publication and the Search-origin restaurant host publication under one shared publication contract, so the restaurant host path no longer assembles its active route from separate global panel/session fields plus a different Search-side publisher wrapper, and Search teardown still clears only its local restaurant host lane instead of wiping global restaurant content. The app host no longer needs the full Search `searchSheetContentLane` object plus a separate boolean just to resolve the root sheet path; that contract is now collapsed to one `activeSearchSheetContent` enum (`none` / `results` / `persistent_poll`) at the overlay boundary. Search now also publishes the final Search-route panel spec instead of making the app host build it from Search hook inputs, but that route content/spec is no longer stored on a separate host store. `sheetTranslateY`, header-action progress, `navBarHeight`, `navBarTopForSnaps`, `searchBarTop`, and `snapPoints` now ride that same Search-route visual-state channel instead of generic overlay-panel inputs. The remaining Search-only composition wrappers around that path are also gone, so `index.tsx` now reads overlay-owned command state plus the real visual-model/tree-model/map-stage owners directly instead of extra selector/surface-model layers. Non-polls routes no longer block on polls-only inputs just to mount through the app host, Search no longer publishes those polls-only runtime inputs at all unless the active Search-route path actually needs polls behavior, Search no longer pre-nulls route-runtime channels before the overlay runtime sees them, and the overlay layer no longer prop-threads those same published Search-route channels once they already live in overlay-owned stores. The remaining gap is narrower: Search still originates some Search-route render inputs and route-specific policy.
   The generic resolver is narrower too: `useAppOverlaySheetResolution.ts` no longer receives built overlay specs just to choose a route key, and now resolves only the active overlay key/visibility while `SearchRouteLayerHost.tsx` owns the final host-spec lookup from the Search-route overlay registry.
   The Search-route panel lane is narrower too: Search no longer publishes split panel contract and panel-host-config bags just to have `SearchRouteLayerHost.tsx` reassemble them. It now publishes one `panelPublication` that carries the final `OverlayContentSpec` plus the separate interaction-ref lane that the host still needs for `SearchInteractionProvider`.
   That Search-route panel publication is narrower again too: the old `createSearchRoutePanelSpec(...)` adaptation layer is deleted, and the final Search-route panel spec now carries one grouped bottom-sheet `runtimeModel` lane instead of the older split `presentationState` / `snapController` compatibility surface.

## Reassessment

This plan is further along than the earlier “Search still effectively owns the overlay surface” state. The global host, route-entry stack, native-first sheet host, restaurant global route, and overlay-owned command/switch state are all real. The remaining work is not foundational anymore.

What is effectively done:

- route-entry overlay store
- app-level mounted overlay host
- global restaurant route path
- non-restaurant route-spec assembly in the overlay layer
- overlay-owned Search-route command/switch/restore state
- overlay-layer-owned polls/bookmarks/profile snap orchestration

What is still the real cutover work:

- Search still publishes some genuinely Search-route-specific content/render/runtime inputs
- the same reusable non-Search restaurant producer contract now lives in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useRestaurantRouteProducer.ts` and is proven on the live Favorites list-detail entry points, but it is not yet reused uniformly across every future producer screen
- restaurant still shares the common sheet motion/chrome primitive, but that remaining shared layer is now explicitly isolated under `RestaurantSheetHost.tsx` rather than mixed into the restaurant route/content owner

Recent reassessment:

- the app host store is now narrowed to host-owned visual/render state only
- Search-route runtime/content/spec channels now live in overlay-owned stores instead of another Search host bag
- the overlay layer no longer prop-threads those Search-route channels internally once they are published
- generic overlay resolution no longer owns Search editing/suggestion suppression policy; that policy now lives in `SearchRouteLayerHost.tsx`
- generic overlay resolution no longer owns `activeSearchSheetContent` / docked-polls interpretation either; `SearchRouteLayerHost.tsx` now resolves the Search-route overlay key and `useSearchRoutePollsOverlaySpec.ts` owns the remaining docked-polls behavior
- Search-route list slot components no longer ride the Search route contract either; `headerComponent`, `ListHeaderComponent`, `ListFooterComponent`, `ListEmptyComponent`, and `ItemSeparatorComponent` now publish on `searchRoutePanelListContentSlots`, so the remaining route contract is closer to route data/render ownership instead of list-host assembly
- the Search-route host-only surface is narrower too: those remaining host concerns no longer publish as another exploded set of overlay-runtime lanes. `SearchRouteLayerHost.tsx` now reads one `searchRoutePanelHostConfig` owner for interaction ref, list slots, decorations, list binding, list chrome, list host config, sheet host config, surface chrome, and underlay instead of nine separate host-only channels
- the Search-route host render state is narrower too: the overlay runtime now stores one `searchRouteHostRenderState` object for freeze/suggestion/editing policy instead of re-expanding that same published host render state back into separate booleans before the route host reads it
- the Search-route host boundary is narrower too: the deleted `useSearchRouteOverlayPanels.ts` wrapper no longer sits between `SearchRouteLayerHost.tsx` and the Search-route runtime stores. The route host now owns Search-route overlay-key resolution, non-search spec selection, and full search-spec adaptation directly, while `useSearchRouteOverlaySpecs.ts` remains the owner of the non-search spec family assembly
- the Search-route overlay registry is gone too: once `SearchRouteLayerHost.tsx` owned both route-key resolution and full search-spec adaptation, the standalone `OverlayRegistry.ts` compatibility layer stopped earning its keep. The route host now selects non-search specs directly instead of reading another registry full of placeholder entries
- the Search-origin restaurant route publication is flatter too: Search no longer publishes separate restaurant content and host-state lanes into `restaurantRouteRuntimeStore.ts`, and now publishes one `searchRestaurantRouteModel` whose `hostState` still carries explicit bottom-sheet presentation state, snap-controller lanes, and nav/header geometry, while the draft publication surface now lives only at the Search-side owner boundary instead of escaping through the runtime store
- the restaurant producer contract is more uniform too: `restaurantRouteRuntimeStore.ts` no longer stores global restaurant state as a split `panel + sessionToken` path while Search publishes through a different wrapper-owned route publisher. Global and Search restaurant publications now both terminate on the same store-owned publication contract, `use-search-restaurant-route-owner.ts` now publishes the Search-side model directly, and the old `useSearchRestaurantRoutePublisher.ts` wrapper is deleted
- the restaurant route payload boundary is stronger too: the Search-side owner and the reusable non-Search producer now both publish native-ready `snapshotPayload` panel drafts through `restaurantRoutePanelContract.ts` instead of leaking raw restaurant business data through the overlay route contract, so `RestaurantOverlayHost.tsx` no longer reshapes restaurant/profile data into the native snapshot payload at host read time
- the restaurant route host boundary is stronger too: `RestaurantRouteLayerHost.tsx` no longer wires raw bottom-sheet presentation/snap primitives into `RestaurantOverlayHost.tsx`, and now resolves one dedicated `RestaurantRouteHostModel` through `restaurantRouteHostContract.ts` plus `useResolvedRestaurantRouteHostModel.ts` before mounting the host
- the restaurant host/runtime split is narrower too: `RestaurantOverlayHost.tsx` no longer mixes restaurant content/payload policy with the shared native sheet/scroll/motion host runtime, and that shared host layer now lives under dedicated `RestaurantSheetHost.tsx`
- the Search-owned restaurant route control boundary is explicit too: the deleted `applySearchOwnedRestaurantRouteIntent(...)` helper no longer sits in `useAppOverlayRouteController.ts`, and Search/profile route application plus highlighted-restaurant reads now go through `searchRestaurantRouteController.ts` (`applySearchRestaurantRouteCommand(...)` and `useActiveSearchRestaurantRouteRestaurantId()`) instead of raw overlay-store peeks or another Search-owned helper vocabulary
- the dedicated restaurant host contract is narrower too: that restaurant host state no longer publishes one blended restaurant sheet `driver` bag, and now carries explicit bottom-sheet presentation state plus snap-controller lanes so `RestaurantOverlayHost.tsx` does not depend on the generic shared driver shape at its boundary
- the remaining overlay/runtime gap is now mostly about how much Search-route-specific content should remain Search-owned, not about mounted-host ownership, route resolution ownership, or switch/restore state ownership

Immediate endgame order for this plan:

1. keep pushing Search-route-specific spec/policy into route-family owners only where that policy is truly Search-content-specific,
2. finish producer adoption for any remaining future non-Search restaurant route producers,
3. then reassess whether the current dedicated restaurant route host/sheet host is the intended long-term stop line or whether any remaining JS interaction behavior should promote further down the native route host.

## Target Ideal Shape

### 1. One app-level overlay route stack

- store route entries, not just keys
- each stack entry owns its typed payload
- root route and pushed routes share one runtime model
- route back behavior is explicit and not Search-specific

### 2. One app-level overlay host

- mounted above app screens, not inside Search
- owns the shared native sheet host
- selects and renders overlay route content
- preserves sheet snap persistence and header/frost/cutout chrome centrally

### 3. Route producers, not surface owners

- Search produces `search_results` and `restaurant_profile` overlay intents
- Favorites/Bookmarks/Polls/Profile can also produce `restaurant_profile` intents
- no screen owns the restaurant surface implementation directly

### 4. Dedicated route content, shared shell

- shared:
  - sheet motion host
  - overlay stack/back behavior
  - sheet chrome, cutouts, frosty/header behavior
  - snap persistence
- route-specific:
  - search results content
  - restaurant profile content
  - polls content
  - bookmarks content
  - profile content
  - future favorites route content

### 5. Restaurant profile becomes globally routable

- opening a restaurant profile from Search, Favorites, Polls, or Bookmarks uses the same overlay route type
- returning from restaurant profile restores the previous overlay route underneath it
- the route stack, not Search, owns that back behavior

## Migration Slices

### Slice GOR1: Normalize the overlay store into route entries

Goals:

- replace key-only stack + sidecar params map with route entries
- keep typed payload ownership on the route itself
- expose selectors/helpers that make root vs active route explicit

Required outcomes:

- add `OverlayRouteKind` / `OverlayRouteEntry` types
- store `overlayRouteStack` as route entries
- make `activeOverlayRoute` and `rootOverlayRoute` explicit selectors/helpers
- remove the need for `overlayParams` as a parallel ownership channel

Delete gate:

- no new code should read route payloads from a side map

Progress:

- `overlayParams` has been deleted from `/Users/brandonkimble/crave-search/apps/mobile/src/store/overlayStore.ts`
- route payloads now live on `overlayRouteStack` entries
- `activeOverlayRoute` and `previousOverlayRoute` are now explicit store state
- the old key-only compatibility projections (`activeOverlay`, `previousOverlay`, `overlayStack`) are now deleted from the store
- Search consumers that still need poll/poll-creation payloads now read them from route entries instead of a side map

### Slice GOR2: Extract an app-level overlay runtime host

Goals:

- move the mounted overlay surface out of Search
- render one global overlay host above app screens
- preserve current Search behavior while making the host reusable

Required outcomes:

- create an app-level overlay host component under `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- mount it from app/root navigation composition instead of a Search-owned sheet tree
- keep Search as a producer of route content/specs, not the host owner

Delete gate:

- Search no longer mounts `OverlaySheetShell` or `RestaurantOverlayHost` directly

Progress:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/AppOverlayRouteHost.tsx` is now mounted from `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`
- Search now publishes its sheet-host inputs into `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/appOverlayRouteHostStore.ts` from `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchForegroundChrome.tsx` instead of mounting a sheet tree directly inside a Search-owned overlay wrapper
- Search still owns producing the current route content inputs, but the mounted host surface is no longer inside the Search render tree
- the app host store no longer depends on one monolithic Search snapshot object; Search now hands Search-route inputs to `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useSearchRouteOverlayPublisher.ts`, that overlay-owned publisher owns the publish/clear lifecycle into `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/searchRouteOverlayRuntimeStore.ts`, that store now groups the runtime snapshot plus overlay-owned header-reset bookkeeping under one Search-route host state, and the Search-origin restaurant route now publishes one dedicated restaurant-route model on its own runtime store
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/searchRouteOverlayRuntimeStore.ts` now owns that single Search-route host state directly instead of six parallel Search-published lanes for visual state, route resolution, polls inputs, panel contract, panel host config, and host render policy plus a separate header-reset side lane; the live route payload is also flatter now, with one `hostPublication` owner that groups the route publication and render policy, with that route publication carrying `activeSearchSheetContent`, polls inputs, and panel publication, with that panel publication now carrying the final Search-route overlay spec plus the separate interaction-ref lane instead of split panel-contract / panel-host-config bags, with Search publishing that whole Search-route overlay boundary through a dedicated `use-search-route-overlay-owner.ts` composition hook instead of coordinating foreground chrome, host-publication assembly, and overlay publishing as separate root-local steps, with Search-route publication assembly now split out of `use-search-foreground-chrome-model.ts` into its own `use-search-route-publication-owner.ts` boundary instead of mixing route payload construction into the chrome-tree owner, with Search-route render-policy assembly now split again into `use-search-route-render-policy-owner.ts` instead of being bundled directly into host-publication shaping, with `use-search-foreground-chrome-model.ts` now reduced to the chrome-tree boundary instead of returning route-policy flags as a second responsibility, and with the old shared arg bag between chrome-model ownership and route-publication ownership now deleted so those two owners no longer share one inflated input contract
- `SearchOverlayChromeTree` remains Search-owned for now, which is acceptable for this slice because the main ownership move was the sheet host itself
- `RestaurantOverlayHost` is now mounted directly from the app-level host when the active overlay route is `restaurant`; it is no longer rendered from the Search sheet tree branch
- the old `SearchResultsSheetTree.tsx` surface is deleted; the app-level host now resolves and renders the Search-owned route specs directly

### Slice GOR3: Replace Search-owned overlay resolution with global route resolution

Goals:

- remove `use-search-overlay-sheet-resolution.ts` as the owner of active overlay selection
- resolve active route content from the global overlay runtime
- keep Search-specific inputs only for Search-specific routes

Required outcomes:

- active route selection happens in the global overlay host/runtime
- Search only publishes route content inputs for the routes it owns
- route suppression rules become route-runtime policies, not Search-only conditionals

Delete gate:

- no Search-only resolver decides which app-level overlay route is active

Progress:

- restaurant-route activation is no longer decided by Search’s local `shouldShowRestaurantOverlay` branch
- the prepared profile shell projection now reconciles the global `restaurant` overlay route in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-presentation-controller.ts`
- the app-level host now renders from a published Search-route panel spec directly instead of delegating back to a Search-owned sheet-tree component or rebuilding the Search results spec internally
- the app-level host now treats the global restaurant route as its own content path instead of borrowing Search’s restaurant sheet driver when Search happens to be mounted
- the route-selection hook now lives under `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useAppOverlaySheetResolution.ts` instead of under `screens/Search`, so app-level route resolution ownership now matches the mounted host ownership
- non-restaurant route-spec assembly is now overlay-owned under `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useSearchRouteOverlaySpecs.ts` plus `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchRouteLayerHost.tsx`; the deleted Search-only hooks are `use-search-overlay-panel-options-model.ts` and `use-search-overlay-panels.ts`
- the remaining gap in this slice is no longer non-restaurant route resolution/spec assembly, poll-creation route spec assembly, snap orchestration, the old “every route needs Search results spec to mount” dependency, or the old Search-republished polls-route params path; it is that Search still publishes some Search-route render inputs and policy, while more of the docked/search-route state itself now lives under overlay-owned stores and no longer needs to be threaded through the host contract
- restaurant no longer flows through a generic overlay-spec entry for route resolution; `useAppOverlaySheetResolution.ts` now treats `restaurant` as a dedicated route path and `AppOverlayRouteHost.tsx` renders it without requiring a generic `overlaySheetSpec`
- the app host store no longer retains one `searchRouteHostSnapshotProps` object; Search-route interaction gating, polls-only route inputs, route-resolution state, and search-route spec inputs now live together in the published `searchRouteRuntimeSnapshot` owned by `searchRouteOverlayRuntimeStore.ts`, while restaurant-route inputs stay on their dedicated runtime store

### Slice GOR4: Promote restaurant profile to a global overlay route

Goals:

- stop treating restaurant profile as a Search exception
- make one `restaurant_profile` route available from any screen
- keep the native restaurant visible lane

Required outcomes:

- dedicated route type for restaurant profile payload
- route content can be produced from Search and non-Search screens
- back behavior restores the previous route regardless of originating screen

Delete gate:

- no Search-only `shouldShowRestaurantOverlay` ownership remains

Progress:

- the restaurant route payload is now typed on the global route stack and includes route ownership metadata (`source`, `sessionToken`) so Search-produced and non-Search-produced restaurant routes do not share hidden local state
- app-level restaurant content for non-Search producers now flows through `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/restaurantRouteRuntimeStore.ts` as session-owned route content instead of an ad hoc “panel options override”
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/AppOverlayRouteHost.tsx` can now render the restaurant route entirely outside the Search snapshot path
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useRestaurantRouteProducer.ts` now owns the reusable non-Search restaurant-route producer contract, including session-token allocation plus route-store publish/push/close orchestration, and active restaurant-route session truth now resolves through the overlay/runtime stores instead of a producer-instance ref

### Slice GOR5: Generalize route producers across screens

Goals:

- let Profile, Bookmarks, Polls, Favorites, and Search all open overlay routes through one runtime API
- stop navigating back to `Main` just to let Search own the overlay surface

Required outcomes:

- screens produce overlay route intents through one controller/store API
- cross-screen restaurant open path does not require Search to already own the view tree
- route producers do not know about host implementation details

Delete gate:

- no screen-specific “navigate to Main so Search can render the overlay” workaround remains

Progress:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/FavoritesListDetail.tsx` now opens restaurant profile through the reusable global producer for both restaurant cards and dish cards instead of hand-rolling local fetch/open/close logic or dropping the dish-card route entirely
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Profile/index.tsx` no longer calls `navigation.navigate('Main')` just to let Search own overlay rendering; it now pushes overlay intents directly while staying on the Profile screen
- non-Search route writers now go through `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useAppOverlayRouteController.ts` instead of calling the overlay store directly in `Profile/index.tsx`, `ProfilePanel.tsx`, `BookmarksPanel.tsx`, and `PollsPanel.tsx`
- Search runtime route writes now also route through that same app-level controller boundary in `use-search-main-intent-handler.ts`, `useSearchRouteSessionController.ts`, and `overlay-runtime-controller.ts` instead of mixing hook-level and direct-store imperative writes
- current tree reassessment: Favorites list detail is the only confirmed live non-Search restaurant-entry producer, and it is already on the shared global producer contract; remaining GOR5 work is future-screen adoption, not an active blocker in the current surface area
- the generic Search-route sheet resolver is narrower too: Search header-action reset policy no longer lives in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useAppOverlaySheetResolution.ts`, and the remaining Search-only suppression/header-action plus Search-route key resolution policy now lives in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchRouteLayerHost.tsx`

### Slice GOR6: Tighten dedicated route hosts where justified

Goals:

- keep shared sheet shell for common routes
- use dedicated route hosts only where the visible lane is materially special

Required outcomes:

- restaurant profile remains a dedicated content host inside the global runtime
- generic list-style routes continue to use the shared shell path
- the route runtime, not Search, decides which host implementation is used

Delete gate:

- no Search-owned special-case host branch remains

Progress:

- the restaurant route now uses a dedicated host-model builder in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/RestaurantPanel.tsx` and `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/RestaurantOverlayHost.tsx`, not a generic `OverlayContentSpec` abstraction
- the remaining restaurant shared-sheet seam is narrower too: `RestaurantOverlayHost.tsx` no longer directly owns the native sheet/scroll/motion host runtime, and that shared host layer now lives under `RestaurantSheetHost.tsx` while the route’s visible content/payload model stays dedicated end-to-end. The lower native host assembly, command/snap callback bridge, and shared scroll/momentum runtime now live together under `useBottomSheetHostRuntimeOwner.ts`, which consumes one grouped bottom-sheet runtime model (`presentationState + snapController`) across `RestaurantSheetHost.tsx` and `BottomSheetWithFlashList.tsx`, the repeated shadow/surface/content shell now lives under `BottomSheetHostShell.tsx`, and `BottomSheetNativeHost.tsx` still hides the raw native event transport behind typed callback props, normalizes hidden as a regular snap transition, and owns touch-blocking pointer-event policy instead of making overlay consumers switch on `eventType`, handle a duplicate native `hidden` event, keep a duplicate hidden-settle timing lane, or re-thread pointer-events gating themselves

## Execution Order

1. GOR1: normalize the store into route entries
2. GOR2: extract the app-level overlay host
3. GOR3: replace Search-owned route resolution
4. GOR4: promote restaurant profile to a global route
5. GOR5: enable non-Search route producers
6. GOR6: clean up dedicated-host boundaries and delete old Search-owned seams

## Why This Order

- GOR1 fixes the foundational ownership model first
- GOR2 removes the biggest architectural blocker: Search still mounting the host
- GOR3 prevents the new host from inheriting Search-owned resolution logic
- GOR4/GOR5 unlock the future “open restaurant profile from any screen” behavior
- GOR6 is cleanup/tightening after ownership is correct

## Promotable End State

- overlays are app-level route runtime, not a Search-owned sheet tree
- restaurant profile can open from any screen through the same route type
- the shared native sheet host is reused centrally
- Search/Favorites/Polls/Profile produce overlay intents instead of owning overlay surfaces
- route payload ownership is explicit and stack-local
