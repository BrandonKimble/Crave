#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_ROOT="${1:-apps/mobile/src}"
TARGET_PATH="$REPO_ROOT/$TARGET_ROOT"
ROOT_NATIVE_PROJECT_PATHS=(
  "$REPO_ROOT/android"
  "$REPO_ROOT/ios"
)

if [[ ! -e "$TARGET_PATH" ]]; then
  echo "[app-route-runtime-delete-gate] Target not found: $TARGET_ROOT" >&2
  exit 1
fi

for root_native_project_path in "${ROOT_NATIVE_PROJECT_PATHS[@]}"; do
  if [[ -e "$root_native_project_path" ]]; then
    echo "[app-route-runtime-delete-gate] FAIL root_native_generated_project_path: root native generated projects must not return; active native projects live under apps/mobile." >&2
    echo "${root_native_project_path#$REPO_ROOT/}" >&2
    exit 1
  fi
done

declare -a CONTENT_CHECKS=(
  "polls_scene_authority_subscribe::routePollsSceneRuntime\\.sceneAuthority\\.subscribe::Polls scene authority must remain snapshot/target-owned, not subscribed from mounted chrome/body."
  "chrome_mode_authority_subscribe::routeOverlayChromeModeAuthority\\.(subscribe|subscribeSelector)::Chrome mode authority is snapshot/shared-value target only."
  "chrome_mode_listener_surface::chromeModeListeners::Chrome mode listener set was deleted as a subscription backdoor."
  "chrome_mode_notify_label::notify:chromeMode::Chrome mode notify path was deleted."
  "chrome_motion_snap_targets::chromeMotionSnapTargets::Old chrome snap listener target path must not return."
  "polls_visibility_authority_subscribe::routeOverlayPollsVisibilityAuthority\\.(subscribe|subscribeSelector)::Polls visibility uses getSnapshot/registerTarget, not subscriptions."
  "idle_route_state_subscription::subscribeIdleRoute(State|Selector)::Idle route state subscription APIs were deleted."
  "nav_switch_harness_route_identity::navSwitchHarnessRouteIdentity::Harness must not revive route-identity side channel."
  "native_overlay_route_switch_authority::nativeOverlayRouteSwitchAuthority::Backed-out native overlay route-switch authority shape must not return."
  "search_route_switch_post_commit_owner::SearchRouteSwitchPostCommitOwner::Backed-out post-commit owner variants must not return."
  "fanout_route_scene_motion_dispatch_owner::RouteSceneMotionDispatchOwner::Fanout-owned scene motion dispatch owner must not return."
  "scene_motion_authority::sceneMotionAuthority::Public scene motion authority was replaced by a route-owned dispatch target."
  "scene_motion_listeners::motionListeners::Scene motion listener set was deleted."
  "scene_stack_transition_authority::sceneStackTransitionAuthority::Public scene-stack transition authority was replaced by a direct sink."
  "scene_stack_transition_listeners::sceneStackTransitionListeners::Scene-stack transition listener set was deleted."
  "scene_stack_transition_target::sceneStackTransitionTarget::Scene-stack transition target listener was deleted."
  "route_scene_hot_lane::syncRouteSceneSwitchHotTransition::Rejected scene-stack hot-lane experiment must not return."
  "route_scene_hot_lane_label::hotLane::Rejected scene-stack hot-lane labels must not return."
  "route_scene_switch_fallback::routeSceneSwitchDispatchTargetFallback::Rejected scene-stack dispatch fallback must not return."
  "native_overlay_identity_subscribe::routeOverlayIdentityAuthority\\.(subscribe|subscribeSelector)::Native overlay identity uses getSnapshot/registerTarget, not subscriptions."
  "native_overlay_root_subscribe::routeOverlayRootAuthority\\.(subscribe|subscribeSelector)::Native overlay root uses getSnapshot/registerTarget, not subscriptions."
  "native_overlay_display_subscribe::routeOverlayDisplayAuthority\\.(subscribe|subscribeSelector)::Native overlay display uses getSnapshot/registerSharedValues, not subscriptions."
  "native_overlay_sheet_policy_subscribe::routeOverlaySheetPolicyAuthority\\.(subscribe|subscribeSelector)::Sheet policy uses getSnapshot/registerTarget, not subscriptions."
  "native_overlay_navigation_subscribe::routeOverlayNavigationAuthority\\.(subscribe|subscribeSelector)::Navigation uses getSnapshot/registerTarget, not subscriptions."
  "route_sheet_host_navigation_subscribe::routeSheetHostNavigationAuthority\\.(subscribe|subscribeSelector)::Sheet-host navigation uses getSnapshot/registerTarget, not subscriptions."
  "route_sheet_host_sheet_policy_subscribe::routeSheetHostSheetPolicyAuthority\\.(subscribe|subscribeSelector)::Sheet-host sheet policy uses getSnapshot/registerTarget, not subscriptions."
  "native_overlay_identity_listeners::identityListeners::Native overlay identity listener set was deleted."
  "native_overlay_root_listeners::rootListeners::Native overlay root listener set was deleted."
  "native_overlay_display_listeners::displayListeners::Native overlay display listener set was deleted."
  "native_overlay_sheet_policy_listeners::sheetPolicyListeners::Native overlay sheet policy listener set was deleted."
  "native_overlay_navigation_listeners::navigationListeners::Native overlay navigation listener set was deleted."
  "native_overlay_identity_notify::notify:identity::Native overlay identity notify label was deleted."
  "native_overlay_root_notify::notify:root::Native overlay root notify label was deleted."
  "native_overlay_display_notify::notify:display::Native overlay display notify label was deleted."
  "native_overlay_sheet_policy_notify::notify:sheetPolicy::Native overlay sheet policy notify label was deleted."
  "native_overlay_navigation_notify::notify:navigation::Native overlay navigation notify label was deleted."
  "unused_visibility_selector_api::routeOverlayVisibilityAuthority\\.subscribeSelector::Visibility authority kept one render-gate subscribe only; selector API must not return."
  "unused_sheet_host_surface_selector_api::routeSheetHostSurfaceAuthority\\.subscribeSelector::Sheet-host surface kept one render-gate subscribe only; selector API must not return."
  "native_overlay_selector_helper::subscribeSelectorToSet::Native overlay selector helper was removed with the unused selector APIs."
  "map_source_controller_sync_mounted_results_subscription::subscribeSearchMountedResultsDataSnapshot\\(publishAndFetch\\)::Map source controller must subscribe to mounted results through deferred notify mode, not the synchronous response-publish task."
  "search_submit_dismiss_side_authority_class::SearchSubmitDismissTransitionVisualAuthority::Submit/dismiss visual ownership must live in route-scene transaction state, not a side authority class."
  "search_submit_dismiss_side_authority_getter::getSearchSubmitDismissTransitionVisualAuthority::Submit/dismiss visual ownership must not use a global side-authority getter."
  "search_submit_dismiss_side_authority_hook::useSearchSubmitDismissTransitionVisualAuthoritySelector::Submit/dismiss visual ownership must select route-scene transaction state."
  "search_submit_dismiss_legacy_route_visual_names::RouteSceneSearchSubmitDismiss|searchSubmitDismissTransaction|requestSearchSubmitDismiss|updateSearchSubmitDismiss|clearSearchSubmitDismiss::Submit/dismiss visual state is owned by SearchSurfaceRuntime transactions."
  "search_surface_legacy_transition_visual_state::\\b(SearchTransitionVisualState|updateSearchTransitionVisualStateReadiness|searchTransitionVisualState|searchTransitionVisualRequest)\\b::Search visual policy must be projected from SearchSurfaceRuntime, not route transition state."
  "search_surface_legacy_mounted_body_snapshot::\\b(SearchMountedSceneBodySnapshot|syncSearchMountedSceneBodySnapshot)\\b::Mounted results body must be projected from the SearchSurfaceRuntime results page bundle."
  "search_surface_legacy_run_one_phase_names::\\b(RunOneHandoffPhase|h1_phase_a_committed|h2_marker_enter|h3_hydration_ramp|h4_chrome_resume)\\b::Redraw readiness must use SearchSurfaceRuntime transactions and surface redraw phase names."
  "search_surface_legacy_run_one_handoff_ownership::\\b(runOneHandoff|RunOneHandoff|run-one-handoff|runOne|RunOne|run-one|Run1|run1)\\b::Search redraw ownership must use SearchSurfaceRedraw/SearchSurfaceRuntime names, not run-one handoff names."
  "search_surface_legacy_prepared_results_transaction::\\b(PreparedResults|preparedResults|preparedPresentationSnapshotKey|results-prepared|prepared_snapshot|prepared_staging|cards_pins_prepared|prepared_commit_gate|map_prepared_source_frame_ready_contract)\\b::Search results transactions must use SearchSurfaceResultsTransaction names."
  "search_surface_redraw_null_results_clears_transaction_key::results == null[\\s\\S]{0,260}searchSurfaceResultsTransactionKey:\\s*null::Transient null result data during redraw must not clear the active SearchSurfaceResultsTransaction key."
  "search_surface_redraw_stage_sources_ready_reset::stage: \\([\\s\\S]{0,520}publishMapSearchSurfaceResultsSourcesReady\\(false, snapshot\\.transactionId\\)::Staging a redraw transaction must not reset already-latched marker/source readiness."
  "search_surface_results_body_bundle_active_only::syncResultsPageBodyBundle[\\s\\S]{0,180}if \\(this\\.snapshot\\.activeBundle\\.kind !== 'results'\\)[\\s\\S]{0,220}this\\.latestResultsBodyBundle = bodyBundle::Results body bundle must be retained before the active-results guard so future redraws can mount cards."
  "search_surface_same_key_rerun_blocked_after_page_one_commit::handlePageOneResultsCommitted\\(inputs\\)[\\s\\S]{0,120}return;[[:space:]]*}[[:space:]]*promoteDataReady\\(inputs\\)::Page-one response commit must refresh same-key cached reruns before promoting data readiness."
  "search_surface_results_react_effect_fallback::react_effect_fallback::Search results transaction commits must use named source events, not fallback labels."
  "search_surface_results_synthetic_enter_settle::synthetic-batch|settledCommittedEnterFromRevealedSurface|committed_enter_settled_from_revealed_surface|maybeSettleCommittedEnterFromRevealedSurface::Search results enter must wait for native mounted-hidden/settled events, not synthetic JS settlement."
  "search_results_semantic_visual_reuse_names::semanticResultsVisualReuse|semantic_visual_reuse|semantic-reuse|semantic_reuse|retainedResultsVisualReuse|retained_results_visual_reuse|retained_submit_promoted|responseLifecycleSkipped|requestPayloadSkipped::Search reveals must not revive the old semantic/retained mounted-visual reuse lane."
  "search_surface_legacy_marker_ready_api::markRedrawMarkersReady\\(::Reveal readiness must use markRedrawNativeMarkerFrameReady from native mounted-hidden acknowledgement."
  "search_surface_legacy_visual_redraw_store_refs::search-surface-visual-redraw-store|SearchSurfaceVisualRedraw|beginSearchSurfaceVisualRedraw|markSearchSurfaceVisualRedrawReady|revealSearchSurfaceVisualRedraw|cancelSearchSurfaceVisualRedraw::Results reveal readiness is owned by SearchSurfaceRuntime.redrawTransaction, not a parallel visual redraw store."
  "search_surface_persistent_poll_clear_without_redraw_guard::transportSnapshot\\.snapshotKind !== 'results_enter'\\) \\{[[:space:]]*publishSearchMountedResultsDataSnapshot\\(null\\)::Persistent-poll lane cleanup must not clear mounted results while a redraw transaction is active or armed."
  "search_results_settled_surface_none::coverState === 'hidden'[\\s\\S]{0,120}\\? 'none'[\\s\\S]{0,120}coverState === 'initial_loading'::Settled visible results must remain an active results surface after the loading cover hides."
  "search_transition_visual_side_request_api::requestSearchTransitionVisualState::Search transition visual state side requests must not return."
  "search_transition_visual_dead_header_fields::\\b(SearchTransitionVisualHeaderOwner|headerOwner|headerReady|navSilhouetteMode)\\b::Search transition visual state must not revive dead header-owner/header-ready/nav-silhouette fields."
  "search_transition_visual_internal_owner_exports::export type SearchTransitionVisual(Phase|BottomBandOwner)\\b::Search transition phase and bottom-band owner types are internal implementation details."
  "app_route_nav_silhouette_dead_transaction_helper::\\bresolveAppRouteNavSilhouetteModeValueFromTransaction\\b::Nav silhouette transaction mode helper was unused and must not return."
  "app_route_nav_silhouette_internal_helper_exports::export const (resolveAppRouteNavSilhouetteMode|resolveAppRouteNavSilhouetteModeValue|roundAppRouteNavSilhouetteTelemetryValue)\\b::Nav silhouette mode/telemetry helpers are internal to the authority module."
  "app_route_nav_silhouette_sheet_like_bottom_band::\\bshouldUseSheetLikeBottomNavBand\\b::Old sheet-like bottom-nav band workaround must not return."
  "app_route_nav_silhouette_solid_bg::\\bAPP_ROUTE_NAV_SILHOUETTE_SOLID_BG\\b::Bottom-nav silhouette must render frosted material, not a solid fallback band."
  "app_route_nav_silhouette_solid_background_color::\\bsolidBackgroundColor\\b::Bottom-nav silhouette geometry must not carry a solid fill color."
  "app_route_nav_silhouette_disable_blur_prop::NavBarSilhouetteBackground[\\s\\S]{0,240}\\bdisableBlur\\b::Bottom-nav silhouette blur must not be switchable off."
  "app_route_nav_silhouette_svg_material_mask::\\bNavBarSilhouetteBackground\\b|@react-native-masked-view/masked-view[\\s\\S]{0,260}nav.*silhouette|react-native-svg[\\s\\S]{0,260}nav.*silhouette::Bottom-nav must not revive a separate SVG/MaskedView material cutout."
  "app_route_nav_silhouette_runtime_mask_role_prop::\\bmaskRole\\b::Nav material and sheet exclusion must use fixed native component roles, not a runtime string role prop."
  "app_route_nav_material_fullscreen_host::materialHost:\\s*\\{[\\s\\S]{0,160}StyleSheet\\.absoluteFillObject|NavSilhouetteMaterialHost[\\s\\S]{0,520}viewportHeight|NavSilhouetteMaterialHost[\\s\\S]{0,520}height:\\s*viewportHeight::Nav material must live inside the bounded nav silhouette host, not as a full-screen or separate material overlay."
  "app_route_nav_material_mask_view::SearchRouteNavMaterialMaskView|AnimatedSearchRouteNavMaterialMaskNativeView|SearchRouteNavMaterialMaskNativeView|SearchRouteNavSilhouetteMaterialView::Bottom-nav material mask view caused the rectangular frosty band; do not reintroduce it."
  "app_route_nav_silhouette_split_material_path::makeSearchRouteNavMaterialBodyPath|makeSearchRouteSheetNavBodyExclusionPath|itemCount:\\s*CGFloat\\s*=\\s*3::Sheet exclusion must consume one shared nav silhouette path, not split item/rectangle paths."
  "app_route_nav_silhouette_synthetic_cutout_reveal::\\bcutoutReveal(AnimatedStyle|Material|MaskElement)\\b::Bottom-nav cutout must be transparent real-sheet reveal, not a synthetic reveal layer."
  "app_route_nav_silhouette_sheet_progress_nav_motion::\\b(shouldDriveBottomNavFromSearchSurfaceMotion|searchResultsMotionNavProgress|sheetYObservedProjection|wasDrivingBottomNavFromSearchSurfaceMotionRef)\\b::Bottom-nav motion must use fixed out-cubic timing, not sheet-progress-driven ownership."
  "bottom_nav_item_visibility_reanimated_svg_wrapper::\\bbottomNavItemVisibilityAnimatedStyle\\b::Bottom-nav item visibility must not apply a Reanimated style around SVG descendants during submit/dismiss."
  "search_startup_geometry_legacy_bottom_aliases::\\bSEARCH_BOTTOM_(INSET_MIN|NAV_ICON_HEIGHT|NAV_LABEL_GAP|NAV_HIDE_EXTRA|NAV_HIDE_MIN|NAV_SILHOUETTE_CUTOUT_HEIGHT)\\b::Search startup geometry must use app-route nav geometry names, not old Search bottom aliases."
  "search_overlay_runtime_dead_contract_exports::\\b(SearchRouteOverlayKey|SearchRouteOverlaySheetKeys|SearchRouteSceneStackState|SearchRouteOverlaySheetPolicyInput|SearchRouteHostSelectionState|SearchRouteOverlayRenderPolicy|areSearchRouteSceneShellSpecsEqual|areSearchRouteSceneChromePublicationsEqual|areSearchRoutePublishedScenePartsEqual|EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF|EMPTY_SEARCH_ROUTE_HOST_SELECTION_STATE|EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY)\\b::Unused Search-route overlay contract exports were deleted and must not return."
  "search_overlay_split_suggestion_header_host::\\bSearchOverlayHeaderLayerHost\\b::Search suggestion cutouts and header chrome must render in one overlay coordinate owner."
  "search_overlay_split_chrome_publication_slots::\\b(publishOverlayChromeFrameSnapshot|publishOverlayChromeContainerSnapshot|publishOverlayChromeHeaderProps|publishOverlayChromeSuggestionSurfaceProps|overlayChromeFrameHostAuthority|overlayChromeContainerHostAuthority|overlayChromeHeaderHostAuthority|overlayChromeSuggestionSurfaceHostAuthority)\\b::Search-mode header and cutout surface must publish through one atomic overlay chrome snapshot."
  "search_overlay_header_drops_input_motion::inputAnimatedStyle=\\{undefined\\}::Search header must receive the app-route input motion style; dropping it desynchronizes search-mode chrome placement."
  "search_suggestion_shortcut_cutout_waits_for_measurement_only::shouldDriveSuggestionLayout\\s*&&\\s*hasResolvedSearchShortcutsFrame::Search-mode shortcut cutouts must reserve the old-good fallback strip before row measurement arrives."
  "search_suggestion_shortcut_hole_cache_null_overwrite::suggestionHeaderShortcutHolesRef\\.current\\s*=\\s*\\{[\\s\\S]{0,220}\\?\\s*cloneSuggestionMaskedHole\\([\\s\\S]{0,120}:\\s*null::Shortcut cutout holes must retain the last valid measured holes when transient layout measurement clears."
  "search_suggestion_keyboard_show_duration::keyboard(Will|Did)Show[\\s\\S]{0,260}event\\.duration::Entering search mode must use fixed local show timing, not keyboard show duration."
  "search_suggestion_keyboard_hide_duration::keyboard(Will|Did)Hide[\\s\\S]{0,260}event\\.duration::Leaving search mode must use fixed local hide timing, not the slower keyboard hide duration."
  "search_mode_press_down_entry_path::\\bhandleSearchPressIn\\b|\\bonInputTouchStart\\b::Search mode enter/exit must use press-up/focus semantics, not a press-down entry lane."
  "search_mode_inactive_input_focusable::inputFocusEnabled=\\{headerVisualModel\\.editable::Inactive search chrome must not leave TextInput focusable before press-up."
  "search_suggestion_exit_ease_in::use-search-suggestion-(transition-timing|layout-animation)-runtime\\.ts[\\s\\S]{0,520}Easing\\.in\\(Easing\\.cubic\\)::Search-mode exit should start visibly on press-up; do not use ease-in for the suggestion surface."
  "search_mode_shortcut_frozen_interaction_boolean::\\bshortcutsInteractionEnabled\\b(?!Ref)::Search-mode shortcut submit must read live interaction through a ref, not a frozen boolean captured by the overlay chrome host."
  "search_submit_dismiss_legacy_lifecycle_methods::\\.(beginResultsEnter|beginResultsExit|markResultsHeaderReady|markPollsHeaderReady|markPersistentPollsHeaderReady|markPersistentPollsBodyReady|markResultsExitMapSettled|markResultsExitCollapsedSettled|markPersistentPollRestoreRequested)\\(::Submit/dismiss result lifecycle marks must update route-scene transaction readiness."
  "search_dismiss_motion_plane_sheet_y_writer::useSearchDismissMotionPlaneRuntime[\\s\\S]*sheetTranslateY\\.value\\s*=::Search dismiss motion plane must observe real sheet Y, not write sheetTranslateY."
  "search_dismiss_motion_plane_sheet_command_writer::useSearchDismissMotionPlaneRuntime[\\s\\S]*(requestSheetMotionSnap|requestSnap\\('collapsed'|animateSheetTo\\('collapsed')::Search dismiss motion plane must not command sheet collapse; close press-up uses the real sheet transport."
  "search_nav_cutout_frame_bucket_proof::\\bnavCutoutProofBucket\\b::Nav/cutout lockstep proof must be edge-triggered, not per-frame progress bucket logging."
  "search_dismiss_motion_dense_progress_proof::search_dismiss_motion_plane_contract[\\s\\S]{0,260}\\blate_progress\\b::Dismiss motion proof must emit bounded early/mid/boundary edges, not dense late progress samples."
  "search_submit_dismiss_command_target_names::\\b(SearchSurfaceMotionPlaneCommandTarget|registerMotionPlaneCommandTarget|motionPlaneCommandTarget)\\b::Search motion-plane adapter observes sheet Y; command-target naming must not return."
  "search_nav_surface_progress_copy_lane::bottomNavHideProgress\\.value\\s*=\\s*surfaceMotionProgress::Search nav silhouette must use its fixed timing lane, not copy Search surface progress."
  "search_route_sheet_clip_stale_ref::sheetClipStyleRef::Route sheet clip must consume the live animated clip style, not retain a stale first style."
  "search_route_sheet_frame_animated_layout_prop::navSilhouetteSheetClipStyle|routeHostVisualRuntime\\?\\.navSilhouetteSheetBodyExclusionHeight|bottom:\\s*Math\\.max\\(0,\\s*bodyExclusionHeight\\s*-\\s*cutoutRevealDepth\\)::Route sheet frame host must keep static layout during nav silhouette motion; do not animate Yoga-affecting props."
  "search_results_portal_animated_layout_props::useAnimatedStyle\\([\\s\\S]{0,260}const sheetY = sheetYValue\\?\\.value \\?\\? measuredSheetY;[\\s\\S]{0,320}(top:\\s*sheetY|left:\\s*viewportLeft|width:\\s*viewportWidth|height:\\s*viewportHeight)::Results body/header portal hosts must keep JS layout static and follow sheetY with transform-only projection."
  "scene_stack_body_frame_reanimated_visibility::SceneStackBodyFrame[\\s\\S]{0,260}<Animated\\.View|SceneStackBodyFrameHost[\\s\\S]{0,520}useAnimatedStyle\\([\\s\\S]{0,260}(opacity|zIndex|elevation)::Scene body frames must use discrete visible/hidden styles, not Reanimated opacity/zIndex/elevation over large page trees."
  "scene_stack_chrome_reanimated_visibility::SceneStack(Decor|Header)Layer[\\s\\S]{0,520}useAnimatedStyle\\([\\s\\S]{0,260}(opacity|zIndex|elevation)::Scene chrome layers must use discrete visible/hidden styles, not Reanimated opacity/zIndex/elevation over SVG/chrome trees."
  "results_header_body_underlap_cutout_leak::\\b(bodyUnderlapsHeader|applyContentTopInset|contentTopInset)\\b::Results header cutouts must not reveal scrolling rows; keep the list viewport physically below the fixed page header instead of underlapping with content padding."
  "search_results_body_bundle_result_specific_deps::stableSceneBodyContent[\\s\\S]{0,900}(rawSceneBodyContent\\.List(Header|Chrome|Empty)Component|rawSceneBodyContent\\.ListFooterComponent|rawSceneBodyContent\\.ItemSeparatorComponent,|rawSceneBodyContent\\.onEndReached,)::Mounted results body bundle must stay structural; result-specific list decorations and callbacks must flow through refs/data-store paths."
  "search_results_body_bundle_transport_flashlist_spread::stableFlashListProps[\\s\\S]{0,260}\\.\\.\\.\\(rawSceneBodyTransport\\.flashListProps::Mounted results body bundle must not resync from FlashList prop object identity; delegate hot callbacks through stable refs."
  "search_route_sheet_frame_local_clip_fallback::\\b(EMPTY_ROUTE_HOST_VISUAL_RUNTIME_AUTHORITY|fallbackFrameSheetClipStyle)\\b::Route sheet frame host must require NavSilhouetteRuntime clipping, not define a local fallback clip."
  "search_route_sheet_mask_progress_mount_gate::shouldMountMaskHost[\\s\\S]{0,260}navBarCutoutProgress[\\s\\S]{0,260}>\\s*0\\.001::Route sheet nav mask host must be semantically present for nav-owned exclusion modes, not mounted from animated progress."
  "search_route_sheet_mask_host_progress_owner::should(Host|Enable)SheetMaskForNavSilhouette[\\s\\S]{0,220}\\bprogress\\b|setShouldHostMask[\\s\\S]{0,260}navBarCutoutProgress::Route sheet nav mask host ownership must not depend on animated progress."
  "search_route_sheet_mask_native_manager_fallback::\\b(hasNativeViewManager|hasSearchRouteSheetNavExclusionMaskNativeView|getViewManagerConfig)\\b::Nav silhouette native mask registration must be strict; do not fallback to a JS View when the native manager is missing."
  "nav_silhouette_rectangular_sheet_clip_helper::useAppRouteNavSilhouetteSheetClipAnimatedStyle|navSilhouetteSheetExclusion\\b|expectedSheetExclusion\\b::Nav silhouette sheet exclusion must be an inverse silhouette mask, not a rectangular bottom inset."
  "search_foreground_local_nav_silhouette_mode_converter::resolveSearchSurfaceNavSilhouetteModeValue::Search foreground must use the app-route nav silhouette authority for mode-to-value projection."
  "search_route_sheet_frame_clip_mode_owner::frameHostInput\\.sheetClipMode|sheetClipMode:\\s*searchSurfaceNavSilhouette\\.sheetClipMode|sheetClipMode:\\s*snapshot\\.frameHostInput\\.sheetClipMode::Sheet frame hosts must consume the nav silhouette exclusion projection, not own a sheetClipMode override."
  "search_route_sheet_policy_clip_mode_owner::resolveAppRouteNavSilhouetteModeValueFromPolicy[\\s\\S]{0,220}sheetClipMode::Nav silhouette policy resolution must not accept a sheet-side clip-mode override."
  "search_route_policy_search_route_as_animated_transition::activeSemanticOverlayKey === 'search' \\? 'animatedSearchTransition'::Fresh search-home must initialize as a docked persistent nav exclusion, not as an animated search transition."
  "nav_silhouette_docked_poll_zero_mask::mode === 'dockedPersistentPoll'[\\s\\S]{0,260}expectedSheetMaskHeight:\\s*0::Docked poll sheet mask is nav-silhouette-owned; it must not collapse to a sheet-side zero mask."
  "search_submit_instant_sheet_writer::\\bshowPanelInstant\\b|setSheetTranslateYTo\\(position\\)::Search submit/open must not instant-write visible sheet Y from the results sheet visibility controller."
  "search_submit_legacy_entry_origin::\\b(entryOrigin|SearchSubmitEntryOrigin)\\b::Search submit intents must use required entrySurface, not the old optional entryOrigin."
  "search_submit_home_surface_default::entrySurface\\s*=\\s*'home'|entrySurface\\s*\\?\\?\\s*'home'::Search submit entrySurface must be declared by the foreground caller, not silently defaulted to home."
  "search_close_visual_handoff_progress_prop::\\bcloseVisualHandoffProgress\\b::Search close must not carry the old split visual-handoff progress prop through route chrome/body hosts."
  "search_dismiss_split_boundary_state::\\b(visualHandoffReached|markVisualHandoffReached|canVisuallyReleasePersistentPolls|canFinalizePersistentPolls)\\b::Search dismiss must use one collapsed boundary release state, not split visual/final handoff state."
  "search_dismiss_two_stage_prehandoff_plane::\\b(PRE_HANDOFF|preHandoff|dismissMotionHandoffY|commitVisualHandoffBoundary|dismissMotionResumeBoundaryRequest|waitingForPollPageAtPreBoundary)\\b::Search dismiss motion plane must not revive the prehandoff two-stage handoff path."
  "search_close_per_piece_handoff_opacity::1\\s*-\\s*closeVisualHandoffProgress\\.value|sceneVisibilityValue\\.value \\* \\(1 - closeVisualHandoffProgress\\.value\\)::Search close must not fade header/body/chrome independently with closeVisualHandoffProgress."
  "search_results_header_authority_singleton::\\bSearchResultsHeaderChromeAuthority\\b|\\bSearchResultsHeaderChromeSurfaceHost\\b|\\buseSearchResultsHeaderChromePublicationRuntime\\b::Results page title header must be owned by the ResultsPageBundle, not a module-level fixed-lane authority."
  "search_mounted_scene_chrome_authority::\\bSearchMountedSceneChromeAuthority\\b|\\bSearchMountedSceneChromeSurfaceHost\\b|\\bpublishSearchMountedSceneChromeSnapshot\\b|\\bSearchMountedSceneChromeSnapshot\\b::Search results must publish a single page bundle object, not separate mounted chrome surfaces."
  "search_results_fixed_header_component_lane::\\bfixedHeaderComponent\\b::Results page header must not be threaded through a separate fixed header component prop."
  "search_results_old_mounted_chrome_lane::sheet_mounted_chrome_overlay|result_page_sheet_chrome_overlay|mounted_behind_loading_cover|mountedChromeKey:\\s*'search'|mountedChromeKey\\s*=\\s*\"search\"::Results toggle/header contracts must name the results page bundle, not the old mounted chrome lane."
  "scene_stack_host_shared_page_material::physicalSheetBackground|BottomSheetSceneStackHost[\\s\\S]*FrostedGlassBackground::Scene stack host must move/clip/present page bundles only; page material belongs to each page bundle."
  "scene_stack_inline_header_before_body::SceneStackBodyFrame[\\s\\S]{0,360}surface=\"header\"[\\s\\S]{0,220}\\{children\\}::Mounted sheet page header must be layered by the page frame above a clipped body lane, not rendered inline before body children."
  "search_dismiss_old_visual_handoff_telemetry::\\b(boundaryHandoffSource|handoffY|releaseDelayAfterVisualHandoffBoundaryMs|releasedAtVisualHandoffBoundary|collapsed_visual_boundary|visual_boundary)\\b::Search dismiss telemetry/contracts must use collapsed motion-plane boundary ownership, not old visual-handoff naming."
  "search_dismiss_delayed_post_restore_path::\\b(requestPostDismissPersistentPollRestore|restorePersistentPollHostAtBoundary|restoredPersistentPollHostIntentIdRef)\\b|resultsDismissBottomHandoff[\\s\\S]{0,240}restoreDockedPolls::Search dismiss boundary must synchronously publish the poll page through SearchSurfaceRuntime, not a delayed post-dismiss restore path."
  "search_dismiss_polls_panel_release_readiness::\\b(usePersistentPollsSearchTransitionReadiness|PollsPanel:(arePersistentPollsHeaderReady|arePersistentPollsBodyReady|isPersistentPollHostReady))\\b::Mounted PollsPanel effects must not satisfy Search dismiss release readiness; release must come from route scene-stack mounted header/body/host evidence."
  "search_dismiss_sheet_host_release_readiness::\\bsheetHost:\\$\\{source\\}|markPollPagePartReady\\([\\s\\S]{0,120}sheetHost::Sheet-host generic renderability must not satisfy Search dismiss poll release readiness."
  "search_dismiss_attach_only_poll_body_readiness::if \\(hasMountedPollBody\\)[\\s\\S]{0,220}markPollPagePartReady\\([\\s\\S]{0,120}'body'::Mounted poll body attachment alone must not satisfy Search dismiss body readiness; release requires an active poll data/content lane."
  "search_dismiss_main_host_preboundary_poll_substrate::\\bisSearchDismissPollSubstratePrewarmed\\b|shouldKeepSearchSheetHostForPollRestore[\\s\\S]{0,220}\\bcanDisplayPersistentPollSubstrate\\b::The moving Search sheet host must not switch to polls before the collapsed boundary; poll substrate renders as a separate layer behind it."
  "search_dismiss_substrate_ready_logical_snap::canDisplayPersistentPollSubstrate[\\s\\S]{0,180}return 'collapsed'::Poll substrate readiness must not collapse the outgoing Search sheet host logical snap before boundary release."
  "search_surface_motion_plane_request_shared_values::\\b(dismissMotionRequest|openMotionRequest|requestDismissMotionStart|openRequestSeqRef|requestSearchDismissMotionPlaneImmediateStart)\\b::Search submit/dismiss motion must start from SearchSurfaceRuntime command target, not React/subscription request shared values."
  "search_surface_motion_plane_runonui_start::useSearchDismissMotionPlaneRuntime[\\s\\S]*\\brunOnUI\\b::Search submit/dismiss motion-plane command target must assign shared-value animations directly, not wait on a runOnUI handoff."
  "search_dismiss_press_up_full_snapshot_before_motion_arm::beginDismissTransaction\\(closeIntentId\\)|beginCloseTransition[\\s\\S]{0,260}getSearchSurfaceRuntime\\(\\)\\.beginDismissTransaction::Search dismiss press-up must arm the UI motion plane first; full SearchSurfaceRuntime publish/fanout belongs at the collapsed boundary."
  "search_surface_dismiss_full_publish_start_method::\\bbeginDismissTransaction\\b|\\bpublishArmedDismissTransaction\\b::Search dismiss start must use armDismissMotion plus commitDismissBoundary, not a during-motion full-publish path."
  "search_dismiss_motion_started_js_fanout::onMotionStarted|prewarmPersistentPollLane|markPollPagePrewarmedForDismiss::Search dismiss must not publish route/surface/poll prewarm work from a motion-start callback during the visible movie."
  "search_dismiss_press_up_presentation_commit::useResultsSurfaceExitTransactionExecutionRuntime[\\s\\S]*commitSearchSurfaceResultsTransaction\\(snapshot\\)::Search dismiss press-up must not run the heavy results presentation commit; SearchSurfaceRuntime freezes the outgoing bundle."
  "search_dismiss_press_up_immediate_ui_reset::handleCloseResultsUiReset\\(\\)|scheduleCloseSearchCleanup\\(closeIntentId\\)::Search dismiss press-up must not clear/reset the results UI before the motion-plane boundary."
  "search_dismiss_poll_restore_blank_results_chrome::shouldClearSearchBarForPollRestore[\\s\\S]{0,360}\\? 'results'::Dismiss poll restore must switch directly to default search chrome, not an empty results chrome frame."
  "search_dismiss_page_bundle_transform_writer::resultPageBundleDismissAnimatedStyle::Search dismiss must not add a second page-bundle transform writer; SearchDismissMotionPlaneRuntime owns sheetTranslateY."
  "search_dismiss_nav_header_progress_owner::navReturnProgressSource:\\s*shouldDriveBottomNavReturnFromSearchCloseProgress\\s*\\?\\s*'searchHeaderDefaultChromeProgress'::Search dismiss nav return must derive from the dismiss motion plane, not header chrome progress."
  "search_close_cleanup_raf_handoff::pendingCloseCleanupFrameRef::Close cleanup must not use a RAF handoff to decide restored/closed visual state."
  "perf_scenario_harness_run_id_alias::harnessRunId::Perf scenario reports and app events must use scenarioRunId only."
  "perf_legacy_harness_env::EXPO_PUBLIC_PERF_HARNESS::Old env-driven perf harness switches must not return."
  "perf_legacy_harness_runtime_names::PerfHarness(Coordinator|Config|Runtime)|usePerfHarnessRuntimeStore|perfHarnessConfig::Old perf harness runtime names must not return."
  "perf_legacy_harness_observer_imports::use(Shortcut|NavSwitch)HarnessObserver::Old self-driving perf observers must not return."
  "persistent_polls_restore_command_current_snap_compare::(dockedPollsRestoreIntent|pollsDockedSnapRequest)[\\s\\S]{0,160}!== currentSnap::Persistent polls restore commands must compare against physicalPollsSheetSnap, not synthetic currentSnap."
  "persistent_polls_initial_snap_live_bypass::currentSnap !== 'hidden' && !isDockedPollsSearchSurfaceActive::Initial visible snap bootstrap must not special-case docked polls; once the shared sheet has a live snap, policy defaults cannot issue another bootstrap command."
  "persistent_polls_restore_shortcut_without_motion::syncDockedPollsTarget[\\s\\S]{0,320}prepareShortcutSheetTransition\\(::Docked polls restore from hidden must issue an animated sheet command, not promote hidden-to-visible through the shortcut path."
  "bottom_sheet_special_hidden_dismiss_resolver::SWIPE_DISMISS_INTENT|shouldResolveSwipeDismiss::Bottom-sheet dismiss must use the unified header-gated snap resolver, not a hidden-specific threshold path."
  "bottom_sheet_legacy_step_snap_resolver_owner::resolveDestination[\\s\\S]{0,420}resolveSteppedSnapPoint::Gesture release must use the unified header-gated snap resolver, not the old step/skip resolver."
  "search_marker_collision_release_settles_js_presentation::event\\.type === 'presentation_visual_sources_collision_released'[\\s\\S]{0,900}onMarkerExitSettled\\?\\.\\(::Fade-zero collision/source release must not be treated as full JS presentation settled."
  "search_marker_old_native_visual_lifecycle_states::\\.(fadingOut|collisionReleased)\\b::Native search map visuals must use explicit dismissed/preparingReveal/revealing/visible/dismissing states, not the old ambiguous lifecycle states."
  "profile_active_route_camera_push_gate::isSearchRestaurantRouteActive && routeIntent\\.targetCamera == null::Active search restaurant route opens must update in place even when the profile transaction has a camera target."
  "profile_open_route_camera_owner_gate::type: 'open_profile_restaurant_route'[\\s\\S]{0,180}targetCamera: snapshot\\.targetCamera::Profile open camera motion must be owned by the prepared transaction pre-shell command, not route intent feedback."
  "profile_open_split_camera_padding_gate::targetCamera: snapshot\\.targetCamera,[\\s\\S]{0,120}profileCameraPadding::Profile open camera padding must travel with the target camera command, not as a duplicate side command."
  "profile_panel_solid_loading_background_gate::loadingBackground|backgroundColor: '#ffffff',[\\s\\S]{0,120}isLoading::Restaurant profile loading chrome must use the sheet frosted background, not a solid white fallback."
  "profile_camera_completion_dropped_gate::completionId: _completionId::Profile camera completion id must travel with the native camera command."
  "profile_camera_completion_unhandled_gate::void payload\\.animationCompletionId::Profile camera completion payload must be consumed by the camera arbiter, not ignored."
  "profile_camera_idle_completion_gate::resolvePendingProgrammaticCameraAnimation\\('finished'\\)::Profile camera transactions must settle from camera animation completion, not generic map-idle completion."
  "profile_camera_native_fire_and_forget_gate::void nativeModule\\.executeCameraCommand::Native profile camera command submission must wire async rejection into the transaction camera leg."
  "profile_camera_command_result_ignored_gate::commitProfileCameraTargetCommand\\(commandSet\\.targetCamera, executionContext\\);::Profile camera target command acceptance must be acknowledged; rejected commands must settle the camera leg explicitly."
  "profile_route_camera_padding_split_gate::zoom: targetCamera\\.zoom,\\s*animationMode::Route camera focus intents must carry padding with center and zoom."
  "profile_active_route_immediate_settle_gate::update_active_search_restaurant_route|applySearchRestaurantRouteCommand[\\s\\S]{0,260}emitProfileRouteCompletionEvent\\(routeIntentAction\\.completionEvent\\)::Active restaurant route updates must settle through the route motion runtime, not immediate route-param completion."
  "profile_open_pressed_coordinate_same_panel_gate::currentPanelRestaurantId === restaurantId::Map-origin restaurant opens must trust the rendered tapped coordinate on first open, not only when the same profile is already active."
  "profile_results_sheet_snap_restore_gate::\\b(savedSheetSnap|restoreSheetSnap|restoreResultsSheetSnap|getLastVisibleSheetSnap|lastVisibleSheetSnap|captureCurrentResultsSheetSnap)\\b::Profile/results content swaps must preserve the live shared sheet position, not restore a saved results snap."
  "search_map_render_source_frame_peek_highlight_gate::directSourceFrameSnapshotForHighlight|directSourceFrameSnapshotForLabels::SearchMap must subscribe to source-frame stores instead of peeking during render."
  "profile_close_clear_after_closing_guard::executeProfileCloseAction[\\s\\S]{0,220}if \\(transitionStatus === 'closing'\\)[\\s\\S]{0,120}ports\\.setMapHighlightedRestaurantId\\(null\\)::Profile close press-up must clear map highlight before any closing/idempotency guard."
  "profile_close_closing_guard_bare_return::if \\(transitionStatus === 'closing'\\) \\{[[:space:]]*return;::Profile close while already closing must re-enter prepared close so clear dismiss can upgrade the pending finalization."
  "profile_optimistic_highlight_timeout::setTimeout\\([\\s\\S]{0,180}setOptimisticSelectedRestaurantId::Map optimistic highlight must be transaction/authority-scoped, not timeout-cleared."
  "profile_restaurant_panel_animate_on_mount::overlayKey:\\s*'restaurant'[\\s\\S]{0,520}animateOnMount:\\s*true::Search restaurant content swaps must preserve sheet position; RestaurantPanel must not animate on mount."
  "profile_route_param_highlight_fallback::shellMapHighlightedRestaurantId\\s*\\?\\?\\s*mapHighlightedRestaurantId::Map highlight must be owned by the profile shell transaction, not route-param fallback."
  "profile_restaurant_motion_target_middle_current_snap::resolveCurrentSnapTarget:\\s*\\(\\)\\s*=>\\s*'middle'::Restaurant route motion target must resolve the live shared sheet snap, not assume middle."
  "profile_results_initial_snap_middle_coercion::searchSceneSheetPlaneRuntime\\.sheetState === 'expanded' \\? 'expanded' : 'middle'::Search results shell must preserve collapsed and expanded live snaps across profile/results content swaps."
  "profile_sheet_host_registration_initial_snap_seed::const initialSnap = activeRenderableShellSpec\\?\\.initialSnapPoint \\?\\? 'middle';::Sheet host runtime registration must seed from the live shared sheet snap, not the incoming content initial snap."
  "profile_results_collapsed_reseed_gate::shouldReseedSearchResultsFromCollapsed|searchResultsCollapsedReseedDispatchKey::Profile/results content swaps must preserve the live sheet snap, not revive a collapsed-results reseed lane."
)

