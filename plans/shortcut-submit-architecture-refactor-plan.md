# Frontend Runtime Re-Architecture Blueprint (V3, Executable)

Last updated: 2026-04-08
Status: active Search runtime cutover; prepared-snapshot presentation and motion-pressure follow-up are the current architecture tracks
Scope: `/Users/brandonkimble/crave-search/apps/mobile/src/**`
Non-goal: backend architecture changes

## 0) Decision and Readiness

Decision: proceed with a full frontend runtime re-architecture.

Continuous execution note for this program:

- Treat slices S3/S4 and any unfinished earlier delete/exit gates as one continuous execution track.
- After a slice is brought to promotion quality, continue directly into the next dependent slice without stopping for permission unless a true blocker requires user action.
- Cross-slice cleanup needed to reach the target architecture is in scope during this continuous effort; do not preserve inferior intermediate ownership just to maintain artificial slice boundaries.

Readiness verdict:

- architecture direction is correct,
- execution details were previously under-specified,
- this V3 document is the canonical implementation plan.

Execution prerequisites (current state):

1. live harness wiring is re-established in runtime code via `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`,
2. metric-definition contract is schema-locked between investigation reporting and parser/comparator outputs (`perf-shortcut-report.v1`),
3. migration ownership + delete-gate posture is defined in this plan and guarded by no-bypass tooling.

## 0.1 Current Implementation Reality Check (2026-04-02)

This file remains the read-first program plan, but the Search runtime codebase has moved materially since the original 2026-02 snapshot. Treat this section as the authoritative current-state override for stale assumptions elsewhere in this document.