declare -a PATH_CHECKS=(
  "polls_panel_sheet_control_runtime_path::(^|/)overlays/panels/runtime/polls-panel-sheet-control-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted polls panel sheet-control runtime file must not return."
  "app_route_scene_chrome_snaps_runtime_path::(^|/)navigation/runtime/use-app-route-scene-chrome-snaps-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted chrome-snaps runtime hook file must not return."
  "app_route_scene_sheet_session_authority_path::(^|/)navigation/runtime/app-route-scene-sheet-session-authority\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted scene sheet-session authority file must not return."
  "app_route_scene_sheet_snap_authority_path::(^|/)navigation/runtime/app-route-scene-sheet-snap-authority\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted scene sheet-snap authority file must not return."
  "overlay_sheet_position_store_path::(^|/)overlays/useOverlaySheetPositionStore\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted overlay sheet position store file must not return."
  "overlay_sheet_snap_state_runtime_path::(^|/)overlays/useOverlaySheetSnapStateRuntime\\.(ts|tsx|js|jsx|d\\.ts)$::Snap persistence is SheetScenePolicy-owned; the old spec-owned snap state runtime must not return."
  "search_runtime_bus_hook_path::(^|/)screens/Search/hooks/use-search-runtime-bus-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted Search runtime bus hook file must not return."
  "search_local_route_overlay_snapshot_contract_paths::(^|/)screens/Search/runtime/shared/route-overlay-(navigation|display|sheet-policy|visibility)-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Route overlay snapshot contracts are app-route runtime files, not Search-local shared files."
  "search_local_route_scene_snapshot_contract_paths::(^|/)screens/Search/runtime/shared/route-scene-(switch|transition|frame)-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Route scene snapshot contracts are app-route runtime files, not Search-local shared files."
  "search_local_restaurant_route_session_controller_path::(^|/)screens/Search/runtime/controller/route-local-restaurant-overlay-session-state-controller\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route session controller is app-route runtime-owned, not Search-local controller-owned."
  "search_local_restaurant_route_session_contract_path::(^|/)screens/Search/runtime/shared/route-local-restaurant-overlay-session-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route session snapshot contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_global_restaurant_route_contract_path::(^|/)screens/Search/runtime/shared/route-global-restaurant-overlay-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Global restaurant route snapshot contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_restaurant_route_policy_controller_path::(^|/)screens/Search/runtime/controller/route-local-restaurant-overlay-policy-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route policy controller is app-route runtime-owned, not Search-local controller-owned."
  "search_local_restaurant_route_interaction_controller_path::(^|/)screens/Search/runtime/controller/route-local-restaurant-overlay-interaction-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route interaction controller is app-route runtime-owned, not Search-local controller-owned."
  "search_local_restaurant_route_policy_contract_path::(^|/)screens/Search/runtime/shared/route-local-restaurant-overlay-policy-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route policy snapshot contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_restaurant_route_interaction_contract_path::(^|/)screens/Search/runtime/shared/route-local-restaurant-overlay-interaction-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route interaction snapshot contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_restaurant_route_input_contract_path::(^|/)screens/Search/runtime/shared/app-overlay-restaurant-input-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Restaurant route input contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_restaurant_route_panel_content_controller_path::(^|/)screens/Search/runtime/controller/route-local-restaurant-overlay-panel-content-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route panel-content controller is app-route runtime-owned, not Search-local controller-owned."
  "search_local_restaurant_route_panel_content_contract_path::(^|/)screens/Search/runtime/shared/route-local-restaurant-overlay-panel-content-snapshot-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route panel-content snapshot contract is app-route runtime-owned, not Search-local shared-owned."
  "search_local_restaurant_route_progress_publication_runtime_path::(^|/)screens/Search/runtime/shared/use-search-root-route-restaurant-overlay-progress-publication-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Restaurant route progress-only publication runtime was replaced by the panel-content publication lane."
  "search_local_restaurant_route_runtime_path::(^|/)screens/Search/runtime/controller/route-restaurant-overlay-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Restaurant route runtime composition is app-route runtime-owned, not Search-local controller-owned."
  "search_local_restaurant_route_local_runtime_path::(^|/)screens/Search/runtime/controller/route-local-restaurant-overlay-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Local restaurant route runtime composition is app-route runtime-owned, not Search-local controller-owned."
  "search_local_profile_transition_contract_path::(^|/)screens/Search/runtime/profile/profile-transition-state-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Profile transition state contract is app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_transaction_contract_path::(^|/)screens/Search/runtime/profile/profile-prepared-presentation-transaction-contract\\.(ts|tsx|js|jsx|d\\.ts)$::Profile prepared-presentation transaction contract is app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_transaction_resolver_path::(^|/)screens/Search/runtime/profile/profile-prepared-presentation-transaction-resolver\\.(ts|tsx|js|jsx|d\\.ts)$::Profile prepared-presentation transaction resolver is app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_focus_builder_path::(^|/)screens/Search/runtime/profile/profile-prepared-focus-presentation-builder\\.(ts|tsx|js|jsx|d\\.ts)$::Profile focused-camera prepared-presentation builder is app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_transition_mutations_path::(^|/)screens/Search/runtime/profile/profile-transition-state-mutations\\.(ts|tsx|js|jsx|d\\.ts)$::Profile transition state mutations are app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_transition_runtime_path::(^|/)screens/Search/runtime/profile/profile-prepared-presentation-transition-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Profile prepared-presentation transition updates are app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_dismiss_runtime_path::(^|/)screens/Search/runtime/profile/profile-prepared-presentation-dismiss-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Profile prepared-presentation dismiss updates are app-route runtime-owned, not Search-local profile-owned."
  "search_local_profile_prepared_settle_runtime_path::(^|/)screens/Search/runtime/profile/profile-prepared-presentation-settle-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Profile prepared-presentation settle updates are app-route runtime-owned, not Search-local profile-owned."
  "search_submit_dismiss_visual_authority_path::(^|/)screens/Search/runtime/shared/search-submit-dismiss-transition-visual-authority\\.(ts|tsx|js|jsx|d\\.ts)$::Submit/dismiss visual authority is route-scene transaction-owned; the side authority file must not return."
  "search_submit_dismiss_legacy_visual_contract_path::(^|/)navigation/runtime/app-route-search-submit-dismiss-transaction\\.(ts|tsx|js|jsx|d\\.ts)$::Search transition visual state contract is canonical; the submit/dismiss transaction contract path must not return."
  "search_surface_legacy_prepared_presentation_transaction_path::(^|/)screens/Search/runtime/shared/prepared-presentation-transaction\\.(ts|tsx|js|jsx|d\\.ts)$::Search results transactions must live in search-surface-results-transaction."
  "search_surface_visual_redraw_store_path::(^|/)screens/Search/runtime/shared/search-surface-visual-redraw-store\\.(ts|tsx|js|jsx|d\\.ts)$::Results reveal readiness must live on the SearchSurfaceRuntime redraw transaction."
  "search_close_visual_handoff_hook_path::(^|/)screens/Search/runtime/shared/use-search-close-visual-handoff-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Search close boundary handoff must live in the dismiss motion-plane runtime."
  "search_root_overlay_close_handoff_hook_path::(^|/)screens/Search/runtime/shared/use-search-root-overlay-close-handoff-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Search close boundary handoff must live in the dismiss motion-plane runtime."
  "perf_harness_coordinator_path::(^|/)perf/PerfHarnessCoordinator\\.(ts|tsx|js|jsx|d\\.ts)$::Perf scenarios are coordinator-owned; old perf harness coordinator file must not return."
  "perf_harness_deep_link_path::(^|/)perf/perf-harness-deep-link\\.(ts|tsx|js|jsx|d\\.ts)$::Perf scenarios own deep links; old perf harness deep-link file must not return."
  "perf_harness_config_path::(^|/)perf/harness-config\\.(ts|tsx|js|jsx|d\\.ts)$::Perf scenario config comes from scenario deep links, not env harness config."
  "perf_harness_runtime_store_path::(^|/)perf/perf-harness-runtime-store\\.(ts|tsx|js|jsx|d\\.ts)$::Perf scenario runtime store replaced old perf harness runtime store."
  "perf_harness_runtime_types_path::(^|/)perf/perf-harness-runtime-types\\.(ts|tsx|js|jsx|d\\.ts)$::Perf scenario types replaced old perf harness runtime types."
  "shortcut_harness_observer_path::(^|/)screens/Search/runtime/telemetry/shortcut-harness-observer\\.(ts|tsx|js|jsx|d\\.ts)$::Shortcut self-driving perf observer must not return."
  "nav_switch_harness_observer_path::(^|/)screens/Search/runtime/telemetry/nav-switch-harness-observer\\.(ts|tsx|js|jsx|d\\.ts)$::Nav-switch self-driving perf observer must not return."
  "app_route_bottom_nav_host_path::(^|/)overlays/AppRouteBottomNavHost\\.(ts|tsx|js|jsx|d\\.ts)$::Bottom nav must be owned by the single NavSilhouetteHost."
  "app_route_nav_material_host_path::(^|/)overlays/NavSilhouetteMaterialHost\\.(ts|tsx|js|jsx|d\\.ts)$::Bottom-nav material must be owned by the single NavSilhouetteHost, not a separate overlay host."
  "app_route_nav_bar_silhouette_background_path::(^|/)screens/Search/components/NavBarSilhouetteBackground\\.(ts|tsx|js|jsx|d\\.ts)$::Bottom-nav must not revive the old frosted rectangular background component."
  "search_results_header_authority_path::(^|/)overlays/SearchResultsHeaderChromeAuthority\\.(ts|tsx|js|jsx|d\\.ts)$::Results title header must be owned by the ResultsPageBundle, not a fixed-lane authority file."
  "search_mounted_scene_chrome_authority_path::(^|/)overlays/SearchMountedSceneChromeAuthority\\.(ts|tsx|js|jsx|d\\.ts)$::Search results must use the SearchResultsPageBundle authority, not mounted chrome surface authority."
  "sheet_handoff_lab_path::(^|/)(perf/SheetGestureHandoffLab\\.tsx|scripts/perf-scenario-sheet-handoff-contracts\\.js|maestro/perf/flows/sheet-handoff-lab\\.yaml)$::Sheet handoff lab was promoted into the real sheet runtime and must not remain mounted as a separate lab surface."
)

declare -a ROOT_CONTENT_CHECKS=(
  "perf_root_harness_run_id_alias::harnessRunId::Perf scenario scripts/contracts must use scenarioRunId only."
  "perf_root_legacy_harness_env::EXPO_PUBLIC_PERF_HARNESS::Scenario scripts must not carry old env harness switches."
  "perf_root_legacy_harness_paths::perf-harness-runtime|harness-config|shortcut-harness-observer|nav-switch-harness-observer::Old perf harness file names must not return in scripts or contracts."
  "perf_root_legacy_self_driving_copy::self-driving shell harness::Scenario docs should not preserve the old self-driving harness framing."
  "perf_root_old_no_sheet_behind_nav_cutout_literal::\"noSheetBehindNavCutout\":true::Scenario scripts/contracts must not bless the old no-sheet-behind-nav-cutout workaround."
  "perf_root_declarative_nav_map_only_telemetry::frostedNavMaterialSamples|sheetBehindNavSilhouetteOverlap::Scenario telemetry must not declare nav map-only sampling without pixel proof."
  "perf_root_sheet_handoff_lab::SheetGestureHandoffLab|sheet_handoff_lab|sheet-handoff-lab|sheet-handoff-contracts|perf:scenario:sheet-handoff-contracts::Sheet handoff lab must not return; the handoff behavior is production sheet runtime behavior."
)