### What is already cut over

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` has been decomposed from the old ~10k LOC root orchestrator into a smaller ~2.3k LOC composition layer plus many dedicated hooks/components under `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/**` and `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/**`.
- Results presentation has a prepared-snapshot staging/commit contract:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/prepared-presentation-transaction.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-prepared-results-presentation-coordinator.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-prepared-presentation-transaction-publisher.ts`
- Profile runtime now has a dedicated owner/runtime stack and split prepared-transition boundary:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-prepared-presentation-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-mutations.ts`
    The Search-facing pre-open boundary is narrower now: profile runtime takes one explicit `prepareForegroundUiForProfileOpen` command instead of separately reaching through Search overlay/search-interaction setup commands, and Search now owns that foreground policy under `use-search-profile-foreground-owner.ts` instead of hand-rolling the prepare/restore callbacks inline in `index.tsx`.
    The prepared profile transaction resolvers are flatter too: they now take the prepared snapshot and direct args instead of one-off option bags at each runtime callsite.
    The prepared profile snapshot factories are flatter as well: open/close snapshot creation now takes the transaction id plus direct transition args instead of another layer of factory option bags.
    The runtime’s open helper is flatter too: prepared profile open commits now call `commitPreparedProfileOpenSnapshot(...)` with direct args instead of another open-only config bag.
    The runtime’s results-sheet seam is narrower too: the profile path no longer receives the raw results-sheet motion driver, hidden-reset fallback, and mounted-host ref as separate inputs. The shared results runtime owner under `runtime/shared/use-results-presentation-runtime-owner.ts` now owns that mounted-host fallback and publishes one grouped `resultsSheetExecutionModel` with `requestResultsSheetSnap(...)` plus `hideResultsSheet(...)`, so the profile runtime consumes a semantic results-sheet execution lane instead of raw Search-root sheet internals.
    The raw results-sheet shell/runtime seam is narrower too: `index.tsx` no longer owns one monolithic local results-sheet snap/state/motion cluster or routes through another grouped sheet owner hook, `runtime/shared/results-sheet-runtime-contract.ts` now owns the grouped sheet-runtime type surface, `runtime/shared/use-results-sheet-shared-values-runtime.ts` now owns snap points plus shared animated values and `setSheetTranslateYTo(...)`, `runtime/shared/use-results-sheet-runtime-model-runtime.ts` now owns bottom-sheet runtime-model construction, `runtime/shared/use-results-sheet-animated-styles-runtime.ts` now owns header-divider plus results-container animated styles, `runtime/shared/use-results-sheet-visibility-state-runtime.ts` now owns sheet visibility state plus snap-change application, `runtime/shared/use-results-sheet-visibility-actions-runtime.ts` now owns animate/reset/docked-polls transition commands, `runtime/shared/use-results-sheet-visibility-sync-runtime.ts` now owns the hidden-translate/nav-top/last-visible synchronization effects, `runtime/shared/use-results-sheet-runtime-surface.ts` now owns grouped `resultsSheetRuntime` publication over those lower sheet owners, and the Search root now consumes that lower surface instead of rebuilding the grouped `resultsSheetRuntime` bag inline. The duplicate outward results-sheet runtime lane is gone too: `useResultsPresentationOwner(...)` no longer mirrors `resultsSheetRuntimeModel`, `shouldRenderResultsSheetRef`, and `resetResultsSheetToHidden` as separate sibling inputs once those already live under `resultsSheetRuntime`. The results-sheet interaction seam is narrower too: `index.tsx` no longer owns the drag/settle/scroll/end-reached orchestration cluster as one grouped owner hook, `runtime/shared/results-sheet-interaction-contract.ts` now owns the grouped interaction type surface, `runtime/shared/use-results-sheet-interaction-state-runtime.ts` now owns the interaction refs plus drag/scroll/settling bookkeeping and motion-pressure/search-interaction updates, `runtime/shared/use-results-sheet-snap-runtime.ts` now owns the snap/settle callback lane, `runtime/shared/use-results-sheet-load-more-runtime.ts` now owns pagination admission, `runtime/shared/use-results-sheet-interaction-surface.ts` now owns grouped `resultsSheetInteractionModel` publication over those lower interaction owners, and `index.tsx` now consumes that lower interaction surface while route publication plus the results panel consume that direct runtime-owned surface instead of another root-local handler fanout. The results tab/toggle seam is narrower too: the top-level owner now keeps direct active-tab commit, pending-tab clearing/publication, and prepared tab-switch choreography inline, so `index.tsx` no longer owns those toggle flows while `useResultsPresentationOwner(...)` still publishes one grouped `interactionModel` for the route/results panel path instead of another pair of root-local toggle callbacks. The remaining shared results owner is flatter too: the deleted `runtime/shared/use-results-presentation-shell-lane-runtime.ts`, `runtime/shared/use-results-presentation-actions-runtime.ts`, `runtime/shared/use-results-presentation-intent-actions-runtime.ts`, and `runtime/shared/use-results-presentation-close-search-actions-runtime.ts` wrappers are gone, `runtime/shared/use-results-presentation-runtime-owner.ts` now composes its direct runtime-machine, prepared-staging, toggle-lifecycle, and marker-handoff lanes with `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, and direct owner-inline close cleanup plus begin/cancel close flow, with the outward owner surface including `presentationActions` assembled there instead of through deleted shell/action wrapper hosts. The route-overlay seam is narrower too: the deleted route/publication wrappers, deleted Search-only foreground wrappers, and deleted Search-only docked-polls publication shim no longer sit between the root and the shared results overlay path. The Search root now composes the route-panel lane directly from `use-search-results-panel-data-runtime.tsx`, `use-search-results-panel-read-model-runtime.tsx`, `use-search-results-panel-render-policy-runtime.tsx`, `use-search-results-panel-covered-render-runtime.tsx`, `use-search-results-panel-surface-state-runtime.tsx`, and `use-search-results-panel-interaction-frost-runtime.tsx`, `use-search-results-panel-surface-background-runtime.tsx`, and `use-search-results-panel-surface-overlay-runtime.tsx`, and `use-search-results-panel-spec-runtime.tsx` / `use-search-results-panel-route-visibility-runtime.tsx`, while the overlay-owned route host lane is now split more honestly: `useSearchRouteOverlayPublishedState.ts` now owns the published visual/search-panel/render-policy selectors, `useSearchRouteOverlaySheetKeys.ts` now owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above the direct family-spec lane, `useResolvedSearchRouteHostModel.ts` now composes the direct polls/poll-creation/bookmarks/profile/save-list specs itself, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that lane, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, and `useResolvedSearchRouteHostModel.ts` now stays on thin composition over that lower overlay host stack. `search-results-panel-data-runtime-contract.ts` now owns the outward panel-data contract, `use-search-results-panel-input-runtime.ts` now owns Search-owner shell/actions plus tab-toggle commands together with the split Search-bus selector and overlay-runtime inputs, `search-results-panel-runtime-state-contract.ts` now owns the shared panel runtime-state vocabulary, `use-search-results-panel-results-runtime-state.ts`, `use-search-results-panel-filters-runtime-state.ts`, `use-search-results-panel-hydration-runtime-state.ts`, and `use-search-results-panel-presentation-runtime-state.ts` now own the split Search-bus selector and chrome-deferral lanes, `use-search-results-panel-overlay-runtime.ts` now owns the active overlay-key read, `search-results-panel-hydration-runtime-contract.ts` now owns the outward hydration contract, `use-search-results-panel-retained-results-runtime.ts` now owns retained-results policy plus resolved dishes/restaurants, `use-search-results-panel-hydration-key-runtime.ts` now owns hydrated-key state, runtime sync, render admission, and request-version derivation, `use-search-results-panel-on-demand-query-runtime.ts` now owns on-demand query derivation, `use-search-results-panel-hydration-content-runtime.ts` is now composition-only over those lower hydration owners, `use-search-results-panel-filters-content-runtime.ts` now owns filter-header composition over the hydrated content lane, `search-results-panel-card-runtime-contract.ts` now owns the shared card contract, `use-search-results-panel-card-metrics-runtime.ts` now owns card-local rank/coverage/location/quality derivation, `use-search-results-panel-on-demand-notice-runtime.tsx` now owns on-demand notice policy, `use-search-results-panel-card-render-runtime.tsx` now owns dish/restaurant renderer assembly, `use-search-results-panel-card-content-runtime.tsx` now owns card metrics/notice/renderer composition over that hydrated content lane, `use-search-results-panel-data-runtime.tsx` is now composition-only over those lower owners, `use-search-results-panel-chrome-runtime.tsx` owns header/layout/chrome-freeze publication, `use-search-results-panel-list-selectors-runtime.tsx` owns selector construction, `use-search-results-panel-list-layout-runtime.tsx` owns placeholder/key/item-layout assembly, `use-search-results-panel-list-publication-runtime.tsx` owns hydration-bus publication, `use-search-results-panel-read-model-runtime.tsx` stays on composition over those lower read-model lanes, `use-search-results-panel-render-policy-runtime.tsx` owns shared panel render-policy/loading-state derivation, `use-search-results-panel-covered-render-runtime.tsx` owns render-freeze/header-geometry/content-container policy, `use-search-results-panel-surface-state-runtime.tsx` owns interaction-enable/container-style/diagnostic publication, `use-search-results-panel-interaction-frost-runtime.tsx` owns frost timing/readiness signaling, `use-search-results-panel-surface-background-runtime.tsx` owns background/pre-measure rendering, `use-search-results-panel-surface-overlay-runtime.tsx` owns overlay/surface-content composition over that shared render-policy lane, `use-search-results-panel-spec-runtime.tsx` owns final panel-spec assembly, and `use-search-results-panel-route-visibility-runtime.tsx` owns final Search-route panel visibility policy. That route/publication contract is narrower again now: the root no longer builds synthetic `resultsRoutePresentationModel`, `routePublicationModel`, final results-panel compatibility bags, grouped overlay-runtime bags, or grouped publication bags before calling that shared path, and the shared results/foreground path now consumes the real results owner surface plus direct panel-model outputs, overlay-owned host-model publication, and `use-search-overlay-chrome-render-model.ts` instead.
    The Search-root results owner split is flatter now too: the deleted `runtime/shared/use-search-results-presentation-runtime-owner.ts`, `runtime/shared/use-search-results-interaction-runtime-owner.ts`, `runtime/shared/use-search-results-runtime-owner.ts`, and `runtime/shared/search-results-runtime-owner-contract.ts` no longer sit between `index.tsx` and the shared results path. The Search root now composes the lower `resultsSheetRuntime` owners directly (`use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts`), composes the lower `resultsSheetInteractionModel` owners directly (`use-results-sheet-load-more-runtime.ts`, `use-results-sheet-interaction-state-runtime.ts`, `use-results-sheet-snap-runtime.ts`, and `use-results-sheet-interaction-surface.ts`), and feeds the real `resultsSheetRuntime` into `useResultsPresentationOwner(...)` directly. Route publication plus foreground chrome now consume the real lower `resultsPresentationOwner`, `resultsSheetRuntime`, and `resultsSheetInteractionModel` lanes directly instead of another root-local compatibility memo.
    The Search-route overlay store seam is narrower again too: the live overlay runtime no longer carries `activeSearchSheetContent`, `panelPublication`, or `pollsPanelInputs` as Search-shaped payload vocabulary, and now stores one host-ready route model with direct `searchPanelSpec`, direct `searchPanelInteractionRef`, direct docked-polls inputs, and explicit `shouldShowSearchPanel` / `shouldShowDockedPollsPanel` booleans for `SearchRouteLayerHost.tsx`.
    The Search-route host-input seam is narrower too: the overlay runtime no longer stores separate `routePublication` and `renderState` fragments that always travel together, it no longer stores one synthetic `hostModelInput` lane, it no longer preserves single-field `panelContent` / `auxiliaryInputs` wrappers, and it no longer preserves a `searchPanelModel` bag either. The deleted `useSearchRouteSearchPanelModel.ts` no longer sits between the lower search-panel lanes and publication, `useSearchRouteDockedPollsPanelInputs.ts` owns direct docked-polls inputs, the deleted `useSearchRouteHostModelInput.ts` no longer sits between those lower owners and publication, `useSearchRouteOverlayRenderPolicy.ts` now owns final host render-policy derivation, `useSearchRouteOverlayRuntimePublication.ts` now owns runtime-store publication of direct `searchPanelSpec` + direct `searchPanelInteractionRef` + direct `dockedPollsPanelInputs` + `renderPolicy`, and `useSearchRouteOverlayRuntime.ts` now stays on thin composition over those lower overlay owners plus the root-composed policy bits.
    The Search-route host-render seam is narrower again too: `SearchRouteLayerHost.tsx` is now a thin renderer, and the live host lane is split more honestly underneath it: `useSearchRouteOverlayPublishedState.ts` owns the published visual/search-panel/render-policy selectors, `useSearchRouteOverlayRouteState.ts` owns overlay-route selection, `useSearchRoutePollsPanelRuntimeModel.ts` now owns the polls panel runtime model, `useSearchRoutePollsPanelActions.ts` now owns the polls snap/restore/create action lane, `useSearchRoutePollsPanelSpec.ts` now stays on thin composition over those lower polls owners, the deleted `useSearchRouteTabOverlayPanelSpecs.ts` wrapper no longer sits above the tab family, `useSearchRouteTabPanelRuntime.ts` now owns shared bookmarks/profile visual inputs, `useSearchRouteBookmarksPanelSpec.ts` and `useSearchRouteProfilePanelSpec.ts` now own the direct bookmarks/profile spec families, `useSearchRoutePollCreationPanelSpec.ts` and `useSearchRouteSaveListPanelSpec.ts` still own their dedicated families, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above that family lane, `useResolvedSearchRouteHostModel.ts` now composes those direct polls/poll-creation/bookmarks/profile/save-list owners itself, `useSearchRouteOverlaySheetKeys.ts` now owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that route/spec lane, the deleted `useSearchRouteOverlayResolvedSheetProps.ts` wrapper no longer sits above final host suppression either, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution directly over those lower family outputs, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, `useSearchRouteFrozenOverlaySheetProps.ts` owns the frozen overlay-sheet props latch, `useSearchRouteOverlayHeaderActionMode.ts` owns the header-action reset/freeze lane, `useSearchRouteFrozenOverlayRenderModel.ts` now stays on thin composition over those lower freeze owners, and `useResolvedSearchRouteHostModel.ts` now stays on composition only before the layer host renders.
    The Search-route render-state contract is narrower too: the overlay runtime no longer carries raw `isSuggestionPanelActive` / `isForegroundEditing` flags into the app host. It now carries host-ready suppression policy (`shouldSuppressSearchAndTabSheetsForForegroundEditing`, `shouldSuppressTabSheetsForSuggestions`), so the overlay side no longer interprets raw Search foreground state to decide host suppression.
    The Search-route runtime-store seam is narrower too: `searchRouteOverlayRuntimeStore.ts` no longer mixes the published route host snapshot with the imperative Search header-reset lane, it no longer keeps another `SearchRouteOverlayRuntimeSnapshot` wrapper, it no longer keeps single-field `panelContent` / `auxiliaryInputs` bags, and it no longer keeps a `searchPanelModel` bag either. The runtime store now owns the direct published `visualState`, direct `searchPanelSpec`, direct `searchPanelInteractionRef`, direct `dockedPollsPanelInputs`, and `renderPolicy` lanes, while the header follow-collapse reset token/command now lives under `searchRouteOverlayCommandStore.ts`.
    The Search-route command lane is narrower too: `index.tsx` and `useResolvedSearchRouteHostModel.ts` no longer select `searchRouteOverlayCommandStore.ts` field-by-field or build save-sheet, docked-polls restore, and close-results-ui-reset actions inline. `searchRouteOverlayCommandRuntimeContract.ts`, `useSearchRouteOverlayCommandState.ts`, `useSearchRouteOverlayCommandActions.ts`, `useSearchRouteOverlaySaveSheetRuntime.ts`, `useSearchRouteOverlayDockedPollsRestoreRuntime.ts`, and `useSearchRouteOverlayResultsUiResetRuntime.ts` still own the lower command-state/action/save/reset lanes, and `overlays/useSearchRouteOverlayCommandRuntime.ts` now owns the Search-facing composition over that lower overlay command stack so the Search root consumes one grouped overlay command owner instead of another root-local command cluster.
    The Search-root overlay root/chrome seam is narrower too: `index.tsx` no longer routes through deleted mixed overlay-root or chrome wrapper hosts. That lane is now split between `runtime/shared/use-search-overlay-store-runtime.ts`, which owns overlay-store root interpretation plus search-root restore and `ensureSearchOverlay()`, direct `useSearchRouteSessionController(...)` composition for search-session origin capture/restore policy, `runtime/shared/use-search-bottom-nav-runtime.ts`, which owns search-bar/bottom-nav geometry caching, `runtime/shared/use-search-docked-polls-visibility-runtime.ts`, which owns docked-polls/polls-sheet visibility policy, `runtime/shared/use-search-nav-restore-runtime.ts`, which owns nav-restore clearing, `runtime/shared/use-search-overlay-render-visibility-runtime.ts`, which owns final overlay render visibility, `runtime/shared/use-search-overlay-chrome-snaps-runtime.ts`, which owns `chromeTransitionConfig`, and `runtime/shared/use-search-overlay-sheet-reset-runtime.ts`, which owns overlay sheet-snap cleanup.
    The Search-root overlay/session seam is narrower again too: `runtime/shared/use-search-overlay-session-runtime.ts` now owns the full overlay-root/session/nav/visibility composition over `use-search-overlay-store-runtime.ts`, direct `useSearchRouteSessionController(...)` composition, `use-search-bottom-nav-runtime.ts`, `use-search-docked-polls-visibility-runtime.ts`, `use-search-nav-restore-runtime.ts`, and `use-search-overlay-render-visibility-runtime.ts`, so `index.tsx` no longer physically hosts that lower overlay/session cluster inline.
    The Search-root map-movement/results-sheet seam is narrower too: `runtime/shared/use-search-results-sheet-runtime-lane.ts` now owns the Search-owned motion-pressure instance, map-movement policy, initial docked-polls-to-sheet state derivation, and the full lower results-sheet runtime composition over `use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts`, so `index.tsx` no longer keeps that lower movement/sheet-runtime cluster inline before the later presentation and interaction lanes.
    That post-suggestion Search-root constructor lane is narrower again too: `runtime/shared/use-search-root-scaffold-runtime.ts` now owns grouped overlay-session + results-sheet-runtime + instrumentation composition over `use-search-overlay-session-runtime.ts`, `use-search-results-sheet-runtime-lane.ts`, and `use-search-runtime-instrumentation-runtime.ts`, `runtime/shared/use-search-request-presentation-flow-runtime.ts` now owns grouped session-shadow + request/clear/results-presentation + autocomplete/recent/input composition over `use-search-session-shadow-transition-runtime.ts`, `use-search-request-presentation-runtime.ts`, `use-search-autocomplete-runtime.ts`, `use-search-recent-activity-runtime.ts`, and `use-search-foreground-input-runtime.ts`, and `runtime/shared/use-search-root-action-runtime.ts` now owns grouped session-action + results-sheet-interaction + derived presentation-state composition over `use-search-session-action-runtime.ts` and `use-search-results-sheet-interaction-runtime.ts`. The remaining top-level Search-root constructor shell is narrower too: `runtime/shared/use-search-root-primitives-runtime.ts` now owns the local map/search refs, setter state, store selection, and root-local cache/selection/focus primitives, `runtime/shared/use-search-root-suggestion-runtime.ts` now owns the grouped suggestion-surface lane plus `isSuggestionScreenActive`, where `use-search-suggestion-transition-timing-runtime.ts` now owns keyboard-aware transition timing policy, `use-search-suggestion-transition-presence-runtime.ts` now owns transition-driver presence/overlay visibility, `use-search-suggestion-layout-warmth-runtime.ts` now owns layout warmth plus drive-layout policy, `use-search-suggestion-transition-runtime.ts` now stays on thin composition over those lower transition owners, `use-search-suggestion-display-runtime.ts` now owns live suggestion/recent/autocomplete display derivation, `use-search-suggestion-hold-state-runtime.ts` now owns hold snapshot state plus capture/reset primitives, `use-search-suggestion-hold-actions-runtime.ts` now owns submit/close hold command construction, `use-search-suggestion-hold-sync-runtime.ts` now owns hold registration plus query/layout cleanup effects, `use-search-suggestion-held-display-runtime.ts` now owns held suggestion surface outputs, `use-search-suggestion-hold-effects-runtime.ts` now stays on thin composition over those lower hold-lifecycle owners, `use-search-suggestion-hold-runtime.ts` now stays on thin composition over those lower hold owners, `use-search-suggestion-visibility-runtime.ts` now stays on thin composition over those lower visibility owners, `use-search-suggestion-layout-state-runtime.ts` now owns layout state, caches, and frame handlers, `use-search-suggestion-layout-visual-runtime.ts` now owns animated spacing, scroll state, and fill-height derivation, `use-search-suggestion-header-holes-runtime.ts` now owns header cutout derivation, `use-search-suggestion-layout-runtime.ts` now stays on thin composition over those lower suggestion layout owners, and `use-search-suggestion-surface-runtime.ts` now stays on thin composition over the lower visibility/layout owners, `runtime/shared/use-search-root-scaffold-lane-runtime.ts` now owns the grouped scaffold lane over `use-search-root-scaffold-runtime.ts`, the deleted mixed `runtime/shared/use-search-root-presentation-runtime.ts` host is replaced by `runtime/shared/use-search-root-request-lane-runtime.ts`, which now stays on grouped request-lane composition over the lower `use-search-root-request-presentation-args-runtime.ts`, `use-search-root-autocomplete-args-runtime.ts`, `use-search-root-recent-activity-args-runtime.ts`, `use-search-root-foreground-input-args-runtime.ts`, and `use-search-request-presentation-flow-runtime.ts` owners, the deleted mixed `runtime/shared/use-search-root-action-lane-runtime.ts` host is replaced by `runtime/shared/use-search-root-profile-action-runtime.ts`, which now owns the profile-specific selection/analytics/native-app execution lane, and `runtime/shared/use-search-root-session-action-runtime.ts`, which now stays on grouped session-action/results-sheet-interaction composition over the lower `use-search-root-session-action-args-runtime.ts`, `use-search-root-results-sheet-interaction-args-runtime.ts`, `use-search-root-presentation-state-args-runtime.ts`, and `use-search-root-action-runtime.ts` owners; the deleted `runtime/shared/use-search-root-display-runtime.ts` and deleted `runtime/shared/use-search-root-display-lane-runtime.ts` hosts are replaced by `runtime/shared/use-search-root-map-display-runtime.ts`, which now owns grouped map composition over `use-search-map-runtime.ts`, while the deleted `runtime/shared/use-search-root-flow-runtime.ts` and deleted `runtime/shared/use-search-root-flow-runtime-contract.ts` no longer sit between those lower suggestion/scaffold/request/action/map/publication phases and the top-level owner boundary. `runtime/shared/use-search-root-runtime-contract.ts` now owns the shared top-level root vocabulary, `runtime/shared/use-search-root-core-construction-runtime.ts` now owns primitives/session/suggestion construction, `runtime/shared/use-search-root-scaffold-request-construction-runtime.ts` now owns scaffold/request construction, the deleted `runtime/shared/use-search-root-pre-presentation-action-owner-runtime.ts` no longer sits between the lower action owners and pre-presentation, `runtime/shared/use-search-root-runtime-publication-owner-runtime.ts` now owns runtime publication, `runtime/shared/use-search-root-pre-presentation-runtime.ts` now composes `use-search-root-profile-action-runtime.ts`, `use-search-root-session-action-runtime.ts`, and runtime publication directly over those lower pre-presentation owners, and `runtime/shared/use-search-root-runtime.ts` now stays on top-level orchestration over pre-presentation, map, and presentation, so `index.tsx` is now just the env/setup shell over that top-level root runtime plus `SearchRuntimeBusContext.Provider` and `SearchRootRenderSurface`.
    The Search-root close/chrome/shadow/instrumentation seam is narrower too: `index.tsx` no longer hosts the close-transition collapsed-boundary handoff, chrome transition interpolation lane, shortcut session-shadow handoff script, or the mixed profiler/telemetry/diagnostic shell inline. `runtime/shared/use-search-close-visual-handoff-runtime.ts`, `runtime/shared/use-search-chrome-transition-runtime.ts`, `runtime/shared/use-search-session-shadow-transition-runtime.ts`, and `runtime/shared/use-search-runtime-instrumentation-runtime.ts` now own those lower lanes directly, and the remaining grouped root visual lane now terminates under `runtime/shared/use-search-root-visual-runtime.ts` instead of staying split across root-local chrome/reset/harness blocks.
    The Search-root UI/map/sheet visual seam is narrower too: the old `runtime/shared/use-search-root-ui-effects-runtime.ts` lane is now deleted, and those search-overlay focus/panel sync effects, transient overlay dismissal, restaurant-only reconciliation, save-sheet close-on-exit policy, and toggle-cancel harness bridge now live directly under `runtime/shared/use-search-foreground-interaction-runtime.ts`, while `runtime/shared/use-search-stable-map-handlers-runtime.ts` owns the stable map-handler ref/publication layer over the lower interaction and presentation callbacks, and `runtime/shared/use-search-results-sheet-visual-runtime.ts` owns the Search sheet visual-context memo plus the run-one/close freeze derivation and results-sheet diagnostic effect. `index.tsx` no longer keeps those mixed UI/effect, stable-callback, and sheet-visual/diagnostic clusters inline.
    The Search-root runtime publication/shortcut harness seam is narrower too: `runtime/shared/use-search-runtime-publication-runtime.ts` now owns the filter button/runtime-flag publish effects, hydration-operation publish, and prepared presentation snapshot-key publish, while the remaining shortcut submit harness bridge now rides under `runtime/shared/use-search-root-visual-runtime.ts` over `runtime/shared/use-search-shortcut-harness-bridge-runtime.ts` instead of staying root-local. `index.tsx` no longer keeps those bus-publication or shortcut-submit bridge blocks inline.
    The Search-root runtime-flags/freeze seam is narrower too: `runtime/shared/use-search-runtime-flags-runtime.ts` now owns the selector-backed search-mode/session/loading lane plus `hydrationOperationId` derivation, and `runtime/shared/use-search-freeze-gate-runtime.ts` now owns the response-frame freeze latch, freeze-gate selector surface, freeze diagnostic logging, operation-scoped commit/stall pressure cleanup, and the shortcut-mode stall-frame watcher. `index.tsx` no longer keeps either the runtime-flags/loading shell or the run-one/freeze shell inline.
    The Search-root runtime-primitives/map-bootstrap seam is narrower too: `runtime/shared/use-search-runtime-primitives-runtime.ts` now owns the sheet-dragging/search-request refs, perf-now helper, memory diagnostics stub, and marker-engine shortcut coverage bridge callbacks, while `runtime/shared/use-search-map-bootstrap-runtime.ts` now owns the access-token/style readiness lane, startup camera bootstrap, initial visible-bounds priming, and main-map-ready publication. `index.tsx` no longer keeps either mixed primitive/bootstrap shell inline.
    The Search-root session constructor seam is narrower too: the deleted `runtime/shared/use-search-root-session-runtime.ts` no longer sits between the lower session owners and the construction lane. `runtime/shared/use-search-root-session-state-runtime.ts` now owns the bus-backed runtime owner/state/flags/primitives/hydration lane, `runtime/shared/use-search-root-session-search-services-runtime.ts` now owns freeze/history/filter/request-status services, `runtime/shared/use-search-root-session-overlay-map-runtime.ts` now owns overlay-command plus map-bootstrap composition, and `runtime/shared/use-search-root-construction-runtime.ts` now composes those lower session owners directly instead of routing through another grouped root-session constructor shell.
    Shared-snap forcing is narrower too: the profile runtime no longer reaches directly into the overlay sheet-position store to force middle snap, and now consumes one `forceSharedMiddleSnap()` command through the same command-ports boundary. Marker-origin middle-snap is explicit too: the old `forceRestaurantProfileMiddleSnapRef` side channel is deleted, and marker/preview/open callers now pass `forceMiddleSnap` through typed profile-open options instead of mutating a shared ref first.
    Camera-prep ownership is narrower too: the profile runtime no longer receives `setIsFollowingUser` and `suppressMapMoved` as separate low-level map-runtime controls, and now consumes one `prepareProfileCameraMotion()` command before committing a profile camera target. Search no longer assembles those camera/sheet execution ports inline in `index.tsx` either; that remaining execution bundle now lives directly under `profile-owner-runtime.ts`, which now exports the full `useProfileOwner(...)` boundary after deleting the thin `use-profile-presentation-owner.ts` wrapper.
    The surviving camera/sheet execution boundary is narrower too: the old mixed command/phase wrapper stack is gone, and `profile-owner-runtime.ts` now stays on the live outward profile owner boundary while consuming the lower native/runtime-state/app/prepared execution lanes through the grouped `profile-owner-execution-models-runtime.ts` owner instead of rebuilding that composition inline. The native side owns grouped transition-completion/runtime binding plus native camera/sheet command transport, but that lower native lane is split more honestly now too: `profile-native-completion-runtime.ts` owns the native completion bridge, `profile-native-transition-runtime.ts` owns native transition-state reads/writes, `profile-native-command-runtime.ts` owns native sheet/camera command transport, and `profile-native-execution-model-runtime.ts` now composes those lower native owners into the grouped `nativeExecutionModel`, so the deleted `use-profile-native-execution-model.ts` no longer sits between those lower native owners and the live owner boundary. The grouped JS-owned app side stays honest too: `profile-app-execution-model-runtime.ts` now composes the grouped `appExecutionRuntime`, where `shellExecutionModel` owns grouped foreground prep/restore plus route-intent and close-time hydration/search-clear policy, and `commandExecutionModel` owns JS results-sheet/shared-snap/highlight command policy. The lower state lane is split more honestly now too: `profile-controller-shell-runtime-state-owner.ts` now owns controller-state creation plus shell selector/publication and transition-status writing, `profile-hydration-runtime-state-owner.ts` now owns the grouped hydration runtime lane, and `profile-close-runtime-state-owner.ts` now owns the grouped close-state lane instead of keeping that entire controller-state buildout inline under `profile-owner-runtime.ts`. The lower view lane is split more honestly now too: `profile-owner-presentation-view-runtime.ts` now owns highlighted-route reads, prepared-snapshot reads, shell projection, presentation-model creation, and `currentMapZoom` derivation, while `profile-owner-native-view-runtime.ts` now owns `restaurantSheetRuntimeModel` extraction from the grouped native execution lane instead of leaving that whole projection inline at the owner boundary. The root/controller app seam is grouped more honestly now too: `appExecutionArgs` now crosses as `foregroundExecutionArgs`, `closeExecutionArgs`, and `resultsExecutionArgs` instead of one flat Search-shaped bag, `profile-app-execution-runtime-contract.ts` now owns the grouped app-execution contract, and `profile-owner-runtime.ts` now consumes the grouped app execution model built by `profile-app-execution-model-runtime.ts` instead of routing that grouped `appExecutionRuntime` through the deleted `profile-app-execution-runtime.ts`, deleted `profile-app-shell-runtime.ts`, or deleted `profile-app-command-runtime.ts` wrappers. The lower prepared-runtime JS boundary is grouped more honestly now too: `profile-prepared-presentation-runtime.ts` no longer consumes loose close-restore/read/reset/clear callbacks, and instead takes that grouped `appExecutionRuntime`, where `shellExecutionModel` contains `foregroundExecutionModel`, `routeExecutionModel`, and `closeExecutionModel`, and close finalization runs through one `finalizePreparedProfileClose(...)` operation. Prepared command execution plus the `pre_shell -> shell -> post_shell` phase/state transaction execution now live together under the dedicated prepared/runtime owners instead of another owner-local command loop or executor-wrapper layer. The prepared command lane is explicit now too: the lower prepared/runtime owners split native command execution from app command execution instead of treating the remaining JS/native command work as one mixed port surface, while the lower prepared open/close/focus/completion helpers now live in `profile-prepared-presentation-runtime.ts` and the lower transition contract plus init/reset/capture helpers now live across `profile-transition-state-contract.ts` and `profile-transition-state-mutations.ts`. Phase-level native sheet commands still route through the shared `PresentationCommandExecutor` to registered bottom-sheet hosts (`app_overlay_sheet`, `restaurant_profile_sheet`) using the same request tokens as the JS command path, while the camera lane routes through `CameraIntentArbiter` into a host-keyed native `RNMBXCamera` command path (`search_map_camera`).
    The grouped action runtime is split more honestly now too: `profile-action-models.ts` is now builder-only for preview/open/focus/close/refresh-selection action models, `profile-preview-camera-target-runtime.ts` owns preview camera-target resolution, `profile-restaurant-focus-target-runtime.ts` owns restaurant focus-target resolution, `profile-restaurant-camera-motion-runtime.ts` owns restaurant camera-motion resolution, `profile-preview-presentation-plan-runtime.ts` owns preview presentation-plan assembly, `profile-open-presentation-plan-runtime.ts` owns open presentation-plan assembly, and `profile-focus-camera-plan-runtime.ts` owns focus camera-plan assembly over those lower restaurant camera owners. `profile-preview-action-execution.ts` now owns preview presentation execution, `profile-open-action-execution.ts` now owns open presentation execution, `profile-focus-action-execution.ts` now owns focus presentation execution, `profile-preview-action-runtime.ts` now owns preview action runtime assembly, `profile-restaurant-action-model-runtime.ts` now owns the shared restaurant camera/open/focus action-model assembly, `profile-open-action-runtime.ts` now owns open action runtime assembly, `profile-focus-action-runtime.ts` now owns focus action runtime assembly, `profile-auto-open-action-runtime.ts` owns auto-open model/resolution, and `profile-runtime-action-execution.ts` now owns close/refresh/auto-open runtime execution. The deleted `profile-presentation-action-runtime.ts`, deleted `profile-restaurant-camera-target-runtime.ts`, deleted `profile-action-runtime.ts`, deleted `profile-runtime-action-runtime.ts`, deleted `profile-owner-action-model-runtime.ts`, deleted `profile-owner-action-state.ts`, deleted `profile-owner-action-ports.ts`, and deleted `profile-owner-action-surface.ts` no longer sit between those lower presentation-action lanes, while the deleted `profile-owner-action-state-runtime.ts`, deleted `profile-owner-action-execution-ports-runtime.ts`, deleted `profile-owner-action-context-runtime.ts`, deleted `profile-owner-action-execution-support-runtime.ts`, deleted `profile-owner-action-engine-runtime.ts`, deleted `profile-owner-linked-action-runtime.ts`, deleted `profile-owner-presentation-action-runtime.ts`, and deleted `profile-owner-refresh-close-action-runtime.ts` no longer sit between the lower owner-action lanes and the live owner boundary, `profile-owner-query-action-context-runtime.ts` now owns submitted-query/results reads plus query-key/label derivation, `profile-owner-selection-action-context-runtime.ts` now owns selection-state assembly, `profile-owner-runtime-state-runtime.ts` now owns runtime-state assembly, `profile-owner-action-state-ports-runtime.ts` now owns the lower state-mutation/action-state port lane, `profile-owner-action-external-ports-runtime.ts` now owns the lower app/native/prepared/analytics action-port lane, `profile-owner-refresh-selection-ports-runtime.ts` now owns refresh-selection ports, `profile-owner-auto-open-ports-runtime.ts` now owns auto-open ports, `profile-owner-presentation-actions-runtime.ts` now owns the lower preview/open/focus action lane, `profile-owner-runtime-actions-runtime.ts` now owns the lower refresh-selection/close runtime-action lane, `profile-owner-action-surface-runtime.ts` now stays on outward `profileActions` publication, and `profile-owner-auto-open-kickoff-runtime.ts` now owns auto-open execution plus the owner-level kickoff effect over that public action surface instead of leaving that full lane behind extra owner-action wrappers.
    The shared lower profile contract is split more honestly now too: `profile-action-model-contract.ts` owns the shared action/source/options/model vocabulary, `profile-action-runtime-port-contract.ts` owns the action execution-port/runtime vocabulary, `profile-owner-runtime-contract.ts` owns the outward owner/search-context vocabulary, and the deleted `profile-presentation-runtime-contract.ts` no longer mixes those layers into one umbrella type host.
    The Search-derived owner-runtime lane is flatter now too: `profile-owner-presentation-view-runtime.ts` now owns highlighted-route reads, prepared-snapshot reads, owner-local shell/map state assembly, presentation-model creation, and `currentMapZoom` derivation directly, while `profile-owner-native-view-runtime.ts` now owns `restaurantSheetRuntimeModel` extraction from the grouped native execution lane instead of routing those reads through the deleted `profile-owner-search-state-runtime.ts`, deleted `profile-owner-shell-state-runtime.ts`, and deleted `profile-owner-view-surface-runtime.ts` wrappers first, while `profile-owner-runtime.ts` now stays on final outward owner composition over those lower view owners and the lower execution/state/action owners. `profile-owner-query-action-context-runtime.ts` still owns the submitted-query/results reads plus query-label/key derivation that only the lower owner-action lane still needs.
    The exported profile boundary is flatter now too: `profile-owner-runtime.ts` now stays on the live `useProfileOwner(...)` boundary plus higher-level profile assembly while the higher-level grouped runtime-state-owner buildout now lives under `profile-owner-runtime-state-owner.ts` and higher-level grouped native/app/prepared execution composition now lives under `profile-owner-execution-models-runtime.ts`, and `profile-presentation-controller.ts` is deleted because the live app path no longer imports that wrapper at all.
    The pure profile read-model lane is split more honestly now too: `profile-camera-presentation-runtime.ts` owns camera-padding resolution plus camera snapshot derivation, `profile-transition-snapshot-runtime.ts` owns transition-snapshot capture math, and `profile-view-state-runtime.ts` owns prepared snapshot-key derivation plus `profileViewState` assembly; `profile-presentation-model-runtime.ts` now just composes that lower presentation-model/runtime lane, so `profile-presentation-controller.ts` no longer physically hosts the mixed read-model cluster alongside owner composition.
    The prepared transaction-builder lane is split more honestly now too: `profile-prepared-presentation-transaction-resolver.ts` owns prepared snapshot-to-transaction resolution, `profile-prepared-open-presentation-builder.ts` owns open transaction assembly, `profile-prepared-close-presentation-builder.ts` owns close transaction assembly, `profile-prepared-focus-presentation-builder.ts` owns focus transaction assembly, and `profile-prepared-presentation-transition-runtime.ts` owns prepared open/close transition-record application against the transition state.
    The lower prepared completion lane is split more honestly now too: `profile-prepared-presentation-transaction-contract.ts` now owns prepared transaction payload types plus execution-context/request-token helpers, `profile-prepared-presentation-dismiss-runtime.ts` now owns overlay-dismiss completion update resolution, `profile-prepared-presentation-settle-runtime.ts` now owns open-settle completion update resolution, `profile-prepared-presentation-completion-executor.ts` now owns prepared completion-event execution over those lower completion owners, and `profile-prepared-presentation-runtime.ts` stays on the prepared binding hook over that lower stack.
    The lower prepared executor lane is split more honestly now too: `profile-prepared-presentation-runtime-contract.ts` owns the shared prepared runtime contract plus the grouped prepared transaction-executor type, `profile-prepared-presentation-transaction-contract.ts` owns the prepared transaction payloads plus the command-execution payload vocabulary, `profile-prepared-presentation-command-executor.ts` owns lower prepared command dispatch, `profile-prepared-presentation-state-executor.ts` owns lower prepared state/phase transaction dispatch plus direct prepared transaction iteration, and `profile-prepared-presentation-event-runtime.ts` owns the prepared completion-event bridge. The deleted `profile-prepared-presentation-action-runtime.ts`, deleted `profile-prepared-presentation-transaction-execution-runtime.ts`, and deleted `profile-prepared-presentation-executor.ts` no longer sit between those lower prepared lanes, and `profile-prepared-presentation-runtime.ts` stays on thin composition over those lower owners instead of physically hosting every lower dispatch layer.
    Decision: lock this stop line in. Native owns camera/sheet command transport plus completion binding; JS owns foreground app state, route intent, hydration-close policy, search-clear policy, and JS-side results/shared-snap/highlight commands. Future slices should delete wrapper seams around that split, not reopen promotion work for the JS shell lane.
    Settle wiring is narrower too: the old `useProfilePresentationSettleController(...)` wrapper is deleted, camera completion registration now lives directly under `useProfilePresentationCameraSettleBridge(...)`, close finalization now lives under `useProfilePresentationCloseFinalizer(...)`, and the controller composes sheet driver + sheet executor + native executor + transaction executor directly instead of carrying another bridge owner in the middle. The native motion boundary is flatter too: `useProfilePresentationNativePhaseExecutor(...)` now returns one plain native phase executor instead of an object wrapper, and that boundary now resolves the honest generic bridge name `PresentationCommandExecutor`, so the remaining profile executor stack is consistently function-shaped across native filtering, motion composition, and phase dispatch. Runtime-owned profile data is narrower too: cache/in-flight request bookkeeping, hydration request sequencing, dismiss-handled state, profile shell state, and profile transition state now live together under `runtime/profile` in `useProfileRuntimeState(...)` instead of Search-local hooks, and the auto-open same-restaurant fast path now crosses one `refreshOpenRestaurantProfileSelection(...)` action instead of raw cache refs, shell setters, and dismiss refs. Auto-open’s read boundary is narrower too: it no longer takes `isRestaurantOverlayVisible` plus `openRestaurantId` just to detect “same restaurant already open,” and instead consumes one `activeOpenRestaurantId` read-model from the composition root. Focus-session ownership is narrower too: the old raw `restaurantFocusSessionRef` no longer crosses Search root / clear-controller / profile-controller boundaries, focus-session state now lives inside `useProfileRuntimeController(...)`, and Search clear flow consumes only one imperative `resetRestaurantProfileFocusSession()` action. The old centered-on-location bookkeeping flag is gone too; startup bootstrap and profile-open no longer receive or write a `hasCenteredOnLocationRef` at all. The shell lane is narrower too: shell application now consumes the prepared shell payload directly, route intent no longer applies as a separate direct settle-path side effect, and the remaining local shell projection now lives directly under `useProfileRuntimeController(...)` through one `applyPreparedProfileShellExecution(...)` action, with highlighted-restaurant state derived there from route intent instead of riding a separate duplicate shell field. Transition status is now single-written by that runtime controller owner instead of being mutated on the ref and state separately, stored restaurant-overlay visibility is gone as a separate shell-owned write path, the profile runtime path no longer consumes `isRestaurantOverlayVisible` as a separate shell-state read just to make transition decisions, and the old separate overlay-dismiss-handled ref/reset seam is gone too. Those checks and that bookkeeping now key off runtime-owned transition/snapshot state instead, while overlay visibility itself is derived from transition status at the Search composition root rather than exported as another runtime-state field. The submit path no longer keys off that visibility getter either; it now consumes one `getIsProfilePresentationActive()` read-model, and external consumers no longer receive a raw highlighted-restaurant setter at all. They now consume one clear-only owner action, while non-null highlight updates stay runtime-owned through route intent and local shell application. The remaining focus/clear/map/overlay-switch controller consumers are narrower too: they now key off one `isProfilePresentationActive` read-model instead of reusing the overlay-visibility boolean for control flow. Profile execution transport is narrower too: the dedicated runtime/profile execution boundary now lives across `profile-owner-runtime.ts` and `profile-presentation-native-sheet-transport.ts`, while the grouped JS app shell/command boundary is composed directly inside `useProfileOwner(...)`, so neither the Search root nor the surviving owner constructs the restaurant-sheet runtime or native completion transport bridge inline anymore. The boundary decision is explicit now too: the remaining app-owned foreground/close policy stays JS-owned because it is app-state, route-intent, and hydration policy, while native remains the command executor for camera/sheet work.
    The root transition-record seam is gone too: `index.tsx` no longer owns `profileTransitionRef` or a separate `useProfileRuntimeState(...)` hook, camera orchestration now returns a captured transition snapshot instead of mutating the transition record directly, and `useProfileRuntimeController(...)` now owns the live transition record itself.
    The profile auto-open boundary is narrower too: `index.tsx` no longer composes `useProfileAutoOpenController(...)` from controller-owned profile actions/read models, and that auto-open lane now lives directly under `useProfileRuntimeController(...)` instead of remaining another root-owned profile orchestration seam.
    The root camera-lane seam is gone too: `index.tsx` no longer owns `mapCameraPadding`, `useProfileCameraOrchestration(...)`, or the profile camera command wrappers, and `useProfileRuntimeController(...)` now owns camera orchestration composition, camera padding state, and the camera execution ports directly.
    The last internal profile camera wrapper is gone too: `use-profile-camera-orchestration.ts` is deleted, its capture/padding/commit logic now lives directly inside `useProfileRuntimeController(...)`, and there is no longer another single-use hook boundary inside the controller-owned camera lane.
    The last internal close-finalization wrapper is gone too: `use-profile-presentation-close-finalizer.ts` is deleted, and close-time sheet-restore resolution, foreground restore, transition reset, and clear-on-dismiss choreography now live directly inside `useProfileRuntimeController(...)` instead of behind another single-use executor hook.
    The transaction-executor wrapper stack is gone too: `use-profile-presentation-transaction-executor.ts` and `use-profile-presentation-motion-phase-executor.ts` are deleted, and the prepared profile phase loop plus shell-vs-motion dispatch now live directly inside `useProfileRuntimeController(...)` instead of behind another pair of single-use executor wrappers.
    The camera/sheet executor wrappers are gone too: `use-profile-presentation-camera-executor.ts` and `use-profile-presentation-sheet-executor.ts` no longer own command execution callbacks, and camera/restaurant-sheet/results-sheet command dispatch now runs directly inside `useProfileRuntimeController(...)` while the remaining helper files only keep the real settle/native driver boundaries they still own.
    The native phase wrapper is gone too: `profile-presentation-native-executor.ts` is deleted, and native sheet-command forwarding plus native-command stripping now live on the dedicated runtime/profile native execution boundary through `profile-owner-runtime.ts` plus `profile-presentation-native-sheet-transport.ts` instead of behind another single-use filter hook.
    The last settle/driver wrappers are gone too: `use-profile-presentation-camera-executor.ts` and `use-profile-presentation-sheet-executor.ts` are deleted, camera completion registration now happens on that same grouped root execution transport, and the restaurant sheet runtime now comes from the root-owned `useBottomSheetProgrammaticRuntimeModel(...)` path instead of through another pair of single-use bridge wrappers.
    The custom shell-status store is gone too: `useProfileRuntimeController(...)` no longer keeps a one-off external-store wrapper for transition status, and now owns profile shell status directly in controller state while still mirroring that status onto the transition record it owns.
    Local shell application is narrower too: transition status plus restaurant shell visibility/highlight now apply through runtime-owned owner actions instead of root setter fan-out.
    Foreground-ui prep is narrower too: profile open/preview now consume one `prepareForegroundUiForProfileOpen({ captureSaveSheetState?: boolean })` command, which owns overlay prep + initial-camera readiness + optional save-sheet hide/capture in one place; close restore now uses one `restoreForegroundUiAfterProfileClose(...)` command with an opaque restore token that lives inside the profile runtime instead of the Search transition hook; close-time search clearing now routes through one `clearSearchAfterProfileDismiss()` command owned under `use-search-clear-owner.ts` and carried on the close lane by `use-search-profile-close-owner.ts` instead of the runtime knowing Search clear refs; and Search now publishes those foreground-vs-close semantics through dedicated owners instead of another inline root-local callback cluster.
    Profile close prep is narrower too: the runtime no longer receives separate pending-marker cancel and hydration-flush callback bags for close, and Search now publishes one `use-search-profile-close-owner.ts` surface with `prepareForProfileClose()` instead of hand-rolling those close-time side effects inline in `index.tsx`.
    The Search-owned profile composition root is narrower too: `index.tsx` no longer fans the selected `results` read model plus shell/foreground/close/execution owner surfaces out across separate local hook calls before invoking `useProfileRuntimeController(...)`, and now publishes that full Search-side profile boundary through `use-search-profile-runtime-owner.ts`.
    The remaining Search-owned controller environment is narrower too: `useProfileRuntimeController(...)` no longer receives raw query/search-state scalars, pending-selection refs, camera-arbiter refs, restaurant-selection helpers, tracking hooks, and focus-tuning constants as separate args, and Search now publishes that remainder through `use-search-profile-runtime-context-owner.ts` under `profileRuntimeOwner`.
    The Search root no longer hand-assembles the final profile composition either: `index.tsx` no longer owns a local `clearSearchAfterProfileDismiss()` bridge or manually wires a Search-specific profile runtime owner into the profile path, and now consumes that final profile composition through `useProfileOwner(...)` from `profile-owner-runtime.ts` while sourcing close-time clear behavior from `use-search-clear-owner.ts`. The Search-side request/action seam is narrower again too: `runtime/shared/use-search-request-presentation-runtime.ts` now owns grouped request + clear + results-presentation composition, `runtime/shared/use-search-session-action-runtime.ts` now owns grouped suggestion/profile/submit/filter plus the lower shared foreground interaction lane, and `runtime/shared/use-search-results-sheet-interaction-runtime.ts` now owns grouped results-sheet load-more/drag/snap interaction composition. `index.tsx` no longer directly calls `useSearchRequestRuntimeOwner(...)`, `useSearchClearOwner(...)`, `useProfileOwner(...)`, `useSearchSubmitOwner(...)`, `useSearchFilterModalRuntime(...)`, `useSearchForegroundInteractionRuntime(...)`, `useResultsPresentationOwner(...)`, `useResultsSheetLoadMoreRuntime(...)`, `useResultsSheetInteractionStateRuntime(...)`, `useResultsSheetSnapRuntime(...)`, or `useResultsSheetInteractionSurface(...)`.
    That final profile-owner input is smaller too: the deleted `use-search-profile-owner.ts` / `use-search-profile-runtime-owner.ts` path no longer requires prop-threading `submittedQuery`, and the extra duplicate `profileMapZoom` prop is gone as well; `useProfileOwner(...)` in `profile-owner-runtime.ts` now reads submitted-query state directly from `searchRuntimeBus` and reuses the existing execution-lane `mapZoom`.
    That profile runtime-context input is smaller too: `isSearchOverlay` no longer rides through another Search-only profile wrapper; the deleted `use-search-profile-runtime-context-owner.ts` pass-through hook is gone, and `useProfileOwner(...)` in `profile-owner-runtime.ts` now derives overlay-root visibility directly from the overlay store instead of another Search-root prop thread.
    That surviving Search-derivation lane is smaller again now: the live profile owner no longer reads `results`, `submittedQuery`, or overlay-root visibility in a deleted controller wrapper just to feed itself, and `useProfileOwner(...)` in `profile-owner-runtime.ts` now derives `currentQueryKey`, `currentQueryLabel`, `results`, and `isSearchOverlay` from grouped Search context plus runtime selectors.
    The profile action lane is flatter too: the deleted `use-profile-actions-owner.ts` wrapper no longer sits under the surviving profile owner, `profile-owner-runtime.ts` now composes the explicit execution ports plus the outward `profileActions` surface directly, and `useProfileOwner(...)` now owns the full owner runtime so the pure presentation-model runtime, the grouped preview/open/focus/close/refresh-selection/auto-open action runtime, and the remaining cyclic action-port wiring are assembled under one owner hook instead of another owner-local script or a second internal owner hook. The lower runtime-state owners now own the live `profileShellState` bus lane directly instead of a writer-ref bridge back through the owner and also own prepared shell transition application, prepared profile transaction-id allocation, the seed-and-reset shell prep, plus the close-state reset/nulling cluster, while `profile-runtime-state-contract.ts` now owns the grouped runtime-state type surface instead of a deleted top-level composer hook. Controller-owned completion-event execution now replaces the owner-local completion branch, runtime-state-owned explicit dismiss-behavior / clear-on-dismiss / foreground-restore-capture / multi-location-baseline / saved-sheet-reset operations now replace the old generic close-state reader-writer path, runtime-state-owned explicit transition-status / prepared-snapshot / dismiss-reset / transition-snapshot / prepared-transaction helpers now replace the remaining raw transition-record reads from the owner, and the runtime-state boundary itself is flatter too because `profile-owner-runtime.ts` now composes those lower shell / transition / close / hydration / focus / auto-open lanes directly instead of routing through `use-profile-runtime-state.ts`. The dead outward `resetPreparedProfileDismissTransitionHandling()` compatibility surface is gone too, and the old generic close-state patch helper is deleted instead of lingering beside the explicit close-state operations that still matter. The root-to-owner profile contract is now grouped into search-context / camera-layout / selection-policy / analytics / explicit `nativeExecutionArgs` / explicit `appExecutionArgs` instead of another giant raw arg list, that grouped search-context model is narrower too because it now publishes semantic pending-selection and restaurant-only-search getters/clear commands instead of raw Search refs, and that execution boundary is honest now too because `useProfileOwner(...)` now keeps those boundaries explicit as `nativeExecutionModel` plus direct JS app shell/command lanes without another top-level execution wrapper sitting above them. The owner seam is flatter too: `useProfileOwner(...)` now consumes grouped `searchContext`, camera-layout inputs, selection policy, analytics, explicit native/app execution args, and grouped runtime-state lanes directly, so the surviving owner no longer assembles compatibility bags or remaps runtime-state helpers one function at a time before calling deeper action and prepared-runtime owners. The low-level action surface is narrower too because preview/open/focus/close no longer each cross their own separate execution-port type and inline port bag, the action-input surface is narrower too because preview/open/focus/close/auto-open/refresh-selection no longer each cross another repeated scalar bundle and now ride grouped action models instead, the pure action-model builders now live under the dedicated lower profile action owners instead of another owner-local helper layer, and the owner no longer rebuilds refresh-selection, auto-open, prepared transaction, or prepared completion execution-port bags inline before calling those lower action/prepared execution paths. The lower prepared runtime is flatter too: `profile-prepared-presentation-transaction-runtime.ts` now owns prepared runtime-arg assembly plus prepared transaction/completion execution, `profile-prepared-presentation-entry-runtime.ts` now owns prepared open/close/focus entrypoint assembly, `profile-prepared-presentation-binding-runtime.ts` now owns completion-handler ref binding, and `profile-prepared-presentation-runtime.ts` is down to the thin `useProfilePreparedPresentationRuntime(...)` composition hook, so the owner path no longer keeps that lower execution loop, runtime builder, or completion-binding effect in the same file. The last owner-local effect lanes are almost gone too: prepared completion binding now lives under `profile-prepared-presentation-binding-runtime.ts` beside that dedicated prepared runtime hook, auto-open kickoff still lives directly under `useProfileOwner(...)`, and the surviving owner no longer assembles another prepared command/state compatibility-port layer before handing control to that dedicated prepared runtime. Prepared transaction execution now drives both command execution and close finalization through grouped native execution runtime, direct JS app shell/command lanes, grouped state execution runtime, the shared `resultsSheetExecutionModel` now published by `useResultsPresentationOwner(...)`, and the grouped results-sheet runtime now published from the direct Search-root sheet owners through `use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts`.
    That Search foreground UI leak is smaller too: the profile path no longer sees raw `isSuggestionPanelActive` plus `isSearchFocused`; `index.tsx` now publishes one `isProfileAutoOpenSuppressed` policy bit instead, and the profile runtime consumes that narrower Search-owned suppression contract.
    That Search foreground-owner input is smaller too: `use-search-profile-foreground-owner.ts` no longer requires `ensureSearchOverlay`, `dismissTransientOverlays`, `saveSheetState`, or `setSaveSheetState` from `index.tsx`; it now ensures the search root overlay directly and reads/writes save-sheet state through the overlay stores itself.
    That Search profile-owner input is narrower too: the profile owner path no longer receives raw `clearSearchState`, `isClearingSearchRef`, `isInitialCameraReady`, or `setIsInitialCameraReady`; `index.tsx` now publishes semantic `clearSearchAfterProfileDismiss()` and `ensureInitialCameraReady()` commands instead, with `clearSearchAfterProfileDismiss()` now owned under `use-search-clear-owner.ts` and carried on the close lane while the foreground owner/runtime owner consume the remaining narrower Search-owned ports.
    That Search interaction ownership is narrower too: the profile path no longer depends on a profile-specific inline `dismissSearchInteractionUiForProfile()` callback in `index.tsx`; `use-suggestion-interaction-controller.js` now owns generic `dismissSearchInteractionUi()` and `dismissSearchKeyboard()` behavior for the Search interaction lane, and the profile foreground owner consumes that generic Search-owned dismiss command instead.
    That Search clear ownership is narrower too: the inline `clearTypedQuery()` and `clearSearchState()` cluster no longer lives directly in `index.tsx`; `use-search-clear-owner.ts` now owns those Search clear semantics alongside `clearSearchAfterProfileDismiss()`, and the remaining inline close-intent orchestration just consumes that clear-owner surface.
    The root map/publication seam is narrower again too: `runtime/shared/use-search-map-runtime.ts` now owns grouped map interaction plus stable map-handler composition, the deleted `runtime/shared/use-search-root-publication-runtime.ts`, deleted `runtime/shared/use-search-root-route-publication-runtime.ts`, deleted `runtime/shared/use-search-root-render-publication-runtime.ts`, and deleted `runtime/shared/use-search-root-visual-publication-runtime.ts` no longer sit between the root and the live publication/render lanes, the lower visual publication path now terminates directly through `runtime/shared/use-search-root-visual-runtime.ts`, `runtime/shared/use-search-results-sheet-visual-runtime.ts`, `runtime/shared/use-search-results-panel-visual-runtime-model.ts`, `runtime/shared/use-search-foreground-suggestion-inputs.ts`, `runtime/shared/use-search-foreground-header-inputs.ts`, and `runtime/shared/use-search-foreground-filters-warmup-inputs.ts`, `runtime/shared/use-search-restaurant-route-host-config-runtime.ts`, `runtime/shared/use-search-restaurant-route-host-model-runtime.ts`, and `runtime/shared/use-search-restaurant-route-publication-runtime.ts` own the restaurant route publication lane, and `runtime/shared/use-search-root-runtime.ts` now composes runtime publication, those lower visual owners, route-panel publication, restaurant-route publication, `runtime/shared/use-search-root-foreground-render-owner-runtime.ts`, `runtime/shared/use-search-root-map-render-props-runtime.ts`, `runtime/shared/use-search-root-modal-sheet-render-owner-runtime.ts`, and the thin `runtime/shared/use-search-root-presentation-render-runtime.ts` directly. `index.tsx` no longer directly calls those lower map/publication/render, visual, or Search restaurant-route publication owners.
    That Search request/close ownership is narrower too: the root no longer keeps the `pendingCloseIntentIdRef` / `pendingCloseCleanupFrameRef` state machine, the inline `beginCloseSearch()` / `cancelCloseSearch()` / `finalizeCloseSearch()` controller body, or a request-cancel bridge hook; the old `use-search-close-intent-owner.ts` wrapper is deleted, the mixed `runtime/shared/use-results-presentation-shell-runtime.ts` host is deleted, the visible Search-side shell lane is now split between `runtime/shared/use-results-presentation-shell-local-state.ts` for local shell state/effects and `runtime/shared/use-results-presentation-shell-model-runtime.ts` for sheet-content plus header/default-chrome model derivation, `runtime/shared/results-presentation-shell-runtime-contract.ts` now owns the grouped action contracts, `runtime/shared/results-presentation-owner-contract.ts` now owns the outward results-owner contract surface, `runtime/shared/results-presentation-runtime-owner-contract.ts` now owns the lower results runtime-owner contract surface, the split lower results runtime lanes now live under direct owner-inline toggle interaction state/completion, direct owner-inline prepared staging, direct owner-inline marker enter/exit handoff, and the direct runtime machine inside `runtime/shared/use-results-presentation-runtime-owner.ts`, the split close lane now lives directly under direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, direct owner-inline close cleanup plus begin/cancel close flow, the deleted `runtime/shared/use-results-presentation-owner-close-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-surface-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-intent-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-search-close-runtime.ts`, and deleted `runtime/shared/results-presentation-owner-close-runtime-contract.ts` wrappers are now gone too, and `runtime/shared/use-results-presentation-runtime-owner.ts` now composes the shared results runtime owner directly with `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, and direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, and direct owner-inline close cleanup plus begin/cancel close flow, with outward `presentationActions` assembled inline instead of routing through deleted shell/outward surface wrappers or physically hosting another wrapper stack. That interaction lane is narrower again now too: the top-level owner now keeps direct tab-change publish/commit and prepared tab-switch visual-sync choreography inline while still publishing one grouped `interactionModel` outward. `use-search-request-runtime-owner.ts` owns the request lifecycle refs plus `cancelActiveSearchRequest()`, request failure/finalization policy, and the generic managed-attempt wrapper, and the remaining results composition now flows through `useResultsPresentationOwner(...)` without re-exporting the cancel lane or rebuilding the attempt/finalize/error cluster outward.
    The owner lane is flatter again too: the deleted `runtime/shared/use-results-presentation-owner-surface-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-close-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-intent-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-search-close-runtime.ts`, and deleted `runtime/shared/results-presentation-owner-close-runtime-contract.ts` no longer sit between the top-level owner and the real lower owners. `runtime/shared/use-results-presentation-runtime-owner.ts` now stays on direct composition over its direct runtime-machine, prepared-staging, toggle-lifecycle, and marker-handoff lanes, `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, and direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, and direct owner-inline close cleanup plus begin/cancel close flow, with outward `presentationActions` assembled inline.
    The owner close lane is flatter too: the top-level owner now consumes the lower close-transition, editing/execution intent, close-search cleanup, begin/cancel close, and outward owner-actions lanes directly instead of another grouped close wrapper.
    The execution-intent lane is flatter too: `runtime/shared/results-presentation-execution-intent-runtime-contract.ts` now owns the shared execution-intent vocabulary, `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts` now owns shell application, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts` now owns staged enter execution, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts` now owns committed exit execution while the top-level owner now owns direct enter/close intent planning and dispatches over those lower owners.
    The prepared-snapshot execution lane is flatter again too: the deleted `runtime/shared/use-results-prepared-snapshot-execution-runtime.ts` wrapper no longer sits between the top-level owner and the real lower executors. `runtime/shared/results-prepared-snapshot-execution-runtime-contract.ts` now owns the lower prepared-execution vocabulary, `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts` now owns cancel/backdrop/input-mode shell application, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts` now owns staged enter execution, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts` now owns committed exit execution while the top-level owner dispatches directly over those lower owners.
    Raw setter leakage is narrower too: the local profile-transition and restaurant-profile hooks no longer expose raw transition/overlay/highlight setters as the public shell contract, and `useMapInteractionController(...)` now consumes only the highlight-clear action it actually needs.
    Profile highlight ownership is narrower again too: highlighted restaurant identity is no longer duplicated in local React state inside `useProfileRuntimeState(...)`, and now derives directly from the search-owned restaurant route while shell execution applies only transition status plus route intent.
    Profile settle ownership is narrower too: `useProfilePresentationSettleController(...)` no longer interprets sheet/camera completion as profile-open transaction meaning inline, and now consumes one shared settle-update helper from `profile-presentation-controller.ts`; idle/open settle-state initialization is also shared instead of repeated literal state bags.
    Profile dismiss ownership is narrower too: overlay dismiss no longer decides “is this transition meaningful, cancel hydration, finalize close” inline in `useProfilePresentationSettleController(...)`, and now consumes one shared dismiss-update helper from `profile-presentation-controller.ts`; the idle transition-state reset shape is also shared instead of being rebuilt ad hoc in multiple runtime owners.
    The profile settle-controller boundary is narrower again too: the settle hook no longer mutates `dismissHandled` or `profileOpenSettleState` itself after resolving dismiss/settle updates, and now delegates those transition-record mutations to controller-owned apply helpers in `profile-presentation-controller.ts`.
    The bottom-sheet programmatic settle bridge is narrower too: native host snap-change events already arrive on the JS thread, and the shared programmatic driver no longer bounces those events through `runOnUI(...)` and back through `runOnJS(...)` before profile/global sheet consumers can react.
    The shared programmatic sheet-driver surface is narrower too: hosts that only care about dismiss no longer have to thread a fake programmatic-settle callback through `useBottomSheetProgrammaticSnapController(...)`.
    The profile settle-driver boundary is narrower too: `useProfilePresentationSettleController(...)` now consumes `useBottomSheetProgrammaticSnapController(...)` directly, and the extra `useProfileRestaurantSheetDriver(...)` wrapper plus callback-ref forwarding layer are deleted.
    The restaurant host boundary is narrower too: `RestaurantOverlayHost` no longer takes one programmatic sheet driver plus separate `sheetY` / `scrollOffset` / `momentumFlag` shared values for the same sheet surface, and now consumes explicit `presentationState` plus `snapController` lanes.
    The Search restaurant-route contract is narrower too: Search no longer publishes restaurant overlay state as another exploded field bag (`panelSnapshot`, `shouldFreezeContent`, `onRequestClose`, `onToggleFavorite`, `interactionEnabled`, `containerStyle`) only for the overlay layer to reassemble it later, and now publishes one route-level `panel` contract plus explicit sheet presentation/control lanes.
    The Search restaurant publication lane is narrower again too: the Search path no longer builds a pseudo host model through `RestaurantRouteHostDraft` or `createRestaurantRouteHostModelFromDraft(...)`. `runtime/shared/use-search-restaurant-route-panel-runtime.ts` now owns direct route-level panel contract assembly, `runtime/shared/use-search-restaurant-route-host-state-runtime.ts` now owns direct restaurant host-state assembly, `runtime/shared/use-search-restaurant-route-host-model-runtime.ts` now stays on thin composition over those lower panel/state owners, and `overlays/restaurantRouteHostContract.ts` now exposes the real host-state/visual-state boundary without the old Search-only draft adapter.
    Search restaurant-route panel assembly is narrower too: the deleted `useSearchRouteOverlayPanels.ts` wrapper no longer carries restaurant-specific panel outputs, `AppOverlayRouteHost` no longer assembles Search restaurant props inline, and `RestaurantRouteLayerHost.tsx` now passes the route-level `panel` contract directly while visual-only nav/search-bar geometry stays separate.
    The overlay runtime naming is narrower too: the restaurant route host contract/store no longer advertise this lane as another Search-specific runtime channel (`SearchRestaurantRouteInputs` / `searchRestaurantRouteInputs`), and now use a generic `RestaurantRouteHostInputs` owner name instead.
    The Search-route overlay host boundary is narrower too: Search no longer publishes another bundled `SearchRouteOverlayHostInputs` host bag; the overlay runtime now stores separate lanes for `searchRouteResolutionInputs`, `searchRoutePollsPanelInputs`, `searchRoutePanelSpec`, and `restaurantRouteHostInputs`, and `BaseSearchRouteSheetHost` no longer owns a restaurant-specific render branch.
    The restaurant route render boundary is narrower too: `AppOverlayRouteHost` no longer assembles separate global-vs-Search restaurant overlay props inline, and a dedicated `RestaurantRouteLayerHost` now owns the route-level restaurant host resolution before delegating into `RestaurantOverlayHost`.
    The restaurant route owner boundary is narrower too: `RestaurantRouteLayerHost` no longer consumes another prop-driven compatibility surface from `AppOverlayRouteHost`; it now reads active route, global route content, Search visual state, and Search restaurant-route inputs from their overlay-owned stores directly, so the app host only decides whether the restaurant route should mount.
    The remaining restaurant compatibility seams inside the generic Search sheet path are gone too: `AppOverlayRouteHost` now mounts `RestaurantRouteLayerHost` directly whenever the active route is `restaurant`, `useAppOverlaySheetResolution(...)` no longer models restaurant as a generic overlay-sheet key/spec/visibility case, and Search no longer bundles restaurant-route inputs into `SearchRouteOverlayHostInputs`; restaurant-route inputs now publish on their own overlay-runtime lane.
    The Search overlay-runtime contract is narrower too: the old bundled Search-route host object is gone entirely, and the app host / Search-route panel resolver now read only the split overlay-owned lanes they actually need instead of another Search-shaped compatibility contract.
    The app-host dependency boundary is narrower too: `AppOverlayRouteHost` no longer reads Search-route runtime lanes just to pre-resolve whether the Search sheet path should mount, and now mounts the non-restaurant Search-route host path from visual-state ownership alone while `useResolvedSearchRouteHostModel.ts` stays on thin composition over the lower Search host owners underneath it.
    The generic overlay-resolution boundary is narrower too: `useAppOverlaySheetResolution(...)` no longer knows about Search editing/suggestion suppression policy or the Search-vs-docked-polls interpretation, and those Search-route semantics now live under the split host lane instead of another app-level/generic resolver: `useSearchRouteOverlayPublishedState.ts` owns the published route-state selectors, `useSearchRouteOverlayRouteState.ts` owns overlay-route selection, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above the direct search/polls/tab/save family owners, `useResolvedSearchRouteHostModel.ts` now composes those lower family specs itself, `useSearchRouteOverlaySheetKeys.ts` owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that route/spec lane, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, `useSearchRouteFrozenOverlaySheetProps.ts` owns the close-handoff sheet-freeze latch, `useSearchRouteOverlayHeaderActionMode.ts` owns the header-action reset/freeze lane, `useSearchRouteFrozenOverlayRenderModel.ts` now stays on thin composition over those lower freeze owners, and `useResolvedSearchRouteHostModel.ts` now just composes those lower owners.
    The route-host boundary is narrower too: `AppOverlayRouteHost` no longer implements the non-restaurant Search sheet shell inline, and now acts as a route switch between dedicated `RestaurantRouteLayerHost` and `SearchRouteLayerHost` owners instead of carrying another embedded Search-route host.
    The Search-route overlay-spec boundary is narrower too: `SearchRouteLayerHost.tsx` no longer owns the full polls/bookmarks/profile/save-list/poll-creation spec assembly cluster inline, and that owner move now lives under `useSearchRouteOverlaySpecs(...)` while the route host only selects the already-owned non-search specs and adapts the Search route itself.
    The Search-route spec-family boundary is narrower too: `useSearchRouteOverlaySpecs(...)` no longer owns polls/poll-creation and tab/save-list overlay families together, and now delegates those distinct clusters to `useSearchRoutePollsOverlaySpec(...)` and `useSearchRouteTabOverlaySpecs(...)` so the composition hook is only wiring route-spec owners together.
    The Search-route save-list boundary is narrower too: save-list no longer rides the same owner as bookmarks/profile tab overlays, and now lives under a dedicated `useSearchRouteSaveListOverlaySpec(...)` owner so the remaining tab hook is only bookmarks/profile.
    The shared tab-overlay owner is gone too: bookmarks/profile no longer share `useSearchRouteTabOverlaySpecs(...)`, and now live under dedicated `useSearchRouteBookmarksOverlaySpec(...)` and `useSearchRouteProfileOverlaySpec(...)` owners so `useSearchRouteOverlaySpecs(...)` only composes distinct route families.
    The profile transition-record boundary is narrower too: `profile-runtime-controller.ts` no longer mutates `preparedSnapshot` / `dismissHandled` / `profileOpenSettleState` directly for open commit, close commit, seed-time dismiss reset, or close-time reset, and now delegates that transition-record mutation batch to controller-owned apply/reset helpers in `profile-presentation-controller.ts`.
    The profile camera-settle bridge is narrower too: low-level `CameraIntentArbiter` completion registration no longer lives in a mixed settle-controller wrapper, and now lives directly under `useProfilePresentationCameraSettleBridge(...)` in the camera execution boundary.
    The shared programmatic sheet runtime is narrower too: `useBottomSheetProgrammaticSnapController(...)` no longer maintains a second ref/effect callback-forwarding layer for hidden/snap-settled events, and now lets the programmatic snap handler close over the live callbacks directly.
    The profile sheet-settle bridge is narrower too: the restaurant sheet driver no longer lives behind a settle-controller wrapper, and now comes directly from `useProfilePresentationRestaurantSheetDriver(...)` while the sheet executor consumes that driver through typed command ports.
    The profile transaction-execution boundary is narrower too: phase batching, phase-payload iteration, prepared command execution, prepared completion-event execution, and prepared state-execution interpretation now live under `profile-presentation-controller.ts` through shared execution helpers, with prepared command execution now split across explicit `nativeCommandExecutionPorts` and `appCommandExecutionPorts`, while `profile-presentation-controller.ts` just dispatches prepared transactions through its grouped command/shell boundary instead of owning another inline command/transaction/completion loop.
    The JS shell-owner boundary is narrower too: `useProfileRuntimeState(...)` no longer fuses runtime-state storage with shell execution application, the dedicated `useProfilePresentationShellExecutor(...)` wrapper is gone, and the remaining JS shell lane now lives directly under `useProfileRuntimeController(...)` while runtime state keeps only the transition ref plus camera-padding storage.
    The restaurant sheet host boundary is stronger too: `RestaurantRouteLayerHost.tsx` now mounts restaurant directly through the shared `OverlaySheetShell.tsx` over explicit route-owned `sheetConfig` and `surfaceModel` lanes instead of routing through `RestaurantOverlayHost.tsx`, `RestaurantSheetHost.tsx`, or `BottomSheetWithFlashList.tsx`.
    The restaurant native action bridge is stronger too: `RestaurantPanelSnapshotNativeView` no longer returns bare action strings to JS, and now emits a typed action payload carrying restaurant id and concrete website/phone/share targets so the bridge is not just another generic string channel.
    The restaurant native payload bridge is stronger too: the `snapshot` prop now terminates immediately in explicit native payload owners on both platforms, with `CraveRestaurantPanelSnapshotView.swift` owning an embedded `RestaurantPanelSnapshotPayload` parser for the incoming `NSDictionary` on iOS and `RestaurantPanelSnapshotPayload.java` parsing the incoming `ReadableMap` on Android before the visible native views render or emit actions, so the hot panel lane no longer reads generic dictionaries / `JSONObject`s inline.
    The restaurant route contract is stronger too: Search-route runtime and global route producers no longer publish restaurant state as `panelOptions`, and now use a dedicated route-level `panel` contract that the route host passes straight into `RestaurantOverlayHost` while host-only geometry stays separate.
    The results presentation boundary is narrower again too: Search hooks now consume one dedicated bus-owned render lane (`resultsPresentation`) directly, lifecycle/snapshot-key consumers now read a dedicated lifecycle lane (`resultsPresentationLifecycle`), the map adapter consumes the dedicated transport lane (`resultsPresentationTransport`), and the richer `resultsPresentationExecution` object no longer leaks into runtime consumers beyond the transition publisher and bus storage.
    Root shell composition is narrower too: the old `applyProfileShellExternalEffects(...)` combiner is deleted, and the profile runtime/settle path now consumes direct owner actions for transition status and local highlighted-restaurant state while route intent applies directly from the settle path and overlay visibility is just a composition-root read-model.
    The remaining JS-owned profile shell lane is narrower too: `profileTransitionStatus` no longer terminates in local React state inside `useProfileRuntimeState(...)`, and now flows through one dedicated runtime-owned status store while the transition ref remains the mutable transaction record. The broad runtime-bus dependency is narrower too: `index.tsx` now selects `results` and constructs one `use-profile-shell-state-owner.ts` owner surface before calling `useProfileRuntimeController(...)`, so the controller no longer reaches into the broad `SearchRuntimeBus` for those lanes itself.
    Route-intent plumbing is narrower too: `applySearchOwnedRestaurantRouteIntent(...)` now runs directly from the profile settle path instead of crossing the Search root and profile runtime as another pass-through action.
    Panel-snapshot ownership is narrower too: the committed `restaurantPanelSnapshot` now lives in `useProfileRuntimeController(...)` instead of a separate restaurant-profile state hook, so the runtime owns both the write path and the committed snapshot state it reads for close/open decisions.
    Auto-open coupling is narrower too: `useProfileAutoOpenController(...)` no longer depends on the full committed panel snapshot shape and now only consumes `openRestaurantId` for same-restaurant refresh checks.
- Results/profile/map/sheet/chrome composition is now split across dedicated Search hooks and presentation surfaces, including:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchScreenPresentationSurface.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-results-runtime-controller.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-runtime-controller.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-map-runtime-state.ts`
- Map label source projection moved from the old component-local hook path to:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/use-map-label-sources.ts`
    and native render-controller label observation is now part of the iOS/Android executor path.
- Programmatic camera animation settle is now intent-keyed in the map runtime:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/camera-intent-arbiter.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-interaction-controller.ts`
  - `patches/@rnmapbox+maps+10.2.9.patch`
    The arbiter issues a per-animation completion id, the patched Mapbox camera emits `onCameraAnimationComplete`, and `onMapIdle` is used for viewport persistence/reveal bookkeeping rather than as the primary programmatic-camera settle authority.

### What is still not the final target architecture

- Prepared presentation transactions exist, and `PresentationTransitionController` now stores one active prepared-results execution object internally while publishing dedicated outward render/lifecycle/transport bus lanes instead of a generic execution-shaped runtime object: `resultsPresentation` for JS render readers, `resultsPresentationLifecycle` for lifecycle/telemetry/snapshot-key readers, and `resultsPresentationTransport` for the map/native transport path. Results presentation still has real Search-runtime architecture debt, but it is narrower: the separate bus-level `resultsPresentationUi` mirror is now deleted, the results panel now consumes a smaller render-policy model instead of `revealPhase` / `resultsSurfaceMode` / `resultsCardVisibility`, prepared results exits no longer masquerade as enter snapshots with fake `mapMutationKind` fields, fake enter-only `query`, `preserveSheetState`, or `transitionFromDockedPolls` placeholders, or fake `close_search` mutation metadata, prepared results snapshots now carry canonical enter `mutationKind` directly so the controller no longer translates snapshot kind into controller-owned mutation semantics on commit, prepared enter snapshots no longer retain a separate `entryMode` once their cover/snap policy has been derived, prepared enter snapshots also no longer retain `query` once the request edge has already applied the display-query override, the prepared layer no longer owns Search submit-intent vocabulary through a separate `createPreparedResultsSnapshotForIntent(...)` helper, the prepared enter helper no longer derives cover policy from `preserveSheetState`, execution-batch refs no longer redundantly carry the active request key alongside the already-owned transaction id, enter snapshots now store only one real `coverState` instead of duplicate staging/committed cover fields, and the controller’s active execution record now keeps the prepared snapshot itself instead of mirroring `transactionId` / `snapshotKind` / `mutationKind` into a second controller-owned shape. The dead outward `mutationKind` field is gone from the controller-facing execution contract, and the dead marker enter first-visible-frame callback/event path is now deleted end-to-end because it no longer carried any controller state transition. The close path now uses `createPreparedResultsExitSnapshot(...)` directly instead of a fake prepared-intent branch, the remaining prepared results intent helper is enter-only, `close_search` is gone from the live results mutation vocabulary, the runtime bus now types `toggleInteractionKind` as the real toggle-kind subset instead of the broad results mutation union, the controller type surface no longer conflates enter mutations and toggle mutations into one umbrella union, the prepared-transaction publisher no longer round-trips through a dedicated bus-patch wrapper when it can publish snapshot-key state directly, the prepared snapshot-key path no longer carries dead `transactionId/kind/stage/executionOwner` metadata, shared resolver helpers, or shared cover-state projection helpers now that only `preparedPresentationSnapshotKey` still drives a real consumer, and the runtime bus no longer carries dead prepared-transaction id/kind/stage/execution-owner fields now that only `preparedPresentationSnapshotKey` still has a live consumer. The prepared snapshot contract no longer carries `preserveSheetState` or `transitionFromDockedPolls` when those are only request-edge sheet-policy hints, the submit path no longer uses `resolveSubmitRevealMode(...)`, the runtime hook/controller boundary no longer carries the stale internal `executionProjection` naming, the internal controller publisher no longer uses the stale `publishProjection(...)` wording, and the public type surface now says `ResultsPresentationExecutionState` instead of `ResultsPresentationExecutionProjection`. The stale reveal-era `.d.ts` surfaces on the map/render/runtime path were also aligned to the current enter/exit contract so the declaration layer no longer advertises the old reveal/dismiss API. The remaining Search-side results shell is narrower too: `useResultsPresentationOwner(...)` under `runtime/shared/use-results-presentation-runtime-owner.ts` is now the runtime-owned outward boundary, the deleted `runtime/shared/use-results-presentation-shell-runtime.ts` host has been replaced by the split lower `runtime/shared/use-results-presentation-shell-local-state.ts` and `runtime/shared/use-results-presentation-shell-model-runtime.ts` owners for visible shell state/model work, the lower close lane now lives directly under direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, direct owner-inline close cleanup plus begin/cancel close flow, `runtime/shared/results-presentation-shell-runtime-contract.ts` still owns the grouped shell action vocabulary, and the deleted `runtime/shared/results-presentation-shell-controller.ts` host has been replaced by the split lower `runtime/shared/results-presentation-shell-contract.ts`, `runtime/shared/results-presentation-shell-prepared-intent.ts`, `runtime/shared/results-presentation-shell-close-transition-state.ts`, and `runtime/shared/results-presentation-shell-visual-runtime.ts` owners for pure shell contract/policy/close-state/visual derivation instead of another mixed shell helper host. Profile command execution now flows through one runtime-owned transaction execute path in `profile-runtime-controller.ts`, and that runtime controller now owns the profile camera orchestration and restaurant-sheet driver directly instead of receiving them through a separate Search hook wrapper. The internal profile command-primitives wrapper is also gone now, the bottom-sheet programmatic driver now owns latest-callback forwarding itself, internal sheet-event handlers and camera-completion handlers are no longer exported as part of the public `ProfileRuntimeController` surface, downstream consumers no longer type against one broad exported profile controller contract, the declaration layer now matches those narrow profile action contracts instead of importing the old broad controller type, and the Search composition root no longer carries `profileRuntimeController` forward as a broad object after construction; it destructures the returned profile actions/drivers and passes only the needed action subsets to children. The profile hook surface is also narrower now: the old split `presentationCommandArgs` / `uiCommandArgs` boundary has been collapsed into one `commandPorts` bag, which more honestly represents the runtime command edge. Programmatic camera completion/cancellation is now owned by `CameraIntentArbiter` instead of a Search-screen bridge or map-interaction callback prop, the runtime no longer takes raw Search suggestion setters plus the input ref as part of profile open/preview execution, and the prepared profile transaction shape now uses explicit `preShellCommands` / `postShellCommands` plus concrete `shellStateExecution` / `postShellStateExecution` planning instead of generic mutation/projection naming or an intermediate `shellStatePatch` bag. Those transaction inputs are now collapsed immediately into one ordered `phasePayloads` tuple, so the runtime no longer expands a second transaction shape right before execution. Prepared profile commands apply directly through runtime-owned camera/sheet helpers instead of another command bag, while Search-specific UI reach-through is narrowed to one `dismissSearchInteractionUi(...)` command plus narrow `ensureInitialCameraReady()` / `hideSaveSheet()` / `restoreSaveSheet()` commands. The remaining seam is no longer the whole sheet or camera lane: native phase-level sheet commands now route to registered bottom-sheet hosts with pending-command replay and token dedupe, the camera lane now routes through `CameraIntentArbiter` into a host-keyed native `RNMBXCamera` command path with JS fallback only when native execution is unavailable, and the remaining profile promotion is chiefly deciding whether shell state should remain JS-owned or also promote under a stronger native transaction executor. The restaurant panel host consumes a committed `restaurantPanelSnapshot` through a dedicated `RestaurantOverlayHost` on the UI-thread bottom-sheet primitive instead of the generic overlay-spec shell, and the restaurant overlay no longer emits JS header/list rows in the visible lane; it mounts one direct native content surface (`CraveRestaurantPanelSnapshotView`) via `contentComponent`, and the overlay-layer route host now owns the polls/bookmarks/profile snap orchestration path and polls-only route inputs instead of receiving broader Search runtime bags. The narrowed interaction gate now rides those polls-only panel inputs instead of a separate Search-route runtime-store channel. Non-polls routes also no longer block on those polls-only inputs just to mount through the app-level host, Search only publishes those polls-only inputs when the active Search-route path actually needs polls behavior, Search-route content/spec state no longer rides the app host store, host suppression/editing policy no longer round-trips through a separate Search-published render-policy bag, Search no longer pre-nulls route-runtime channels before the overlay runtime sees them, and the overlay layer no longer prop-threads those same published Search-route channels internally once they live in overlay-owned stores. Search-only selector/surface-model wrappers around this overlay path are also gone, and app-host render-freeze/suppression state no longer rides the Search runtime store, so the Search composition root now reads overlay-owned command state plus the real visual/tree/map-stage owners directly.
- The JS map presentation path is narrower too: phase derivation and active enter-request derivation now come from shared helpers in `search-map-render-controller.ts`, not parallel local helpers in multiple Search map files.
- The map presentation adapter is narrower too: it no longer exports a separate `labelResetRequestKey` field once that value derives directly from `nativePresentationState` through the shared presentation-request helper at the callsite.
- `search-map.tsx` is narrower too: it no longer takes `labelResetRequestKey` as another prop, and now derives that visual-ready key directly from `nativePresentationState`.
- The results panel is narrower too: it no longer consumes the full `resultsPresentationExecution` object just to derive render UI, and now subscribes to the smaller derived render-policy model directly.
- That render-policy path is narrower again too: the panel now selects only `snapshotKind`, `executionStage`, and `coverState` before deriving render policy, because the policy helper no longer requires the whole execution object.
- The prepared-results coordinator is narrower too: it no longer consumes the full `resultsPresentationExecution` object just to compute the committed prepared snapshot key, and now subscribes only to `transactionId`, `snapshotKind`, `executionStage`, and the live results snapshot key.
- Prepared snapshot-key ownership and map request-key derivation are also cleaner now: both use the shared stage-settled helper instead of hard-coding duplicate idle/settled checks.
- The prepared-results coordinator is cleaner internally too: staged commit promotion now follows the selected readiness/runtime inputs directly instead of carrying a second imperative bus watcher for the same keys.
- The prepared-results coordinator is narrower again too: it no longer calls `searchRuntimeBus.getState()` to capture the staging snapshot key during stage, and now uses the already-selected runtime `resultsSnapshotKey` input directly.
- The map presentation adapter is narrower again too: it no longer subscribes to the whole `resultsPresentationExecution` object, and now reads only the exact execution fields needed to build `nativePresentationState`.
- That map transport edge is cleaner too: the adapter no longer re-wraps that payload behind a `SearchMapNativePresentationState` alias or a no-op builder, and now exposes the shared render-controller presentation type directly.
- `search-map.tsx` no longer owns its own copy of the presentation transport equality contract either; presentation-state equality now lives with the shared render-controller presentation type.
- The native render-owner path is cleaner too: it no longer hand-checks presentation deltas field-by-field, and now uses that same shared presentation-state equality contract.
- Native render-owner status no longer receives a parallel `presentationBatchPhase` prop either; it now derives phase from the same shared presentation state contract it already depends on.
- Native render-owner status is narrower again too: it no longer keeps a whole phase ref just to test `idle` vs non-`idle`, and now stores only the derived active-presentation gate it actually uses.
- That render-owner status seam is tighter again too: the hook no longer translates shared presentation state into `batchPhase + isPresentationActive` inline, and now consumes one shared status projection from `search-map-render-controller.ts`.
- The native render-owner frame-admission path is cleaner too: it now computes current/previous presentation request identity once and reuses that through force-replace and same-batch checks instead of re-deriving the same request key in multiple local branches, and dead suppressed-viewport-frame local bookkeeping is deleted now that the shared admission result plus desired-frame queue state are the only live suppression owners.
- That same frame path is a bit tighter again too: the current execution request identity is now reused all the way through batch-id and churn logging instead of being reintroduced under a second local name later in the pass.
- The map-presentation to motion-pressure transaction mapping is single-owned now too: the render-controller contract derives that projection instead of leaving the native render-owner hook to map presentation phase into motion-pressure phase inline.
- The map scene-policy boundary is narrower too: `SearchMapWithMarkerEngine.tsx` no longer derives presentation phase just to request snapshot presentation policy, and now passes shared render presentation state directly into the map presentation controller.
- `search-map.tsx` is narrower again too: it no longer derives a visual-ready request key from raw render state for label-reset and visible-label scene policy, and now consumes that key from `MapSnapshotPresentationPolicy`.
- The visible label-scene gate is narrower too: `search-map.tsx` no longer merges `preparedResultsSnapshotKey` with the visual-ready request key in component space, and now consumes one `visualSceneKey` from `MapSnapshotPresentationPolicy`.
- The child map boundary is narrower too: `SearchMap` no longer receives `preparedResultsSnapshotKey` as another prop once visible-scene gating and readiness churn consume `MapSnapshotPresentationPolicy.visualSceneKey` instead.
- The map policy equality contract is single-owned now too: `search-map.tsx` no longer owns a field-by-field comparator for `MapSnapshotPresentationPolicy`, and now consumes that equality helper from the map presentation controller.
- The native render-owner diagnostics seam is narrower too: dropped-frame presentation diagnostics no longer map snapshot kind into `laneKind` inline in the hook, and now consume a shared diagnostics projection from `search-map-render-controller.ts`.
- The map presentation adapter is narrower again too: it no longer hand-builds `SearchMapRenderPresentationState` from results execution fields, and now consumes that builder from `search-map-render-controller.ts`; the `.d.ts` surface now also matches the live adapter return shape.
- The native render-owner request-comparison seam is narrower too: current/previous presentation request identity and same-batch comparison no longer derive inline in the hook, and now consume one shared sync-state projection from `search-map-render-controller.ts`.
- The results-sheet visual model and runtime freeze diagnostics are narrower too: they no longer sample broad runtime state inside effects just to log screen/freeze snapshots, and now subscribe only to `runOneHandoffPhase`, `executionStage`, and `coverState`.
- The runtime diagnostics/profiler lane is narrower again too: `runtime/shared/use-search-runtime-instrumentation-runtime.ts` now owns the selector-backed profiler state, harness observer composition, stage-hint refs, commit-span pressure advancement, and stall-frame ticker, so `index.tsx` no longer hosts that mixed profiler/diagnostics shell inline.
- The runtime profiler is narrower too: it no longer keeps a ref to the whole `resultsPresentationExecution` object just to derive stage hints, and now tracks only the derived “presentation pending” bit alongside the hydration signal it already owned.
- The runtime profiler is narrower again too: it no longer uses imperative `getState()` + subscribe loops for `resultsPresentationExecution`, `shouldHydrateResultsForRender`, or `isLoadingMore`, and now consumes those through one narrow selector-backed runtime state slice under `use-search-runtime-instrumentation-runtime.ts`.
- Harness pending-state and runtime telemetry root-state logging are narrower too: they no longer depend on the whole execution object just to answer “is presentation still pending?”, and now use a stage-level pending helper plus narrow execution-stage selectors.
- The shortcut harness observer is narrower again too: it now composes through `runtime/shared/use-search-runtime-instrumentation-runtime.ts`, no longer uses `searchRuntimeBus.getState()` for active operation and hydration-settle inputs during trace-stage and settle-boundary evaluation, and now consumes those through the same selector-backed runtime slice as map-reveal pending.
- The shortcut harness observer results seam is narrower too: it no longer subscribes to the full `results` object, and now selects only dish count, restaurant count, and `hasResults`.
- The root UI effects seam is narrower too: `use-search-root-ui-effects.ts` no longer reaches into the runtime bus just to resolve the restaurant-only match, and now consumes selected restaurant results from the composition root instead.
- The submit-actions seam is narrower too: `use-search-submit-actions.ts` no longer consults the runtime bus for pagination/loading-more gates, and now consumes selected `isLoadingMore` state from the composition root.
- The runtime-flags seam is narrower too: `runtime/shared/use-search-runtime-flags-runtime.ts` now owns the selector-backed search-mode/session/loading lane directly, including `runOneHandoffOperationId` selection, request-loading publication, and `hydrationOperationId` derivation from that same runtime slice instead of leaving that shell inline at the root or behind the older `use-search-runtime-flags.ts` wrapper.
- The results-runtime-controller seam is narrower too: `use-search-results-runtime-controller.ts` no longer consults the runtime bus for root-owned tab/session/pagination state, and now consumes selected `activeTab`, `isSearchSessionActive`, `isLoadingMore`, `canLoadMore`, and `currentPage` inputs from the composition root.
- The runtime-bus-effects seam is narrower too: `use-search-runtime-bus-effects.ts` no longer imperatively reads the runtime bus to preserve filter-toggle draft fields, and now consumes that draft state through one selector-backed runtime slice.
- The clear-controller seam is narrower too: `use-search-clear-controller.ts` no longer consults the runtime bus for root-owned search-presence/loading-more checks, and now consumes selected `hasResults`, `submittedQuery`, and `isLoadingMore` inputs from the composition root.
- The submit-runtime-controller seam is narrower too: `use-search-submit-runtime-controller.ts` no longer consults the runtime bus for `pendingTogglePresentationIntentId`, and now consumes that transaction id through a dedicated root selector.
- The query-mutation seam is narrower too: `query-mutation-orchestrator.ts` no longer consults the runtime bus for current `openNow` / votes-filter toggle state, and now consumes those root-owned filter values directly from the composition root.
- The map polish-lane seam is narrower too: `use-search-map-lane-advancement.ts` no longer uses imperative bus reads/subscriptions for active operation state, and now follows selected `activeOperationId`, `activeOperationLane`, and `executionStage` directly.
- `runtime/shared/use-search-runtime-flags-runtime.ts` is cleaner too: it no longer reaches into the runtime bus outside that dedicated selector-backed owner and now resolves current `searchMode`, `isSearchSessionActive`, and request-loading state inside one lower runtime lane before publishing writes.
- The root freeze-gate seam is narrower too: `runtime/shared/use-search-freeze-gate-runtime.ts` now owns the response-frame freeze latch, freeze-gate selector surface, freeze diagnostic logging, operation-scoped commit/stall pressure cleanup, and the shortcut-mode stall-frame watcher directly instead of leaving that run-one/freeze shell inline at the root.
- The outer submit seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for top-level `submittedQuery` fallbacks or the initial append/loading-more guard, and now consumes selected `submittedQuery` / `isLoadingMore` inputs from the composition root.
- The submit pagination seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for top-level load-more gating state, and now consumes selected `hasResults`, `canLoadMore`, `currentPage`, and `isPaginationExhausted` inputs from the composition root for `loadMoreResults(...)` and `loadMoreShortcutResults(...)`.
- Submit action ownership is narrower too: `use-search-submit-owner.ts` no longer keeps the final `loadMoreResults(...)` and `rerunActiveSearch(...)` wrappers inline, and now delegates those Search-facing action shells through `use-search-submit-action-owner.ts`.
- Submit owner diagnostics are narrower too: `use-search-submit-owner.ts` no longer owns `searchPerfDebug` policy, top-level `[SearchPerf]` submit logs, or the one-shot submit cutover probe; the Search-facing submit owner now just passes no-op logging callbacks into the lower boundaries instead of carrying another probe policy shell at the top.
- Submit owner composition is narrower too: `use-search-submit-owner.ts` no longer manufactures scheduling helpers, no-op diagnostics helpers, or the shared load-more rate-limit formatter just to thread them into lower owners. Entry scheduling now lives under `use-search-submit-entry-owner.ts`, lower submit owners default their own optional diagnostics lanes, and shared load-more error formatting now lives in `search-submit-runtime-utils.ts`.
- The Search-facing submit boundary is more explicit too: `use-search-submit-owner.ts` no longer accepts one flat catch-all construction bag from `index.tsx`, and now consumes one grouped contract of `readModel`, `uiPorts`, and `runtimePorts` instead.
- That outer submit seam is a bit tighter again too: the entity-search and shortcut-rerun entry paths no longer read the runtime bus just to clear `isLoadingMore`, and now use the same selected `isLoadingMore` read-model already threaded into `use-search-submit-owner.ts`.
- The append-response submit seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for append-path current results / pending-tab-switch / pagination-exhaustion reads when merging response state and precomputing marker pipelines, and now consumes explicit `currentResults`, `pendingTabSwitchTab`, `activeTab`, and `isPaginationExhausted` inputs from the composition root.
- The deferred submit settle seam is narrower too: `use-search-submit-owner.ts` no longer imperatively reads the runtime bus during hydration-settle / runtime-settle polling or natural-response tab fallback, and no longer owns the selector-backed runtime gate slice or the healthy-frame / hydration-settle / runtime-settle polling helpers either; that settle scheduler shell now lives under `use-search-submit-response-owner.ts`, while `use-search-submit-owner.ts` only feeds the composition-root `activeTab` read-model into the response boundary.
- Response-meta ownership is narrower too: `use-search-submit-owner.ts` now resolves response active-tab and pagination publish state through centralized helper projection instead of mixing those semantics inline with nested bus-write branches inside `handleSearchResponse(...)`.
- The phase-A response commit seam is narrower too: `use-search-submit-owner.ts` now resolves merged-results + precomputed-marker publish state through one centralized response-commit projection helper instead of assembling that patch inline inside `handleSearchResponse(...)`.
- Committed response identity is narrower too: `handleSearchResponse(...)` now uses the phase-A committed response projection as its single request-id source for commit, page-one callbacks, deferred UI writes, and settle transitions instead of mixing `normalizedResponse.metadata` reads with the committed publish path.
- Deferred non-append UI application is narrower too: `use-search-submit-owner.ts` now resolves the post-commit submitted-query/reset-sheet projection through one helper instead of assembling another inline runtime patch plus single-restaurant hide branch inside `handleSearchResponse(...)`.
- History projection is narrower too: `use-search-submit-owner.ts` now resolves recent-search upsert eligibility/payload through one response-history helper instead of interpreting response filters plus submission context inline inside `handleSearchResponse(...)`.
- Submit finalization ownership is narrower too: natural/entity/shortcut/append paths no longer each assemble their own “finalized without response lifecycle” shadow-cancel + idle cleanup sequence, and now share one runtime finalization helper in `use-search-submit-owner.ts`.
- Response settle sequencing is narrower too: `use-search-submit-owner.ts` no longer owns the full nested `visual_released -> phase_b_materializing -> settled` lane/hydration/healthy-frame script inline, and now delegates that sequence through the dedicated `use-search-submit-response-owner.ts` boundary.
- Post-commit UI follow-up is narrower too: `use-search-submit-owner.ts` no longer owns lane-C/meta, deferred UI, history upsert, and keyboard/scroll follow-up inline, and now delegates that whole post-commit block through the dedicated `use-search-submit-response-owner.ts` boundary.
- Phase-A commit ownership is narrower too: `use-search-submit-owner.ts` no longer owns the `phase_a_committed` acceptance, lane-B publish, and page-one commit callback script inline, and now delegates that through the dedicated `use-search-submit-response-owner.ts` boundary.
- The response entry boundary is narrower too: `use-search-submit-owner.ts` no longer carries normalization + stale-guard setup + response dispatch inline, and now delegates that owned response-lifecycle entry through `use-search-submit-response-owner.ts`.
- The response-lifecycle executor boundary is narrower too: `use-search-submit-owner.ts` no longer prepares the merged response context and commit/post-commit/settle script inline, and now delegates that owned response lifecycle through `use-search-submit-response-owner.ts`.
- The response-lifecycle entry boundary is narrower too: the `response_received` gate, apply-token stale guard, and normalized-response handoff no longer live in `use-search-submit-owner.ts`, and now sit under `use-search-submit-response-owner.ts`.
- Submit failure ownership is narrower too: natural, entity, shortcut, and shortcut-append no longer each assemble their own runtime error transition + idle cleanup + UI error script, and now delegate that through one shared `failSearchRequestLifecycle(...)` helper.
- Submit final-attempt ownership is narrower too: natural, entity, shortcut, and shortcut-append no longer each assemble their own loading-more unwind or in-flight reset plus `finalized_without_response_lifecycle` fallback in `finally`, and now delegate that through one shared `finalizeSearchRequestAttempt(...)` helper.
- Submit request-attempt activation is narrower too: entity, shortcut, and shortcut-append no longer each assemble request-id allocation, active-request ownership, tuple creation, shadow activation, and reject-time tuple cleanup inline, and now delegate that through one shared `startSearchRequestAttempt(...)` helper while the natural path stays explicit for the cutover contract gate.
- Structured submit foreground prep is narrower too: entity and shortcut no longer each assemble their own pre-request `setSearchRequestInFlight(true)` + presentation-intent start + submit UI lanes + keyboard dismiss + optional replace-results script, and now delegate that through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Structured submit request execution is narrower too: entity, shortcut, and shortcut-append no longer each assemble their own timed `runSearch({ kind: 'structured' ... })` block inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary, which owns the shared structured execution helpers.
- Structured response handoff is narrower too: entity, shortcut, and shortcut-append no longer each assemble their own response logging plus `handleSearchResponse(...)` option bag inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary, which owns the shared response-start helpers plus optional pre-handoff shortcut coverage publication.
- Shortcut structured request-state ownership is narrower too: `use-search-submit-owner.ts` no longer owns shortcut coverage/search-request ref state directly, and now routes coverage priming, append payload carry-forward, and response coverage publication through the dedicated `use-search-submit-structured-helper-owner.ts` boundary.
- Shortcut structured response ownership is narrower too: shortcut rerun and shortcut append no longer each assemble their own shortcut-specific response-received payload and coverage-publication handoff inline, and now delegate that through one shared `startShortcutStructuredResponseLifecycle(...)` helper.
- Restaurant entity structured payload ownership is narrower too: `runRestaurantEntitySearch(...)` no longer mutates the structured payload field-by-field inline, and now delegates entity-specific payload shaping plus submission-context construction through the dedicated `use-search-submit-structured-helper-owner.ts` boundary.
- Initial structured request preparation is narrower too: entity search and shortcut rerun no longer each assemble their own “clear loading-more, log loading-state, build page-one structured payload, stale-check tuple” script inline, and now delegate that through the dedicated `use-search-request-preparation-owner.ts` boundary instead of another local submit helper cluster.
- Structured request execution handoff is narrower too: entity search, shortcut rerun, and shortcut append no longer each assemble their own “execute structured request, log response, guard active request, start response lifecycle” sequence inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary instead of another local helper cluster.
- Structured initial request orchestration is narrower too: entity search and shortcut rerun no longer each assemble their own request-attempt shell (activation, map-reset, foreground-UI prep, shared failure path, shared finalization path) inline, and now delegate that through the dedicated `use-search-structured-submit-owner.ts` boundary instead of another local submit helper cluster.
- Structured append orchestration is narrower too: shortcut append no longer owns loading-more token setup, append attempt activation, shared append failure handling, and append finalization inline, and now delegates that through the dedicated `use-search-structured-submit-owner.ts` boundary instead of another local submit helper cluster.
- Natural request execution handoff is narrower too: `submitSearch(...)` no longer owns the inline `runSearch({ kind: 'natural' })` timing/logging, active-request guard, and response-lifecycle start block in `use-search-submit-owner.ts`, and now delegates that through the dedicated `use-search-submit-execution-owner.ts` boundary.
- Natural request payload preparation is narrower too: `submitSearch(...)` no longer assembles the natural payload, request-bounds capture, and user-location hydration inline after activation, and now delegates that through the dedicated `use-search-request-preparation-owner.ts` boundary instead of another local submit helper cluster.
- Natural foreground UI orchestration is narrower too: the non-append natural path no longer owns its pre-request UI shell inline after activation, and now delegates presentation-intent start, lane scheduling, loading-more reset, and replace-results fallback through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural request orchestration is narrower too: `submitSearch(...)` no longer owns the post-activation try/catch/finalize shell inline, and now delegates loading-more token setup, shared natural failure handling, and finalization through the dedicated `use-search-natural-submit-owner.ts` boundary instead of another local submit helper cluster.
- Natural request decision shaping is narrower too: `submitSearch(...)` no longer resolves submission source/context, tab, preserve-sheet policy, open-now/filter policy, and force-fresh-bounds policy inline, and now delegates that option-to-runtime config mapping through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural response handoff is narrower too: `submitSearch(...)` no longer assembles the natural `handleSearchResponse(...)` option bag inline in `use-search-submit-owner.ts`, and now delegates that through the dedicated `use-search-submit-execution-owner.ts` boundary.
- Natural entry-shell ownership is narrower too: `submitSearch(...)` no longer owns append gating, pre-activation map-reset, query normalization, and empty-query clear inline, and now delegates that through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural response logging ownership is narrower too: response payload logging no longer happens from both the natural execution helper and the natural response-lifecycle helper, and now stays single-owned in `startNaturalResponseLifecycle(...)`.
- Natural post-activation ownership is narrower too: `submitSearch(...)` no longer owns the full post-activation foreground-UI, payload-prep, run-search, and response-start script inline, and now delegates that through the dedicated `use-search-natural-submit-owner.ts` boundary instead of another local submit helper cluster.
- Structured response handoff ownership is narrower too: entity and shortcut branches no longer thread fixed response-log labels and fixed response-received payload assembly inline, and now keep those mode-owned details under dedicated entity/shortcut response helpers.
- Structured execution label ownership is narrower too: entity and shortcut branches no longer thread fixed debug/timing/response-phase labels inline, and now keep those mode-owned execution labels under dedicated structured execution helpers.
- Structured entry-config ownership is narrower too: entity and shortcut rerun branches no longer assemble fixed submit-intent and foreground-UI config inline, and now keep those mode-owned entry shells under dedicated structured entry-config helpers.
- Shortcut append entry-config ownership is narrower too: the append branch no longer assembles its fallback label and fixed submit-intent config inline, and now keeps that shortcut-owned setup under one dedicated append entry-config helper.
- Shortcut response-start ownership is narrower too: rerun and append branches no longer thread fixed `append`/`targetPage`/fallback-request-id/initial-UI-state response fields inline, and now keep those shortcut-owned lifecycle details under dedicated initial-vs-append response helpers.
- Mode-owned structured execution scripts are narrower too: entity, shortcut rerun, and shortcut append branches no longer own their full inline “prepare payload, run search, start lifecycle” scripts, and now delegate those through dedicated mode-owned execution helpers.
- Prepared-results coordinator ownership is narrower too: it no longer stitches together `transactionId` / `snapshotKind` / `executionStage` just to derive the committed prepared snapshot key, and now consumes one shared committed-key derivation instead.
- Published prepared snapshot-key ownership is narrower too: the map layer no longer redefines the fallback from `preparedPresentationSnapshotKey` to hydration/request keys inline, and now consumes one shared prepared-snapshot-key derivation from the runtime contract.
- Shared map presentation-state ownership is narrower too: the map adapter no longer hand-selects execution fields and rebuilds `SearchMapRenderPresentationState` inline, and now consumes one shared runtime-to-presentation projection from the render controller.
- Shared map execution-batch-id ownership is narrower too: the native render owner no longer resolves execution-batch ids inline from presentation/request churn state, and now consumes one shared batch-id derivation from the render controller.
- Shared map transport-diagnostics ownership is narrower too: the native render owner no longer hand-assembles request-key/batch-phase logging fields for churn diagnostics, and now consumes one shared transport-diagnostics projection from the render controller.
- Shared map frame-delta ownership is narrower too: the native render owner no longer computes viewport/presentation/control change booleans inline, and now consumes one shared frame-change derivation from the render controller.
- Shared native render diagnostics ownership is narrower too: the native render owner no longer owns commit-burst message parsing, transition-diagnostic gating, or top-source summary sorting inline, and now consumes those diagnostics derivations from the render controller.
- Shared native render-owner ready-state ownership is narrower too: attach/invalidation ready-state preservation no longer lives as two hook-local branches, and now consumes one shared preservation rule from the render controller; the declaration mirror is also back in sync with the live render-controller contract.
- Profile close-finalization ownership is narrower too: `profile-runtime-controller.ts` no longer owns close-time sheet-restore resolution, foreground restore, transition reset, or clear-on-dismiss choreography inline, and that batch now lives under `useProfilePresentationCloseFinalizer(...)` while the settle bridge calls a stable finalizer callback.
- The remaining profile completion bridge is narrower too: `profile-runtime-controller.ts` no longer keeps mutable callback refs just to let dismiss/sheet-settle handlers reach the live close finalizer or transaction executor, and now uses typed event callbacks instead of another ad hoc ref-forwarding seam.
- The profile read-model boundary is narrower too: `index.tsx` no longer derives profile overlay visibility, active-open restaurant id, presentation-active state, or the prepared profile snapshot key from raw transition status/ref state, and now consumes those read models directly from `useProfileRuntimeController(...)`; the prepared-presentation publisher also no longer reads `profileTransitionRef` / `profileTransitionStatus` / `showProfileOverlay` just to derive the profile snapshot key.
- The root-facing profile render bag is narrower too: `index.tsx` no longer reads `restaurantPanelSnapshot` and `mapCameraPadding` as separate controller fields, and now consumes one `profileViewState` model from `useProfileRuntimeController(...)` that groups presentation state, panel snapshot, and camera padding together.
- Highlighted restaurant identity now rides that same `profileViewState` model instead of escaping as another parallel root-facing field; the remaining separate profile export is only the clear-highlight action.
- That last separate clear-highlight export is gone too: `clearMapHighlightedRestaurantId()` now rides the `profileActions` bundle, so the outward profile controller surface is just `profileViewState`, `restaurantSheetSnapController`, and `profileActions`.
- The foreground chrome model is narrower too: the deleted `use-search-foreground-chrome-model.ts`, `use-search-foreground-overlay-runtime.ts`, and `use-search-foreground-render-runtime.ts` no longer assemble and re-export another mixed foreground host. `index.tsx` now composes direct overlay/runtime, results/publication, and suggestion/header/filter input lanes through the real lower route-panel, docked-polls, overlay-runtime, and chrome-render owners instead of another exploded scalar prop list or another mixed foreground bag. The Search-owned foreground input lane is flatter too: `use-search-results-panel-visual-runtime-model.ts`, `use-search-foreground-suggestion-inputs.ts`, `use-search-foreground-header-inputs.ts`, and `use-search-foreground-filters-warmup-inputs.ts` now own the final results-panel visual model plus the final suggestion/header/warmup input surfaces, while `runtime/shared/use-search-route-panel-publication-runtime.tsx` now owns the full Search-route publication lane over `use-search-results-panel-data-runtime.tsx`, `use-search-results-panel-read-model-runtime.tsx`, `use-search-results-panel-render-policy-runtime.tsx`, `use-search-results-panel-covered-render-runtime.tsx`, `use-search-results-panel-surface-state-runtime.tsx`, `use-search-results-panel-interaction-frost-runtime.tsx`, `use-search-results-panel-surface-background-runtime.tsx`, `use-search-results-panel-surface-overlay-runtime.tsx`, `use-search-results-panel-spec-runtime.tsx`, `use-search-results-panel-route-visibility-runtime.tsx`, and `useSearchRouteOverlayRuntime(...)`, so `index.tsx` no longer keeps that panel/read-model/spec/publication cluster inline either. The remaining Search-root foreground interaction/input and visual lane is flatter too: `use-search-suggestion-interaction-runtime.ts` now owns the suggestion interaction controller composition that the profile owner and suggestion/header surfaces consume, `use-search-foreground-interaction-runtime-contract.ts` now owns the shared foreground interaction vocabulary, `use-search-foreground-launch-intent-runtime.ts` now owns launch-intent routing, `use-search-foreground-submit-runtime.ts` now owns submit/search-this-area/suggestion/recent selection orchestration, `use-search-foreground-retry-runtime.ts` now owns reconnect retry policy, `use-search-foreground-editing-runtime.ts` now owns clear/focus/blur/back editing behavior, `use-search-foreground-overlay-runtime.ts` now owns route-intent replay plus view-more/overlay selection, and `use-search-foreground-interaction-runtime.ts` now stays on thin composition over those lower foreground interaction owners. `use-search-request-status-runtime.ts` now owns grouped search-request plus system-status reads, `use-search-history-runtime.ts` now owns the grouped recent-search / recently-viewed history lane, `use-search-filter-state-runtime.ts` now owns the grouped filter store selection lane, `use-search-filter-modal-runtime.ts` now owns the later filter-modal/control surface over the lower modal owner, `use-search-autocomplete-runtime.ts` now owns autocomplete cache/suppression/request lifecycle, `use-search-recent-activity-runtime.ts` now owns recent-search upsert plus recently-viewed buffering/flush policy, `use-search-foreground-input-runtime.ts` now owns query/focus/press-in/change handling plus shortcut query reseed behavior, `use-search-suggestion-transition-timing-runtime.ts` now owns keyboard-aware transition timing policy, `use-search-suggestion-transition-presence-runtime.ts` now owns transition-driver presence/overlay visibility, `use-search-suggestion-layout-warmth-runtime.ts` now owns layout warmth plus drive-layout policy, `use-search-suggestion-transition-runtime.ts` now stays on thin composition over those lower transition owners, `use-search-suggestion-display-runtime.ts` now owns live suggestion/recent/autocomplete display derivation, `use-search-suggestion-hold-state-runtime.ts` now owns hold snapshot state plus capture/reset primitives, `use-search-suggestion-hold-actions-runtime.ts` now owns submit/close hold command construction, `use-search-suggestion-hold-sync-runtime.ts` now owns hold registration plus query/layout cleanup effects, `use-search-suggestion-held-display-runtime.ts` now owns held suggestion surface outputs, `use-search-suggestion-hold-effects-runtime.ts` now stays on thin composition over those lower hold-lifecycle owners, `use-search-suggestion-hold-runtime.ts` now stays on thin composition over those lower hold owners, `use-search-suggestion-visibility-runtime.ts` now stays on thin composition over those lower visibility owners, `use-search-suggestion-layout-state-runtime.ts`, `use-search-suggestion-layout-visual-runtime.ts`, and `use-search-suggestion-header-holes-runtime.ts` now own the paired layout caches, cutout geometry, and header spacing lane under the thin `use-search-suggestion-layout-runtime.ts` surface, `use-search-suggestion-surface-runtime.ts` now stays on thin composition over the lower visibility/layout owners, `use-search-foreground-visual-runtime.ts` now owns the later chrome/search-shortcut/search-this-area/results-sheet visual lane, and `index.tsx` no longer keeps either mixed foreground cluster inline. The final render surface is flatter too: `runtime/shared/search-root-render-runtime-contract.ts` now owns the shared render vocabulary, `runtime/shared/use-search-root-foreground-render-runtime.ts` now owns chrome render-model plus bottom-nav prop assembly, `runtime/shared/use-search-root-map-render-props-runtime.ts` now owns final map prop assembly, `runtime/shared/use-search-root-modal-sheet-render-runtime.ts` now owns the score-sheet and price-sheet prop lane, and [`components/SearchRootRenderSurface.tsx`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchRootRenderSurface.tsx) now owns the final `SearchMapWithMarkerEngine`, `SearchSuggestionSurface`, `SearchOverlayHeaderChrome`, hidden `SearchFilters`, `SearchBottomNav`, `SearchRankAndScoreSheets`, `SearchPriceSheet`, and `SearchStatusBarFade` mount tree. `index.tsx` no longer builds those final render props inline or mounts that final render tree inline either.
- The foreground submit lane is narrower too: `use-search-foreground-submit-preparation-runtime.ts` now owns shared submit/recent preparation, `use-search-foreground-primary-submit-runtime.ts` now owns submit/search-this-area/shortcut submits, `use-search-foreground-suggestion-submit-runtime.ts` now owns suggestion selection submits, `use-search-foreground-recent-submit-runtime.ts` now owns recent/recently-viewed submits, and `use-search-foreground-submit-runtime.ts` now stays on thin composition over those lower submit owners instead of remaining the mixed submit family host.
- The foreground chrome presentation layer is narrower too: `SearchForegroundChrome.tsx` and `SearchOverlayChromeTree.tsx` are now deleted, and the Search root mounts `SearchSuggestionSurface`, `SearchOverlayHeaderChrome`, the hidden SearchFilters warmup lane, bottom-nav, and the remaining score/price sheets directly instead of crossing another chrome render wrapper.
- The foreground chrome runtime seam is narrower too: the deleted foreground wrappers, deleted route-panel wrapper pair, and deleted Search-only docked-polls publication shim no longer sit between Search and the overlay runtime store. `index.tsx` now composes Search-route publication plus overlay-runtime publishing directly from the lower panel publication lanes and the thin `useSearchRouteOverlayRuntime(...)` overlay owner, and it now composes final chrome render-model assembly directly through `use-search-overlay-chrome-render-model.ts`; `useSearchRouteOverlayPublisher.ts` stays deleted instead of preserving another publish/clear adapter between Search and the overlay runtime store.
- The remaining profile settle/finalization event seam is narrower too: `useProfileRuntimeController(...)` no longer keeps `useEffectEvent` wrapper indirection around prepared-transaction execution or close finalization for sheet dismiss/snap-settled callbacks, and now calls those controller-owned executors directly from the live settle handlers.
- The root-to-map profile action seam is narrower too: `index.tsx` no longer re-bundles `openRestaurantProfilePreview(...)` and `openRestaurantProfile(...)` into a separate `markerProfileActions` bag, and the map stage now consumes the existing `profileActions` owner surface directly.
- The outward results-controller contract is narrower too: `PresentationTransitionController` no longer publishes a generic execution-shaped payload for `use-search-presentation-transition-runtime.ts` to reinterpret, and now publishes the three real outward lanes directly (`resultsPresentation`, `resultsPresentationLifecycle`, `resultsPresentationTransport`) while `search-runtime-bus.ts` simply re-exports that runtime contract instead of redefining it.
- The old generic results execution compatibility type is gone too: `ResultsPresentationExecutionState`, `IDLE_RESULTS_PRESENTATION_EXECUTION_STATE`, and `resolveResultsPresentationExecution(...)` are deleted from the live runtime tree, and the remaining projection state is now controller-private instead of another exported runtime derivation surface.
- The old object-level pending/settled helper vocabulary is gone from the public runtime surface too; only the stage-level settled helper still escapes because the map transport/runtime contract actually uses it.
- The remaining non-render profile state is narrower too: transition/close runtime state plus hydration intent, request sequencing, profile cache/in-flight requests, focus session, auto-open key, and presentation transaction sequencing now live under one controller-owned `profileControllerStateRef` instead of a split `profileRuntimeStateRef` + `profileMutableStateRef`.
- The root selector surface is a bit tighter too: `index.tsx` no longer carries a second submit-only runtime selector for `currentResults` / `pendingTabSwitchTab`, and now folds those fields into the existing results-arrival selector.
- The composition-root seam is narrower too: `index.tsx` no longer reaches into `searchRuntimeBus.getState()` for search-this-area visibility or close-time hydration flush checks, and now consumes selector-backed `isLoadingMore` plus hydration-key state directly.
- Submit settle gating is narrower too: it no longer reads the whole execution object just to decide whether visual work is settled, and now keys off a stage-level settled helper.
- Map polish-lane advancement and the runtime profiler now also use those stage-level helpers directly instead of routing pending/settled checks through the whole execution object.
- Map polish-lane advancement is narrower again too: it no longer re-reads `resultsPresentationExecution` from the runtime bus inside its subscribe loop once it already has selected `executionStage`, and now subscribes only to active operation changes during runtime advancement.
- The runtime telemetry hook is narrower too: `runtime/shared/use-search-runtime-instrumentation-runtime.ts` now owns run-one phase telemetry, root-state commit telemetry, and presentation-diff telemetry, so `index.tsx` no longer runs that mixed telemetry shell inline and no longer uses imperative bus-watch loops with raw `getState()` reads for those signals.
- The runtime telemetry hook is narrower again too: it no longer selects handoff-operation / execution-stage state twice across overlapping runtime slices, and now shares one selector-backed handoff-presentation state between root-state commit telemetry and presentation-diff telemetry under that lower instrumentation owner.
- The JS map render-owner path is narrower too: it no longer compares a ghost `executionBatch.requestKey` field, and instead treats request identity as `transactionId` while batch identity remains `batchId/generationId`.
- Motion pressure is narrower too: the planner-specific materiality helpers are now controller-private inside `map-motion-pressure.ts` instead of another exported runtime surface, so the surviving public motion contract is the planner admission path rather than helper trivia.
- Sticky label preference no longer flows into the native label source contract, JS label source revisions are candidate-static instead of preference-static, and the dead JS sticky-state mirror used by the old fallback source-projection path has been removed. The remaining fallback path is observation-only in non-native environments.
- Motion-time map planning/publish pressure now has one shared `MotionPressureState`, transaction-aware publish/backpressure admission, centralized candidate/LOD planner admission, materiality, and planner-policy helpers in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-motion-pressure.ts`, dead publish-start/publish-ack timestamp bookkeeping is deleted from that shared state, planner/render-frame admission helpers now return pure admission results instead of mutating fairness state internally, failed/dropped native publish attempts now only clear the in-flight transport bit while successful native sync is the path that resets fairness bookkeeping, and queued-frame replacement / owner-epoch retargeting / in-flight ack state now live directly in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts` instead of a separate queue module. The remaining motion gap is now mostly the native transport admission surface, not planner-local materiality drift.
- Instrumentation and compatibility plumbing have been materially reduced: Search runtime diagnostics are now debug-level, heavy label perf logging is disabled by default, and the remaining `console.log` output is intentional perf-harness contract emission. Delete-gate cleanup is still active only for newly touched compatibility seams or dead comments, not for already-promoted runtime owners.

### Current execution order

The current architecture sequence is:

1. finish the remaining overlay-runtime decoupling work so Search-specific render/runtime suppression policy no longer leaks through generic overlay host/resolution boundaries,
2. then finish the remaining internal results-controller cleanup so the long-term results shape is defined by prepared transaction policy plus the outward render/lifecycle/transport lanes (`resultsPresentation`, `resultsPresentationLifecycle`, `resultsPresentationTransport`), with executor-shaped transition/apply/logging machinery staying below the narrowed public contract inside the thicker `results-presentation-runtime-machine.ts` owner instead of re-expanding into compatibility-shaped controller internals,
3. then make the explicit end-state decision on the remaining profile shell/final-completion boundary: either accept the current JS-owned shell lane as the intended architecture boundary, or promote that last lane under a stronger native/UI executor,
4. then close the remaining convergence work: any remaining future global restaurant producer adoption, motion-pressure unification, sticky-label fallback cleanup, and residual instrumentation/delete-gate cleanup.

Detailed active plans:

- `/Users/brandonkimble/crave-search/plans/prepared-snapshot-presentation-architecture-audit.md`
- `/Users/brandonkimble/crave-search/plans/global-overlay-route-runtime-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/map-motion-pressure-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-label-observation-native-cutover-plan.md`

## 1) Product Contract (User-Visible Behavior Must Match)

This is the acceptance oracle for every migration slice.

Global invariants:

- no user-visible UX changes unless explicitly approved,
- no stale result flash after newer submit reaches phase-A commit,
- no map snap-back while user gesture is active,
- sheet drag/snap responsiveness remains equivalent to current behavior,
- tab/filter/pagination semantics remain unchanged.

### 1.1 Interaction Contracts (Authoritative)

| Interaction           | Required event order                                                                                                           | Synchronous JS budget                            | Cancellation precedence                                       | Visible parity rule                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| Shortcut submit       | `submit_intent -> submitting -> response_received -> phase_a_committed -> visual_released -> phase_b_materializing -> settled` | phase-A commit <= 1 frame target                 | newest submit cancels prior submit and dependent phase-B work | no full-screen blank between old/new results   |
| Natural/entity submit | same order as shortcut via mode adapters                                                                                       | same as shortcut                                 | newest submit wins across all search modes                    | no stale previous-query snapshot after phase-A |
| Map pan/zoom          | `gesture_start -> camera_user_controlled -> viewport_update -> map_read_model_update -> gesture_end -> settle`                 | camera gesture lane has strict priority          | user gesture overrides programmatic camera writes             | no active-gesture snap-back                    |
| Sheet drag/snap       | `drag_start -> drag_active -> snap_resolve -> settle`                                                                          | drag lane never blocked by search/map phase-B    | drag lane preempts phase-B                                    | no hitching caused by submit/map enrichment    |
| Filter mutation rerun | `filter_intent -> query_mutation_apply -> submit_intent -> ...`                                                                | filter apply stays lightweight                   | newest filter mutation wins                                   | chips reflect latest filter immediately        |
| Pagination append     | `end_reached -> page_request -> page_response -> append_phase_a -> append_phase_b -> settled`                                  | append cannot block active scrolling             | new submit cancels pending append                             | no duplicates, no stale append onto new query  |
| Overlay switch        | `overlay_intent -> shell_transition -> overlay_settled`                                                                        | shell transition isolated from heavy search work | newest overlay intent wins                                    | no overlay/search state bleed                  |

### 1.2 Performance Contract (Current Baseline + Target)

Current canonical signal from investigation log (`/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`):

- floor is currently around `~3.27` on recent baseline,
- dominant bottlenecks: `results_hydration_commit` and `marker_reveal_state`.

Program objective:

- repeatable floor lift `> +20` from locked baseline, then continue toward `+25`.

Gate primitives (required for any promotion evidence):

- minimum completed runs `>=3` for both baseline and candidate reports,
- baseline/candidate `harnessSignatureStable` must match,
- baseline/candidate environment parity (`launchTargetMode`, `runtimeTarget`, `launchPreferDevice`) must match,
- all required harness markers present,
- comparator inputs must share the same `schemaVersion`,
- comparator threshold checks remain active (`floorMean`, `stallP95`, `uiFloorMean`, `uiStallP95`),
- baseline regression-denominator metrics must be non-degenerate (`stallP95` and `uiStallP95` above configured floor; defaults `>= 1`).

Slice-class promotion policy (blocking):

| Slice class             | Slices                             | Promotion expectation                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural scaffolding  | P0, P0.5, S1, S2                   | correctness + observability stability first: no timeout-shaped harness run completion, no transition legality regressions, and no-worse perf deltas by threshold policy. Absolute catastrophic failure is waivable only when it is the sole failure and candidate is not worse than locked baseline.                    |
| Ownership cutover       | S3, S4                             | same as structural, plus no stale-write regressions and no new catastrophic stage families outside known hotspots (`results_list_materialization`, `results_list_ramp`, `marker_reveal_state`, `visual_sync_state`). Promotion evidence must use robust matched-gate median deltas (section 9.2), not a single compare. |
| Perf-bearing ownership  | S5, S6, S7, S8, S9A, S9B, S9D, S9E | same as ownership cutover, plus directional improvement in the hotspot targeted by the slice; if hotspot signal is flat/regressed, promotion is blocked until the blocker is fixed. Promotion is blocked if strict root ownership checks fail for the slice.                                                            |
| JS optimization tranche | JS0, JS1, JS2, JS3, JS4            | JS0 must emit attribution evidence (`stageAttribution` top contributors). JS1-JS4 require directional hotspot improvement on `results_hydration_commit` and `visual_sync_state`, median `stallP95` improvement, and no catastrophic waiver usage.                                                                       |
| Ownership decomposition | S9C, S9F                           | ownership extraction is required with no-worse perf by thresholds, strict root ownership delete-gate evidence, and no dual-control root/runtime overlap for migrated concerns.                                                                                                                                          |
| Program completion      | S10, S11, refactor completion      | full policy enforced with no waivers, including absolute catastrophic gate: no catastrophic `>300ms` stage in `>=2/3` runs (JS and UI lanes).                                                                                                                                                                           |

Waiver rule for existing catastrophic baseline:

- if comparator fails only on the absolute catastrophic check,
- and locked baseline already fails the same check,
- and candidate `catastrophic.runCount <= baseline catastrophic.runCount`,
- and all other gate checks pass,
- then structural/ownership slices may promote with explicit waiver note attached to the compare artifact.

## 2) Current Frontend Reality (Code-Evidenced Map)

### 2.1 Runtime hotspots

| File                                                                                                | Signal                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                        | ~10k LOC, mixed orchestration + render + map + overlay    |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`        | heavy map query/label/control plane                       |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts` | broad response apply and submit fan-out                   |
| `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`                  | local poll composer + header/snap UI shell still grouped  |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx`                          | auth + step logic + animation orchestration in one module |

### 2.2 Concrete root-cause anchors

1. Root map writes in screen scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6878`

2. Full-catalog fallback candidate path:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`

3. Root-owned hydration scheduling (`InteractionManager` + RAF):

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8585`

4. Broad response fan-out:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts:361`

5. Pre-request clear branch still present:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts:718`

### 2.3 Existing architecture assets to preserve

1. Overlay shell and snap persistence are strong:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/OverlaySheetShell.tsx`

2. Sheet interaction utility is already separable:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-sheet.ts`

3. Search session origin coordinator exists:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/session/use-search-session-coordinator.ts`

4. Edge-fade and marker LOD guardrails are documented and must be honored:

- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md`

### 2.4 Red-Team Reality Check (2026-02-13)

Current hard facts from repository inspection:

1. Harness plumbing files under `/Users/brandonkimble/crave-search/apps/mobile/src/perf/**` now have active runtime call sites in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` that emit `shortcut_loop_*` markers and JS/UI sampler events.
2. CI P0 jobs remain fixture-backed and validate parser/comparator/no-bypass wiring; live runtime perf is enforced through local gate flow (`scripts/perf-shortcut-local-ci.sh`) until hosted live perf CI is reintroduced.
3. Reported investigation snapshot metrics and parser-derived metrics can diverge unless metric definitions are explicitly version-locked.

## 3) Target Runtime System (Reverse-Engineered from UX)

### 3.1 Domain boundaries

Target boundaries:

- `features/search/runtime`: request lifecycle, submit orchestration, map/list/header/chip read-models,
- `features/overlay/runtime`: shell transitions, snap/scroll persistence, panel mount policy,
- `features/polls/runtime`: socket + fetch + autocomplete orchestration,
- `features/onboarding/runtime`: step state machine + auth lane + username lane,
- `features/profile/runtime`: selector-first profile actions,
- `platform/navigation-runtime`: bootstrap and gating ownership,
- `platform/telemetry-runtime`: production-safe event schema and counters.

### 3.2 Runtime event protocol (non-negotiable)

All state-mutating runtime events use one envelope.

```ts
export type RuntimeDomain =
  | 'search_session'
  | 'map_presentation'
  | 'overlay_shell'
  | 'list_sheet'
  | 'polls_runtime'
  | 'onboarding_runtime'
  | 'navigation_runtime';

export type RuntimeEvent<TType extends string = string, TPayload = unknown> = {
  domain: RuntimeDomain;
  type: TType;
  sessionId: string;
  operationId: string;
  seq: number;
  requestId?: string;
  atMs: number;
  payload: TPayload;
};
```

Acceptance rules:

- reducer accepts event only when `(sessionId, operationId, seq)` dominates current lane tuple,
- stale events are dropped and counted (`staleEventDropCount`),
- illegal transition emits `transitionViolation` and is tracked in runtime telemetry.

### 3.3 Search session state machine (authoritative)

States:

- `idle`
- `submitting`
- `receiving`
- `phase_a_ready`
- `phase_a_committed`
- `visual_released`
- `phase_b_materializing`
- `settled`
- `cancelled`
- `error`

Legal transitions only:

- `idle -> submitting`
- `submitting -> receiving | cancelled | error`
- `receiving -> phase_a_ready | cancelled | error`
- `phase_a_ready -> phase_a_committed | cancelled | error`
- `phase_a_committed -> visual_released | cancelled | error`
- `visual_released -> phase_b_materializing | settled | cancelled | error`
- `phase_b_materializing -> settled | cancelled | error`
- `settled -> submitting | idle`
- `cancelled -> submitting | idle`
- `error -> submitting | idle`

### 3.4 Lane priority and preemption

Runtime priority order:

1. `sheet_drag` and `user_camera_gesture`
2. `selection_feedback`
3. `phase_a_commit`
4. `overlay_shell_transition`
5. `phase_b_materialization`
6. `telemetry/non-critical logging`

Preemption rules:

- lane 1 preempts all lower lanes,
- new `submit_intent` cancels older search operation and all dependent phase-B work,
- overlay transitions may pause phase-B but do not cancel active submit operation.

### 3.5 Read-model architecture (frontend CQRS style)

Write model owners:

- `SearchSessionController` owns request phase transitions and operation tuple,
- `MapPresentationController` owns camera intent arbitration and map presentation tuple,
- `OverlayRuntimeController` owns overlay shell transition tuple.

Read models (pure projections):

- `ListReadModelBuilder`: sections, rows, pagination projection,
- `HeaderReadModelBuilder`: titles/counters/status strings,
- `ChipReadModelBuilder`: filter chip projection,
- `MapReadModelBuilder`: viewport subset and incremental marker diff payload.

UI rule:

- presentation components consume selectors only,
- no heavy derivation in JSX or screen-level callbacks.

### 3.6 Performance-First Decomposition Rules (No Move-Only Refactors)

These rules are mandatory for S9A-S9F:

1. No move-only extraction: each slice must add at least one runtime performance mechanism, not just relocate code.
2. Owner computes, UI reads: heavy derivation stays in runtime owners/selectors keyed by operation tuple/version.
3. Incremental apply over rebuild: prefer diff application and slice scheduling over full recompute/commit.
4. Cancellation and coalescing are first-class: superseded work must be cancelable and duplicate intents coalesced.
5. Stable render boundaries: keep root and major list/map surfaces on stable props/handlers to reduce avoidable commit churn.
6. Root complexity budget is enforced per slice: root hook pressure must trend down across decomposition slices (not just ownership shuffling).

Required mechanisms by decomposition slice:

- `S9A`: indexed candidate query + read-model diff application (map path).
- `S9B`: selector memoization keyed by request/version for list/header/chips.
- `S9C`: mutation coalescing + single orchestrator write path for filter/query reruns.
- `S9D`: profile runtime state machine with cancelable hydration/camera intents.
- `S9E`: event-driven harness observer owner (subscription-based settle checks, no render-driven observer churn).
- `S9F`: composition-only root with runtime owner construction externalized under dedicated runtime owners (now `use-search-runtime-owner.ts`).

### 3.7 Maps-Class Runtime Principles (Industry Pattern Alignment)

These principles mirror large-scale map/search app patterns and are binding for this refactor:

1. Viewport-first work admission:

- only admit map/list work tied to current viewport + active operation tuple,
- drop superseded viewport work before it reaches render lanes.

2. Progressive reveal over full commit:

- prefer phase-A visible readiness, then budgeted phase-B enrichment,
- never allow full-surface synchronous rebuild in active interaction lanes.

3. Deterministic backpressure:

- lane priority + cancellation are mandatory,
- when interaction lanes are busy, defer enrichment lanes rather than contending.

4. Projection caches with explicit invalidation:

- read-model owners keep projection caches keyed by request/version tuple,
- invalidation is explicit (operation change, viewport change, filter mutation), never implicit render churn.

5. Observability as control input:

- mechanism telemetry (`mechanismSignals`) is part of promotion truth, not debug-only data,
- slices that claim optimization must emit mechanism evidence.

## 4) Source-of-Truth Matrix (Current -> Target)

| Concern                            | Current source(s)                                                                                              | Target owner                                           | Delete gate                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Query text and submitted label     | local Search state + store mix in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` | `SearchSessionController` write model + selector reads | no direct query submit writes in screen root             |
| Request lifecycle + response apply | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts`            | `SearchSessionController` + adapters                   | direct response fan-out branches removed                 |
| Map camera writes                  | screen root handlers in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`           | `camera-intent-arbiter`                                | no `setMapCenter`/`setMapZoom` in root map idle handlers |
| Marker candidateing                | screen-derived catalog fallback                                                                                | map index/query service                                | no `return markerCatalogEntries` candidate fallback path |
| Hydration/reveal scheduling        | root effect in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                    | `phase-b-materializer` scheduler                       | no root-owned hydration scheduler calls                  |
| Overlay transitions                | mixed root + store imperative branches                                                                         | overlay runtime controller + shell                     | root cross-domain overlay/search branches deleted        |

### 4.1 Store ownership clarifications (required before S3 promotion)

To avoid dual-source drift between local state and Zustand stores:

- `useSearchStore` remains user-preference + durable filters store (`preferredActiveTab`, `scoreMode`, filter defaults/history),
- request-scoped runtime state (`submittedQuery`, results phase, request tuple, hydration stage) moves to `SearchSessionController`,
- overlay navigation stack state remains in `useOverlayStore`, but search-data derivation cannot mutate overlay store directly,
- any field with both local state and store representation must be resolved to one owner in the slice that first touches it.

## 5) Map Subsystem Contract (Critical)

This section is mandatory because map is a primary bottleneck and has sensitive UX behavior.

### 5.1 Protected behavior constraints (from LOD v2)

Do not regress these without explicit dedicated map UX approval:

- edge-fade behavior and `visibleMarkerKeys` semantics,
- overscan geometry assumptions and `getCoordinateFromView` polygon sampling,
- no flash/jitter in pin/dot handoff,
- no duplicate key or gap states during transitions.

References:

- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:24`
- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:33`
- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:40`

### 5.2 Split map control plane from map presentation

Target modules:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/camera-intent-arbiter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-query-budget.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-viewport-query.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-spatial-index.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`

### 5.2A Snapshot-Owned Map Presentation Pipeline

Target shape:

- `SearchSessionController` owns the active operation tuple and phase transitions.
- `MapPresentationController` owns `MapPresentationSnapshot` lifecycle for that tuple.
- `MapReadModelBuilder` builds a versioned snapshot for the active operation + viewport + results snapshot id.
- `MapDiffApplier` applies the prepared snapshot incrementally to native map state.
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` is a presentation surface that renders the currently owned snapshot; it must not remain the owner of pin/dot/label/collision lifecycle policy.

Snapshot rules:

- one prepared `MapPresentationSnapshot` exists per active operation/snapshot/version,
- `covered` is a preparation lane that builds and arms the next snapshot,
- `reveal` is only a handoff from current snapshot to prepared snapshot,
- `dismiss` is only a handoff from current snapshot to idle/next snapshot,
- native render-owner epoch is an internal sync detail and must not be the long-term driver of React mount ownership.

### 5.3 Map migration invariants

1. Keep edge-fade and sticky-label behavior equivalent while moving candidateing/index logic.
2. Remove full-catalog fallback from screen scope.
3. All expensive feature queries flow through one budgeted service.
4. Marker updates are diff-based and versioned by snapshot id.
5. Camera writes are authorized only through arbiter.
   Programmatic camera settle must be matched by arbiter-issued completion id from a Mapbox camera completion event; generic `onMapIdle` may persist settled viewport state, but must not be the long-term authority for clearing programmatic suppression.
6. Label/pin/dot/collision scene ownership is snapshot-scoped; transient `batchPhase` booleans may control visual policy, but not long-term source/layer ownership.

### 5.4 Query and apply budgets

- `indexQueryDurationP95 <= 2ms`
- `readModelBuildSliceP95 <= 4ms`
- `mapDiffApplySliceP95 <= 3ms`
- `fullCatalogScanCount == 0` after map cutover slice

## 6) Concrete Module Plan (What to Build)

### 6.1 New runtime modules (search)

Controller/event model:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-reducer.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-events.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-state-machine.ts`

Adapters:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/natural-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/shortcut-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/entity-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/search-response-envelope.ts`

Scheduler:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/runtime-work-scheduler.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`

Read models:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/list-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/header-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/chip-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors.ts`

Cross-cutting runtime services:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/viewport/viewport-bounds-service.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/mutations/query-mutation-orchestrator.ts`

### 6.2 Existing modules to shrink or re-home

| File                                                                                                         | Required end-state                                                   |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                                 | composition shell only (selector reads + intent dispatch + layout)   |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts`          | request construction + dispatch bridge only                          |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`                 | presentation component with runtime-controller inputs only           |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-sheet.ts`                 | keep as UI shell utility; remove search-lifecycle authority          |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/session/use-search-session-coordinator.ts` | keep as overlay-origin coordinator; remove submit lifecycle coupling |
| `/Users/brandonkimble/crave-search/apps/mobile/src/hooks/useSearchRequests.ts`                               | transport-only request client                                        |

### 6.3 Non-search modules to decompose in scope

| File                                                                               | Required split                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx` | split into polls runtime hook(s) + presentational sections            |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx`         | split step state machine + auth lane + animation hooks + presentation |
| `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`   | extract navigation bootstrap/gating runtime owner                     |

## 7) Vertical Migration Slices (Replace "single extended effort")

Each slice is independently promotable and rollbackable.

### Slice P0: Preconditions and toolchain alignment

Goal:

- make the plan executable with real CI hooks and scripts.

Status:

- implemented for fixture-mode tooling validation.

Required actions:

1. Add `/Users/brandonkimble/crave-search/scripts/perf-shortcut-loop-report.sh`.
2. Add `/Users/brandonkimble/crave-search/scripts/ci-compare-perf-reports.sh`.
3. Add `/Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`.
4. Keep GitHub CI focused on static/contract checks (`search-runtime-contract-tests` contract-check job + `no-bypass-search-runtime`).
5. Add local live perf-gate orchestration (`/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`) and expose package scripts.

Exit gate:

- parser/comparator/no-bypass/local-perf scripts exist and run locally,
- GitHub CI includes contract/static gates only for this refactor phase,
- local perf gate command exists and is documented for slice promotion decisions.

Rollback:

- if scripts are noisy/flaky, keep analyzer jobs non-blocking until parser stability is validated for two consecutive runs.

### Slice P0.5: Live harness reactivation + metric lock (new hard prerequisite)

Goal:

- make P0 metrics meaningful for real implementation slices.

Status:

- runtime wiring for harness markers + JS/UI sampler emission has been reintroduced in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`,
- live validation is complete on current runtime path (`plans/perf-logs/perf-shortcut-loop-20260213T023338Z-signin-rerun.log`) with `markerIntegrity.complete=true`.

Required actions:

1. Re-introduce runtime harness emission points for:

- `[SearchPerf][Harness]` `shortcut_loop_start`,
- `[SearchPerf][Harness]` `shortcut_loop_run_start`,
- `[SearchPerf][Harness]` `shortcut_loop_run_complete`,
- `[SearchPerf][Harness]` `shortcut_loop_complete`.

2. Reconnect JS/UI frame sampler startup to active harness scenario path.
3. Add `schemaVersion` to parser output and enforce same version in comparator.
4. Lock metric definitions (see section 9.3) and append one calibration entry to `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md` that maps old vs new metric semantics.

Exit gate:

- `scripts/perf-shortcut-loop.sh` produces live logs with complete marker integrity,
- parser succeeds on a fresh live log from the current commit,
- comparator hard-fails on schema mismatch,
- investigation log includes calibration note tied to parser `schemaVersion`.

Rollback:

- keep fixture-mode jobs green and retain local gate as promotion source of truth until hosted live perf CI is added.

### Slice S1: Runtime scaffolding in shadow mode (no behavior change)

Goal:

- create runtime controller/event/reducer scaffolding and mirror existing events.

Files touched:

- add `runtime/controller/*`, `runtime/adapters/*`, `runtime/scheduler/*` scaffolds,
- add event emission bridge from existing paths.

Exit gate:

- shadow traces show legal transitions only,
- `transitionViolation == 0` on shortcut loop baseline,
- shortcut harness runs complete without timeout-shaped completion,
- local compare evidence satisfies structural-class no-worse policy,
- no user-visible behavior changes.

Rollback:

- disable shadow bridge and keep old runtime path; no state ownership change yet.

### Slice S2: Operation identity protocol in active paths

Goal:

- enforce `(sessionId, operationId, seq)` on all mutating events.

Files touched:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- new runtime reducers/guards

Exit gate:

- stale events are rejected and counted,
- stale accept/reject behavior is visible in runtime telemetry and harness traces.
- deferred side-effects (including history writes) are tuple-guarded against superseded operations,
- local compare evidence satisfies structural-class policy (waiver allowed only per section 1.2).

Delete gate:

- remove legacy unguarded mutation branches where they overlap with guarded path.

Rollback:

- keep guard checks in monitor-only mode if unexpected false positives occur, then fix tuple propagation.

### Covered-phase execution track (continuous across S1-S4)

Goal:

- treat `covered` as a preparation lane, not a live render-negotiation lane.

Scope:

- covered-phase results-panel render inputs
- covered-phase shell/header geometry inputs
- covered-phase map/presentation readiness handoff inputs

Exit gate:

- covered-phase logs show stable render-facing inputs while the cover is visible,
- no newly introduced `covered`-phase catastrophic JS stall family,
- compare evidence remains no-worse until the dedicated perf-bearing slices target the remaining hotspot directly.

Delete gate:

- remove legacy branches that still let covered-phase render trees churn live after cover entry once the promoted cluster has a stable prepared snapshot path.

### Slice S3: Natural-mode submit cutover (phase-A then phase-B)

Goal:

- cut natural submit through controller with minimal first-paint phase.

Files touched:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- runtime controller/adapters/scheduler/read-model selectors

Exit gate:

- natural submit uses controller-gated phase transitions (rejected shadow transitions do not proceed),
- no pre-request full-null clear for natural path,
- natural cutover contract guard passes (`scripts/search-runtime-natural-cutover-contract.sh`),
- robust local promotion summary satisfies ownership-cutover policy (section 9.2),
- no regressions in parity checklist.

Delete gate:

- remove natural-mode direct apply branches in old submit hook.

Rollback:

- keep feature-scoped fallback for natural mode only until 2 matched runs pass.

### Slice S4: Shortcut and entity submit cutover

Goal:

- route shortcut/entity through same controller path via adapters.

Exit gate:

- all modes use same state machine,
- no mode-specific bypass around controller transitions,
- S4 mode cutover contract guard passes (`scripts/search-runtime-s4-mode-cutover-contract.sh`),
- robust local promotion summary satisfies ownership-cutover policy (contextual no-worse expectation, not blanket uplift per slice).

Delete gate:

- remove mode-specific direct fan-out branches.

Rollback:

- rollback only affected mode adapter while keeping shared controller enabled.

### Slice S5: Root hydration ownership removal

Goal:

- move hydration/reveal scheduling out of screen root.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`

Exit gate:

- root no longer owns `InteractionManager`/RAF lifecycle scheduling for result hydration.
- targeted hotspot expectation: `results_list_materialization` or `results_list_ramp` shows directional improvement vs pre-S5 baseline.

Delete gate:

- remove root hydration effect branch entirely.

Rollback:

- allow one guarded fallback branch for a single release candidate only if parity breaks.

### Slice S6: Map candidate/index cutover (without edge-fade regression)

Goal:

- replace full-catalog candidateing with viewport-indexed read-model while preserving existing edge-fade/label behavior.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`

Exit gate:

- `fullCatalogScanCount == 0` in map verdict scenarios,
- edge-fade parity checklist passes,
- no pin/dot duplicate/gap errors.
- targeted hotspot expectation: `marker_reveal_state` catastrophic-window count or stall severity improves vs pre-S6 baseline.

Delete gate:

- remove full-catalog fallback return path in root.

Rollback:

- keep index service present but switch candidate provider back if parity break occurs.

### Slice S7: Camera arbiter cutover and root map-write deletion

Goal:

- remove direct root camera writes and enforce arbiter ownership.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6878`

Exit gate:

- no direct root camera writes remain,
- no snap-back during active gesture,
- camera burst budgets pass,
- targeted hotspot expectation: `results_list_ramp` or `visual_sync_state` catastrophic-window count/stall severity improves vs pre-S7 baseline.

Delete gate:

- delete root `setMapCenter`/`setMapZoom` idle handler writes.

Rollback:

- arbiter fallback mode can mirror old state one-way, but old root writer must stay deleted once slice is promoted.

### Slice S8: Overlay/list contract hardening and cleanup

Goal:

- stabilize request-scoped list contracts and remove duplicate debug/legacy sheet paths.

Actions:

1. enforce stable selector-fed list contract identity,
2. remove redundant prop-change logging paths,
3. evaluate and remove unused legacy sheet component if no references remain.

Note:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-results-sheet.tsx` was removed after the runtime tree switched to `SearchResultsSheetTree` + `OverlaySheetShell`.
- keep enforcing that no new runtime imports of `search-results-sheet` are reintroduced.

Exit gate:

- reduced sheet commit churn during submit/reveal windows,
- targeted hotspot expectation: `results_list_ramp` stage pressure is directionally improved vs pre-S8 baseline,
- no overlay/search cross-domain imperative coupling in root.

### Tranche: Search Index Decomposition (Mandatory Before Non-Search Slices)

This tranche is explicit and ownership-gated. The goal is to make `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` a composition shell, not a runtime owner.

### Slice S9A: Map Read-Model Owner Extraction

Goal:

- move map candidate/read-model ownership out of root and into runtime map modules.

Actions:

- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`,
- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-read-model-builder.ts`,
- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`,
- define and publish a versioned `MapPresentationSnapshot` keyed by operation tuple + viewport + results snapshot id,
- enforce incremental map diff-apply ownership (no full root recompute path),
- move pin/dot/label/collision scene ownership out of `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` and into snapshot/runtime owners,
- treat native render-owner epoch as a transport/sync concern, not the driver of React scene ownership,
- remove root map read-model blocks and constructors listed in root ownership gates.

Exit gate:

- root ownership gate `S9A` passes (`runtime-root-ownership-gates.json`),
- map edge-fade/label parity constraints remain satisfied,
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` no longer negotiates label/pin/dot/collision ownership from transient phase toggles,
- repeated reveal/dismiss loops do not carry stale prepared source state across snapshot boundaries,
- targeted hotspot expectation: `marker_reveal_state` or `results_list_ramp` improves directionally.

### Slice S9B: List/Header Read-Model Owner Extraction

Goal:

- move list/header/chip derivation out of root and into runtime read-model selectors/builders.

Actions:

- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/list-read-model-builder.ts`,
- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/header-read-model-builder.ts`,
- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/chip-read-model-builder.ts`,
- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors.ts`,
- enforce selector memoization keyed by request/version tuple for list/header/chip outputs,
- remove root list/header derivation blocks listed in root ownership gates.

Exit gate:

- root ownership gate `S9B` passes,
- no list/header parity drift,
- targeted hotspot expectation: `results_list_ramp` stage pressure improves directionally.

### Slice S9C: Query Mutation Orchestrator Ownership

Goal:

- centralize filter/query rerun logic in runtime mutation orchestrator and remove root mutation authority.

Actions:

- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/mutations/query-mutation-orchestrator.ts`,
- route filter/rank/price/open-now mutation reruns through orchestrator,
- coalesce rapid filter mutation intents so only the newest mutation issues rerun work,
- delete root mutation blocks listed in root ownership gates.

Exit gate:

- root ownership gate `S9C` passes,
- no stale filter/query branch behavior,
- mechanism telemetry shows observable coalescing (`query_mutation_coalesced` count above threshold),
- no-worse perf by ownership-class thresholds.

### Slice S9D: Profile Runtime Ownership

Goal:

- move restaurant profile open/close/hydration/camera choreography from root to dedicated runtime owner.

Actions:

- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-runtime-controller.ts`,
- move profile orchestration blocks out of `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`,
- enforce cancelable profile hydration/camera intents for superseded profile transitions,
- make profile-open settle snapshot-scoped and event-driven: `profile_open` reaches `open` only after both the restaurant sheet reports the expected programmatic snap and the map camera reports the arbiter-issued animation completion id for that prepared snapshot,
- preserve profile transition parity.

Exit gate:

- root ownership gate `S9D` passes,
- profile overlay parity is preserved,
- profile-open completion is not sheet-only or timeout-driven; camera animation completion and sheet snap completion both participate in the prepared snapshot settle gate,
- mechanism telemetry shows observable cancellation of superseded profile intents (`profile_intent_cancelled` count above threshold),
- targeted hotspot expectation: `visual_sync_state` or `results_list_ramp` improves directionally.

### Slice S9E: Harness Observer Ownership

Goal:

- move shortcut harness lifecycle/settle observer logic out of root into runtime telemetry owner.

Actions:

- create and wire `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`,
- remove root harness lifecycle blocks listed in root ownership gates,
- keep settle evaluation event-driven (subscription/callback driven, no render-bump observer loop),
- keep marker contract and settle policy unchanged unless baseline refresh is explicitly performed.

Exit gate:

- root ownership gate `S9E` passes,
- harness marker integrity remains complete,
- mechanism telemetry proves event-driven observer behavior (`shortcut_harness_settle_eval` above threshold and `shortcut_harness_observer_render_bump` at or below threshold),
- targeted hotspot expectation: `results_list_ramp` or `visual_sync_state` improves directionally.

### Slice S9F: Composition Shell Finalization

Goal:

- finalize `index.tsx` as composition shell only: selector reads + intent dispatch + layout/return shell wiring.

Actions:

- remove inline runtime owner constructors from root,
- route runtime construction through dedicated runtime hooks/modules,
- verify root has no residual owner blocks from S9A-S9E domains.

Exit gate:

- root ownership gate `S9F` passes,
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` owns composition responsibilities only (selector reads, dispatch wiring, layout/return shell),
- no dual-control root/runtime ownership remains.

### Search Index Decomposition Matrix (Deterministic Execution)

| Slice | Root ownership delete gate id(s)                              | Primary extraction target(s)                                                                                                                                                                          | Required performance mechanism                                                                            | Required promotion evidence                                                                                                                                               |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S9A   | `root_map_read_model_blocks`, `root_map_runtime_constructors` | `runtime/map/map-presentation-controller.ts`, `runtime/map/map-read-model-builder.ts`, `runtime/map/map-diff-applier.ts`                                                                              | indexed candidate query + incremental diff apply                                                          | targeted hotspot directional improvement + map runtime budget gate (`indexQueryDurationP95`, `readModelBuildSliceP95`, `mapDiffApplySliceP95`, `fullCatalogScanCount==0`) |
| S9B   | `root_list_read_model_blocks`                                 | `runtime/read-models/list-read-model-builder.ts`, `runtime/read-models/header-read-model-builder.ts`, `runtime/read-models/chip-read-model-builder.ts`, `runtime/read-models/read-model-selectors.ts` | selector memoization keyed by request/version                                                             | targeted hotspot pressure improvement on JS and UI `results_list_ramp` windows                                                                                            |
| S9C   | `root_query_mutation_blocks`                                  | `runtime/mutations/query-mutation-orchestrator.ts`                                                                                                                                                    | mutation coalescing + single rerun write path                                                             | strict root ownership pass + no-worse non-cat thresholds                                                                                                                  |
| S9D   | `root_profile_runtime_blocks`                                 | `runtime/profile/profile-runtime-controller.ts`                                                                                                                                                       | profile transition state machine with cancelable hydration/camera intents                                 | targeted hotspot directional improvement (`visual_sync_state` or `results_list_ramp`)                                                                                     |
| S9E   | `root_harness_observer_blocks`                                | `runtime/telemetry/shortcut-harness-observer.ts`                                                                                                                                                      | event-driven observer (subscription/callback settle evaluation)                                           | targeted hotspot directional improvement (`results_list_ramp` or `visual_sync_state`) + marker integrity complete                                                         |
| S9F   | `root_runtime_owner_constructors`                             | runtime composition hook/modules (for example `hooks/use-search-runtime-owner.ts`)                                                                                                                    | root as composition-only shell                                                                            | strict root ownership pass + no residual root runtime owner constructors                                                                                                  |
| S10   | `s10_*` ownership gates                                       | polls/onboarding/navigation runtime owner modules                                                                                                                                                     | domain runtime owner extraction (service/socket/auth/bootstrap ownership moved out of panel/screen roots) | strict S10 ownership pass + domain parity suites                                                                                                                          |
| S11   | `s11_*` ownership gates                                       | final root/search runtime cleanup paths                                                                                                                                                               | delete shadow/debug/bypass legacy branches + end-state root composition budgets                           | strict S11 ownership pass + full policy (no waivers)                                                                                                                      |

Complexity budget note:

- each S9 slice has root hook-pressure ceilings in `runtime-root-ownership-gates.json` to force monotonic reduction of root orchestration complexity during decomposition.

### Slice S10: Non-search domain decomposition

Goal:

- bring onboarding/polls/profile/navigation to same runtime quality bar.

Actions:

- split `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx` into runtime owner(s) + presentation shell,
- split `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx` into state machine + auth lane + animation lane owners,
- isolate bootstrap gating runtime from `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`,
- delete legacy panel/screen-level runtime writers in the same promotion (no long-lived dual control).

Exit gate:

- root ownership gate `S10` passes (`runtime-root-ownership-gates.json`),
- required owner modules exist:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-runtime-controller.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-autocomplete-owner.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-panel-runtime-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-panel-state-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-panel-interaction-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/onboarding/runtime/onboarding-step-machine.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/onboarding/runtime/use-onboarding-auth-lane.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/onboarding/runtime/use-onboarding-animation-lane.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/runtime/use-navigation-bootstrap-runtime.ts`
- no direct service/socket/autocomplete ownership remains in `PollsPanel.tsx`, and the remaining local panel shell only composes the lower polls state/interaction owners,
- no direct auth/bootstrap writes remain in `Onboarding.tsx` and `RootNavigator.tsx`,
- parity suites for onboarding/polls/profile/navigation pass.

### Slice S11: Debt cleanup and hardening

Goal:

- remove temporary paths, probes, and bypasses.

Validation sweep:

- `rg -n "searchPerfDebug|EXPO_PUBLIC_PERF_|\[SearchPerf\]|console\.log\(" /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search /Users/brandonkimble/crave-search/apps/mobile/src/overlays`

Exit gate:

- root ownership gate `S11` passes (`runtime-root-ownership-gates.json`),
- one clear runtime path per concern (no shadow controller path in root or submit runtime),
- no cluster remains in `shadow` or `owned` with undeleted legacy writers,
- debug probe cleanup complete (no root `searchPerfDebug` wiring, no root/submit `console.log` probes),
- root composition shell complexity meets end-state budget (S11 ownership gate budgets).

## 8) Cluster Ownership Ledger (Mandatory)

| Cluster                        | Current anchor                                                                                          | Target owner                                              | Slice | Delete gate                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| Submit + response apply        | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts:361` | `SearchSessionController` + adapters                      | S3/S4 | old fan-out branches deleted                                  |
| Hydration/reveal scheduling    | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`                       | `phase-b-materializer`                                    | S5    | no root hydration scheduler                                   |
| Map idle camera writes         | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`                       | camera arbiter                                            | S7    | no root camera writes                                         |
| Marker candidate derivation    | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`                       | map index/read-model                                      | S6    | no full-catalog fallback                                      |
| Filter rerun fan-out           | root filter submit branches                                                                             | query mutation orchestrator                               | S4/S8 | no direct mode-specific rerun branches                        |
| Overlay/search coupling        | root imperative overlay-search branches                                                                 | overlay runtime controller                                | S8    | root cross-domain branches deleted                            |
| Map read-model owner blocks    | root map candidate/LOD derivation in `index.tsx`                                                        | map presentation + read-model owners                      | S9A   | root map read-model blocks deleted                            |
| List/header read-models        | root sectioning/list/header derivation in `index.tsx`                                                   | read-model builders/selectors                             | S9B   | root list/header derivation deleted                           |
| Query mutation authority       | root filter/rank/price mutation reruns in `index.tsx`                                                   | query mutation orchestrator                               | S9C   | root query-mutation blocks deleted                            |
| Profile runtime authority      | root restaurant profile orchestration in `index.tsx`                                                    | profile runtime controller                                | S9D   | root profile orchestration deleted                            |
| Profile presentation read bag  | root-facing loose profile presentation booleans/keys in `index.tsx`                                     | `profilePresentation` read model                          | S9D   | no loose profile presentation field bag                       |
| Profile shell state ownership  | parallel profile shell state cells in runtime controller                                                | runtime-bus `profileShellState` owner surface             | S9D   | no parallel status/panel/padding shell cells                  |
| Profile dismiss policy         | root-owned profile dismiss/clear refs threaded into profile close flow                                  | controller-owned close options + policy refs              | S9D   | no root-owned profile dismiss policy refs                     |
| Profile action ref bridge      | root-held imperative close/reset profile refs for later hook wiring                                     | direct controller actions in hook composition             | S9D   | no root-held close/reset profile refs                         |
| Profile preview ref bridge     | root-held preview action ref for intent/submit/recent consumers                                         | direct controller preview action wiring                   | S9D   | no root-held preview action ref                               |
| Profile clear-state bridge     | root-held `clearSearchStateRef` for profile-dismiss cleanup                                             | direct captured clear action                              | S9D   | no root-held clear-search bridge ref                          |
| Profile close-state refs       | scattered controller refs for dismiss/restore/baseline close bookkeeping                                | controller-owned `profileCloseStateRef`                   | S9D   | no scattered close bookkeeping refs                           |
| Profile runtime ref split      | parallel controller refs for transition state and close bookkeeping                                     | controller-owned `profileRuntimeStateRef`                 | S9D   | no parallel transition/close runtime refs                     |
| Harness observer authority     | root shortcut harness lifecycle observer in `index.tsx`                                                 | telemetry/runtime observer                                | S9E   | root harness observer blocks deleted                          |
| Root owner constructors        | inline runtime owner constructors in `index.tsx`                                                        | runtime hooks/modules                                     | S9F   | no root runtime owner constructors                            |
| Polls runtime authority        | service/socket/autocomplete orchestration in `PollsPanel.tsx`                                           | polls runtime controller + panel state/interaction owners | S10   | no direct service/socket/autocomplete in panel root           |
| Onboarding runtime authority   | auth/state/animation orchestration in `Onboarding.tsx`                                                  | onboarding runtime state/auth/animation owners            | S10   | no direct auth/bootstrap writes in onboarding screen          |
| Navigation bootstrap authority | auth + hydration bootstrap in `RootNavigator.tsx`                                                       | navigation bootstrap runtime owner                        | S10   | no direct auth/hydration bootstrap ownership in RootNavigator |
| Shadow/debug debt cleanup      | shadow controller and perf debug probes in search root/submit runtime                                   | deleted (single runtime path)                             | S11   | no shadow controller path; no root/submit debug probes        |

Cluster state machine:

- `legacy`
- `shadow`
- `owned`
- `deleted`

Rules:

- `owned` requires deletion of legacy writer in same promotion,
- `shadow` overlap allowed only during explicitly declared slice,
- no bypass flags after delete gate.

## 9) CI and Harness Plan (Reality-Aligned)

### 9.1 GitHub CI (required, production-relevant)

1. `search-runtime-contract-tests` (contract-check job)

- validates parser output contract and marker integrity on canonical fixture log,
- ensures required perf fields exist and are numeric.

2. `no-bypass-search-runtime`

- static guard for prohibited legacy paths.

Intent:

- keep GitHub CI deterministic and merge-blocking for contract/static regressions,
- avoid treating fixture perf comparisons as runtime perf truth.

### 9.2 Local perf gate (required for refactor promotions)

Command surface:

- `bash ./scripts/perf-shortcut-local-ci.sh record-baseline`
- `bash ./scripts/perf-shortcut-local-ci.sh gate`
- `bash ./scripts/perf-shortcut-local-ci.sh promote-slice <slice_id>`

Script:

- `/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`
- `/Users/brandonkimble/crave-search/plans/perf-baselines/runtime-root-ownership-gates.json` (strict root ownership checks for S7+ and S9/S10/S11 decomposition+completion slices)

Flow:

1. capture/refresh locked live baseline report,
2. run matched live candidate shortcut loop harness gates (`PERF_PROMOTION_MATCHED_RUNS`, default `2`),
3. parse candidate reports,
4. compare baseline vs each candidate with comparator thresholds and schema checks,
5. compute robust median deltas and slice-class promotion verdict (promotion summary artifact),
6. attach promotion summary evidence to slice promotion notes.

Promotion rule:

- slices that touch submit/map/list runtime ownership cannot promote without a local perf gate report from current branch.
- local gate evidence is invalid when either report has `runCountCompleted < 3`.
- local gate evidence is invalid when baseline `stallP95` or `uiStallP95` is below configured denominator floor (defaults: `PERF_BASELINE_MIN_STALL_P95=1`, `PERF_BASELINE_MIN_UI_STALL_P95=1`).
- ownership slices (S3/S4) use robust matched-gate median deltas for non-cat regressions, with default shortcut-loop stall tolerance `20%` (`PERF_PROMOTION_STALL_P95_MAX_REGRESSION_PCT`, `PERF_PROMOTION_UI_STALL_P95_MAX_REGRESSION_PCT`) because shortcut loop is non-target mode for natural-path cutover.
- structural slices (P0/P0.5/S1/S2) may use catastrophic waiver only under section 1.2 waiver conditions.
- ownership cutover slices (S3/S4) may use the same waiver only if no new catastrophic stage families are introduced.
- perf-bearing ownership slices (S5/S6/S7/S8/S9A/S9B/S9D/S9E) cannot use catastrophic waiver unless their targeted hotspot still shows directional improvement.
- JS optimization slices (JS1-JS4) cannot use catastrophic waiver; catastrophic gating remains absolute for these slices.
- JS optimization slices (JS1-JS4) require directional hotspot improvement on hydration/visual-sync stages and must show median `stallP95` improvement (`PERF_JS_TRANCHE_MIN_STALL_P95_IMPROVEMENT_PCT`, default `5%`).
- JS optimization slices (JS1-JS4) require non-regressive UI stall median (`PERF_JS_TRANCHE_MAX_UI_STALL_P95_REGRESSION_PCT`, default `0%`).
- S9A also requires map runtime budget evidence (same gate family as S6) to ensure map extraction is an optimization, not only a move.
- S9B requires targeted hotspot pressure improvement on both JS and UI stage windows for `results_list_ramp`.
- S9C/S9D/S9E require mechanism telemetry evidence (coalescing/cancellation/event-driven observer signals) in promotion summaries.
- S9A-S11 apply strict root ownership checks; S9/S11 include explicit root complexity budgets (`React.useEffect`/`React.useLayoutEffect` and `React.useCallback`/`React.useMemo` pressure ceilings).
- ownership decomposition slices (S9C/S9F) require strict no-worse non-cat metrics plus root ownership delete-gate evidence.
- S7+ and S9/S10/S11 promotions require strict root ownership checks from `runtime-root-ownership-gates.json`; promotion is blocked if any banned root writer or banned root function block remains.
- LOC transition gating is deprecated and disabled by default; use only as an explicit legacy override.

### 9.3 Parser/comparator contract

Parser script responsibilities (`perf-shortcut-loop-report.sh`):

- input: loop log path,
- output JSON fields include:
  - core: `schemaVersion`, `markerIntegrity`, `runCountStarted`, `runCountCompleted`,
  - JS metrics: `floorMean`, `stallP95`, `stallMaxMean`, `stageHistogram`, `catastrophic`,
  - UI metrics: `uiFloorMean`, `uiStallP95`, `uiStallMaxMean`, `uiStageHistogram`, `uiCatastrophic`,
  - mechanism telemetry: `mechanismSignals.queryMutationCoalescedCount`, `mechanismSignals.profileIntentCancelledCount`, `mechanismSignals.harnessSettleEvalCount`, `mechanismSignals.observerRenderBumpCount`,
  - parity metadata: `harnessSignatureStable`, `environment`.
- harness settle boundary policy is part of harness signature parity; if settle policy changes, refresh locked baseline before comparing promotion deltas.
- metric definitions (canonical):
  - `floorMean`: mean of per-run minimum `floorFps` values from `[SearchPerf][JsFrameSampler]` windows between `shortcut_loop_run_start` and `shortcut_loop_run_complete`,
  - `stallMaxMean`: mean of per-run maximum `stallLongestMs` values from the same scoped windows,
  - `stallP95`: p95 over all scoped window `stallLongestMs` values,
  - `uiFloorMean`: mean of per-run minimum `floorFps` values from `[SearchPerf][UiFrameSampler]` windows between `shortcut_loop_run_start` and `shortcut_loop_run_complete`,
  - `uiStallMaxMean`: mean of per-run maximum `stallLongestMs` values from the same scoped windows,
  - `uiStallP95`: p95 over all scoped UI window `stallLongestMs` values.
- local CI sampler defaults (enforced in `perf-shortcut-local-ci.sh`):
  - `EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS=120`
  - `EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS=120`
  - `EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240`
  - `EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240`
  - baseline denominator floors:
    - `PERF_BASELINE_MIN_STALL_P95=1`
    - `PERF_BASELINE_MIN_UI_STALL_P95=1`

Comparator script responsibilities (`ci-compare-perf-reports.sh`):

- input: baseline JSON, candidate JSON, threshold config,
- output: non-zero exit on any of:
  - regression gate violation (JS or UI metrics),
  - schema mismatch,
  - missing required metrics,
  - insufficient run counts (`runCountExpected`/`runCountCompleted` below `PERF_MIN_RUNS`, default `3`),
  - signature/environment parity mismatch,
  - catastrophic gate breach (absolute, not baseline-relative).

Artifact paths (local gate flow):

- locked baseline default: `/Users/brandonkimble/crave-search/plans/perf-baselines/perf-shortcut-live-baseline.json`
- candidate report: `/tmp/perf-shortcut-candidate-<timestamp>.json`
- compare summary: `/tmp/perf-shortcut-compare-<timestamp>.json`

### 9.4 Future hosted perf CI graduation (optional later)

Re-introduce merge-blocking hosted perf jobs only when:

1. dedicated runtime environment is stable/repeatable (for example, controlled Mac runner),
2. live harness logs are produced in that environment with complete marker integrity,
3. hosted results are statistically consistent with local-gate outcomes over multiple runs.

Until then:

- GitHub remains contract/static gate only,
- local live perf gate is the source of truth for refactor runtime promotion decisions.

## 10) Validation Matrix (Implementation-Ready)

Runtime validation signals:

- submit->phase-A->visual release ordering is captured via shadow/controller event stream,
- stale response rejection after newer submit is captured via stale-drop telemetry,
- pagination cancellation on submit reset is observable in operation-lifecycle traces,
- camera gesture preemption over programmatic camera intents is enforced by lane priority logs,
- overlay switch isolation from heavy search work is enforced by domain-scoped transition logs.

Parity validation signals:

- no stale rows/markers,
- no missing cards/pins,
- no tab/filter/pagination semantic drift,
- no map snap-back during active gesture,
- onboarding/polls/profile/nav flows preserve behavior.

## 11) Non-Negotiables

1. No direct render-state mutation in adapters.
2. No mode-specific bypass around controller transitions.
3. No synchronous full phase-B materialization commit.
4. No direct camera writes from screen-level components after S7.
5. No bounds capture ownership outside viewport service after S6.
6. No stale request writes; strict tuple guards mandatory.
7. Debug/probe branches cannot gate production runtime behavior.
8. No cluster promotion without legacy delete gate evidence.
9. No long-lived dual-path overlap outside explicit `shadow` slices.
10. Do not treat map edge-fade/overscan as refactorable collateral.
11. Architecture program is incomplete until non-search domain slices pass.

## 12) Explicit Improvements vs Prior Plan

This V3 intentionally fixes the prior gaps:

1. Replaces single extended effort model with rollbackable vertical slices.
2. Adds source-of-truth migration matrix for mixed local/store state.
3. Aligns CI/harness scope with actual code reality today.
4. Elevates map edge-fade/label constraints to first-class migration contract.
5. Includes missing module owners (`use-search-sheet`, `use-search-session-coordinator`, `useSearchRequests`) in final ownership model.
6. Adds explicit missing-script precondition so "ready" status is factual.

## 13) Next 72 Hours (Post-P0.5)

1. Lock the promotion baseline in local CI:

- run `bash ./scripts/perf-shortcut-local-ci.sh record-baseline` in the chosen target environment (simulator or device),
- publish baseline report path and environment details into the investigation log,
- require `bash ./scripts/perf-shortcut-local-ci.sh gate` evidence before each slice promotion, applying slice-class rules from sections 1.2 and 9.2.

2. Execute Slice S1:

- scaffold runtime modules,
- wire shadow event emission,
- capture transition legality in shadow runtime telemetry.

3. Execute Slice S2:

- propagate operation tuple across existing submit/mutation paths,
- enforce stale-event drop telemetry,
- ship with no behavior change.

4. Start Slice S3 (natural mode only):

- move natural submit through controller phase-A then phase-B,
- remove natural-mode direct fan-out branch once parity passes.

Success condition for this window:

- promotion baseline is explicit and repeatable,
- runtime ownership becomes enforceable/measurable with rollbackable slices,
- no user-visible UX change during scaffolding slices.

Current profile/runtime note:

- profile camera and sheet lanes are now native-backed command paths,
- the JS/native stop line is now locked: shell-state stays as the explicit JS-owned app-policy lane, while native remains the camera/sheet command executor plus completion owner,
- `profile-transition-state-contract.ts` now owns the shared transition/shell type vocabulary, `profile-transition-state-mutations.ts` now owns the transition init/reset/snapshot-capture mutation helpers, and the deleted `profile-transition-state.ts` no longer mixes those layers into one umbrella host. `profile-runtime-state-record.ts` now stays on the internal profile controller-state record contract plus init helpers, while `profile-transition-state-record.ts`, `profile-close-state-record.ts`, and `profile-mutable-state-record.ts` now own the low-level transition, close, and mutable record operations respectively. `profile-runtime-state-contract.ts` now owns the grouped runtime-state type surface, `profile-controller-shell-runtime-state-owner.ts` now owns controller-state creation plus shell selector/publication and transition-status writing, `profile-hydration-runtime-state-owner.ts` now owns the grouped hydration runtime lane, `profile-close-runtime-state-owner.ts` now owns the grouped close-state lane, `profile-owner-runtime-state-owner.ts` now owns the higher-level grouped runtime-state-owner assembly, and `profile-owner-runtime.ts` now consumes that grouped owner directly instead of routing through the deleted `use-profile-runtime-state.ts` composer,
- `profile-prepared-presentation-runtime.ts` now owns the thin `useProfilePreparedPresentationRuntime(...)` composition hook, while the lower prepared transaction/completion/runtime contract is split across `profile-prepared-presentation-runtime-contract.ts`, `profile-prepared-presentation-transaction-contract.ts`, `profile-prepared-presentation-transition-runtime.ts`, `profile-prepared-presentation-dismiss-runtime.ts`, `profile-prepared-presentation-settle-runtime.ts`, `profile-prepared-presentation-completion-executor.ts`, `profile-prepared-presentation-command-executor.ts`, `profile-prepared-presentation-state-executor.ts`, `profile-prepared-presentation-event-runtime.ts`, `profile-prepared-presentation-transaction-runtime.ts`, `profile-prepared-presentation-entry-runtime.ts`, and `profile-prepared-presentation-binding-runtime.ts`,
- `profile-hydration-intent-runtime.ts` now owns profile hydration request sequencing plus active-intent policy, `profile-hydration-request-runtime.ts` now owns cache/in-flight request reuse plus profile-data loading, `profile-panel-seed-runtime.ts` now owns seeded panel hydration, and `profile-panel-hydration-runtime.ts` now owns async panel hydration flow over the lower panel snapshot mutation helpers in `profile-panel-hydration-snapshot-runtime.ts`. The deleted `profile-hydration-panel-runtime.ts`, deleted `profile-hydration-runtime.ts`, deleted `profile-mutable-runtime-state.ts`, and deleted `use-profile-runtime-state.ts` no longer sit between those lower hydration/focus/auto-open lanes; `profile-owner-runtime.ts` now composes first-class `hydrationRuntime`, `focusRuntime`, and `autoOpenRuntime` lanes directly, and `profile-runtime-state-contract.ts` owns their grouped type surface,
- `profile-app-execution-runtime-contract.ts` now owns the grouped JS app execution contract, `profile-app-foreground-runtime.ts` now owns foreground prep/restore, `profile-app-route-runtime.ts` now owns route intent, `profile-app-close-preparation-runtime.ts` now owns close hydration flush and pre-close cleanup, and `profile-app-close-finalization-runtime.ts` now owns close finalization policy. The deleted `profile-app-close-runtime.ts`, deleted `profile-app-execution-runtime.ts`, deleted `profile-app-shell-runtime.ts`, and deleted `profile-app-command-runtime.ts` no longer sit between those lower app owners and the live owner boundary because `profile-app-execution-model-runtime.ts` now composes the grouped app execution model from those lower owners plus the direct JS results-sheet/shared-snap/highlight command lane, and `profile-owner-runtime.ts` consumes that grouped model directly,
- The deleted `profile-owner-query-action-state-runtime.ts`, deleted `profile-owner-selection-action-state-runtime.ts`, and deleted `profile-owner-runtime-action-state-runtime.ts` no longer sit between the lower action state lanes and the live grouped owner boundary. The deleted `profile-owner-presentation-action-port-runtime.ts`, deleted `profile-owner-refresh-selection-port-runtime.ts`, and deleted `profile-owner-auto-open-action-port-runtime.ts` also remain gone. The deleted `profile-owner-search-state-runtime.ts`, deleted `profile-owner-shell-state-runtime.ts`, deleted `profile-owner-execution-runtime.ts`, deleted `profile-owner-view-surface-runtime.ts`, deleted `profile-owner-presentation-runtime.ts`, deleted `profile-owner-publication-runtime.ts`, deleted `profile-owner-action-publication-runtime.ts`, and deleted `profile-owner-auto-open-effect.ts` no longer sit between the lower owner lanes and the live owner boundary, and the deleted `profile-owner-action-port-runtime.ts`, deleted `profile-owner-action-link-runtime.ts`, deleted `profile-owner-action-resource-runtime.ts`, deleted `profile-owner-action-model-runtime.ts`, deleted `profile-owner-action-state.ts`, deleted `profile-owner-action-ports.ts`, and deleted `profile-owner-action-surface.ts` no longer sit between the lower action owners either. The deleted `profile-owner-action-state-runtime.ts`, deleted `profile-owner-action-execution-ports-runtime.ts`, deleted `profile-owner-action-context-runtime.ts`, deleted `profile-owner-action-execution-support-runtime.ts`, deleted `profile-owner-action-engine-runtime.ts`, deleted `profile-owner-linked-action-runtime.ts`, deleted `profile-owner-presentation-action-runtime.ts`, and deleted `profile-owner-refresh-close-action-runtime.ts` no longer sit between the lower owner-action lanes and the live owner boundary. `profile-owner-runtime.ts` now stays on outward owner composition while consuming grouped runtime-state ownership from `profile-owner-runtime-state-owner.ts`, grouped native/app/prepared execution composition from `profile-owner-execution-models-runtime.ts`, the lower `profile-owner-presentation-view-runtime.ts`, the lower `profile-owner-native-view-runtime.ts`, and the lower owner-action lane directly; `profile-owner-query-action-context-runtime.ts` now owns submitted-query/results reads plus query-key/label derivation, `profile-owner-selection-action-context-runtime.ts` now owns selection-state assembly, `profile-owner-runtime-state-runtime.ts` now owns runtime-state assembly, `profile-owner-action-state-ports-runtime.ts` now owns the lower state-mutation/action-state port lane, `profile-owner-action-external-ports-runtime.ts` now owns the lower app/native/prepared/analytics action-port lane, `profile-owner-refresh-selection-ports-runtime.ts` now owns refresh-selection ports, `profile-owner-auto-open-ports-runtime.ts` now owns auto-open ports, `profile-owner-presentation-actions-runtime.ts` now owns the lower preview/open/focus action lane, `profile-owner-runtime-actions-runtime.ts` now owns the lower refresh-selection/close runtime-action lane, `profile-owner-action-surface-runtime.ts` now stays on outward `profileActions` publication, and `profile-owner-auto-open-kickoff-runtime.ts` now owns auto-open execution plus the owner-level kickoff effect over that public action surface. The earlier deleted `profile-owner-action-runtime.ts` also remains gone, and the now-deleted `profile-owner-state-runtime.ts`, `profile-owner-execution-runtime.ts`, plus `profile-owner-view-runtime.ts` no longer sit between those lower lanes and `profile-owner-runtime.ts`, so the live owner boundary now stays on direct owner composition while the lower action/runtime lanes live under their dedicated owners,
- `profile-shell-state-selector.ts` now owns the live `profileShellState` bus selector, `profile-shell-state-publisher.ts` now owns lower shell publication for camera padding and panel snapshot updates, and `profile-controller-shell-runtime-state-owner.ts` now owns the transition-status writer at the real controller/shell composition point instead of routing through another shell wrapper. `profile-transition-runtime-state.ts` still owns transition-record access, with the lower transition contract plus init/reset/capture helpers now split across `profile-transition-state-contract.ts` and `profile-transition-state-mutations.ts`, the grouped runtime-state type surface now living in `profile-runtime-state-contract.ts`, and the close runtime-state lane split across `profile-close-policy-runtime-state.ts`, `profile-close-foreground-runtime-state.ts`, `profile-close-finalization-runtime-state.ts`, so the deleted `profile-shell-runtime-state.ts` and deleted `use-profile-runtime-state.ts` no longer sit between shell publication and the live owner boundary,
- recent slices should keep deleting controller/root reach-throughs around that shell/results boundary rather than reopening mixed ownership.

## 14) Red-Team Residual Risks (Explicit)

These are known risks that must stay visible during execution.

1. CI perf gates are fixture-backed in Phase 1 and therefore validate tooling, not live runtime behavior.
2. The current `search-runtime-contract-tests` contract-check job is a parser/contract smoke gate and does not validate full runtime behavior.
3. Map label-sticky internals remain highly coupled in current code; migration must preserve behavior while extracting candidate/index ownership.
4. Shared-checkout churn can reintroduce legacy writes unless cluster state (`legacy`/`shadow`/`owned`/`deleted`) is enforced in every promotion.
5. Harness marker/sampler wiring is now connected and validated once in live run, but it is not yet continuously enforced in hosted CI.
6. Metric naming can look comparable while semantics differ; without schema lock, trend decisions can be invalid.

Live shape note: the deleted `use-search-root-surface-publication-args-runtime-contract.ts` and deleted `use-search-root-publication-args-runtime-contract.ts` no longer own another shared publication vocabulary tier. The deleted grouped `use-search-root-runtime-publication-args-runtime.ts`, deleted `use-search-root-chrome-input-publication-args-runtime.ts`, deleted `use-search-root-route-panel-publication-args-runtime.ts`, and deleted `use-search-root-restaurant-route-publication-args-runtime.ts` no longer sit between the root and the lower publication owners, the lower suggestion/header/filter input arg owners still terminate through `use-search-root-suggestion-input-publication-args-runtime.ts`, `use-search-root-header-input-publication-args-runtime.ts`, and `use-search-root-filters-warmup-publication-args-runtime.ts`, the map-render publication split now terminates through `search-root-map-render-publication-runtime-contract.ts`, `use-search-root-presentation-owner-runtime.ts` now owns the visual/route/restaurant/render publication lane, and `use-search-root-runtime.ts` now stays on root runtime publication plus lower map/presentation owner composition instead of keeping that whole publication lane inline.

Live shape note: `use-search-root-map-display-runtime-contract.ts` now owns the shared root map-display vocabulary, `use-search-root-map-runtime-interaction-args-runtime.ts` now owns runtime-backed map interaction arg assembly, `use-search-root-map-scaffold-interaction-args-runtime.ts` now owns scaffold-backed map interaction arg assembly, `use-search-root-map-request-interaction-args-runtime.ts` now owns request-backed map interaction arg assembly, `use-search-root-map-primitives-interaction-args-runtime.ts` now owns primitives/suggestion interaction arg assembly, `use-search-root-map-action-interaction-args-runtime.ts` now owns profile/presentation interaction arg assembly, the deleted `use-search-root-map-interaction-args-runtime.ts` and deleted `use-search-root-map-display-runtime.ts` no longer sit between those lower interaction owners and the map runtime, `use-search-root-map-stable-handlers-args-runtime.ts` now owns stable map-handler arg assembly, `use-search-root-map-display-owner-runtime.ts` now owns grouped map-display composition over those lower interaction/stable-handler owners, `use-search-root-map-render-publication-owner-runtime.ts` now owns the map-render publication split, `use-search-root-map-runtime.ts` now stays on thin composition over those lower map owners, and `use-search-root-runtime.ts` no longer wires that full map lane inline.

Live shape note: `use-search-foreground-visual-runtime-contract.ts` now owns the shared foreground-visual vocabulary, `use-search-foreground-bottom-nav-visual-runtime.ts` now owns the bottom-nav/results-wash/handoff lane, `use-search-foreground-shortcuts-visual-runtime.ts` now owns shortcut presence plus shortcut chip/chrome animation, `use-search-foreground-chrome-surface-visual-runtime.ts` now owns search surface and bar container animation, `use-search-foreground-search-this-area-visual-runtime.ts` now owns search-this-area reveal plus status-bar fade geometry, and `use-search-foreground-visual-runtime.ts` now stays on thin composition over those lower visual owners instead of remaining the mixed later visual lane.

Live shape note: `search-root-action-runtime-contract.ts` now owns the shared root action vocabulary, the old grouped `SearchRootActionRuntime` bag is gone from the live root-side contract path, and the root-side action surface still terminates on the separate `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` lanes instead of another nested action bundle. The deleted `use-search-root-session-action-args-runtime-contract.ts`, deleted `use-search-root-suggestion-interaction-args-runtime.ts`, deleted `use-search-root-submit-owner-args-runtime.ts`, deleted `use-search-root-filter-modal-args-runtime.ts`, deleted `use-search-root-foreground-interaction-args-runtime.ts`, deleted `use-search-root-ui-effects-args-runtime.ts`, deleted `use-search-root-results-sheet-interaction-args-runtime.ts`, deleted `use-search-root-session-action-args-runtime.ts`, deleted `use-search-root-presentation-state-args-runtime.ts`, deleted `use-search-root-action-runtime.ts`, deleted `use-search-root-session-action-runtime-contract.ts`, deleted `use-search-session-action-runtime.ts`, deleted `use-search-session-dependent-runtime.ts`, deleted `use-search-root-session-dependent-runtime.ts`, deleted `use-search-root-session-interaction-runtime.ts`, deleted `use-search-root-submit-filter-runtime.ts`, deleted `use-search-root-foreground-effects-runtime.ts`, deleted `use-search-root-filter-modal-owner-runtime.ts`, deleted `use-search-root-ui-effects-owner-runtime.ts`, deleted `use-search-root-session-action-owner-runtime.ts`, deleted `use-search-root-submit-runtime.ts`, deleted `use-search-root-action-owner-runtime.ts`, deleted `use-search-root-session-action-lane-runtime.ts`, deleted `use-search-root-results-sheet-runtime.ts`, deleted `use-search-root-results-presentation-state-runtime.ts`, deleted `use-search-root-action-runtime-publication-runtime.ts`, deleted `use-search-root-session-profile-owner-runtime.ts`, deleted `use-search-root-filter-modal-runtime.ts`, deleted `use-search-root-foreground-runtime.ts`, deleted `use-search-root-session-ui-effects-runtime.ts`, deleted `use-search-root-submit-read-model-runtime.ts`, deleted `use-search-root-submit-ui-ports-runtime.ts`, deleted `use-search-root-submit-runtime-ports-runtime.ts`, deleted `use-search-root-foreground-interaction-runtime.ts`, deleted `use-search-root-submit-filter-model-runtime.ts`, deleted `use-search-root-foreground-effects-model-runtime.ts`, deleted `use-search-root-session-dependent-model-runtime.ts`, deleted `use-search-root-session-action-model-runtime.ts`, deleted `use-search-root-action-publication-runtime.ts`, deleted `use-search-root-submit-model-runtime.ts`, deleted `use-search-root-foreground-model-runtime.ts`, deleted `use-search-root-filter-modal-model-runtime.ts`, deleted `use-search-root-ui-effects-model-runtime.ts`, deleted `use-search-root-results-sheet-interaction-runtime.ts`, deleted `use-search-root-results-presentation-state-runtime.ts`, deleted `use-search-root-runtime-publication-state-runtime.ts`, deleted `use-search-root-session-foreground-runtime.ts`, deleted `use-search-root-session-submit-filter-runtime.ts`, deleted `use-search-root-action-presentation-runtime.ts`, deleted `use-search-root-action-phase-runtime.ts`, deleted `use-search-root-submit-filter-owner-runtime.ts`, deleted `use-search-root-action-surface-runtime.ts`, deleted `use-search-root-action-model-runtime.ts`, now-deleted `use-search-root-submit-owner-runtime.ts`, now-deleted `use-search-root-dependent-action-runtime.ts`, now-deleted `use-search-root-profile-owner-runtime.ts`, now-deleted `use-search-root-results-sheet-interaction-owner-runtime.ts`, now-deleted `use-search-root-results-surface-state-runtime.ts`, now-deleted `use-search-root-action-publication-effects-runtime.ts`, now-deleted `use-search-session-action-boundary-runtime.ts`, now-deleted `use-search-session-submit-runtime.ts`, now-deleted `use-search-root-session-action-lanes-runtime.ts`, now-deleted `use-search-root-session-dependent-lane-runtime.ts`, now-deleted `use-search-root-session-submit-lane-runtime.ts`, now-deleted `use-search-root-session-action-runtime.ts`, now-deleted `use-search-root-results-surface-runtime.ts`, now-deleted `use-search-root-dependent-session-runtime.ts`, now-deleted `use-search-root-submit-filter-session-runtime.ts`, now-deleted `use-search-root-foreground-session-runtime.ts`, now-deleted `use-search-root-results-interaction-runtime.ts`, now-deleted `use-search-root-results-presentation-runtime.ts`, now-deleted `use-search-root-profile-session-runtime.ts`, now-deleted `use-search-root-submit-surface-runtime.ts`, now-deleted `use-search-root-submit-filter-surface-runtime.ts`, now-deleted `use-search-root-session-dependent-surface-runtime.ts`, now-deleted `use-search-root-session-action-surface-runtime.ts`, now-deleted `use-search-root-results-surface-publication-runtime.ts`, now-deleted `use-search-root-foreground-surface-runtime.ts`, now-deleted `use-search-root-foreground-command-runtime.ts`, and now-deleted `use-search-root-foreground-state-runtime.ts` remain gone. `use-search-root-session-profile-surface-runtime.ts` now owns the root-side profile/session lane, `use-search-root-submit-presentation-runtime.ts` now owns the root-side submit presentation/toggle lane, `use-search-root-submit-owner-surface-runtime.ts` now owns the direct submit-owner composition lane, `use-search-root-filter-surface-runtime.ts` now owns the root-side filter lane, `use-search-root-session-action-owner-runtime.ts` now terminates foreground interaction composition directly at the real session-action owner boundary over request/session/primitives/scaffold/suggestion lower lanes while still owning the full root-side profile/session/submit/filter/foreground session-action composition, `use-search-root-results-publication-owner-runtime.ts` now owns the root-side results-sheet interaction, presentation-state, and runtime-publication lane, and `use-search-root-action-lanes-runtime.ts` now stays on thin composition over those two real lower owners while map/presentation still consume `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` directly.

Live shape note: `use-search-root-profile-action-runtime-contract.ts` now owns the shared root profile-action vocabulary, `use-search-root-profile-selection-model-runtime.ts` now owns restaurant selection-model assembly, `use-search-root-profile-analytics-model-runtime.ts` now owns profile analytics-model assembly, `use-search-root-profile-native-execution-args-runtime.ts` now owns camera-transition, selection, and native execution args, `use-search-root-profile-app-execution-args-runtime.ts` now owns app execution args plus pending marker-frame cleanup, and `use-search-root-profile-action-runtime.ts` now stays on thin composition over those lower profile-action owners instead of remaining the mixed profile-action host.

Live shape note: `use-search-root-session-runtime-contract.ts` now owns the shared root-session vocabulary, `use-search-root-shared-snap-state-runtime.ts` now owns shared-snap reads, `use-search-root-results-arrival-state-runtime.ts` now owns results-arrival selection, `use-search-root-hydration-runtime-state.ts` now owns hydration-state selection, `use-search-root-camera-viewport-runtime.ts` now owns the root camera viewport refs plus `commitCameraViewport(...)`, `use-search-root-session-state-runtime.ts` now owns the bus-backed runtime owner/state/flags/primitives/hydration lane, `use-search-root-session-search-services-runtime.ts` now owns freeze/history/filter/request-status services, `use-search-root-session-overlay-map-runtime.ts` now owns overlay-command plus map-bootstrap composition, the deleted `use-search-root-session-runtime.ts` no longer sits between those lower session owners and the construction lane, and `use-search-root-construction-runtime.ts` now composes those lower session owners directly instead of routing through another grouped root-session constructor lane.

Live shape note: `use-search-root-runtime-contract.ts` now owns the shared top-level root vocabulary, the deleted `use-search-root-suggestion-scaffold-flow-runtime.ts`, deleted `use-search-root-request-action-flow-runtime.ts`, deleted `use-search-root-flow-runtime.ts`, deleted `use-search-root-flow-runtime-contract.ts`, deleted `use-search-root-core-construction-runtime.ts`, deleted `use-search-root-scaffold-request-construction-runtime.ts`, deleted `use-search-root-pre-presentation-action-owner-runtime.ts`, deleted `use-search-root-runtime-publication-owner-runtime.ts`, deleted `use-search-root-pre-presentation-interaction-runtime.ts`, now-deleted `use-search-root-pre-presentation-runtime.ts`, now-deleted `use-search-root-session-dependent-runtime.ts`, now-deleted `use-search-root-session-interaction-runtime.ts`, deleted `use-search-root-submit-owner-runtime.ts`, deleted `use-search-root-dependent-action-runtime.ts`, now-deleted `use-search-root-profile-owner-runtime.ts`, now-deleted `use-search-root-results-sheet-interaction-owner-runtime.ts`, now-deleted `use-search-root-results-surface-state-runtime.ts`, now-deleted `use-search-root-action-publication-effects-runtime.ts`, now-deleted `use-search-root-submit-filter-action-runtime.ts`, now-deleted `use-search-root-foreground-interaction-owner-runtime.ts`, now-deleted `use-search-root-foreground-submit-retry-runtime.ts`, now-deleted `use-search-root-foreground-editing-runtime.ts`, now-deleted `use-search-root-foreground-overlay-owner-runtime.ts`, now-deleted `use-search-root-ui-effects-runtime.ts`, now-deleted `use-search-session-action-boundary-runtime.ts`, now-deleted `use-search-session-submit-runtime.ts`, now-deleted `use-search-root-session-action-lanes-runtime.ts`, now-deleted `use-search-root-session-dependent-lane-runtime.ts`, now-deleted `use-search-root-session-submit-lane-runtime.ts`, now-deleted `use-search-root-session-action-runtime.ts`, now-deleted `use-search-root-results-surface-runtime.ts`, now-deleted `use-search-root-dependent-session-runtime.ts`, now-deleted `use-search-root-submit-filter-session-runtime.ts`, now-deleted `use-search-root-foreground-session-runtime.ts`, now-deleted `use-search-root-results-interaction-runtime.ts`, now-deleted `use-search-root-results-presentation-runtime.ts`, and now-deleted `use-search-root-profile-session-runtime.ts` remain gone. `use-search-root-construction-runtime.ts` now owns primitives/session/suggestion/scaffold/request construction, `use-search-root-action-lanes-runtime.ts` now stays on thin composition over `use-search-root-session-action-owner-runtime.ts` and `use-search-root-results-publication-owner-runtime.ts`, `use-search-root-map-runtime.ts` now owns the grouped map lane, and `use-search-root-presentation-owner-runtime.ts` now owns the grouped presentation lane. The top-level root now stays on orchestration over those real lower owners and threads `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` from `use-search-root-action-lanes-runtime.ts` directly into `use-search-root-map-runtime.ts` and `use-search-root-presentation-owner-runtime.ts` instead of preserving another grouped root-action bag.

Live shape note: the shared results boundary is narrower again too. `results-toggle-interaction-contract.ts` now owns toggle kind/lifecycle/scheduling/state vocabulary, `results-presentation-panel-state-contract.ts` now owns panel-only surface/render policy, and `results-presentation-runtime-contract.ts` now stays on the shared read/transport lane plus the settled-stage/read-model equality helpers instead of also carrying those lower toggle/panel families. The live consumers were repointed directly: `use-results-presentation-runtime-owner.ts`, `results-presentation-runtime-machine.ts`, `results-presentation-runtime-owner-contract.ts`, `query-mutation-orchestrator.ts`, and `search-runtime-bus.ts` now terminate on `results-toggle-interaction-contract.ts`, while `use-search-results-panel-render-policy-runtime.tsx` and `use-search-results-panel-surface-state-runtime.tsx` now terminate on `results-presentation-panel-state-contract.ts` instead of the broader shared runtime contract.

Live shape note: the shared results owner is flatter again too. The deleted `use-results-presentation-action-surface-runtime.ts`, deleted `use-results-presentation-close-runtime.ts`, deleted `use-results-presentation-request-runtime.ts`, deleted `use-results-presentation-shell-actions-runtime.ts`, deleted `use-results-presentation-shell-close-runtime.ts`, deleted `use-results-presentation-shell-request-runtime.ts`, deleted `use-results-presentation-close-search-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `results-presentation-shell-actions-runtime-contract.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-request-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, deleted `use-results-presentation-runtime-core-owner.ts`, deleted `use-results-presentation-owner-sheet-execution-runtime.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` remain gone. `results-presentation-owner-action-runtime-contract.ts` now owns the shared owner-action arg vocabulary, `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns the owner-side close-transition lifecycle lane, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns grouped `closeTransitionActions`, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns the lower deferred close-search cleanup lane, and `use-results-presentation-runtime-owner.ts` now terminates directly on `use-results-presentation-runtime-machine-owner.ts` and `use-results-presentation-toggle-runtime.ts`, keeps grouped `resultsSheetExecutionModel`, owner-side prepared exit dispatch, enter/editing/close request intent dispatch, and grouped `interactionModel` inline at the real owner boundary, and stays on shell-local state, shell model, and thin orchestration over those real lower owner-side lanes, with outward `presentationActions` assembly and close commands staying at the real owner boundary instead of routing through another local action wrapper tier.

Live shape note: the shared results machine is flatter again too. `results-presentation-runtime-machine.ts` no longer physically hosts the whole lower transport transition family inline. `results-presentation-runtime-machine-transport.ts` now owns committed/idle transport assembly, cover-state apply/clear policy, cancel/abort reset policy, toggle lifecycle transport resolution, enter mounted-hidden/start/settle transition policy, exit start/settle transition policy, and the grouped applied-log plus blocked-log semantics, while `results-presentation-runtime-machine.ts` now stays on machine-host apply/publish orchestration over that lower transport owner.

Live shape note: the deleted `use-search-root-publication-runtime-contract.ts` no longer owns a grouped root-publication vocabulary. The remaining root/publication types now terminate under the real lower owners: `use-search-root-runtime-contract.ts` owns the outward top-level root runtime surface, `use-search-root-visual-publication-args-runtime-contract.ts` owns the shared visual-publication arg vocabulary, `use-search-root-chrome-input-publication-args-runtime-contract.ts` owns the shared chrome-input publication vocabulary, `search-root-map-render-publication-runtime-contract.ts` owns the map-render publication vocabulary, `search-root-render-runtime-contract.ts` now owns the shared render vocabulary, and direct `use-search-runtime-publication-runtime.ts` now terminates that runtime publication lane inside `use-search-root-runtime.ts`. `use-search-root-presentation-visual-runtime.ts` now owns grouped visual/input publication preparation, `use-search-root-search-route-publication-runtime.ts` now owns Search-route publication, `use-search-root-restaurant-route-publication-owner-runtime.ts` now owns restaurant-route publication, `use-search-root-presentation-route-publication-runtime.ts` now stays on thin composition over those lower route-publication owners, `use-search-root-foreground-render-owner-runtime.ts` now owns the foreground render publication side of that lane, `use-search-root-modal-sheet-render-owner-runtime.ts` now owns the modal-sheet render publication side of that lane, `use-search-root-presentation-render-runtime.ts` now stays on thin composition over those lower render owners, and `use-search-root-presentation-owner-runtime.ts` now stays on thin composition over those lower publication/render owners.

Live shape note: the shared results owner/runtime seam is flatter again too. The deleted `use-results-presentation-runtime-core-owner.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` now also remain gone. `use-results-presentation-runtime-machine-owner.ts` now owns the runtime-machine publication, prepared snapshot staging/commit policy, and marker enter/exit handoff coordination directly under the real owner, while `use-results-presentation-toggle-runtime.ts` now owns toggle lifecycle plus frost-ready completion over that lower machine owner. `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns pending/active close intent refs plus restore/finalization lifecycle policy. `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns close-transition event application plus grouped `closeTransitionActions` over that lower lifecycle lane. `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred close-search cleanup scheduling over those lower close-transition lanes, while `use-results-presentation-runtime-owner.ts` now keeps outward `beginCloseSearch()` / `handleCloseResults()` / `cancelCloseSearch()` inline at the real owner boundary, assembles grouped `resultsSheetExecutionModel`, prepared exit execution, prepared snapshot shell application plus prepared enter/editing/close request intent dispatch, and tab-toggle commit plus grouped `interactionModel` inline, and stays on shell-local state, shell model, and thin outward owner composition over those lower runtime and owner-action lanes instead of physically hosting that whole mixed owner lane inline.

Live shape note: the shared results runtime-core lane is flatter again too. The deleted `use-results-presentation-runtime-core-owner.ts` no longer sits between the real owner and the lower runtime lanes. `use-results-presentation-runtime-machine-owner.ts` now owns the runtime-machine publication, prepared snapshot staging/commit policy, and marker enter/exit handoff coordination, `use-results-presentation-toggle-runtime.ts` now owns toggle lifecycle, frost-ready commit, and intent completion over that lower machine owner, and `use-results-presentation-runtime-owner.ts` now terminates directly on those two lower runtime owners instead of routing through the deleted runtime-core host.

Live shape note: the shared results runtime-machine lane is flatter again too. `use-results-presentation-staging-runtime.ts` now owns committed snapshot-key selection, staging admission/commit policy, page-one staging completion, and abort-time staged cleanup over the lower machine callbacks, while `use-results-presentation-marker-handoff-runtime.ts` now owns execution-batch enter/exit markers plus the run-one handoff settle bridge. `use-results-presentation-runtime-machine-owner.ts` now stays on thin composition over the live machine callbacks plus those two lower owners instead of remaining the mixed staging/handoff host.

Live shape note: the shared results marker-handoff lane is flatter again too. `use-results-presentation-marker-enter-runtime.ts` now owns mounted-hidden/start/settled enter markers plus the run-one handoff settle bridge, while `use-results-presentation-marker-exit-runtime.ts` now owns exit start/settle handling plus close-map-exit completion. `use-results-presentation-marker-handoff-runtime.ts` now stays on thin composition over those two lower enter/exit owners instead of remaining the mixed marker handoff host.

Live shape note: the shared results marker-enter lane is flatter again too. `use-results-presentation-marker-enter-batch-runtime.ts` now owns mounted-hidden/start/settled enter-batch admission over the lower machine callbacks, while `use-results-presentation-marker-enter-settle-bridge-runtime.ts` now owns the pending-enter settle queue plus run-one handoff advancement. `use-results-presentation-marker-enter-runtime.ts` now stays on thin composition over those two lower owners instead of remaining the mixed enter batch/settle host.

Live shape note: the shared results transport lane is flatter again too. `results-presentation-runtime-machine-enter-transport.ts` now owns the enter-mounted-hidden, start-enter-execution, enter-started, and enter-settled attempt family, while `results-presentation-runtime-machine-exit-transport.ts` now owns the exit-started and exit-settled attempt family. `results-presentation-runtime-machine-transport.ts` now stays on shared transport attempt primitives plus cover-state, cancel/abort, commit, and toggle lifecycle transport policy instead of physically hosting the whole enter/exit transition family inline.

Live shape note: the shared results owner-side action lane is flatter again too. The deleted `use-results-presentation-shell-close-runtime.ts`, deleted `use-results-presentation-shell-request-runtime.ts`, deleted `use-results-presentation-shell-actions-runtime.ts`, deleted `use-results-presentation-close-search-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `results-presentation-shell-actions-runtime-contract.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-request-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, deleted `use-results-presentation-owner-sheet-execution-runtime.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` remain gone. `results-presentation-owner-action-runtime-contract.ts` now owns the shared owner-action arg vocabulary, `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns direct close-transition refs plus restore/finalization policy, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns grouped `closeTransitionActions`, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred close-search cleanup scheduling, and `use-results-presentation-runtime-owner.ts` now stays on thin orchestration over those real owner-side lanes plus shell-local state, shell model, direct runtime-machine/toggle composition, owner-inline grouped `resultsSheetExecutionModel`, owner-inline prepared exit execution, owner-inline prepared snapshot shell application plus `requestSearchPresentationIntent(...)`, owner-inline grouped `interactionModel`, and owner-inline close commands.

Live shape note: the shared results close-transition lane is flatter again too. The deleted `use-results-presentation-close-transition-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, and deleted `use-results-presentation-owner-close-exit-runtime.ts` remain gone. `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now terminates the lower transition lifecycle lane directly on the pure transition-state helpers in `results-presentation-shell-close-transition-state.ts`, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns close-transition event application plus grouped `closeTransitionActions` over that lower lifecycle lane, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred cleanup scheduling over those lower close-transition lanes, and `use-results-presentation-runtime-owner.ts` now keeps prepared exit dispatch and outward close commands at the real owner boundary.

Live shape note: the shared results enter transport lane is flatter again too. The deleted `results-presentation-runtime-machine-enter-transport.ts` no longer sits between the runtime machine and the lower enter attempt families. `results-presentation-runtime-machine-enter-batch-transport.ts` now owns enter-mounted-hidden plus start-enter-execution, `results-presentation-runtime-machine-enter-completion-transport.ts` now owns enter-started plus enter-settled, and `results-presentation-runtime-machine.ts` now terminates directly on those two lower enter transport owners together with `results-presentation-runtime-machine-exit-transport.ts`.

Live shape note: the shared results transport host is flatter again too. The deleted `results-presentation-runtime-machine-transport.ts` no longer sits between the runtime machine and the lower transport policy/primitives families. `results-presentation-runtime-machine-transport-primitives.ts` now owns the named/applied attempt types, active execution resolution, and attempt application plumbing, `results-presentation-runtime-machine-cover-state-transport.ts` now owns cover-state apply/clear policy, `results-presentation-runtime-machine-intent-lifecycle-transport.ts` now owns cancel/abort/commit policy plus toggle lifecycle transport resolution over that lower cover-state owner, and `results-presentation-runtime-machine.ts` plus the lower enter/exit transport owners now terminate directly on those lower transport owners instead of another mixed shared host.