failures=0

SEARCH_SUBMIT_DISMISS_AUTHORITY_LIFECYCLE_PATTERN='(beginResultsEnter|beginResultsExit|markResultsHeaderReady|markPollsHeaderReady|mark[A-Za-z0-9_]*Settled)'
SEARCH_SUBMIT_DISMISS_AUTHORITY_FILE_PATTERN='(^|/)screens/Search/runtime/shared/search-submit-dismiss-transition-visual-authority\.(ts|tsx|js|jsx|d\.ts)$'

for check in "${CONTENT_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  description="${rest#*::}"

  set +e
  matches="$(rg -n --pcre2 "$pattern" "$TARGET_PATH" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 2 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: invalid pattern" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: rg exited with status $status" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  fi
done

set +e
map_interaction_camera_command_matches="$(
  rg -n --pcre2 \
    "\\bcommitCameraViewport\\b" \
    "$TARGET_PATH/screens/Search/runtime/map/map-interaction-controller.ts" 2>&1
)"
map_interaction_camera_command_status=$?
set -e
if [[ "$map_interaction_camera_command_status" -eq 2 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL map_interaction_camera_command_path: invalid pattern" >&2
  echo "$map_interaction_camera_command_matches" >&2
  failures=$((failures + 1))
elif [[ "$map_interaction_camera_command_status" -eq 0 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL map_interaction_camera_command_path: Map idle must mirror observed camera state, not command native camera movement." >&2
  echo "$map_interaction_camera_command_matches" >&2
  failures=$((failures + 1))
elif [[ "$map_interaction_camera_command_status" -eq 1 ]]; then
  echo "[app-route-runtime-delete-gate] PASS map_interaction_camera_command_path"
else
  echo "[app-route-runtime-delete-gate] FAIL map_interaction_camera_command_path: rg exited with status $map_interaction_camera_command_status" >&2
  echo "$map_interaction_camera_command_matches" >&2
  failures=$((failures + 1))
fi

camera_intent_arbiter_file="$TARGET_PATH/screens/Search/runtime/map/camera-intent-arbiter.ts"
map_interaction_controller_file="$TARGET_PATH/screens/Search/runtime/map/map-interaction-controller.ts"
sheet_host_authority_file="$TARGET_PATH/navigation/runtime/app-route-sheet-host-authority-controller.ts"
if [[ -e "$camera_intent_arbiter_file" ]] && {
  ! rg -q --fixed-strings "syncObservedCameraViewport" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "if (this.pendingProgrammaticCameraCompletionId != null)" "$camera_intent_arbiter_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL map_idle_camera_mirror_pending_completion_gate: Observed map-idle camera mirroring must not fight active programmatic camera commands." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS map_idle_camera_mirror_pending_completion_gate"
fi

if [[ -e "$map_interaction_controller_file" ]] && {
  ! rg -q --fixed-strings "if (isProfilePresentationActive)" "$map_interaction_controller_file" ||
  ! rg -q --fixed-strings "cameraIntentArbiter.syncObservedCameraViewport" "$map_interaction_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL map_idle_profile_camera_mirror_gate: Map idle must not mirror React camera state while profile presentation owns camera padding and motion." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS map_idle_profile_camera_mirror_gate"
fi

if [[ -e "$sheet_host_authority_file" ]] && {
  ! rg -q --fixed-strings "const searchRouteRuntimeModel =" "$sheet_host_authority_file" ||
  ! rg -q --fixed-strings "rootOverlayKey === 'search'" "$sheet_host_authority_file" ||
  ! rg -q --fixed-strings "searchRouteRuntimeModel ??" "$sheet_host_authority_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_search_origin_shared_sheet_runtime_gate: Search-root surfaces must resolve through the shared search route runtime model before page-local runtime models; otherwise child/profile content can split from the visible sheet command owner." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_search_origin_shared_sheet_runtime_gate"
fi

results_close_actions_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-actions-runtime.ts"
profile_bridge_publication_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-root-profile-bridge-publication-runtime.ts"
foreground_clear_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-foreground-clear-runtime.ts"
if [[ -e "$results_close_actions_file" ]] && [[ -e "$profile_bridge_publication_file" ]] && {
  rg -q --fixed-strings "dismissBehavior: 'clear'" "$results_close_actions_file" ||
  rg -q --fixed-strings "dismissBehavior: 'restore'" "$results_close_actions_file" ||
  rg -q --fixed-strings "closeRestaurantProfileRef.current" "$results_close_actions_file" ||
  ! rg -q --fixed-strings "prepareRestaurantProfileForTerminalSearchDismissRef.current();" "$results_close_actions_file" ||
  ! rg -q --fixed-strings "prepareRestaurantProfileForTerminalSearchDismissRef.current =" "$profile_bridge_publication_file" ||
  ! rg -q --fixed-strings "prepareRestaurantProfileForTerminalSearchDismiss" "$profile_bridge_publication_file" ||
  rg -q --fixed-strings "closeRestaurantProfile({" "$profile_bridge_publication_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_terminal_dismiss_results_owned_gate: Search-bar terminal dismiss from an active profile must use the dedicated restore-only profile bridge and leave clear/sheet collapse to the results exit transaction." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_terminal_dismiss_results_owned_gate"
fi

if [[ -e "$foreground_clear_file" ]] && ! rg -q -U --pcre2 "const hasSearchToClose =[\\s\\S]{0,180}profilePresentationActive" "$foreground_clear_file"; then
  echo "[app-route-runtime-delete-gate] FAIL profile_foreground_clear_uses_results_exit_gate: Foreground clear must route active profile dismiss through the results exit transaction even after search state is partially cleared." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_foreground_clear_uses_results_exit_gate"
fi

ROOT_SCAN_PATHS=(
  "$REPO_ROOT/apps/mobile/src"
  "$REPO_ROOT/scripts"
  "$REPO_ROOT/maestro/perf"
  "$REPO_ROOT/package.json"
)

for check in "${ROOT_CONTENT_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  description="${rest#*::}"

  set +e
  matches="$(
    rg -n --pcre2 \
      --glob '!**/app-route-runtime-delete-gate.sh' \
      "$pattern" \
      "${ROOT_SCAN_PATHS[@]}" 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -eq 2 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: invalid pattern" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: rg exited with status $status" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  fi
done

search_map_component_file="$TARGET_PATH/screens/Search/components/search-map.tsx"
search_map_native_camera_executor_file="$TARGET_PATH/screens/Search/runtime/map/search-map-native-camera-executor.ts"
if [[ -e "$search_map_native_camera_executor_file" ]] && {
  ! rg -q --fixed-strings "animationCompletionId?: string" "$search_map_native_camera_executor_file" ||
  ! rg -q --fixed-strings "stop.animationCompletionId = command.completionId" "$search_map_native_camera_executor_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_completion_native_payload_gate: Native profile camera commands must carry the camera animation completion id." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_completion_native_payload_gate"
fi

search_map_presentation_file="$TARGET_PATH/screens/Search/runtime/controller/search-root-map-presentation-controller-runtime.ts"
if [[ -e "$search_map_component_file" ]] && [[ -e "$search_map_presentation_file" ]] && {
  ! rg -q --fixed-strings "onCameraAnimationComplete={handleCameraAnimationComplete}" "$search_map_component_file" ||
  ! rg -q --fixed-strings "cameraIntentArbiter.handleProgrammaticCameraAnimationCompletion" "$search_map_presentation_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_completion_event_gate: Mapbox camera animation completion must feed the camera arbiter." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_completion_event_gate"
fi

camera_intent_arbiter_file="$TARGET_PATH/screens/Search/runtime/map/camera-intent-arbiter.ts"
route_scene_camera_motion_target_file="$TARGET_PATH/navigation/runtime/use-app-route-scene-camera-motion-target-runtime.ts"
if [[ -e "$camera_intent_arbiter_file" ]] && {
  ! rg -q --fixed-strings "onCommandRejected" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "deferControlledCameraStateUntilCompletion" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "pendingControlledCameraStateSync" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "flushControlledCameraStateSync" "$camera_intent_arbiter_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_native_acceptance_mirrors_state_gate: Native-accepted profile camera commands must support async rejection and deferred controlled camera state sync." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_native_acceptance_mirrors_state_gate"
fi

if [[ -e "$route_scene_camera_motion_target_file" ]] && {
  ! rg -q --fixed-strings "deferControlledCameraStateUntilCompletion: true" "$route_scene_camera_motion_target_file" ||
  ! rg -q --fixed-strings "pendingCameraStateRef.current.set" "$route_scene_camera_motion_target_file" ||
  ! rg -q --fixed-strings "payload.status === 'finished' && pendingCameraState" "$route_scene_camera_motion_target_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_route_camera_restore_deferred_state_gate: Route profile close/restore camera must defer React camera state until native animation completion." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_route_camera_restore_deferred_state_gate"
fi

native_camera_executor_file="$TARGET_PATH/screens/Search/runtime/map/search-map-native-camera-executor.ts"
if [[ -e "$native_camera_executor_file" ]] && {
  ! rg -q --fixed-strings "onCommandRejected?: (completionId: string | null) => void" "$native_camera_executor_file" ||
  ! rg -q --fixed-strings ".catch(() =>" "$native_camera_executor_file" ||
  ! rg -q --fixed-strings "command.onCommandRejected?.(command.completionId ?? null)" "$native_camera_executor_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_native_async_rejection_gate: Native camera command Promise rejection must explicitly settle/cancel the active camera leg." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_native_async_rejection_gate"
fi

profile_route_normalizer_file="$TARGET_PATH/navigation/runtime/app-route-profile-route-intent-normalizer.ts"
route_scene_switch_controller_file="$TARGET_PATH/navigation/runtime/app-route-scene-switch-controller.ts"
if [[ -e "$profile_route_normalizer_file" ]] && [[ -e "$route_scene_switch_controller_file" ]] && {
  ! rg -q --fixed-strings "routeAction: 'updateActive'" "$profile_route_normalizer_file" ||
  ! rg -q --fixed-strings "case 'updateActive'" "$route_scene_switch_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_active_route_update_settle_gate: Active restaurant route changes must update in place through a route switch motion transaction." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_active_route_update_settle_gate"
fi

route_scene_transition_policy_file="$TARGET_PATH/navigation/runtime/app-route-scene-transition-policy-runtime.ts"
if [[ -e "$profile_route_normalizer_file" ]] && [[ -e "$route_scene_transition_policy_file" ]] && {
  ! rg -q --fixed-strings "sheetTransitionKind: 'openChild'" "$profile_route_normalizer_file" ||
  ! rg -q --fixed-strings "sheetTransitionKind:" "$profile_route_normalizer_file" ||
  ! rg -q --fixed-strings "routeIntent.shellTarget === 'default' ? 'terminalDismiss' : 'closeChild'" "$profile_route_normalizer_file" ||
  ! rg -q --fixed-strings "resolvedSheetIntent?.sceneKey ?? resolveAppRouteSceneSheetHostSceneKey" "$route_scene_transition_policy_file" ||
  ! rg -q --fixed-strings "resolveAppRouteSceneSheetHostSceneKey(targetSceneKey) ?? targetSceneKey" "$route_scene_transition_policy_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_search_restaurant_shared_sheet_motion_gate: Search-origin restaurant route sheet motion must target the shared route sheet, not the stale local restaurant sheet target." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_search_restaurant_shared_sheet_motion_gate"
fi

search_map_component_file="$TARGET_PATH/screens/Search/components/search-map.tsx"
search_map_engine_component_file="$TARGET_PATH/screens/Search/components/SearchMapWithMarkerEngine.tsx"
if [[ -e "$search_map_component_file" ]] && {
  ! rg -q --fixed-strings "useSearchMapSourceFrameSelector" "$search_map_component_file" ||
  ! rg -q --fixed-strings "DIRECT_SOURCE_FRAME_STORE_KEYS" "$search_map_component_file" ||
  ! rg -q --fixed-strings "authoritativeSelectedRestaurantId" "$search_map_component_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_source_frame_reactive_selector_gate: SearchMap must subscribe to active source-frame stores and selected id for highlight and label readiness." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_source_frame_reactive_selector_gate"
fi

if [[ -e "$search_map_engine_component_file" ]] && ! rg -q --fixed-strings "selectedRestaurantId: highlightedRestaurantId" "$search_map_engine_component_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_scene_selected_id_gate: SearchMap scene selection must come from the active highlighted restaurant id, not hardcoded null." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_scene_selected_id_gate"
fi

if [[ -e "$search_map_component_file" ]] && {
  rg -q --fixed-strings "directSourceFrameStores.selectedRestaurantId ?? selectedRestaurantId" "$search_map_component_file" ||
  ! rg -q --fixed-strings "const authoritativeSelectedRestaurantId = selectedRestaurantId;" "$search_map_component_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_selection_shell_authority_gate: Source-frame selected ids must not keep map highlight alive after profile close clears shell selection." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_selection_shell_authority_gate"
fi

profile_open_plan_file="$TARGET_PATH/screens/Search/runtime/profile/profile-open-presentation-plan-runtime.ts"
if [[ -e "$profile_open_plan_file" ]] && ! rg -q --fixed-strings "source === 'results_sheet' && Boolean(pressedCoordinate)" "$profile_open_plan_file"; then
  echo "[app-route-runtime-delete-gate] FAIL profile_open_pressed_coordinate_authority_gate: Map pin/label opens must prefer the rendered tapped coordinate whenever one is present." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_open_pressed_coordinate_authority_gate"
fi

search_map_render_controller_file="$TARGET_PATH/screens/Search/runtime/map/search-map-render-controller.ts"
search_map_render_controller_native_file="$REPO_ROOT/apps/mobile/ios/cravesearch/SearchMapRenderController.swift"
search_map_render_controller_android_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java"
search_map_render_controller_ios_bridge_file="$REPO_ROOT/apps/mobile/ios/cravesearch/UIFrameSamplerBridge.m"
if [[ -e "$search_map_render_controller_native_file" ]] && {
  ! rg -q --fixed-strings "didClearSettledVisibleLabelInteractions" "$search_map_render_controller_native_file" ||
  ! rg -q --fixed-strings "didClearLabelInteractionVisibility" "$search_map_render_controller_native_file" ||
  ! rg -q --fixed-strings "labelFamilyState.labelObservation.observationEnabled" "$search_map_render_controller_native_file" ||
  ! rg -q --fixed-strings "label_interaction_visibility_clear_failed" "$search_map_render_controller_native_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_ios_label_interaction_terminal_clear_gate: iOS label interaction visibility must snap empty on close/dismiss and reject stale in-flight observation commits." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_ios_label_interaction_terminal_clear_gate"
fi

if [[ -e "$search_map_render_controller_android_file" ]] && {
  ! rg -q --fixed-strings "didClearSettledVisibleLabelInteractions" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "didClearLabelInteractionVisibility" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "labelFamilyState.labelObservation.observationEnabled" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "labelObservation.settledVisibleFeatureIds.clear()" "$search_map_render_controller_android_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_android_label_interaction_terminal_clear_gate: Android label interaction visibility must snap empty on close/dismiss and reject stale in-flight observation commits." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_label_interaction_terminal_clear_gate"
fi

if [[ -e "$search_map_component_file" ]] && {
  rg -q --fixed-strings "commitVisibleLabelInteractionVisibility: true" "$search_map_component_file" ||
  rg -q --fixed-strings "publishVisibleLabelFeatureIds: isPresentationLive && !isMapMoving" "$search_map_component_file" ||
  ! rg -q --fixed-strings "commitVisibleLabelInteractionVisibility: allowLiveLabelUpdates" "$search_map_component_file" ||
  ! rg -q --fixed-strings "publishVisibleLabelFeatureIds: isPresentationLive" "$search_map_component_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_label_interaction_live_policy_gate: Label interaction geometry should stay live with visible labels while presentation is live; do not pause it during map movement." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_label_interaction_live_policy_gate"
fi

if { [[ -e "$search_map_render_controller_native_file" ]] &&
    rg -q --pcre2 'let shouldRenderPinInteraction =\s*renderState\.isDesiredPresent &&\s*renderState\.currentOpacity >= 0\.999' "$search_map_render_controller_native_file"; } ||
   { [[ -e "$search_map_render_controller_android_file" ]] &&
    rg -q --pcre2 'boolean shouldRenderPinInteraction =\s*desiredPresent &&\s*\(transition == null \|\| transition\.targetOpacity != 1d\)' "$search_map_render_controller_android_file"; }; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_pin_interaction_live_policy_gate: Pin interaction geometry must publish with desired pins, not wait for visual transition opacity to settle." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_pin_interaction_live_policy_gate"
fi

if [[ -e "$search_map_component_file" ]] && {
  ! rg -q --fixed-strings "const PIN_TAP_INTENT_RADIUS_PX = PIN_MARKER_RENDER_SIZE / 2;" "$search_map_component_file" ||
  ! rg -q --fixed-strings "circleStrokeWidth: 0" "$search_map_component_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_pin_interaction_exact_debug_geometry_gate: Pin debug interaction geometry must match the actual pin hit size without a larger visible stroke." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_pin_interaction_exact_debug_geometry_gate"
fi

if [[ -e "$search_map_render_controller_native_file" ]] && {
  rg -q --fixed-strings "distanceSq" "$search_map_render_controller_native_file" ||
  ! rg -q --fixed-strings "return left.lodZ > right.lodZ" "$search_map_render_controller_native_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_pin_interaction_topmost_hit_gate: Pin taps must resolve topmost visual hit geometry, not nearest overlapping source feature." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_pin_interaction_topmost_hit_gate"
fi

search_map_native_render_owner_file="$TARGET_PATH/screens/Search/components/hooks/use-search-map-native-render-owner.ts"
if [[ -e "$search_map_native_render_owner_file" ]] && {
  rg -q --fixed-strings "labelObservationEnabled && isPresentationLive && isPresentationSettled" "$search_map_native_render_owner_file" ||
  rg -q --fixed-strings "commitVisibleLabelInteractionVisibility && isPresentationLive && isPresentationSettled" "$search_map_native_render_owner_file" ||
  ! rg -q --fixed-strings "labelObservationEnabled && isPresentationLive && labelSourceCount > 0" "$search_map_native_render_owner_file" ||
  ! rg -q --fixed-strings "commitVisibleLabelInteractionVisibility && isPresentationLive" "$search_map_native_render_owner_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_label_interaction_live_before_settle_gate: Label interaction observation should start when presentation is live, not wait for results enter to settle." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_label_interaction_live_before_settle_gate"
fi

if [[ -e "$search_map_component_file" ]] && [[ -e "$search_map_render_controller_file" ]] && {
  ! rg -q --fixed-strings "commitSearchMapRestaurantPressTarget" "$search_map_component_file" ||
  ! rg -q --fixed-strings "getPointFromMapPressFeature" "$search_map_component_file" ||
  ! rg -q --fixed-strings "handleMapPress" "$search_map_component_file" ||
  ! rg -q --fixed-strings "onBlankMapPress" "$search_map_component_file" ||
  ! rg -q --fixed-strings "pinLayerIds: pinInteractionLayerIds" "$search_map_component_file" ||
  ! rg -q --fixed-strings "labelLayerIds: labelInteractionLayerIds" "$search_map_component_file" ||
  ! rg -q --fixed-strings "dotLayerIds: [dotLayerId]" "$search_map_component_file" ||
  rg -q --fixed-strings "pressKind: SearchMapPressResolutionKind" "$search_map_component_file" ||
  rg -q --fixed-strings "source_press" "$search_map_component_file" ||
  rg -q --fixed-strings "includeLabels" "$search_map_component_file" ||
  rg -q --fixed-strings "LABEL_VISUAL_LAYER_IDS" "$search_map_component_file" ||
  rg -q --fixed-strings "labelLayerIds: [...labelInteractionLayerIds, ...labelVisualLayerIds]" "$search_map_component_file" ||
  rg -q --fixed-strings "dotLayerId: DOT_LAYER_ID" "$search_map_component_file" ||
  ! rg -q --fixed-strings "dotLayerId: DOT_INTERACTION_LAYER_ID" "$search_map_component_file" ||
  rg -q --fixed-strings "getPressEventFeatureFallbackTarget" "$search_map_component_file" ||
  rg -q --fixed-strings "getLabelRestaurantPressTargetFromFeature" "$search_map_component_file" ||
  rg -q --fixed-strings "pressEventTargetsMarkerFeature" "$search_map_component_file" ||
  rg -q --fixed-strings "resolveLayerPressEventTarget" "$search_map_component_file" ||
  rg -q --fixed-strings "pressTarget ?? layerPressTarget" "$search_map_component_file" ||
  rg -q --fixed-strings "queryRenderedDotObservation" "$search_map_component_file" ||
  rg -q --fixed-strings "queryRenderedDotObservation" "$search_map_render_controller_file" ||
  [[ -e "$search_map_render_controller_ios_bridge_file" ]] &&
    rg -q --fixed-strings "queryRenderedDotObservation" "$search_map_render_controller_ios_bridge_file" ||
  [[ -e "$search_map_render_controller_android_file" ]] &&
    rg -q --fixed-strings "queryRenderedDotObservation" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "labelQueryBox?: [number, number, number, number] | null" "$search_map_render_controller_file" ||
  ! rg -q --fixed-strings "dotLayerIds?: string[]" "$search_map_render_controller_file" ||
  ! rg -q --fixed-strings "labelTapHitbox?:" "$search_map_render_controller_file" ||
  ! rg -q --fixed-strings "labelTapHitbox" "$search_map_component_file" ||
  ! rg -q --fixed-strings "pinInteractionSourceStore: snapshot.pinInteractionSourceStore" "$search_map_component_file" ||
  ! rg -q --fixed-strings "const activePinInteractionSourceStore" "$search_map_component_file" ||
	  rg -q --fixed-strings "resolveInteractionPressTargetFromEvent" "$search_map_component_file" ||
	  rg -q --fixed-strings "eventPressTarget" "$search_map_component_file" ||
	  rg -q --pcre2 'event\\.features[\\s\\S]{0,320}commitRestaurantPressTarget' "$search_map_component_file" ||
	  ! rg -q --fixed-strings "id={STYLE_PINS_SOURCE_ID}" "$search_map_component_file" ||
	  ! rg -q --fixed-strings "stylePinLayerStack.concat(pinInteractionLayerStack)" "$search_map_component_file" ||
	  ! rg -q --fixed-strings "sourceID={STYLE_PINS_SOURCE_ID}" "$search_map_component_file" ||
	  ! rg -q --fixed-strings "id={PIN_INTERACTION_SOURCE_ID}" "$search_map_component_file" ||
	  rg -q --fixed-strings "onPress={handleStylePinPress}" "$search_map_component_file" ||
	  rg -q --fixed-strings "onPress={handleLabelPress}" "$search_map_component_file" ||
	  rg -q --fixed-strings "onPress={handleDotPress}" "$search_map_component_file" ||
	  rg -q --fixed-strings "pinInteractionEventLayerStack" "$search_map_component_file" ||
	  ! rg -q --fixed-strings "requiredSourceId: state.pinSourceId" "$search_map_render_controller_native_file" ||
	  [[ -e "$search_map_render_controller_android_file" ]] &&
	    ! rg -q --fixed-strings "state.pinSourceId" "$search_map_render_controller_android_file" ||
	  ! rg -q --fixed-strings "targetKind: 'pin' | 'label' | 'dot'" "$search_map_render_controller_file" ||
  rg -q --fixed-strings "Set([state.labelInteractionSourceId, state.labelSourceId])" "$search_map_render_controller_native_file" ||
  rg -q --pcre2 'guard let hitbox else \{\s*return true\s*\}' "$search_map_render_controller_native_file" ||
  [[ -e "$search_map_render_controller_android_file" ]] &&
    rg -q --pcre2 'if \(hitbox == null\) \{\s*return true;' "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "let labelSourceIds = Set([state.labelInteractionSourceId])" "$search_map_render_controller_native_file" ||
  ! rg -q --fixed-strings "requiredSourceIds: Set<String>" "$search_map_render_controller_native_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_restaurant_press_target_gate: Map presses must resolve once through native rendered-layer pin, label, and dot targets without ShapeSource feature fallbacks." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_restaurant_press_target_gate"
fi

if [[ -e "$search_map_render_controller_android_file" ]] && {
  ! rg -q --fixed-strings "ArrayList<String> dotLayerIds" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "queryRenderedDotPressTarget(" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "buildRenderedDotPressTarget(" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "state.dotInteractionSourceId" "$search_map_render_controller_android_file" ||
  rg -q --fixed-strings "pinLayerIds.isEmpty() && labelLayerIds.isEmpty())" "$search_map_render_controller_android_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_android_press_target_parity_gate: Android press target resolution must support dot interaction layers and avoid the old pin/label-only resolver." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_press_target_parity_gate"
fi

profile_command_executor_file="$TARGET_PATH/screens/Search/runtime/profile/profile-prepared-presentation-command-executor.ts"
if [[ -e "$profile_command_executor_file" ]] && {
  ! rg -q --fixed-strings "didAcceptProfileCameraTargetCommand" "$profile_command_executor_file" ||
  ! rg -q --fixed-strings "type: 'camera_settled'" "$profile_command_executor_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_command_ack_gate: Rejected profile camera commands must explicitly settle/cancel the camera transaction leg." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_command_ack_gate"
fi

profile_close_finalization_file="$TARGET_PATH/screens/Search/runtime/profile/profile-close-finalization-runtime-state.ts"
profile_app_close_finalization_file="$TARGET_PATH/screens/Search/runtime/profile/profile-app-close-finalization-runtime.ts"
if [[ -e "$profile_close_finalization_file" ]] && [[ -e "$profile_app_close_finalization_file" ]] && {
  ! rg -q --fixed-strings "clearMapHighlightedRestaurantId();" "$profile_close_finalization_file" ||
  ! rg -q --fixed-strings "clearMapHighlightedRestaurantId();" "$profile_app_close_finalization_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_close_clears_map_highlight_gate: Profile close finalization must clear selected map highlight in both shell and route state." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_close_clears_map_highlight_gate"
fi

results_close_actions_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-actions-runtime.ts"
results_close_finalize_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-transition-finalize-runtime.ts"
profile_bridge_publication_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-root-profile-bridge-publication-runtime.ts"
if [[ -e "$results_close_actions_file" ]] && [[ -e "$results_close_finalize_file" ]] && [[ -e "$profile_bridge_publication_file" ]] && {
  rg -q --fixed-strings "dismissBehavior: 'clear'" "$results_close_actions_file" ||
  rg -q --fixed-strings "dismissBehavior: 'restore'" "$results_close_actions_file" ||
  ! rg -q --fixed-strings "prepareRestaurantProfileForTerminalSearchDismissRef.current();" "$results_close_actions_file" ||
  ! rg -q --fixed-strings "prepareRestaurantProfileForTerminalSearchDismiss" "$profile_bridge_publication_file" ||
  rg -q --fixed-strings "closeRestaurantProfile({" "$profile_bridge_publication_file" ||
  ! rg -q --fixed-strings "skipProfileDismissClear: terminalDismissSource !== 'profile'" "$results_close_finalize_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_terminal_dismiss_single_owner_gate: Terminal dismiss from profile must use a dedicated restore-only profile bridge and leave search clear/sheet collapse to the results exit transaction." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_terminal_dismiss_single_owner_gate"
fi

route_camera_contract_file="$TARGET_PATH/navigation/runtime/app-overlay-route-transition-contract.ts"
route_camera_normalizer_file="$TARGET_PATH/navigation/runtime/app-route-profile-route-intent-normalizer.ts"
route_camera_motion_target_file="$TARGET_PATH/navigation/runtime/use-app-route-scene-camera-motion-target-runtime.ts"
if [[ -e "$route_camera_contract_file" ]] && [[ -e "$route_camera_normalizer_file" ]] && [[ -e "$route_camera_motion_target_file" ]] && {
  ! rg -q --fixed-strings "padding?: CameraSnapshot['padding']" "$route_camera_contract_file" ||
  ! rg -q --fixed-strings "padding: targetCamera.padding" "$route_camera_normalizer_file" ||
  ! rg -q --fixed-strings "padding: cameraIntent.padding" "$route_camera_motion_target_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_route_camera_padding_gate: Route camera intents must carry padding atomically with center and zoom." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_route_camera_padding_gate"
fi

restaurant_route_scene_input_host_file="$TARGET_PATH/overlays/RestaurantRouteSceneInputHost.tsx"
local_restaurant_layer_host_file="$TARGET_PATH/overlays/LocalRestaurantSheetLayerHost.tsx"
global_restaurant_layer_host_file="$TARGET_PATH/overlays/GlobalRestaurantSheetLayerHost.tsx"
restaurant_route_sheet_surface_file="$TARGET_PATH/overlays/RestaurantRouteSheetSurface.tsx"
restaurant_overlay_sheet_config_file="$TARGET_PATH/overlays/useRestaurantOverlaySheetConfigRuntime.ts"
restaurant_route_sheet_render_runtime_file="$TARGET_PATH/overlays/useRestaurantRouteSheetRenderRuntime.tsx"
restaurant_route_snap_controller_contract_file="$TARGET_PATH/overlays/restaurantRouteHostContract.ts"
set +e
restaurant_scene_input_publish_files="$(rg -l --fixed-strings "sceneKey: 'restaurant'" "$TARGET_PATH" 2>/dev/null)"
restaurant_scene_input_publish_status=$?
restaurant_scene_input_clear_files="$(rg -l --fixed-strings "clearRouteSceneInput('restaurant')" "$TARGET_PATH" 2>/dev/null)"
restaurant_scene_input_clear_status=$?
set -e
if [[ "$restaurant_scene_input_publish_status" -ne 0 && "$restaurant_scene_input_publish_status" -ne 1 ]] ||
   [[ "$restaurant_scene_input_clear_status" -ne 0 && "$restaurant_scene_input_clear_status" -ne 1 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_single_scene_input_writer_gate: Unable to inspect restaurant scene input writers." >&2
  failures=$((failures + 1))
else
  restaurant_scene_input_publish_count="$(
    printf '%s\n' "$restaurant_scene_input_publish_files" | sed '/^$/d' | wc -l | tr -d ' '
  )"
  restaurant_scene_input_clear_count="$(
    printf '%s\n' "$restaurant_scene_input_clear_files" | sed '/^$/d' | wc -l | tr -d ' '
  )"
  if [[ "$restaurant_scene_input_publish_count" != "1" ]] ||
     [[ "$restaurant_scene_input_publish_files" != "$restaurant_route_scene_input_host_file" ]] ||
     [[ "$restaurant_scene_input_clear_count" != "1" ]] ||
     [[ "$restaurant_scene_input_clear_files" != "$restaurant_route_scene_input_host_file" ]]; then
    echo "[app-route-runtime-delete-gate] FAIL restaurant_single_scene_input_writer_gate: Restaurant route scene input must have exactly one writer file." >&2
    printf '[app-route-runtime-delete-gate] restaurant publish files:\n%s\n' "$restaurant_scene_input_publish_files" >&2
    printf '[app-route-runtime-delete-gate] restaurant clear files:\n%s\n' "$restaurant_scene_input_clear_files" >&2
    failures=$((failures + 1))
  elif [[ ! -e "$restaurant_route_scene_input_host_file" ]] ||
     [[ -e "$local_restaurant_layer_host_file" ]] ||
     [[ -e "$global_restaurant_layer_host_file" ]] ||
     [[ -e "$restaurant_route_sheet_surface_file" ]] ||
     rg -q --fixed-strings "RestaurantRouteSheetSurface" "$restaurant_route_scene_input_host_file" ||
     rg -q --fixed-strings "SearchRouteSheetFrameHost" "$restaurant_route_scene_input_host_file" ||
     rg -q --fixed-strings "useRestaurantRouteSheetMotionTargetRegistration" "$restaurant_route_scene_input_host_file" ||
     rg -q --fixed-strings "useRestaurantRouteRenderLayerRuntime" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "overlayGlobalRestaurantHostAuthority" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "overlayLocalRestaurantSheetHostAuthority" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "routeSceneInputLane.publishRouteSceneDescriptor" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "clearRouteSceneInput('restaurant')" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "sceneKey: 'restaurant'" "$restaurant_route_scene_input_host_file" ||
     ! rg -q --fixed-strings "animateOnMount: false" "$restaurant_route_scene_input_host_file"; then
    echo "[app-route-runtime-delete-gate] FAIL restaurant_single_scene_input_writer_gate: Restaurant scene input must be owned by one shared host that consumes both search and parent-scoped restaurant authorities." >&2
    failures=$((failures + 1))
  else
    echo "[app-route-runtime-delete-gate] PASS restaurant_single_scene_input_writer_gate"
  fi
fi

if [[ -e "$restaurant_route_sheet_surface_file" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL parent_scoped_restaurant_shared_scene_gate: Non-search restaurant routes must not mount a separate global RestaurantRouteSheetSurface." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS parent_scoped_restaurant_shared_scene_gate"
fi

if [[ -e "$restaurant_overlay_sheet_config_file" ]] ||
   [[ -e "$restaurant_route_sheet_render_runtime_file" ]] ||
   [[ -e "$restaurant_route_snap_controller_contract_file" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_local_sheet_runtime_deleted_gate: Restaurant profile content must use the shared sheet host, not local sheet config/render/snap-controller files." >&2
  printf '%s\n' \
    "$restaurant_overlay_sheet_config_file" \
    "$restaurant_route_sheet_render_runtime_file" \
    "$restaurant_route_snap_controller_contract_file" \
    | while IFS= read -r stale_file; do
      [[ -e "$stale_file" ]] && echo "${stale_file#$REPO_ROOT/}" >&2
    done
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_local_sheet_runtime_deleted_gate"
fi

if [[ -e "$TARGET_PATH" ]] && rg -q --pcre2 "source\\??:\\s*'search'\\s*\\|\\s*'global'|source:\\s*'global'" "$TARGET_PATH"; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_global_source_contract_gate: Restaurant route ownership must not use raw source:'global'; non-search restaurants must be parent-scoped children." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_global_source_contract_gate"
fi

restaurant_route_types_contract_file="$TARGET_PATH/navigation/runtime/app-overlay-route-types.ts"
if [[ -e "$restaurant_route_types_contract_file" ]] && {
  ! rg -q -U --pcre2 "restaurant\\?: \\{[\\s\\S]{0,260}source\\?: 'search';[\\s\\S]{0,260}parentSceneKey\\?: AppOverlayTopLevelProductRouteKey \\| null;[\\s\\S]{0,260}ownerSceneKey\\?: AppOverlayTopLevelProductRouteKey \\| null;[\\s\\S]{0,260}openerRouteKey\\?: OverlayKey \\| null;[\\s\\S]{0,260}routeInstanceId\\?: string \\| null;[\\s\\S]{0,260}sessionToken\\?: number \\| null;" "$restaurant_route_types_contract_file" ||
  ! rg -q -U --pcre2 "restaurant: \\{[\\s\\S]{0,260}role: 'child'[\\s\\S]{0,260}requiresOwnerSceneKey: true[\\s\\S]{0,260}sheetPolicy: 'sharedPhysicalSheet'" "$restaurant_route_types_contract_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_parent_scoped_route_contract_gate: Restaurant routes must stay parent-scoped shared-sheet children with explicit owner, opener, route instance, and session params." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_parent_scoped_route_contract_gate"
fi

native_overlay_target_authorities_file="$TARGET_PATH/navigation/runtime/app-route-native-overlay-target-authorities.ts"
app_route_scene_policy_registry_file="$TARGET_PATH/navigation/runtime/app-route-scene-policy-registry.ts"
if [[ -e "$native_overlay_target_authorities_file" ]] && rg -q --pcre2 "restaurant[\\s\\S]{0,240}source|source[\\s\\S]{0,240}restaurant" "$native_overlay_target_authorities_file"; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_shared_sheet_suppression_gate: Shared sheet suppression must not branch on restaurant source; only root restaurant routes stay outside the shared shell." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_shared_sheet_suppression_gate"
fi

if [[ -e "$app_route_scene_policy_registry_file" ]] && {
  ! rg -q -U --pcre2 "restaurant: \\{[\\s\\S]{0,180}sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP" "$app_route_scene_policy_registry_file" ||
  ! rg -q -U --pcre2 "restaurant: \\{[\\s\\S]{0,420}snapPersistence: 'none'" "$app_route_scene_policy_registry_file" ||
  ! rg -q -U --pcre2 "case 'closeChild':[\\s\\S]{0,120}return \\{ kind: 'preserveLiveY' \\}" "$route_scene_transition_policy_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_shared_sheet_policy_gate: Restaurant child routes must target the shared shell and must not restore parent snap on close." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_shared_sheet_policy_gate"
fi

app_overlay_route_types_file="$TARGET_PATH/navigation/runtime/app-overlay-route-types.ts"
if [[ ! -e "$app_overlay_route_types_file" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL app_route_taxonomy_metadata_gate: Route taxonomy metadata file is missing." >&2
  failures=$((failures + 1))
else
  route_taxonomy_failures=0
  if ! rg -q --fixed-strings "export type AppOverlayRouteRole = 'topLevel' | 'child' | 'modalExtension' | 'shell';" "$app_overlay_route_types_file" ||
     ! rg -q --fixed-strings "export const APP_OVERLAY_ROUTE_METADATA_BY_KEY" "$app_overlay_route_types_file" ||
     ! rg -q --fixed-strings "satisfies Record<OverlayKey, AppOverlayRouteMetadata>" "$app_overlay_route_types_file"; then
    route_taxonomy_failures=$((route_taxonomy_failures + 1))
  fi

  declare -a ROUTE_TAXONOMY_ROLE_CHECKS=(
    "search::role: 'topLevel'"
    "polls::role: 'topLevel'"
    "bookmarks::role: 'topLevel'"
    "profile::role: 'topLevel'"
    "searchRoute::role: 'shell'"
    "price::role: 'modalExtension'"
    "scoreInfo::role: 'modalExtension'"
    "saveList::role: 'child'"
    "restaurant::role: 'child'"
    "favoriteListDetail::role: 'child'"
    "pollCreation::role: 'child'"
  )

  for route_role_check in "${ROUTE_TAXONOMY_ROLE_CHECKS[@]}"; do
    route_key="${route_role_check%%::*}"
    route_role="${route_role_check#*::}"
    if ! rg -q -U --pcre2 "${route_key}: \\{[\\s\\S]{0,320}${route_role}" "$app_overlay_route_types_file"; then
      echo "[app-route-runtime-delete-gate] route taxonomy missing explicit role for $route_key" >&2
      route_taxonomy_failures=$((route_taxonomy_failures + 1))
    fi
  done

  if [[ "$route_taxonomy_failures" -ne 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL app_route_taxonomy_metadata_gate: Every OverlayKey must keep an explicit route role classification and policy metadata." >&2
    failures=$((failures + 1))
  else
    echo "[app-route-runtime-delete-gate] PASS app_route_taxonomy_metadata_gate"
  fi
fi

app_overlay_route_command_runtime_file="$TARGET_PATH/navigation/runtime/app-overlay-route-command-runtime.ts"
if [[ -e "$app_overlay_route_command_runtime_file" ]] && rg -q --fixed-strings "APP_ROUTE_TRANSITION_SCENE_KEYS" "$app_overlay_route_command_runtime_file"; then
  echo "[app-route-runtime-delete-gate] FAIL app_route_command_uses_taxonomy_gate: Route command runtime must use app-overlay route taxonomy instead of a local transition-scene key list." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS app_route_command_uses_taxonomy_gate"
fi

poll_creation_panel_spec_file="$TARGET_PATH/overlays/useSearchRoutePollCreationPanelSpec.ts"
if [[ -e "$poll_creation_panel_spec_file" ]] && rg -q --pcre2 "recordRouteSceneSheetSettle\\([\\s\\S]{0,160}sceneKey:\\s*'polls'" "$poll_creation_panel_spec_file"; then
  echo "[app-route-runtime-delete-gate] FAIL poll_creation_child_snap_is_not_parent_snap_gate: Poll creation is a Polls child and must not write child settles into Polls snap memory." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS poll_creation_child_snap_is_not_parent_snap_gate"
fi

app_route_static_scene_descriptor_file="$TARGET_PATH/navigation/runtime/app-route-static-scene-descriptor-controller.ts"
app_route_overlay_command_controller_file="$TARGET_PATH/navigation/runtime/app-route-overlay-command-controller.ts"
if [[ -e "$app_overlay_route_types_file" ]] && {
  ! rg -q -U --pcre2 "saveList: \\{[\\s\\S]{0,260}role: 'child'[\\s\\S]{0,260}requiresOwnerSceneKey: true[\\s\\S]{0,260}sheetPolicy: 'sharedPhysicalSheet'" "$app_overlay_route_types_file" ||
  rg -q --fixed-strings "saveList?: undefined" "$app_overlay_route_types_file" ||
  ! rg -q -U --pcre2 "saveList\\?: \\{[\\s\\S]{0,260}parentSceneKey: AppOverlayTopLevelProductRouteKey;[\\s\\S]{0,260}ownerSceneKey: AppOverlayTopLevelProductRouteKey;[\\s\\S]{0,260}routeInstanceId: string;" "$app_overlay_route_types_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL save_list_scoped_route_contract_gate: saveList must stay an owner-scoped route child with explicit parent/owner/route instance params." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS save_list_scoped_route_contract_gate"
fi

if [[ -e "$app_route_overlay_command_controller_file" ]] && {
  ! rg -q --fixed-strings "routeOverlayRouteCommandRuntime.pushRoute('saveList'" "$app_route_overlay_command_controller_file" ||
  ! rg -q --fixed-strings "routeOverlayRouteCommandRuntime.closeActiveRoute()" "$app_route_overlay_command_controller_file" ||
  ! rg -q --fixed-strings "restoreSaveSheetState" "$app_route_overlay_command_controller_file" ||
  rg -q --pcre2 "setSaveSheetState\\(\\{[\\s\\S]{0,120}visible:\\s*true" "$TARGET_PATH" --glob '!navigation/runtime/app-route-overlay-command-controller.ts'
}; then
  echo "[app-route-runtime-delete-gate] FAIL save_list_command_opens_scoped_route_gate: Save sheet open/restore must flow through the command controller and push the scoped saveList route." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS save_list_command_opens_scoped_route_gate"
fi

if [[ -e "$app_route_static_scene_descriptor_file" ]] && rg -q --pcre2 "recordRouteSceneSheetSettle\\([\\s\\S]{0,180}sceneKey:\\s*'saveList'" "$app_route_static_scene_descriptor_file"; then
  echo "[app-route-runtime-delete-gate] FAIL save_list_child_snap_is_not_parent_snap_gate: saveList uses the shared physical shell and must not keep independent scene snap memory." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS save_list_child_snap_is_not_parent_snap_gate"
fi

favorite_list_detail_scene_writer_file="$TARGET_PATH/navigation/runtime/use-app-route-favorite-list-detail-scene-input-writer-runtime.tsx"
favorite_list_detail_route_actions_file="$TARGET_PATH/navigation/runtime/use-favorite-list-detail-route-actions.ts"
favorite_list_detail_screen_file="$TARGET_PATH/screens/FavoritesListDetail.tsx"
app_shell_main_navigator_file="$TARGET_PATH/navigation/runtime/AppShellMainNavigator.tsx"
root_navigation_types_file="$TARGET_PATH/types/navigation.ts"
if [[ -e "$TARGET_PATH" ]] && rg -q --fixed-strings "navigate('FavoritesListDetail'" "$TARGET_PATH"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_no_native_navigation_gate: Favorites list detail must open as a parent-scoped route child, not native stack navigation." >&2
  failures=$((failures + 1))
elif [[ -e "$TARGET_PATH" ]] && rg -q --fixed-strings 'navigate("FavoritesListDetail"' "$TARGET_PATH"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_no_native_navigation_gate: Favorites list detail must open as a parent-scoped route child, not native stack navigation." >&2
  failures=$((failures + 1))
elif [[ -e "$app_shell_main_navigator_file" ]] && rg -q --fixed-strings "FavoritesListDetail" "$app_shell_main_navigator_file"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_no_native_navigation_gate: FavoritesListDetail must not be registered as a native stack modal." >&2
  failures=$((failures + 1))
elif [[ -e "$root_navigation_types_file" ]] && rg -q --fixed-strings "FavoritesListDetail" "$root_navigation_types_file"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_no_native_navigation_gate: FavoritesListDetail must not be part of the native root stack params." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_no_native_navigation_gate"
fi

if [[ -e "$favorite_list_detail_screen_file" ]] && rg -q --fixed-strings "closeRestaurantRoute(sessionToken)" "$favorite_list_detail_screen_file"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_hydration_failure_keeps_seed_gate: Favorites list detail restaurant hydration failures must keep the seeded restaurant route open and clear loading, not close the route." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_hydration_failure_keeps_seed_gate"
fi

if [[ -e "$app_overlay_route_types_file" ]] && {
  ! rg -q -U --pcre2 "favoriteListDetail: \\{[\\s\\S]{0,260}role: 'child'[\\s\\S]{0,260}requiresOwnerSceneKey: true[\\s\\S]{0,260}sheetPolicy: 'sharedPhysicalSheet'" "$app_overlay_route_types_file" ||
  ! rg -q -U --pcre2 "favoriteListDetail\\?: \\{[\\s\\S]{0,260}listId: string;[\\s\\S]{0,260}parentSceneKey: AppOverlayTopLevelProductRouteKey;[\\s\\S]{0,260}ownerSceneKey: AppOverlayTopLevelProductRouteKey;[\\s\\S]{0,260}routeInstanceId: string;" "$app_overlay_route_types_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_scoped_route_contract_gate: Favorites list detail must stay an owner-scoped route child with explicit parent/owner/route instance params." >&2
  failures=$((failures + 1))
elif [[ -e "$favorite_list_detail_route_actions_file" ]] && {
  ! rg -q --fixed-strings "pushRoute('favoriteListDetail'" "$favorite_list_detail_route_actions_file" ||
  ! rg -q --fixed-strings "parentSceneKey" "$favorite_list_detail_route_actions_file" ||
  ! rg -q --fixed-strings "ownerSceneKey" "$favorite_list_detail_route_actions_file" ||
  ! rg -q --fixed-strings "openerRouteKey" "$favorite_list_detail_route_actions_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_scoped_route_contract_gate: Favorites list detail route actions must push explicit parent, owner, opener, and instance identity." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_scoped_route_contract_gate"
fi

if [[ -e "$favorite_list_detail_scene_writer_file" ]] && {
  ! rg -q --fixed-strings "publishRouteSceneDescriptor" "$favorite_list_detail_scene_writer_file" ||
  ! rg -q --fixed-strings "sceneKey: 'favoriteListDetail'" "$favorite_list_detail_scene_writer_file" ||
  ! rg -q --fixed-strings "clearRouteSceneInput('favoriteListDetail')" "$favorite_list_detail_scene_writer_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_scene_input_writer_gate: Favorites list detail must publish content/chrome/state into the shared route scene input lane." >&2
  failures=$((failures + 1))
elif [[ -e "$TARGET_PATH" ]] && rg -q -U --pcre2 "recordRouteSceneSheetSettle\\([\\s\\S]{0,180}favoriteListDetail|settleRouteSceneTabSnap\\([\\s\\S]{0,180}favoriteListDetail|recordPersistentSnap\\([\\s\\S]{0,180}favoriteListDetail" "$TARGET_PATH"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_child_snap_is_not_parent_snap_gate: Favorites list detail uses the shared physical shell and must not keep independent scene snap memory." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_scene_input_writer_gate"
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_child_snap_is_not_parent_snap_gate"
fi

nav_silhouette_authority_file="$TARGET_PATH/navigation/runtime/app-route-nav-silhouette-authority.ts"
search_route_sheet_frame_host_file="$TARGET_PATH/overlays/SearchRouteSheetFrameHost.tsx"
nav_silhouette_host_file="$TARGET_PATH/overlays/NavSilhouetteHost.tsx"
search_bottom_nav_file="$TARGET_PATH/screens/Search/components/SearchBottomNav.tsx"
nav_silhouette_host_native_file="$TARGET_PATH/overlays/SearchRouteNavSilhouetteHostNativeView.tsx"
native_nav_silhouette_file="$REPO_ROOT/apps/mobile/ios/cravesearch/SearchRouteSheetNavExclusionMaskView.swift"
if [[ -e "$nav_silhouette_authority_file" ]] && {
  ! rg -q --fixed-strings "const isPersistentAppRouteNavSilhouetteMode =" "$nav_silhouette_authority_file" ||
  ! rg -q --fixed-strings "return isPersistentAppRouteNavSilhouetteMode(mode) ? 0 : Math.max(0, navTranslateY);" "$nav_silhouette_authority_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_forces_visible_boundary_gate: Persistent nav silhouette modes must ignore stale hidden nav translate and keep full sheet exclusion active." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_nav_silhouette_forces_visible_boundary_gate"
fi

if [[ -e "$nav_silhouette_authority_file" ]] && ! rg -q --fixed-strings "const sheetBottomExclusionHeight = bottomNavHeight;" "$nav_silhouette_authority_file"; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_cutout_reveal_boundary_gate: Persistent sheet snaps and masks must stop at the nav body while the painted cutout reveals sheet chrome behind it." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_nav_silhouette_cutout_reveal_boundary_gate"
fi

if [[ -e "$search_route_sheet_frame_host_file" ]] && {
  ! rg -q --fixed-strings "modeValue: AppRouteNavSilhouetteSheetExclusionModeValue;" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "if (isPersistentNavBodyExclusionMode(modeValue))" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "navBodyBoundaryTranslateY: boundaryTranslateY" "$search_route_sheet_frame_host_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_sheet_mask_boundary_mode_gate: Native sheet mask boundary translation must be resolved from exclusion mode, not raw nav translate alone." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_sheet_mask_boundary_mode_gate"
fi

if [[ -e "$search_route_sheet_frame_host_file" ]] && {
  ! rg -q --fixed-strings "const hardClipAnimatedStyle = useAnimatedStyle(() => {" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "const shouldHardClipSheet = isPersistentNavBodyExclusionMode(modeValue);" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "? Math.max(0, sheetMaskRuntime.navBarTop)" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings ": Math.max(0, viewportHeight)" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "styles.persistentSheetHardClip" "$search_route_sheet_frame_host_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_sheet_hard_clip_boundary_gate: Persistent sheet content must be UI-thread clipped at the nav body top, then released during animated nav transitions." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_sheet_hard_clip_boundary_gate"
fi

if [[ -e "$nav_silhouette_host_file" ]] && {
  ! rg -q --fixed-strings "const useStartupBottomNavVisualInputs =" "$nav_silhouette_host_file" ||
  ! rg -q --fixed-strings "getSearchStartupGeometrySeed()" "$nav_silhouette_host_file" ||
  ! rg -q --fixed-strings "bottomNavVisualInputs ?? startupBottomNavVisualInputs" "$nav_silhouette_host_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_startup_host_gate: Nav silhouette must mount from the same startup geometry as the sheet mask instead of waiting for shell visual inputs." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_nav_silhouette_startup_host_gate"
fi

if [[ -e "$native_nav_silhouette_file" ]] && {
  ! rg -q --fixed-strings "private func requestMaterialPathUpdate() {" "$native_nav_silhouette_file" ||
  ! rg -q --fixed-strings "updateMaterialPath()" "$native_nav_silhouette_file" ||
  ! rg -q --fixed-strings "effectView.layer.mask = effectMaskLayer" "$native_nav_silhouette_file" ||
  ! rg -q --fixed-strings "tintView.layer.mask = tintMaskLayer" "$native_nav_silhouette_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL native_nav_material_mask_sync_gate: Nav material mask must be synchronously owned by the bounded nav host." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS native_nav_material_mask_sync_gate"
fi

if [[ -e "$search_route_sheet_frame_host_file" || -e "$search_bottom_nav_file" || -e "$nav_silhouette_host_native_file" || -e "$native_nav_silhouette_file" ]] && {
  rg -q --fixed-strings "onMaskPerfEvent" "$search_route_sheet_frame_host_file" "$nav_silhouette_host_native_file" "$native_nav_silhouette_file" 2>/dev/null ||
  rg -q --fixed-strings "onMaterialPerfEvent" "$search_bottom_nav_file" "$nav_silhouette_host_native_file" "$native_nav_silhouette_file" 2>/dev/null ||
  rg -q --fixed-strings "native_sheet_mask_event" "$search_route_sheet_frame_host_file" "$native_nav_silhouette_file" 2>/dev/null ||
  rg -q --fixed-strings "native_nav_material_event" "$search_bottom_nav_file" "$native_nav_silhouette_file" 2>/dev/null ||
  rg -q --fixed-strings "native_sheet_mask_path_setup" "$native_nav_silhouette_file" 2>/dev/null ||
  rg -q --fixed-strings "native_nav_material_path_setup" "$native_nav_silhouette_file" 2>/dev/null
}; then
  echo "[app-route-runtime-delete-gate] FAIL nav_silhouette_diagnostic_bridge_deleted_gate: Temporary native mask measurement events must not remain in the runtime path." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS nav_silhouette_diagnostic_bridge_deleted_gate"
fi

surface_enter_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-surface-results-enter-transaction-execution-runtime.ts"
if [[ -e "$surface_enter_transaction_file" ]] && rg -q --pcre2 '(requestLocalSheetMotion|animateSheetTo|snapSheetTo)\b' "$surface_enter_transaction_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_results_enter_bypass_visibility_controller: Results enter must publish a SheetTransitionPlan instead of calling sheet motion directly." >&2
  rg -n --pcre2 '(requestLocalSheetMotion|animateSheetTo|snapSheetTo)\b' "$surface_enter_transaction_file" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_results_enter_bypass_visibility_controller"
fi

if rg -q --pcre2 '\b(resultsSheetExecutionModel|ResultsSheetExecutionModel|requestResultsSheetMotion|hideResultsSheet|useResultsPresentationSheetExecutionRuntime|useResultsPresentationOwnerSheetExecutionStateRuntime)\b' "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" 2>/dev/null; then
  echo "[app-route-runtime-delete-gate] FAIL stale_results_sheet_execution_lane_deleted_gate: Results sheet execution lanes must not reintroduce page-owned sheet motion." >&2
  rg -n --pcre2 '\b(resultsSheetExecutionModel|ResultsSheetExecutionModel|requestResultsSheetMotion|hideResultsSheet|useResultsPresentationSheetExecutionRuntime|useResultsPresentationOwnerSheetExecutionStateRuntime)\b' "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS stale_results_sheet_execution_lane_deleted_gate"
fi

surface_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"
if [[ -e "$surface_transaction_file" ]] && rg -q --pcre2 'markRedrawMarkersReady\(' "$surface_transaction_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_results_surface_marks_marker_ready: Results surface transactions must wait for the native mounted-hidden marker acknowledgement." >&2
  rg -n --pcre2 'markRedrawMarkersReady\(' "$surface_transaction_file" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_results_surface_marks_marker_ready"
fi

if rg -q --pcre2 '\b(requestMiddleSheetSnap|requestResultsSheetSnap|pollCreationSnapRequest|requestRouteScenePollCreationExpand|setPollCreationSnapRequest|requestRouteSceneDockedPollsRestore|restaurantSheetSnapController|resultsSheetCommand|executeAndStripNativeSheetCommands|executeAndStripNativeProfileSheetCommands)\b' "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" 2>/dev/null; then
  echo "[app-route-runtime-delete-gate] FAIL shared_sheet_motion_old_writers_deleted_gate: Profile/results/polls local snap writers and native sheet command lanes must not return; sheet motion is route transition-plan owned." >&2
  rg -n --pcre2 '\b(requestMiddleSheetSnap|requestResultsSheetSnap|pollCreationSnapRequest|requestRouteScenePollCreationExpand|setPollCreationSnapRequest|requestRouteSceneDockedPollsRestore|restaurantSheetSnapController|resultsSheetCommand|executeAndStripNativeSheetCommands|executeAndStripNativeProfileSheetCommands)\b' "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS shared_sheet_motion_old_writers_deleted_gate"
fi

if rg -q --fixed-strings "snapPersistenceKey" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" 2>/dev/null ||
   rg -q -U --pcre2 "normalizeSearchRouteSceneStackShellSpec\\(\\{[\\s\\S]{0,700}initialSnapPoint" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" 2>/dev/null; then
  echo "[app-route-runtime-delete-gate] FAIL shared_sheet_page_owned_motion_fields_deleted_gate: Scene descriptors must not publish snap persistence or initial snap; SheetScenePolicy and SheetTransitionPlan own those fields." >&2
  rg -n --fixed-strings "snapPersistenceKey" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" >&2 || true
  rg -n -U --pcre2 "normalizeSearchRouteSceneStackShellSpec\\(\\{[\\s\\S]{0,700}initialSnapPoint" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" >&2 || true
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS shared_sheet_page_owned_motion_fields_deleted_gate"
fi

profile_native_sheet_transport_file="$TARGET_PATH/screens/Search/runtime/profile/profile-presentation-native-sheet-transport.ts"
profile_owner_native_view_file="$TARGET_PATH/screens/Search/runtime/profile/profile-owner-native-view-runtime.ts"
profile_command_payload_normalizer_file="$TARGET_PATH/navigation/runtime/app-route-profile-command-payload-normalizer.ts"
if [[ -e "$profile_native_sheet_transport_file" ]] ||
   [[ -e "$profile_owner_native_view_file" ]] ||
   [[ -e "$profile_command_payload_normalizer_file" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL profile_native_sheet_command_lane_deleted_gate: Profile sheet movement must use SheetTransitionPlan, not native sheet command or snap-controller adapter files." >&2
  printf '%s\n' \
    "$profile_native_sheet_transport_file" \
    "$profile_owner_native_view_file" \
    "$profile_command_payload_normalizer_file" \
    | while IFS= read -r stale_file; do
      [[ -e "$stale_file" ]] && echo "${stale_file#$REPO_ROOT/}" >&2
    done
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_native_sheet_command_lane_deleted_gate"
fi

if rg -q --pcre2 "requestLocalSheetMotion\\(\\s*['\"](polls|pollCreation|restaurant|bookmarks|profile|favoriteListDetail|saveList)['\"]" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" 2>/dev/null; then
  echo "[app-route-runtime-delete-gate] FAIL page_local_motion_writer_deleted_gate: Pages and child scenes must open through SheetTransitionPlan, not local sheet-motion writers." >&2
  rg -n --pcre2 "requestLocalSheetMotion\\(\\s*['\"](polls|pollCreation|restaurant|bookmarks|profile|favoriteListDetail|saveList)['\"]" "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS page_local_motion_writer_deleted_gate"
fi

transition_contract_file="$TARGET_PATH/navigation/runtime/app-overlay-route-transition-contract.ts"
transition_policy_file="$TARGET_PATH/navigation/runtime/app-route-scene-transition-policy-runtime.ts"
transition_switch_file="$TARGET_PATH/navigation/runtime/app-route-scene-switch-controller.ts"
if [[ -e "$transition_contract_file" && -e "$transition_policy_file" && -e "$transition_switch_file" ]] && {
  ! rg -q --fixed-strings "RouteSceneSwitchSheetTransitionPlan" "$transition_contract_file" ||
  ! rg -q --fixed-strings "resolveDefaultSheetMotionPlan" "$transition_policy_file" ||
  ! rg -q --fixed-strings "sheetTransitionPlan: transitionPlan.sheetTransitionPlan" "$transition_switch_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL shared_sheet_transition_plan_contract_gate: Route switches must carry one SheetTransitionPlan-derived sheet motion contract." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS shared_sheet_transition_plan_contract_gate"
fi

native_render_owner_file="$TARGET_PATH/screens/Search/components/hooks/use-search-map-native-render-owner.ts"
if [[ -e "$native_render_owner_file" ]] && rg -q --pcre2 'shouldQueueNativeEnterMountAckFrame[\\s\\S]{0,320}residentSourceDataMatchesPreparedFrame' "$native_render_owner_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_native_enter_ack_not_bound_to_resident_cache_match: Same-data results enter must still queue a native mounted-hidden acknowledgement when resident-source metadata is stale." >&2
  rg -n --pcre2 'shouldQueueNativeEnterMountAckFrame|residentSourceDataMatchesPreparedFrame' "$native_render_owner_file" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_native_enter_ack_not_bound_to_resident_cache_match"
fi

if [[ -e "$native_render_owner_file" ]] && {
  ! rg -q --fixed-strings "const shouldQueueNativeEnterMountAckFrame =" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "nextPresentationState.executionStage === 'enter_pending_mount'" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "preparedSourceFrameReadyForHiddenPreapply" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "presentationRequestKey != null" "$native_render_owner_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_native_enter_ack_queues_presentation_only_frame: Enter-pending-mount transactions with ready source data must be able to queue a native mounted-hidden ack frame." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_native_enter_ack_queues_presentation_only_frame"
fi

direct_map_source_controller_file="$TARGET_PATH/screens/Search/hooks/use-direct-search-map-source-controller.ts"
if [[ -e "$direct_map_source_controller_file" ]] && ! rg -q --fixed-strings "shouldPreserveResidentEnterSourceFrame" "$direct_map_source_controller_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_source_preserves_resident_enter_frame: Results enter must not replace a resident non-empty source frame with an empty frame before native enter settles." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_source_preserves_resident_enter_frame"
fi

if [[ -e "$direct_map_source_controller_file" ]] && {
  ! rg -q --fixed-strings "const projectSearchMapVisualFrame =" "$direct_map_source_controller_file" ||
  ! rg -q --fixed-strings "const buildVisualIdentityKey =" "$direct_map_source_controller_file" ||
  ! rg -q --fixed-strings "const assertProjectedVisualFrameInvariants =" "$direct_map_source_controller_file" ||
  ! rg -q --fixed-strings "visualProjector:" "$direct_map_source_controller_file" ||
  rg -q --pcre2 '\[\s*\.\.\.shortcutResultFeatures,\s*\.\.\.shortcutCoverageFeatures' "$direct_map_source_controller_file" ||
  rg -q --pcre2 '\[\s*\.\.\.shortcutCoverageFeatures,\s*\.\.\.shortcutResultFeatures' "$direct_map_source_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_single_visual_projector_gate: Map visual sources must flow through one restaurant-location projector, not inline result/coverage pin merges." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_single_visual_projector_gate"
fi

surface_results_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/search-surface-results-transaction.ts"
surface_results_transaction_runtime_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"
direct_map_source_controller_file="$TARGET_PATH/screens/Search/hooks/use-direct-search-map-source-controller.ts"
search_surface_runtime_file="$TARGET_PATH/screens/Search/runtime/surface/search-surface-runtime.ts"
if [[ -e "$surface_results_transaction_file" ]] && {
  rg -q --fixed-strings "canPromoteRetainedShortcutRerun" "$surface_results_transaction_file" ||
  rg -q --fixed-strings "SearchSurfaceResultsEnterDataSource" "$surface_results_transaction_file" ||
  rg -q --fixed-strings "createRetainedResultsSearchSurfaceResultsEnterTransaction" "$surface_results_transaction_file" ||
  rg -q --fixed-strings "snapshot.dataSource" "$surface_results_transaction_file" ||
  rg -q --fixed-strings "'retained_results'" "$surface_results_transaction_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Search reveals must not revive retained/same-key transaction sources." >&2
  failures=$((failures + 1))
elif [[ -e "$surface_results_transaction_file" ]] && {
  ! rg -q --fixed-strings "SearchSurfaceResultsDataReadyFrom" "$surface_results_transaction_file" ||
  ! rg -q --fixed-strings "expectedResultsDataKey" "$surface_results_transaction_file" ||
  ! rg -q --fixed-strings "dataReady: snapshot.dataReadyFrom !== 'pending'" "$surface_results_transaction_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Search reveal transactions must carry explicit data readiness identity." >&2
  failures=$((failures + 1))
elif [[ -e "$surface_results_transaction_runtime_file" ]] && rg -q --fixed-strings "retained_native_source_frame_commit" "$surface_results_transaction_runtime_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Retained results must not commit by publishing native source readiness from JS." >&2
  failures=$((failures + 1))
elif [[ -e "$surface_results_transaction_runtime_file" ]] && {
  rg -q --fixed-strings "expectedResultsSnapshotKey" "$surface_results_transaction_runtime_file" ||
  rg -q --fixed-strings "sameKeyMountedResultsData" "$surface_results_transaction_runtime_file" ||
  rg -q --fixed-strings "shouldReuseMountedResultsData" "$surface_results_transaction_runtime_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Presentation gates must use explicit results data keys, not stale same-key guessing." >&2
  failures=$((failures + 1))
elif [[ -e "$surface_results_transaction_runtime_file" ]] && rg -q --fixed-strings "beginRetainedResultsVisualReplay" "$surface_results_transaction_runtime_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Search submit reveals must not use retained mounted visual replay." >&2
  failures=$((failures + 1))
elif [[ -e "$search_surface_runtime_file" ]] && rg -q --fixed-strings "beginRetainedResultsVisualReplay" "$search_surface_runtime_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Runtime must not expose retained mounted visual replay." >&2
  failures=$((failures + 1))
elif [[ -e "$direct_map_source_controller_file" ]] && {
  rg -q --fixed-strings "canReplaySourceFrameData" "$direct_map_source_controller_file" ||
  rg -q --fixed-strings "retained_frame_readiness" "$direct_map_source_controller_file" ||
  rg -q --fixed-strings "retainedSourceFrameReplay" "$direct_map_source_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Exact same search must publish a full source-frame snapshot, not a retained source-ready-only replay." >&2
  failures=$((failures + 1))
elif [[ -e "$native_render_owner_file" ]] && {
  rg -q --fixed-strings "covered_promote_retained_hidden_sources" "$native_render_owner_file" ||
  rg -q --fixed-strings "enter_uses_resident_hidden_sources" "$native_render_owner_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Native presentation diagnostics must describe preapplied hidden sources, not retained mounted-source replay." >&2
  failures=$((failures + 1))
elif [[ -e "$direct_map_source_controller_file" ]] && {
  ! rg -q --fixed-strings "sourceFramePort.publishSnapshot(nextCachedSnapshot)" "$direct_map_source_controller_file" ||
  ! rg -q --fixed-strings "labelCollisionSourceStore" "$direct_map_source_controller_file" ||
  ! rg -q --fixed-strings "cachedPreparedSourceFrameReplay" "$direct_map_source_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_surface_retained_results_data_only: Prepared-frame cache reuse must republish a full snapshot that preserves label collision sources." >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_surface_retained_results_data_only"
fi

search_submit_dismiss_lifecycle_matches=""
search_submit_dismiss_path_files="$(
  find "$TARGET_PATH" -type f \( \
    -name '*.ts' -o \
    -name '*.tsx' -o \
    -name '*.js' -o \
    -name '*.jsx' -o \
    -name '*.d.ts' \
  \) -print \
    | while IFS= read -r source_file; do
      relative_source_file="${source_file#$REPO_ROOT/}"
      if printf '%s\n' "$relative_source_file" \
        | rg -q --pcre2 "$SEARCH_SUBMIT_DISMISS_AUTHORITY_FILE_PATTERN"; then
        printf '%s\n' "$source_file"
      fi
    done
)"

set +e
search_submit_dismiss_authority_files="$(
  rg -l --pcre2 'SearchSubmitDismissTransitionVisualAuthority|getSearchSubmitDismissTransitionVisualAuthority|useSearchSubmitDismissTransitionVisualAuthoritySelector' "$TARGET_PATH" 2>&1
)"
authority_files_status=$?
set -e

if [[ "$authority_files_status" -eq 2 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: invalid authority pattern" >&2
  echo "$search_submit_dismiss_authority_files" >&2
  failures=$((failures + 1))
elif [[ "$authority_files_status" -ne 0 && "$authority_files_status" -ne 1 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: rg exited with status $authority_files_status" >&2
  echo "$search_submit_dismiss_authority_files" >&2
  failures=$((failures + 1))
else
  search_submit_dismiss_candidate_files="$(
    printf '%s\n%s\n' \
      "$search_submit_dismiss_path_files" \
      "$search_submit_dismiss_authority_files" \
      | sed '/^$/d' \
      | sort -u
  )"

  while IFS= read -r source_file; do
    [[ -n "$source_file" ]] || continue

    set +e
    lifecycle_matches="$(rg -n --pcre2 "$SEARCH_SUBMIT_DISMISS_AUTHORITY_LIFECYCLE_PATTERN" "$source_file" 2>&1)"
    lifecycle_status=$?
    set -e

    if [[ "$lifecycle_status" -eq 2 ]]; then
      echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: invalid lifecycle pattern" >&2
      echo "$lifecycle_matches" >&2
      failures=$((failures + 1))
    elif [[ "$lifecycle_status" -eq 0 ]]; then
      search_submit_dismiss_lifecycle_matches+="$lifecycle_matches"$'\n'
    elif [[ "$lifecycle_status" -ne 1 ]]; then
      echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: rg exited with status $lifecycle_status" >&2
      echo "$lifecycle_matches" >&2
      failures=$((failures + 1))
    fi
  done <<< "$search_submit_dismiss_candidate_files"
fi

if [[ -n "$search_submit_dismiss_lifecycle_matches" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: SearchSubmitDismissTransitionVisualAuthority must not own submit/dismiss lifecycle writer APIs." >&2
  printf '%s' "$search_submit_dismiss_lifecycle_matches" >&2
  failures=$((failures + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_submit_dismiss_authority_lifecycle_writer"
fi

for check in "${PATH_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  description="${rest#*::}"

  set +e
  matches="$(
    find "$TARGET_PATH" -type f -print \
      | sed "s#^$REPO_ROOT/##" \
      | rg -n --pcre2 "$pattern" 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -eq 2 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: invalid path pattern" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: path scan exited with status $status" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  fi
done

if [[ "$failures" -gt 0 ]]; then
  echo "[app-route-runtime-delete-gate] FAILED ($failures checks)." >&2
  exit 1
fi

echo "[app-route-runtime-delete-gate] OK (${#CONTENT_CHECKS[@]} content checks, ${#PATH_CHECKS[@]} path checks)."
