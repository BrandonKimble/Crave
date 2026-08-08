#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime) + `yarn app-route:delete-gate`
#
# WHAT THIS GATE IS FOR: deleted app-route runtime shapes must not return.
# It asserts NEGATIVELY — banned symbols (CONTENT_CHECKS / ROOT_CONTENT_CHECKS)
# and banned file paths (PATH_CHECKS). That class ages well: a thing that was
# deliberately deleted stays deleted, no matter how the surviving code is
# restructured.
#
# TRIAGE 2026-08-03 (audit D37 / F702). This gate was declared in package.json
# and executed by nothing — not CI, not lefthook, not turbo. Unwatched, it had
# gone 16-checks RED. All 16 were POSITIVE design-shape assertions pinned to
# exact source strings and file paths, and every one that was traced turned out
# to be a stale referent against code that had legitimately moved, e.g.:
#   - it demanded route-taxonomy roles for `bookmarks` and `favoriteListDetail`;
#     the bookmarks->lists rename (owner, 2026-07-26) made those `lists` and
#     `listDetail`, and lists-scene-key.spec.ts asserts `bookmarks` is GONE — a
#     LIVE SPEC and this gate were asserting opposite things. The spec is truth.
#   - restaurant_single_scene_input_writer_gate counted
#     app-route-scene-entry-mounts.spec.ts as a second "writer" of
#     `sceneKey: 'restaurant'`; production still has exactly one writer.
#   - prepareRestaurantProfileForTerminalSearchDismiss still exists, in
#     screens/Search/runtime/profile/profile-owner-action-surface-runtime.ts,
#     not the path the check named.
#   - the 8 map checks pinned exact Swift/Java lines (`distanceSq`,
#     `return left.featureIndex < right.featureIndex`, PIN_TAP_INTENT_RADIUS_PX)
#     that no longer exist in the SHIPPED map. CLAUDE.md forbids re-deriving map
#     assertions outside a real map change, so they were not rewritten.
# Those 16 blocks were REMOVED and the surviving 327 checks WIRED INTO CI.
#
# TRIAGE 2026-08-07 (audit D114 / F7200). The 41 PURE co-location checks were
# re-measured and the premise everyone had been arguing over collapsed: the
# CONTENT_CHECKS runner had no `rg -U`, so every `[\s\S]{0,N}` distance meant
# "N characters within ONE LINE" and the whole class had been INERT since
# birth. 17 were ROTTED (dead anchor, or the pattern matches legal live code)
# and are DELETED, each with its measurement in a one-line tombstone. 8 were
# HISTORY — the forbidden fragment is absent tree-wide, so the co-location
# reduces exactly to the negative single-symbol ban this header demands — and
# were CONVERTED. 3 were module-boundary (dependency) rules and moved to
# eslint import restrictions in apps/mobile/.eslintrc.js. `-U` landed in the
# same commit as the deletions (see the loop below), and every surviving
# proximity check was RED-PROVEN by planting its forbidden co-location as
# multi-line prettier-formatted TypeScript: 22 of 22 fired, 0 demotions.
#
# RULE FOR ADDING CHECKS HERE: negative only. Assert that a killed symbol or
# path is absent. Do NOT add positive "the current design looks like X" string
# assertions — that is what rotted, and it belongs in a live spec next to the
# code, where a refactor updates it in the same commit.
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

# TOOL PRECONDITION + SOUND SCANNING VOCABULARY (F8900, 2026-08-07; supersedes
# the local F8800 block and the local ban_absent/require_present helpers).
# Every negative-ban block below runs ripgrep. If rg is absent (exit 127), an
# `if rg -q …` test is non-zero and reads as "no match → PASS" — a green that
# verified NOTHING, exactly where a developer looks at it. That guarantee, and
# the exit-status discrimination the two helpers carried, now live once in
# scripts/lib/gate-runner.sh (mutation-proven by scripts/lib/gate-runner.test.sh)
# so no gate can drift out of it. `accumulate` mode: this gate reports the FULL
# list of broken checks in one run, which is what a human needs from 200 checks.
source "$REPO_ROOT/scripts/lib/gate-runner.sh"
gate_init app-route-runtime-delete-gate accumulate
gate_require_tool rg

for root_native_project_path in "${ROOT_NATIVE_PROJECT_PATHS[@]}"; do
  if [[ -e "$root_native_project_path" ]]; then
    echo "[app-route-runtime-delete-gate] FAIL root_native_generated_project_path: root native generated projects must not return; active native projects live under apps/mobile." >&2
    echo "${root_native_project_path#$REPO_ROOT/}" >&2
    exit 1
  fi
done

if [[ -e "$TARGET_PATH/screens/Search/runtime/map/map-diff-applier.ts" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_legacy_diff_applier_path: LOD is role-table owned; the old JS map diff applier must not return." >&2
  exit 1
fi

# F1700/D59 (2026-08-04): the scalar-surface stack (JS runtime + iOS
# SearchChromeScalarSurfaceRegistry.swift + Android SearchChromeScalarSurfaceRegistryModule.java
# + the RCT_EXTERN_MODULE block) was DELETED as a fork of the shipped
# SearchChromeNativeHitTargetId stack. Neither half may return, on any platform.
SCALAR_SURFACE_NATIVE_FORBIDDEN_PATHS=(
  "$REPO_ROOT/apps/mobile/ios/cravesearch/SearchChromeScalarSurfaceRegistry.swift"
  "$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchChromeScalarSurfaceRegistryModule.java"
)
for scalar_surface_native_path in "${SCALAR_SURFACE_NATIVE_FORBIDDEN_PATHS[@]}"; do
  if [[ -e "$scalar_surface_native_path" ]]; then
    echo "[app-route-runtime-delete-gate] FAIL search_chrome_scalar_surface_native_path: the scalar-surface native registry was deleted (F1700); the shipped native chrome seam is SearchChromeNativeHitTargetSurface." >&2
    echo "${scalar_surface_native_path#$REPO_ROOT/}" >&2
    exit 1
  fi
done

# F1716/D61 (2026-08-04): the native camera-command fallback (executeCameraCommand +
# dispatchProfilePresentationCameraCommand + the camera_command_unavailable reject in
# ProfilePresentationTransactionExecutor.swift, and its RCT_EXTERN_METHOD block) was
# DELETED — the CameraIntentArbiter's park-and-replay owns the hostless window; a
# fire-and-forget native fallback whose resolve cannot mean "applied" must not return.
# (The executeSheetCommands half of that module is LIVE and stays.)
CAMERA_NATIVE_EXECUTOR_FILES=(
  "$REPO_ROOT/apps/mobile/ios/cravesearch/ProfilePresentationTransactionExecutor.swift"
  "$REPO_ROOT/apps/mobile/ios/cravesearch/UIFrameSamplerBridge.m"
)
for camera_native_file in "${CAMERA_NATIVE_EXECUTOR_FILES[@]}"; do
  if [[ -e "$camera_native_file" ]] && rg -q --pcre2     "executeCameraCommand|camera_command_unavailable|dispatchProfilePresentationCameraCommand|cameraCommandExecutionAvailable"     "$camera_native_file"; then
    echo "[app-route-runtime-delete-gate] FAIL camera_native_fallback_symbols: the native camera-command fallback was deleted (F1716/D61); the arbiter park-and-replay owns the hostless window." >&2
    echo "${camera_native_file#$REPO_ROOT/}" >&2
    exit 1
  fi
done

declare -a CONTENT_CHECKS=(
  "camera_native_fallback_lane::SearchMapNativeCameraExecutor|searchMapNativeCameraExecutor|camera_command_unavailable|cameraCommandExecutionAvailable|onCommandRejected::The camera lane's native fallback was deleted (F1716/D61) — the arbiter parks a hostless commit and replays it on host return; a JS shim around a fire-and-forget native camera dispatch must not return."
  "search_chrome_scalar_surface_symbols::SearchChromeScalarSurface|createSearchChromeScalarSurfaceRuntime|setSearchChromeScalarPrimitiveTarget|syncScalarSnapshot|registerPlatformScalarSlot::Scalar-surface stack was deleted (F1700/D59); the live native chrome seam is SearchChromeNativeHitTargetId — do not rebuild the fork."
  "polls_scene_authority_subscribe::routePollsSceneRuntime\\.sceneAuthority\\.subscribe::Polls scene authority must remain snapshot/target-owned, not subscribed from mounted chrome/body."
  "chrome_mode_authority_subscribe::routeOverlayChromeModeAuthority\\.(subscribe|subscribeSelector)::Chrome mode authority is snapshot/shared-value target only."
  "chrome_mode_listener_surface::chromeModeListeners::Chrome mode listener set was deleted as a subscription backdoor."
  "chrome_mode_notify_label::notify:chromeMode::Chrome mode notify path was deleted."
  "chrome_motion_snap_targets::chromeMotionSnapTargets::Old chrome snap listener target path must not return."
  "polls_visibility_authority_subscribe::routeOverlayDockedSceneVisibilityAuthority\\.(subscribe|subscribeSelector)::Polls visibility uses getSnapshot/registerTarget, not subscriptions."
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
  # F9950 (2026-08-07) GATE ROT: dbfce5bb9/F5403 renamed the navigation authority's
  # `registerTarget` to `subscribeTarget` (notify-on-change, deliberately NOT push-on-
  # register like the six sibling authorities). The unanchored `subscribe` alternative
  # then matched every legal `.subscribeTarget(` call site — the gate banned the live
  # target contract itself. `\b` restores the original intent: the banned things are the
  # deleted broadcast APIs `.subscribe(` / `.subscribeSelector(`, not target registration.
  "native_overlay_navigation_subscribe::routeOverlayNavigationAuthority\\.(subscribe|subscribeSelector)\\b::Navigation uses getSnapshot/subscribeTarget, not broadcast subscriptions."
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
  # F1735 (2026-08-04): the surface-redraw coordinator subsystem was a structural
  # fossil — no writer ever assigned an operationId, so the phase machine could never
  # leave 'idle'; every bus flag it bridged was pinned at its idle value. The whole
  # channel (coordinator, phase module, pressure runtimes, telemetry, bus fields,
  # freeze flags, hydration-finalize allowance) was deleted and must not return.
  "search_surface_redraw_coordinator_symbols::\\b(SearchSurfaceRedrawCoordinator|createSearchSurfaceRedrawCoordinator|searchSurfaceRedrawCoordinatorRef|SearchSurfaceRedrawOwnerRuntime|resolveSearchSurfaceRedrawAdvanceSnapshot|resolveSearchSurfaceRedrawResetSnapshot|createSearchSurfaceRedrawIdleSnapshot|SEARCH_SURFACE_REDRAW_PHASE_ORDER|isSearchSurfaceRedrawDeferredChromePhase|isSearchSurfaceRedrawVisibleAdmissionPhase)\\b::The surface-redraw coordinator was a structural fossil (F1735) and was deleted; redraw readiness is SearchSurfaceRuntime.redrawTransaction."
  "search_surface_redraw_bus_fields::\\b(searchSurfaceRedrawOperationId|isSearchSurfaceRedrawActive|isSearchSurfaceRedrawPreflightFreezeActive|isSearchSurfaceRedrawChromeFreezeActive|searchSurfaceRedrawSelectionFeedbackOperationId|searchSurfaceRedrawCommitSpanPressureActive|isSearchSurfaceRedrawChromeDeferred|isChromeDeferred|allowHydrationFinalizeCommit)\\b::The redraw-coordinator bus/policy fields were pinned at idle values by construction (F1735) and were deleted with the coordinator."
  # F6500 (2026-08-07): this pattern used to carry the bare alternatives
  # `runOne|RunOne|run-one`. Two of them (`runOne|RunOne`) were UNMATCHABLE against
  # any real identifier — a trailing `\b` after `RunOne` cannot fire inside
  # `isRunOneFreezeActive`, so they policed nothing — while `run-one` matched ENGLISH
  # PROSE: the gate went RED on two COMMENTS narrating the F1324 consolidation
  # (use-frozen-while.ts, search-foreground-chrome-contract.ts), i.e. it forbade
  # DESCRIBING the deletion. The banned thing is the HANDOFF name, in code; matching
  # it without a trailing `\b` also catches suffixed revivals like
  # `runOneHandoffOwner`, which the old anchored form would have missed.
  "search_surface_legacy_run_one_handoff_ownership::(?i)runonehandoff|run-one-handoff|\\b(Run1|run1)\\b::Search redraw ownership must use SearchSurfaceRedraw/SearchSurfaceRuntime names, not run-one handoff names."
  "search_surface_legacy_prepared_results_transaction::\\b(PreparedResults|preparedResults|preparedPresentationSnapshotKey|results-prepared|prepared_snapshot|prepared_staging|cards_pins_prepared|prepared_commit_gate|map_prepared_source_frame_ready_contract)\\b::Search results transactions must use SearchSurfaceResultsTransaction names."
  "search_surface_redraw_null_results_clears_transaction_key::results == null[\\s\\S]{0,260}searchSurfaceResultsTransactionKey:\\s*null::Transient null result data during redraw must not clear the active SearchSurfaceResultsTransaction key."
  "search_surface_redraw_stage_sources_ready_reset::publishMapSearchSurfaceResultsSourcesReady\\(false,\\s*snapshot\\.transactionId\\)::Staging a redraw transaction must not reset already-latched marker/source readiness. F7200/D114: converted from a proximity check to a negative ban on the killed call form (the legal `(false, null)` clear at search-surface-results-transaction.ts:315 is untouched)."
  "search_surface_results_body_bundle_active_only::syncResultsPageBodyBundle[\\s\\S]{0,180}if \\(this\\.snapshot\\.activeBundle\\.kind !== 'results'\\)[\\s\\S]{0,220}this\\.latestResultsBodyBundle = bodyBundle::Results body bundle must be retained before the active-results guard so future redraws can mount cards."
  # DELETED F7200/D114 (2026-08-07) — search_surface_same_key_rerun_blocked_after_page_one_commit ROTTED: handlePageOneResultsCommitted/promoteDataReady are both dead as literals. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_surface_results_react_effect_fallback::react_effect_fallback::Search results transaction commits must use named source events, not fallback labels."
  "search_surface_results_synthetic_enter_settle::synthetic-batch|settledCommittedEnterFromRevealedSurface|committed_enter_settled_from_revealed_surface|maybeSettleCommittedEnterFromRevealedSurface::Search results enter must wait for native mounted-hidden/settled events, not synthetic JS settlement."
  "search_results_semantic_visual_reuse_names::semanticResultsVisualReuse|semantic_visual_reuse|semantic-reuse|semantic_reuse|retainedResultsVisualReuse|retained_results_visual_reuse|retained_submit_promoted|responseLifecycleSkipped|requestPayloadSkipped::Search reveals must not revive the old semantic/retained mounted-visual reuse lane."
  "search_surface_legacy_marker_ready_api::markRedrawMarkersReady\\(::Reveal readiness must use markRedrawNativeMarkerFrameReady from native mounted-hidden acknowledgement."
  "search_surface_legacy_visual_redraw_store_refs::search-surface-visual-redraw-store|SearchSurfaceVisualRedraw|beginSearchSurfaceVisualRedraw|markSearchSurfaceVisualRedrawReady|revealSearchSurfaceVisualRedraw|cancelSearchSurfaceVisualRedraw::Results reveal readiness is owned by SearchSurfaceRuntime.redrawTransaction, not a parallel visual redraw store."
  "search_results_enter_conditional_sheet_ready::if \\(targetSnap == null\\) \\{\\s*getSearchSurfaceRuntime\\(\\)\\.markRedrawSheetReady\\(snapshot\\.transactionId\\)::Results enter must mark the sheet gate ready when the shared sheet transition is accepted, not only when no snap target exists."
  "route_sheet_runtime_config_initial_snap_current_snap::return this\\.currentSnap === 'hidden' \\? policyInitialSnap : this\\.currentSnap::Runtime config initial snap must stay policy/bootstrap only; live snap belongs to motion state."
  "search_surface_persistent_poll_clear_without_redraw_guard::transportSnapshot\\.snapshotKind !== 'results_enter'\\) \\{[[:space:]]*publishSearchMountedResultsDataSnapshot\\(null\\)::Persistent-poll lane cleanup must not clear mounted results while a redraw transaction is active or armed."
  # DELETED F7200/D114 (2026-08-07) — search_results_settled_surface_none ROTTED: -U MATCHES the CORRECT code at results-presentation-runtime-machine-state.ts:54-58. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_transition_visual_side_request_api::requestSearchTransitionVisualState::Search transition visual state side requests must not return."
  "search_transition_visual_dead_header_fields::\\b(SearchTransitionVisualHeaderOwner|headerOwner|headerReady|navSilhouetteMode)\\b::Search transition visual state must not revive dead header-owner/header-ready/nav-silhouette fields."
  "search_transition_visual_internal_owner_exports::export type SearchTransitionVisual(Phase|BottomBandOwner)\\b::Search transition phase and bottom-band owner types are internal implementation details."
  "app_route_nav_silhouette_dead_transaction_helper::\\bresolveAppRouteNavSilhouetteModeValueFromTransaction\\b::Nav silhouette transaction mode helper was unused and must not return."
  "app_route_nav_silhouette_internal_helper_exports::export const (resolveAppRouteNavSilhouetteMode|resolveAppRouteNavSilhouetteModeValue|roundAppRouteNavSilhouetteTelemetryValue)\\b::Nav silhouette mode/telemetry helpers are internal to the authority module."
  "app_route_nav_silhouette_sheet_like_bottom_band::\\bshouldUseSheetLikeBottomNavBand\\b::Old sheet-like bottom-nav band workaround must not return."
  "app_route_nav_silhouette_solid_bg::\\bAPP_ROUTE_NAV_SILHOUETTE_SOLID_BG\\b::Bottom-nav silhouette must render frosted material, not a solid fallback band."
  "app_route_nav_silhouette_solid_background_color::\\bsolidBackgroundColor\\b::Bottom-nav silhouette geometry must not carry a solid fill color."
  # DELETED F7200/D114 (2026-08-07) — app_route_nav_silhouette_disable_blur_prop ROTTED: NavBarSilhouetteBackground: 0 occurrences. It could not fire even with rg -U; a check that cannot fire defends nothing.
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
  # DELETED F7200/D114 (2026-08-07) — search_suggestion_shortcut_hole_cache_null_overwrite ROTTED: suggestionHeaderShortcutHolesRef.current: dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  # DELETED F7200/D114 (2026-08-07) — search_suggestion_keyboard_show_duration ROTTED: both fragments dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_suggestion_keyboard_hide_duration::\\bevent\\.duration\\b::Leaving search mode must use fixed local hide timing, not the slower keyboard hide duration. F7200/D114: converted from a proximity check to a negative ban; `event.duration` is absent tree-wide."
  "search_mode_press_down_entry_path::\\bhandleSearchPressIn\\b|\\bonInputTouchStart\\b::Search mode enter/exit must use press-up/focus semantics, not a press-down entry lane."
  "search_mode_inactive_input_focusable::inputFocusEnabled=\\{headerVisualModel\\.editable::Inactive search chrome must not leave TextInput focusable before press-up."
  # DELETED F7200/D114 (2026-08-07) — search_suggestion_exit_ease_in ROTTED: its first anchor is a FILE NAME matched against file CONTENT — unfireable by construction. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_mode_shortcut_frozen_interaction_boolean::\\bshortcutsInteractionEnabled\\b(?!Ref)::Search-mode shortcut submit must read live interaction through a ref, not a frozen boolean captured by the overlay chrome host."
  "search_submit_dismiss_legacy_lifecycle_methods::\\.(beginResultsEnter|beginResultsExit|markResultsHeaderReady|markPollsHeaderReady|markDockedSceneHeaderReady|markDockedSceneBodyReady|markResultsExitMapSettled|markResultsExitCollapsedSettled|markDockedSceneRestoreRequested)\\(::Submit/dismiss result lifecycle marks must update route-scene transaction readiness."
  # MOVED F7200/D114 (2026-08-07) — search_dismiss_motion_plane_sheet_y_writer was an UNBOUNDED `useSearchDismissMotionPlaneRuntime[\s\S]*X`
  # proximity regex, i.e. under rg -U a DEPENDENCY rule ("must not share a file"), not a proximity law.
  # It now lives as a no-restricted-imports rule in apps/mobile/.eslintrc.js scoped to
  # src/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts, which bans acquiring
  # the capability rather than calling it. The sheet-write API (the shared-sheet values runtime that owns sheetTranslateY) is import-banned there.
  # MOVED F7200/D114 (2026-08-07) — search_dismiss_motion_plane_sheet_command_writer was an UNBOUNDED `useSearchDismissMotionPlaneRuntime[\s\S]*X`
  # proximity regex, i.e. under rg -U a DEPENDENCY rule ("must not share a file"), not a proximity law.
  # It now lives as a no-restricted-imports rule in apps/mobile/.eslintrc.js scoped to
  # src/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts, which bans acquiring
  # the capability rather than calling it. The sheet command API (shared sheet runtime / sheet host authority controller) is import-banned there.
  "search_nav_cutout_frame_bucket_proof::\\bnavCutoutProofBucket\\b::Nav/cutout lockstep proof must be edge-triggered, not per-frame progress bucket logging."
  "search_dismiss_motion_dense_progress_proof::\\blate_progress\\b::F6400(a/b): the 'late_progress' proof stage was UNEMITTABLE (shouldEmitProofEdge admits only boundaryReached/early/mid) and was deleted 2026-08-07. This check used to pair the event literal with the stage name inside 260 characters; in the only file that contained both they sat 77 lines apart, so it had been green-forever since it was written and policed nothing. Now negative-only, per this file's own header rule: the stage name is gone and must not return."
  "search_submit_dismiss_command_target_names::\\b(SearchSurfaceMotionPlaneCommandTarget|registerMotionPlaneCommandTarget|motionPlaneCommandTarget)\\b::Search motion-plane adapter observes sheet Y; command-target naming must not return."
  "search_nav_surface_progress_copy_lane::bottomNavHideProgress\\.value\\s*=\\s*surfaceMotionProgress::Search nav silhouette must use its fixed timing lane, not copy Search surface progress."
  "search_route_sheet_clip_stale_ref::sheetClipStyleRef::Route sheet clip must consume the live animated clip style, not retain a stale first style."
  "search_route_sheet_frame_animated_layout_prop::navSilhouetteSheetClipStyle|routeHostVisualRuntime\\?\\.navSilhouetteSheetBodyExclusionHeight|bottom:\\s*Math\\.max\\(0,\\s*bodyExclusionHeight\\s*-\\s*cutoutRevealDepth\\)::Route sheet frame host must keep static layout during nav silhouette motion; do not animate Yoga-affecting props."
  # DELETED F7200/D114 (2026-08-07) — search_results_portal_animated_layout_props ROTTED: the pinned `const sheetY = ...` line is gone; measuredSheetY and viewportLeft are both 0. It could not fire even with rg -U; a check that cannot fire defends nothing.
  # DELETED F7200/D114 (2026-08-07) — scene_stack_body_frame_reanimated_visibility ROTTED: -U MATCHES the shipped SceneStackBodyFrame at BottomSheetSceneStackBodyLayer.tsx:91-100. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "scene_stack_chrome_reanimated_visibility::SceneStack(Decor|Header)Layer[\\s\\S]{0,520}useAnimatedStyle\\([\\s\\S]{0,260}(opacity|zIndex|elevation)::Scene chrome layers must use discrete visible/hidden styles, not Reanimated opacity/zIndex/elevation over SVG/chrome trees."
  "results_header_body_underlap_cutout_leak::\\b(bodyUnderlapsHeader|applyContentTopInset|contentTopInset)\\b::Results header cutouts must not reveal scrolling rows; keep the list viewport physically below the fixed page header instead of underlapping with content padding."
  "search_results_body_bundle_result_specific_deps::stableSceneBodyContent[\\s\\S]{0,900}(rawSceneBodyContent\\.List(Header|Chrome|Empty)Component|rawSceneBodyContent\\.ListFooterComponent|rawSceneBodyContent\\.ItemSeparatorComponent,|rawSceneBodyContent\\.onEndReached,)::Mounted results body bundle must stay structural; result-specific list decorations and callbacks must flow through refs/data-store paths."
  "search_results_body_bundle_transport_flashlist_spread::\\.\\.\\.\\(rawSceneBodyTransport\\.flashListProps::Mounted results body bundle must not resync from FlashList prop object identity; delegate hot callbacks through stable refs. F7200/D114: converted from a proximity check to a negative ban."
  "search_route_sheet_frame_local_clip_fallback::\\b(EMPTY_ROUTE_HOST_VISUAL_RUNTIME_AUTHORITY|fallbackFrameSheetClipStyle)\\b::Route sheet frame host must require NavSilhouetteRuntime clipping, not define a local fallback clip."
  # DELETED F7200/D114 (2026-08-07) — search_route_sheet_mask_progress_mount_gate ROTTED: shouldMountMaskHost: 0. It could not fire even with rg -U; a check that cannot fire defends nothing.
  # DELETED F7200/D114 (2026-08-07) — search_route_sheet_mask_host_progress_owner ROTTED: setShouldHostMask: 0, and the surviving branch's second fragment is a bare-word `progress`. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_route_sheet_mask_native_manager_fallback::\\b(hasNativeViewManager|hasSearchRouteSheetNavExclusionMaskNativeView|getViewManagerConfig)\\b::Nav silhouette native mask registration must be strict; do not fallback to a JS View when the native manager is missing."
  "nav_silhouette_rectangular_sheet_clip_helper::useAppRouteNavSilhouetteSheetClipAnimatedStyle|navSilhouetteSheetExclusion\\b|expectedSheetExclusion\\b::Nav silhouette sheet exclusion must be an inverse silhouette mask, not a rectangular bottom inset."
  "search_foreground_local_nav_silhouette_mode_converter::resolveSearchSurfaceNavSilhouetteModeValue::Search foreground must use the app-route nav silhouette authority for mode-to-value projection."
  "search_route_sheet_frame_clip_mode_owner::frameHostInput\\.sheetClipMode|sheetClipMode:\\s*searchSurfaceNavSilhouette\\.sheetClipMode|sheetClipMode:\\s*snapshot\\.frameHostInput\\.sheetClipMode::Sheet frame hosts must consume the nav silhouette exclusion projection, not own a sheetClipMode override."
  "search_route_sheet_policy_clip_mode_owner::resolveAppRouteNavSilhouetteModeValueFromPolicy[\\s\\S]{0,220}sheetClipMode::Nav silhouette policy resolution must not accept a sheet-side clip-mode override."
  "search_route_policy_search_route_as_animated_transition::activeSemanticOverlayKey === 'search' \\? 'animatedSearchTransition'::Fresh search-home must initialize as a docked persistent nav exclusion, not as an animated search transition."
  "nav_silhouette_docked_poll_zero_mask::mode === 'dockedScene'[\\s\\S]{0,260}expectedSheetMaskHeight:\\s*0::Docked poll sheet mask is nav-silhouette-owned; it must not collapse to a sheet-side zero mask."
  "search_submit_instant_sheet_writer::\\bshowPanelInstant\\b|setSheetTranslateYTo\\(position\\)::Search submit/open must not instant-write visible sheet Y from the shared sheet presentation controller."
  "search_submit_legacy_entry_origin::\\b(entryOrigin|SearchSubmitEntryOrigin)\\b::Search submit intents must use required entrySurface, not the old optional entryOrigin."
  "search_submit_home_surface_default::entrySurface\\s*=\\s*'home'|entrySurface\\s*\\?\\?\\s*'home'::Search submit entrySurface must be declared by the foreground caller, not silently defaulted to home."
  "search_close_visual_handoff_progress_prop::\\bcloseVisualHandoffProgress\\b::Search close must not carry the old split visual-handoff progress prop through route chrome/body hosts."
  "search_dismiss_split_boundary_state::\\b(visualHandoffReached|markVisualHandoffReached|canVisuallyReleaseDockedScene|canFinalizeDockedScene)\\b::Search dismiss must use one collapsed boundary release state, not split visual/final handoff state."
  "search_dismiss_two_stage_prehandoff_plane::\\b(PRE_HANDOFF|preHandoff|dismissMotionHandoffY|commitVisualHandoffBoundary|dismissMotionResumeBoundaryRequest|waitingForPollPageAtPreBoundary)\\b::Search dismiss motion plane must not revive the prehandoff two-stage handoff path."
  "search_close_per_piece_handoff_opacity::1\\s*-\\s*closeVisualHandoffProgress\\.value|sceneVisibilityValue\\.value \\* \\(1 - closeVisualHandoffProgress\\.value\\)::Search close must not fade header/body/chrome independently with closeVisualHandoffProgress."
  "search_results_header_authority_singleton::\\bSearchResultsHeaderChromeAuthority\\b|\\bSearchResultsHeaderChromeSurfaceHost\\b|\\buseSearchResultsHeaderChromePublicationRuntime\\b::Results page title header must be owned by the ResultsPageBundle, not a module-level fixed-lane authority."
  "search_mounted_scene_chrome_authority::\\bSearchMountedSceneChromeAuthority\\b|\\bSearchMountedSceneChromeSurfaceHost\\b|\\bpublishSearchMountedSceneChromeSnapshot\\b|\\bSearchMountedSceneChromeSnapshot\\b::Search results must publish a single page bundle object, not separate mounted chrome surfaces."
  "search_results_fixed_header_component_lane::\\bfixedHeaderComponent\\b::Results page header must not be threaded through a separate fixed header component prop."
  "search_results_old_mounted_chrome_lane::sheet_mounted_chrome_overlay|result_page_sheet_chrome_overlay|mounted_behind_loading_cover|mountedChromeKey:\\s*'search'|mountedChromeKey\\s*=\\s*\"search\"::Results toggle/header contracts must name the results page bundle, not the old mounted chrome lane."
  # F7200/D114 (2026-08-07): this is one of the 9 RESIDUE checks (a bannable branch plus a
  # proximity branch). Its `BottomSheetSceneStackHost[\s\S]*FrostedGlassBackground` branch is
  # UNBOUNDED, so under rg -U it means "these two symbols must not share a file" — and it
  # matched exactly one file that merely MENTIONS both (overlays/BottomSheetSceneStackHost.tsx),
  # which is legal live code. That branch is deleted on F7200's residue measurement; the
  # bannable residue (`physicalSheetBackground`, 0 occurrences tree-wide) is kept as the
  # negative single-symbol ban the gate header demands.
  "scene_stack_host_shared_page_material::\\bphysicalSheetBackground\\b::Scene stack host must move/clip/present page bundles only; page material belongs to each page bundle."
  # DELETED F7200/D114 (2026-08-07) — scene_stack_inline_header_before_body ROTTED: surface="header": dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_dismiss_old_visual_handoff_telemetry::\\b(boundaryHandoffSource|handoffY|releaseDelayAfterVisualHandoffBoundaryMs|releasedAtVisualHandoffBoundary|collapsed_visual_boundary|visual_boundary)\\b::Search dismiss telemetry/contracts must use collapsed motion-plane boundary ownership, not old visual-handoff naming."
  "search_dismiss_delayed_post_restore_path::\\b(requestPostDismissDockedSceneRestore|restoreDockedSceneHostAtBoundary|restoredDockedSceneHostIntentIdRef)\\b|resultsDismissBottomHandoff[\\s\\S]{0,240}restoreDockedScene::Search dismiss boundary must synchronously publish the poll page through SearchSurfaceRuntime, not a delayed post-dismiss restore path."
  "search_dismiss_poll_release_nav_gate::const canReleaseDockedScene =[\\s\\S]{0,180}bottomNavReturnReady|const canCompleteDismissHandoff =[\\s\\S]{0,260}bottomNavReturnReady|const isReadyToReleaseDockedScene =[\\s\\S]{0,220}bottomNavReturnReady::Persistent-poll content handoff must release at the collapsed sheet boundary once poll header/body/host are ready; bottom-nav return is a separate visual fact, not a content-swap gate."
  "persistent_poll_prewarm_search_only_gate::\\bpollsPrewarmed\\b::Persistent poll prewarm must be substrate-owned from any idle scene once the polls input is ready, not limited to idle search. F7200/D114: converted from a proximity check to a negative ban."
  "search_dismiss_polls_panel_release_readiness::\\b(useDockedSceneSearchTransitionReadiness|PollsPanel:(isDockedSceneHeaderReady|isDockedSceneBodyReady|isDockedSceneHostReady))\\b::Mounted PollsPanel effects must not satisfy Search dismiss release readiness; release must come from route scene-stack mounted header/body/host evidence."
  "search_dismiss_sheet_host_release_readiness::\\bsheetHost:\\$\\{source\\}|markPollPagePartReady\\([\\s\\S]{0,120}sheetHost::Sheet-host generic renderability must not satisfy Search dismiss poll release readiness."
  # DELETED F7200/D114 (2026-08-07) — search_dismiss_attach_only_poll_body_readiness ROTTED: hasMountedPollBody: 0. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_dismiss_synthetic_poll_release_readiness::pollHeaderReady:\\s*pollBundle\\.chromeReady|pollBodyReady:\\s*pollBundle\\.bodyReady|pollHostReady:\\s*pollBundle\\.hostReady::Search dismiss prewarm must not satisfy persistent-poll release readiness; only sceneStack header/body/host evidence may release."
  "search_dismiss_poll_data_prewarm_requires_display_ready::shouldPrewarmSearchDismissPollDataLane[\\s\\S]{0,420}canDisplayDockedSceneSubstrate|shouldSyncSearchDismissDockedSceneDataPrewarmScene[\\s\\S]{0,420}canDisplayDockedSceneSubstrate::Persistent-poll data prewarm must depend on the active dismiss transaction, not on display/release readiness that the data lane itself must prove."
  "search_dismiss_publish_release_clears_transaction::private publishDismissTransaction\\([\\s\\S]{0,760}dismissTransaction:\\s*null::Dismiss release-ready must be observable; publishDismissTransaction may mark release-ready, but only completeDismissHandoff may clear the dismiss transaction."
  "search_dismiss_main_host_preboundary_poll_substrate::\\bisSearchDismissPollSubstratePrewarmed\\b|shouldKeepSearchSheetHostForPollRestore[\\s\\S]{0,220}\\bcanDisplayDockedSceneSubstrate\\b::The moving Search sheet host must not switch to polls before the collapsed boundary; poll substrate renders as a separate layer behind it."
  "search_dismiss_substrate_ready_logical_snap::canDisplayDockedSceneSubstrate[\\s\\S]{0,180}return 'collapsed'::Poll substrate readiness must not collapse the outgoing Search sheet host logical snap before boundary release."
  "search_surface_motion_plane_request_shared_values::\\b(dismissMotionRequest|openMotionRequest|requestDismissMotionStart|openRequestSeqRef|requestSearchDismissMotionPlaneImmediateStart)\\b::Search submit/dismiss motion must start from SearchSurfaceRuntime command target, not React/subscription request shared values."
  # MOVED F7200/D114 (2026-08-07) — search_surface_motion_plane_runonui_start was an UNBOUNDED `useSearchDismissMotionPlaneRuntime[\s\S]*X`
  # proximity regex, i.e. under rg -U a DEPENDENCY rule ("must not share a file"), not a proximity law.
  # It now lives as a no-restricted-imports rule in apps/mobile/.eslintrc.js scoped to
  # src/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts, which bans acquiring
  # the capability rather than calling it. `runOnUI` is legitimate in seven other modules, so no tree-wide ban could ever express this; only the file-scoped import ban can.
  "search_dismiss_press_up_full_snapshot_before_motion_arm::beginDismissTransaction\\(closeIntentId\\)|beginCloseTransition[\\s\\S]{0,260}getSearchSurfaceRuntime\\(\\)\\.beginDismissTransaction::Search dismiss press-up must arm the UI motion plane first; full SearchSurfaceRuntime publish/fanout belongs at the collapsed boundary."
  "search_surface_dismiss_full_publish_start_method::\\bbeginDismissTransaction\\b|\\bpublishArmedDismissTransaction\\b::Search dismiss start must use armDismissMotion plus commitDismissBoundary, not a during-motion full-publish path."
  "search_dismiss_motion_started_js_fanout::onMotionStarted|prewarmDockedLane|markPollPagePrewarmedForDismiss::Search dismiss must not publish route/surface/poll prewarm work from a motion-start callback during the visible movie."
  "search_results_ambiguous_commit_api::commitSearchSurfaceResultsTransaction::Search results presentation must distinguish enter presentation commits from exit commits; the old ambiguous commit API must not return."
  "search_enter_public_commit_writer::resultsRuntimeOwner\\.commitSearchSurfaceResultsEnterPresentation::Enter presentation commits must only come from the surface transaction coordinator, not public runtime-owner callers."
  "search_dismiss_press_up_enter_presentation_commit::useResultsSurfaceExitTransactionExecutionRuntime[\\s\\S]*commitSearchSurfaceResultsEnterPresentation\\(snapshot\\)::Search dismiss press-up must not run the enter presentation commit; exit uses its dedicated transaction commit."
  "search_pending_page_one_after_stage_patch::pending_page_one_commit_applied_after_stage|runDeferredStage[\\s\\S]{0,520}handlePageOneResultsCommitted\\(::Pending page-one results for a deferred stage must merge into the effective staged snapshot before publication, not patch the staged transaction afterward."
  "search_dismiss_press_up_immediate_ui_reset::handleCloseResultsUiReset\\(\\)|scheduleCloseSearchCleanup\\(closeIntentId\\)::Search dismiss press-up must not clear/reset the results UI before the motion-plane boundary."
  # DELETED F7200/D114 (2026-08-07) — search_dismiss_poll_restore_blank_results_chrome ROTTED: shouldClearSearchBarForPollRestore: 0. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "search_dismiss_page_bundle_transform_writer::resultPageBundleDismissAnimatedStyle::Search dismiss must not add a second page-bundle transform writer; SearchDismissMotionPlaneRuntime owns sheetTranslateY."
  "search_dismiss_nav_header_progress_owner::navReturnProgressSource:\\s*shouldDriveBottomNavReturnFromSearchCloseProgress\\s*\\?\\s*'searchHeaderDefaultChromeProgress'::Search dismiss nav return must derive from the dismiss motion plane, not header chrome progress."
  "search_close_cleanup_raf_handoff::pendingCloseCleanupFrameRef::Close cleanup must not use a RAF handoff to decide restored/closed visual state."
  "perf_scenario_harness_run_id_alias::harnessRunId::Perf scenario reports and app events must use scenarioRunId only."
  "perf_legacy_harness_env::EXPO_PUBLIC_PERF_HARNESS::Old env-driven perf harness switches must not return."
  "perf_legacy_harness_runtime_names::PerfHarness(Coordinator|Config|Runtime)|usePerfHarnessRuntimeStore|perfHarnessConfig::Old perf harness runtime names must not return."
  "perf_legacy_harness_observer_imports::use(Shortcut|NavSwitch)HarnessObserver::Old self-driving perf observers must not return."
  "docked_scene_restore_command_current_snap_compare::!== currentSnap\\b::Persistent polls restore commands must compare against physicalPollsSheetSnap, not synthetic currentSnap. F7200/D114: converted from a proximity check to a negative ban."
  "docked_scene_initial_snap_live_bypass::currentSnap !== 'hidden' && !isDockedSceneSearchSurfaceActive::Initial visible snap bootstrap must not special-case docked polls; once the shared sheet has a live snap, policy defaults cannot issue another bootstrap command."
  # DELETED F7200/D114 (2026-08-07) — docked_scene_restore_shortcut_without_motion ROTTED: both fragments dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "bottom_sheet_special_hidden_dismiss_resolver::SWIPE_DISMISS_INTENT|shouldResolveSwipeDismiss::Bottom-sheet dismiss must use the unified header-gated snap resolver, not a hidden-specific threshold path."
  "bottom_sheet_legacy_step_snap_resolver_owner::\\bresolveSteppedSnapPoint\\b::Gesture release must use the unified header-gated snap resolver, not the old step/skip resolver. F7200/D114: converted from a proximity check to a negative ban on the killed resolver."
  "search_marker_collision_release_settles_js_presentation::event\\.type === 'presentation_visual_sources_collision_released'[\\s\\S]{0,900}onMarkerExitSettled\\?\\.\\(::Fade-zero collision/source release must not be treated as full JS presentation settled."
  "search_marker_old_native_visual_lifecycle_states::\\.(fadingOut|collisionReleased)\\b::Native search map visuals must use explicit hidden/preparingReveal/revealing/visible/dismissing states, not the ambiguous lifecycle states."
  "profile_active_route_camera_push_gate::isSearchRestaurantRouteActive && routeIntent\\.targetCamera == null::Active search restaurant route opens must update in place even when the profile transaction has a camera target."
  # DELETED F7200/D114 (2026-08-07) — profile_open_route_camera_owner_gate ROTTED: both fragments dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  # DELETED F7200/D114 (2026-08-07) — profile_open_split_camera_padding_gate ROTTED: both fragments dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
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
  "search_map_label_solver_layer_gate::\\b(labelSolver|solverLayer|placementSolver|dotPlacementSolver|labelPlacementSolver)\\b::Search map labels use native rendered-candidate observation; solver-layer experiments must not return."
  "search_map_old_label_interaction_commit_gate::\\bcommitInteractionVisibility\\b::Visible label hits are committed from rendered label observation; the old label interaction visibility naming/path must not return."
  "search_map_shortcut_viewport_lod_skip_gate::canSkipSourceRebuildForShortcutViewport::Shortcut viewport changes must publish local LOD projection; only shortcut coverage fetch work may be skipped or coalesced."
  # DELETED F7200/D114 (2026-08-07) — profile_close_clear_after_closing_guard ROTTED: the middle fragment `if (transitionStatus === 'closing')` is dead. It could not fire even with rg -U; a check that cannot fire defends nothing.
  "profile_close_closing_guard_bare_return::if \\(transitionStatus === 'closing'\\) \\{[[:space:]]*return;::Profile close while already closing must re-enter prepared close so clear dismiss can upgrade the pending finalization."
  "profile_optimistic_highlight_timeout::\\bsetOptimisticSelectedRestaurantId\\b::Map optimistic highlight must be transaction/authority-scoped, not timeout-cleared. F7200/D114: converted from a proximity check to a negative ban on the killed setter."
  "profile_restaurant_panel_animate_on_mount::\\banimateOnMount:\\s*true\\b::Search restaurant content swaps must preserve sheet position; RestaurantPanel must not animate on mount. F7200/D114: converted from a proximity check to a negative ban."
  "profile_route_param_highlight_fallback::shellMapHighlightedRestaurantId\\s*\\?\\?\\s*mapHighlightedRestaurantId::Map highlight must be owned by the profile shell transaction, not route-param fallback."
  "profile_restaurant_motion_target_middle_current_snap::resolveCurrentSnapTarget:\\s*\\(\\)\\s*=>\\s*'middle'::Restaurant route motion target must resolve the live shared sheet snap, not assume middle."
  "profile_results_initial_snap_middle_coercion::searchSceneSheetPlaneRuntime\\.sheetState === 'expanded' \\? 'expanded' : 'middle'::Search results shell must preserve collapsed and expanded live snaps across profile/results content swaps."
  "profile_sheet_host_registration_initial_snap_seed::const initialSnap = activeRenderableShellSpec\\?\\.initialSnapPoint \\?\\? 'middle';::Sheet host runtime registration must seed from the live shared sheet snap, not the incoming content initial snap."
  "profile_results_collapsed_reseed_gate::shouldReseedSearchResultsFromCollapsed|searchResultsCollapsedReseedDispatchKey::Profile/results content swaps must preserve the live sheet snap, not revive a collapsed-results reseed lane."
  "scene_readiness_dead_spine::SceneReadinessGate|SceneReadinessContract::F1386 — the Phase 1 'universal per-scene readiness spine' was declared and used by nothing; must not return without a real producer and consumer."
  "scene_input_authority_dead_surface::clearAllSceneInputs|AppRouteStaticSceneInputKey::F1384 — clearAllSceneInputs was unreachable (not re-exported on RouteShellSceneInputLane) and AppRouteStaticSceneInputKey had zero referents; deleted."
  "nav_silhouette_duplicate_paint_height::expectedVisiblePaintedHeight::F1398(b) — always equal to expectedSheetMaskHeight on every path (the hideLead=1 always-green class); deleted."
  "f1033a_results_surface_policy_controller::createResultsSurfacePolicyController|ResultsSurfacePolicyController|resultsSurfacePolicyController|getSheetPolicyInputs|readReadModelPolicyDiagnostics::F1033(a): the write-only results-surface-policy-controller (constructed, fed via updateShellFacts/updatePanelInputs/reset, but never read via getSnapshot/getSheetPolicyInputs/readReadModelPolicyDiagnostics) was deleted 2026-08-05; the live panel state comes from use-search-root-search-scene-surface-panel-state-runtime.tsx. Must not return."
  # F6500/F6202 (2026-08-07): `restoreSaveSheetState` — a close/reopen save-sheet
  # restore lane with ZERO callers repo-wide — was deleted in 74ce55ba6. The
  # save_list_command_opens_scoped_route_gate below had asserted its PRESENCE, so
  # the deletion turned that gate RED; the assertion is re-expressed here in the
  # negative form this file's header demands.
  "save_list_restore_sheet_state_lane::\\brestoreSaveSheetState\\b::The zero-caller save-sheet restore lane was deleted (F6202); save-sheet open/restore is one setSaveSheetState path on the command controller."
  "f1033c_search_foreground_policy_readiness_flag::readyForPublication\\s*:\\s*true::F1033(c): the always-green readyForPublication:true literal on the zero-caller SearchForegroundPolicyDomainController.readDiagnostics() was deleted 2026-08-05 along with the method. Must not return."
)

declare -a PATH_CHECKS=(
  "search_map_native_camera_executor_path::(^|/)screens/Search/runtime/map/search-map-native-camera-executor\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted native camera executor file must not return (F1716/D61)."
  "search_chrome_scalar_surface_runtime_paths::(^|/)screens/Search/runtime/native/(search-chrome-scalar-surface|use-search-chrome-scalar-surface)[a-z-]*\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted scalar-surface JS runtime files must not return (F1700/D59)."
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
  "search_surface_redraw_coordinator_paths::(^|/)screens/Search/runtime/controller/search-surface-redraw-(coordinator|owner-runtime|phase-transition-runtime|phase|runtime|snapshot-runtime)\\.(ts|tsx|js|jsx|d\\.ts)$::The surface-redraw coordinator subsystem was deleted (F1735) and must not return."
  "search_surface_redraw_pressure_paths::(^|/)screens/Search/runtime/shared/(use-search-surface-redraw-stall-pressure-runtime|search-runtime-profiler-pressure-runtime|use-search-runtime-surface-redraw-telemetry-runtime|use-results-presentation-marker-enter-settle-runtime)\\.(ts|tsx|js|jsx|d\\.ts)$::The redraw pressure/settle/telemetry runtimes died with the coordinator (F1735) and must not return."
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
  "f1781_search_runtime_shared_dead_contract_cluster_paths::(^|/)screens/Search/runtime/shared/(route-overlay-command-input-snapshot-contract|search-suggestion-surface-scroll-input-contract|search-header-search-bar-interaction-input-contract|results-surface-read-model-policy-diagnostics|search-header-shortcuts-layout-input-contract|search-overlay-profiler-snapshot-contract|search-rank-and-score-sheets-input-contract|search-map-render-host-config-snapshot-contract|search-results-panel-card-runtime-contract|search-suggestion-surface-motion-input-contract|search-map-render-engine-inputs-snapshot-contract|search-header-search-this-area-visual-input-contract|search-foreground-policy-domain-diagnostics|search-bottom-nav-layout-input-contract|search-header-search-bar-layout-input-contract|search-header-shortcuts-interaction-input-contract|search-hidden-filters-warmup-state-input-contract|search-route-sheet-resolved-scene-selection-snapshot-contract|search-suggestion-surface-data-input-contract|search-result-row-header-chrome-boundary-telemetry|search-map-render-state-snapshot-contract|search-suggestion-surface-panel-input-contract|use-search-root-tab-scene-layout-runtime|search-header-search-this-area-interaction-input-contract|search-header-shortcuts-visual-input-contract|use-search-root-foreground-effects-runtime|search-runtime-bus-context|search-overlay-local-restaurant-sheet-render-snapshot-contract|search-suggestion-overlay-container-snapshot-contract|search-price-sheet-input-contract|search-header-search-bar-visual-input-contract|search-suggestion-surface-selection-input-contract|use-search-root-tab-root-overlay-key-runtime|search-map-render-presentation-props-snapshot-contract|search-suggestion-surface-layout-input-contract|use-search-root-search-scene-results-transaction-key-runtime)\\.(ts|tsx|js|jsx|d\\.ts)$::F1781: 36-file dead typed-contract/runtime-hook cluster (input/snapshot contracts, diagnostics, and unused runtime hooks) predating the F1730/F1734/F1736 collapse, recorded ESCALATED by F1010/F1011/F1033(c) and never wired; deleted 2026-08-04, must not return."
  "f1781_search_submit_runtime_utils_path::(^|/)screens/Search/hooks/search-submit-runtime-utils\\.(ts|tsx|js|jsx|d\\.ts)$::F1781: dead rate-limit/error-message/no-op-logger utils with zero consumers repo-wide; deleted 2026-08-04, must not return."
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


# ban_absent — sound single-symbol negative ban (F8800, 2026-08-07).
#
# F8900: `ban_absent` and `require_present` used to be defined here, ~80 lines
# that were the SIXTH hand-written copy of the same exit-status discrimination.
# They are now gate_ban_absent / gate_require_present from
# scripts/lib/gate-runner.sh — identical signature, identical contract:
#   0 → banned symbol present / required symbol present
#   1 → the only status that may be read as evidence (absent)
#   2 → invalid pattern → the check did NOT run → FAIL
#   * → rg broke or is missing → FAIL
# Usage: gate_ban_absent <id> <description> <pattern> <rg-flags-and-paths...>

SEARCH_SUBMIT_DISMISS_AUTHORITY_LIFECYCLE_PATTERN='(beginResultsEnter|beginResultsExit|markResultsHeaderReady|markPollsHeaderReady|mark[A-Za-z0-9_]*Settled)'
SEARCH_SUBMIT_DISMISS_AUTHORITY_FILE_PATTERN='(^|/)screens/Search/runtime/shared/search-submit-dismiss-transition-visual-authority\.(ts|tsx|js|jsx|d\.ts)$'

# ── F1793: A CHECK CANNOT BE FILED INTO THE WRONG MATCHER ──────────────────────
# F1792 (2026-08-05): two content checks were appended to PATH_CHECKS. PATH_CHECKS
# matches file PATHS, so a content pattern could never match — both entries passed
# unconditionally while reading as protection. Planting the banned symbol PASSED.
# The arrays are structurally identical bash strings, so the misfile was invisible
# by eye; the only tell was the summary line counting 57 path checks instead of 202
# content ones. Four earlier checks in this repo were also found wired to nothing.
#
# The invariant that makes it unrepresentable: a PATH pattern is anchored on a path
# boundary `(^|/)` (all 55 are, by construction — they match a path segment), and a
# CONTENT pattern never is (0 of 209). So the array a check belongs in is DERIVABLE
# from the check itself, and a mismatch is a load-time failure rather than a silent
# green. This runs before any scanning: a misfiled entry can never reach the loops.
#
# Deliberately NOT attempted: synthesising a matching input per entry to prove each
# check can go RED. An arbitrary regex is not invertible, so that "proof" would be
# a guess dressed as a guarantee — exactly the class this gate exists to kill. The
# shape rule is enforceable and complete; per-entry RED proofs stay a human duty at
# authoring time (see the RULE FOR ADDING CHECKS above).
shape_failures=0
for check in "${CONTENT_CHECKS[@]}" "${ROOT_CONTENT_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  if [[ "$pattern" == *'(^|/)'* ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: path-anchored pattern '(^|/)' in a CONTENT check — this belongs in PATH_CHECKS (F1793). A path pattern scanned against file CONTENT can never match, which is a permanently-green check." >&2
    shape_failures=$((shape_failures + 1))
  fi
done
for check in "${PATH_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  if [[ "$pattern" != *'(^|/)'* ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: PATH check without a path anchor '(^|/)' — a content pattern scanned against file PATHS can never match, which is a permanently-green check (F1792/F1793). Move it to CONTENT_CHECKS." >&2
    shape_failures=$((shape_failures + 1))
  fi
done
if [[ "$shape_failures" -gt 0 ]]; then
  echo "[app-route-runtime-delete-gate] FAILED shape validation ($shape_failures misfiled checks) — no scanning was attempted." >&2
  exit 1
fi

for check in "${CONTENT_CHECKS[@]}"; do
  id="${check%%::*}"
  rest="${check#*::}"
  pattern="${rest%%::*}"
  description="${rest#*::}"

  set +e
  # Specs are excluded: invariant-proof tests QUOTE the exterminated patterns
  # (RED recipes, mutation probes) — this collision bit twice (bookmarks spec
  # 08-03; route-entry-origin-camera.spec 08-04/F1664) before the exclusion.
  #
  # -U IS LOAD-BEARING (F7200/D114, 2026-08-07). Without it rg matches LINE BY
  # LINE, so every `[\s\S]{0,N}` co-location distance in these patterns meant
  # "N characters WITHIN ONE LINE" — and in prettier-formatted TypeScript the
  # forbidden shapes these checks describe (a statement then a return then
  # another statement; a JSX element then a prop) physically cannot occupy one
  # line. The whole proximity class was therefore INERT from birth; its only
  # two firings ever were on COMMENTS, the one place two anchors do share a
  # line. The flag was measured before it landed: it produced exactly three new
  # matches, all three of which are deleted in this same commit (two ROTTED
  # proximity checks and one residue proximity branch). Do not remove it —
  # without it 200 checks are comments with a CI job attached.
  matches="$(rg -n --pcre2 -U --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' "$pattern" "$TARGET_PATH" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 2 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: invalid pattern" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: rg exited with status $status" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
elif [[ "$map_interaction_camera_command_status" -eq 0 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL map_interaction_camera_command_path: Map idle must mirror observed camera state, not command native camera movement." >&2
  echo "$map_interaction_camera_command_matches" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
elif [[ "$map_interaction_camera_command_status" -eq 1 ]]; then
  echo "[app-route-runtime-delete-gate] PASS map_interaction_camera_command_path"
else
  echo "[app-route-runtime-delete-gate] FAIL map_interaction_camera_command_path: rg exited with status $map_interaction_camera_command_status" >&2
  echo "$map_interaction_camera_command_matches" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
fi

camera_intent_arbiter_file="$TARGET_PATH/screens/Search/runtime/map/camera-intent-arbiter.ts"
map_interaction_controller_file="$TARGET_PATH/screens/Search/runtime/map/map-interaction-controller.ts"
sheet_host_authority_file="$TARGET_PATH/navigation/runtime/app-route-sheet-host-authority-controller.ts"
if [[ -e "$camera_intent_arbiter_file" ]] && {
  ! rg -q --fixed-strings "syncObservedCameraViewport" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "if (this.pendingProgrammaticCameraCompletionId != null)" "$camera_intent_arbiter_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL map_idle_camera_mirror_pending_completion_gate: Observed map-idle camera mirroring must not fight active programmatic camera commands." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS map_idle_camera_mirror_pending_completion_gate"
fi

if [[ -e "$map_interaction_controller_file" ]] && {
  ! rg -q --fixed-strings "if (isProfilePresentationActive)" "$map_interaction_controller_file" ||
  ! rg -q --fixed-strings "cameraIntentArbiter.syncObservedCameraViewport" "$map_interaction_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL map_idle_profile_camera_mirror_gate: Map idle must not mirror React camera state while profile presentation owns camera padding and motion." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS map_idle_profile_camera_mirror_gate"
fi

if [[ -e "$sheet_host_authority_file" ]] && {
  ! rg -q --fixed-strings "private sharedRuntimeModel:" "$sheet_host_authority_file" ||
  ! rg -q --fixed-strings "const resolvedRuntimeModel = canRenderSurface ? this.sharedRuntimeModel : null" "$sheet_host_authority_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_search_origin_shared_sheet_runtime_gate: Search-root surfaces must use the single shared sheet runtime model directly; page-local runtime models must not split from the visible sheet command owner." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_search_origin_shared_sheet_runtime_gate"
fi

results_close_actions_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-actions-runtime.ts"
profile_bridge_publication_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-root-profile-bridge-publication-runtime.ts"
foreground_clear_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-foreground-clear-runtime.ts"
if [[ -e "$foreground_clear_file" ]] && ! rg -q -U --pcre2 "const hasSearchToClose =[\\s\\S]{0,180}profilePresentationActive" "$foreground_clear_file"; then
  echo "[app-route-runtime-delete-gate] FAIL profile_foreground_clear_uses_results_exit_gate: Foreground clear must route active profile dismiss through the results exit transaction even after search state is partially cleared." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: rg exited with status $status" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  fi
done

search_map_component_file="$TARGET_PATH/screens/Search/components/search-map.tsx"
# profile_camera_completion_native_payload_gate RETIRED (F1716/D61): it positively pinned the
# native camera executor file, which is now BANNED (search_map_native_camera_executor_path +
# camera_native_fallback_lane above). Completion ids ride the cameraRef stop; the arbiter
# gate below still requires the deferred-state machinery.

search_map_presentation_file="$TARGET_PATH/screens/Search/runtime/controller/search-root-map-presentation-controller-runtime.ts"
if [[ -e "$search_map_component_file" ]] && [[ -e "$search_map_presentation_file" ]] && {
  ! rg -q --fixed-strings "onCameraAnimationComplete={handleCameraAnimationComplete}" "$search_map_component_file" ||
  ! rg -q --fixed-strings "cameraIntentArbiter.handleProgrammaticCameraAnimationCompletion" "$search_map_presentation_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_completion_event_gate: Mapbox camera animation completion must feed the camera arbiter." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_completion_event_gate"
fi

camera_intent_arbiter_file="$TARGET_PATH/screens/Search/runtime/map/camera-intent-arbiter.ts"
route_scene_camera_motion_target_file="$TARGET_PATH/navigation/runtime/use-app-route-scene-camera-motion-target-runtime.ts"
if [[ -e "$camera_intent_arbiter_file" ]] && {
  ! rg -q --fixed-strings "parkedIntent" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "notifyCameraWriterAvailable" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "deferControlledCameraStateUntilCompletion" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "pendingControlledCameraStateSync" "$camera_intent_arbiter_file" ||
  ! rg -q --fixed-strings "flushControlledCameraStateSync" "$camera_intent_arbiter_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_park_and_deferred_state_gate: The arbiter must PARK a hostless commit (D61 park-and-replay) and defer controlled camera state until completion." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_camera_park_and_deferred_state_gate"
fi

if [[ -e "$route_scene_camera_motion_target_file" ]] && {
  ! rg -q --fixed-strings "deferControlledCameraStateUntilCompletion: true" "$route_scene_camera_motion_target_file" ||
  ! rg -q --fixed-strings "pendingCameraStateRef.current.set" "$route_scene_camera_motion_target_file" ||
  ! rg -q --fixed-strings "payload.status === 'finished' && pendingCameraState" "$route_scene_camera_motion_target_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_route_camera_restore_deferred_state_gate: Route profile close/restore camera must defer React camera state until native animation completion." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_route_camera_restore_deferred_state_gate"
fi

native_camera_executor_file="$TARGET_PATH/screens/Search/runtime/map/search-map-native-camera-executor.ts"
profile_route_normalizer_file="$TARGET_PATH/navigation/runtime/app-route-profile-route-intent-normalizer.ts"
route_scene_switch_controller_file="$TARGET_PATH/navigation/runtime/app-route-scene-switch-controller.ts"
if [[ -e "$profile_route_normalizer_file" ]] && [[ -e "$route_scene_switch_controller_file" ]] && {
  ! rg -q --fixed-strings "routeAction: 'updateActive'" "$profile_route_normalizer_file" ||
  ! rg -q --fixed-strings "case 'updateActive'" "$route_scene_switch_controller_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_active_route_update_settle_gate: Active restaurant route changes must update in place through a route switch motion transaction." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_source_frame_reactive_selector_gate"
fi

if [[ -e "$search_map_engine_component_file" ]] && ! rg -q --fixed-strings "selectedRestaurantId: highlightedRestaurantId" "$search_map_engine_component_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_scene_selected_id_gate: SearchMap scene selection must come from the active highlighted restaurant id, not hardcoded null." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_scene_selected_id_gate"
fi

if [[ -e "$search_map_component_file" ]]; then
  gate_ban_absent search_map_selection_shell_authority_gate \
    "Source-frame selected ids must not keep map highlight alive after profile close clears shell selection." \
    "directSourceFrameStores.selectedRestaurantId ?? selectedRestaurantId" \
    --fixed-strings "$search_map_component_file"
  gate_require_present search_map_selection_shell_authority_gate \
    "Source-frame selected ids must not keep map highlight alive after profile close clears shell selection." \
    "const authoritativeSelectedRestaurantId = selectedRestaurantId;" \
    --fixed-strings "$search_map_component_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_selection_shell_authority_gate"
fi

profile_open_plan_file="$TARGET_PATH/screens/Search/runtime/profile/profile-open-presentation-plan-runtime.ts"
if [[ -e "$profile_open_plan_file" ]] && ! rg -q --fixed-strings "source === 'results_sheet' && Boolean(pressedCoordinate)" "$profile_open_plan_file"; then
  echo "[app-route-runtime-delete-gate] FAIL profile_open_pressed_coordinate_authority_gate: Map pin/label opens must prefer the rendered tapped coordinate whenever one is present." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_open_pressed_coordinate_authority_gate"
fi

search_map_render_controller_file="$TARGET_PATH/screens/Search/runtime/map/search-map-render-controller.ts"
search_map_render_controller_native_file="$REPO_ROOT/apps/mobile/ios/cravesearch/SearchMapRenderController.swift"
search_map_render_controller_android_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java"
# F6500 (2026-08-07): this pin used to name UIFrameSamplerBridge.m. 669640f19 split
# that omnibus bridge into one file per Swift module and repointed
# perf-scenario-parity-contracts.js in the same commit — but NOT this gate, which
# went RED on the very next CI run (31063713439, 2026-08-06T01:46Z). The SUBJECT
# moved; the law held (the other 14 clauses of the press-owner gate all still hit,
# and the RCT_EXTERN_METHOD is byte-identical in its new home). No map production
# code was touched.
search_map_render_controller_ios_bridge_file="$REPO_ROOT/apps/mobile/ios/cravesearch/SearchMapRenderControllerBridge.m"
if [[ -e "$search_map_render_controller_android_file" ]] && {
  ! rg -q --fixed-strings "didClearSettledVisibleLabelHits" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "didClearVisibleLabelHits" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "labelFamilyState.labelObservation.observationEnabled" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "labelObservation.settledVisibleFeatureIds.clear()" "$search_map_render_controller_android_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_android_label_interaction_terminal_clear_gate: Android label interaction visibility must snap empty on close/dismiss and reject stale in-flight observation commits." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_label_interaction_terminal_clear_gate"
fi

if [[ -e "$search_map_render_controller_native_file" ]]; then
  gate_ban_absent search_map_pin_interaction_live_policy_gate \
    "Pin interaction geometry must publish with desired pins, not wait for visual transition opacity to settle." \
    'let shouldRenderPinInteraction =\s*renderState\.isDesiredPresent &&\s*renderState\.currentOpacity >= 0\.999' \
    --pcre2 "$search_map_render_controller_native_file"
fi
if [[ -e "$search_map_render_controller_android_file" ]]; then
  gate_ban_absent search_map_pin_interaction_live_policy_gate \
    "Pin interaction geometry must publish with desired pins, not wait for visual transition opacity to settle." \
    'boolean shouldRenderPinInteraction =\s*desiredPresent &&\s*\(transition == null \|\| transition\.targetOpacity != 1d\)' \
    --pcre2 "$search_map_render_controller_android_file"
fi
if [[ ! -e "$search_map_render_controller_native_file" && ! -e "$search_map_render_controller_android_file" ]]; then
  echo "[app-route-runtime-delete-gate] PASS search_map_pin_interaction_live_policy_gate"
fi

if [[ -e "$search_map_render_controller_native_file" ]]; then
  gate_ban_absent search_map_pin_visual_opacity_preroll_gate \
    "Pin/source visual opacity fallbacks must store settled visible values; transient presentation or LOD opacity belongs to feature-state animation, and placement preroll is only for label/collision readiness." \
    '"nativeLodOpacity": placementPrerollOpacity' \
    --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_pin_visual_opacity_preroll_gate \
    "Pin/source visual opacity fallbacks must store settled visible values; transient presentation or LOD opacity belongs to feature-state animation, and placement preroll is only for label/collision readiness." \
    '"nativeLodRankOpacity": placementPrerollOpacity' \
    --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_pin_visual_opacity_preroll_gate \
    "Pin/source visual opacity fallbacks must store settled visible values; transient presentation or LOD opacity belongs to feature-state animation, and placement preroll is only for label/collision readiness." \
    '"nativeLodOpacity": renderState.currentOpacity' \
    --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_pin_visual_opacity_preroll_gate \
    "Pin/source visual opacity fallbacks must store settled visible values; transient presentation or LOD opacity belongs to feature-state animation, and placement preroll is only for label/collision readiness." \
    '"nativeLodRankOpacity": renderState.currentOpacity' \
    --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_pin_visual_opacity_preroll_gate \
    "Pin/source visual opacity fallbacks must store settled visible values; transient presentation or LOD opacity belongs to feature-state animation, and placement preroll is only for label/collision readiness." \
    '"nativePresentationOpacity": state.currentPresentationOpacityValue' \
    --fixed-strings "$search_map_render_controller_native_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_pin_visual_opacity_preroll_gate"
fi

if [[ -e "$search_map_render_controller_native_file" ]]; then
  gate_ban_absent search_map_native_feature_state_merge_apply_gate \
    "Native source mutation must apply the merged mounted feature-state, not the raw parsed collection state, so dismiss opacity cannot be cleared and fall back to visible source properties." \
    "featureStateById: plan.next.featureStateById" \
    --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_native_feature_state_merge_apply_gate \
    "Native source mutation must apply the merged mounted feature-state, not the raw parsed collection state, so dismiss opacity cannot be cleared and fall back to visible source properties." \
    "nextFeatureStateRevision: plan.next.featureStateRevision" \
    --fixed-strings "$search_map_render_controller_native_file"
fi
if [[ -e "$search_map_render_controller_android_file" ]]; then
  gate_require_present search_map_native_feature_state_merge_apply_gate \
    "Native source mutation must apply the merged mounted feature-state, not the raw parsed collection state, so dismiss opacity cannot be cleared and fall back to visible source properties." \
    "plan.nextSourceState.featureStateRevision" \
    --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_native_feature_state_merge_apply_gate \
    "Native source mutation must apply the merged mounted feature-state, not the raw parsed collection state, so dismiss opacity cannot be cleared and fall back to visible source properties." \
    "plan.nextSourceState.featureStateById" \
    --fixed-strings "$search_map_render_controller_android_file"
fi
if [[ ! -e "$search_map_render_controller_native_file" && ! -e "$search_map_render_controller_android_file" ]]; then
  echo "[app-route-runtime-delete-gate] PASS search_map_native_feature_state_merge_apply_gate"
fi

search_map_native_render_owner_file="$TARGET_PATH/screens/Search/components/hooks/use-search-map-native-render-owner.ts"
if [[ -e "$search_map_component_file" ]] &&
  [[ -e "$search_map_render_controller_file" ]] &&
  [[ -e "$search_map_render_controller_native_file" ]] &&
  [[ -e "$search_map_render_controller_android_file" ]] &&
  [[ -e "$search_map_render_controller_ios_bridge_file" ]]; then
  search_map_native_first_press_owner_desc="Map press ownership must stay native-first on iOS and Android, with RNMBX press handlers disabled and no stale generic pin hitbox path."
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "searchMapRenderController.platform === 'ios' ||" --fixed-strings "$search_map_component_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "searchMapRenderController.platform === 'android'" --fixed-strings "$search_map_component_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "const handleMapViewPress = undefined;" --fixed-strings "$search_map_component_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "const handleMarkerScenePressTarget = undefined;" --fixed-strings "$search_map_component_file"
  gate_ban_absent search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "handleMapPress" --fixed-strings "$search_map_component_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    ".configureNativePressTargeting({" --fixed-strings "$search_map_component_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "type: 'native_press_target_resolved'" --fixed-strings "$search_map_render_controller_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "configureNativePressTargeting is required on \${Platform.OS}" --fixed-strings "$search_map_render_controller_file"
  gate_ban_absent search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "pinTapHitbox" --fixed-strings "$search_map_render_controller_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "private final class NativePressLifecycleGestureRecognizer" --fixed-strings "$search_map_render_controller_native_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "\"type\": \"native_press_target_resolved\"" --fixed-strings "$search_map_render_controller_native_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "public void configureNativePressTargeting(ReadableMap payload, Promise promise)" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "handleNativePressTouch(state.mapTag, motionEvent)" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "native_press_target_resolved" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_native_first_press_owner_gate "$search_map_native_first_press_owner_desc" \
    "RCT_EXTERN_METHOD(configureNativePressTargeting:(NSDictionary *)payload" --fixed-strings "$search_map_render_controller_ios_bridge_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_native_first_press_owner_gate"
fi

if [[ -e "$search_map_render_controller_android_file" ]]; then
  search_map_android_press_target_parity_desc="Android press target resolution must support visible glyph dot layers and avoid the old pin/label-only resolver."
  gate_require_present search_map_android_press_target_parity_gate "$search_map_android_press_target_parity_desc" \
    "ArrayList<String> dotLayerIds" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_android_press_target_parity_gate "$search_map_android_press_target_parity_desc" \
    "queryRenderedDotPressTarget(" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_android_press_target_parity_gate "$search_map_android_press_target_parity_desc" \
    "buildRenderedDotPressTarget(" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_android_press_target_parity_gate "$search_map_android_press_target_parity_desc" \
    "state.dotSourceId" --fixed-strings "$search_map_render_controller_android_file"
  gate_ban_absent search_map_android_press_target_parity_gate "$search_map_android_press_target_parity_desc" \
    "pinLayerIds.isEmpty() && labelLayerIds.isEmpty())" --fixed-strings "$search_map_render_controller_android_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_press_target_parity_gate"
fi

if [[ -e "$search_map_render_controller_android_file" ]] && {
  ! rg -q --fixed-strings "final Set<String> highlightedMarkerKeys = new LinkedHashSet<>()" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "String highlightedRestaurantId;" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "parseStringSet(payload, \"highlightedMarkerKeys\")" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "restaurantIdFromFeature(feature)" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "Generic suppression disables native press resolution through interactionMode" "$search_map_render_controller_android_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_android_highlight_group_parity_gate: Android map render owner must honor iOS selected-location groups and must not clear mounted interaction sources for non-terminal suppression." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_highlight_group_parity_gate"
fi

profile_command_executor_file="$TARGET_PATH/screens/Search/runtime/profile/profile-prepared-presentation-command-executor.ts"
if [[ -e "$profile_command_executor_file" ]] && {
  ! rg -q --fixed-strings "didAcceptProfileCameraTargetCommand" "$profile_command_executor_file" ||
  ! rg -q --fixed-strings "type: 'camera_settled'" "$profile_command_executor_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL profile_camera_command_ack_gate: Rejected profile camera commands must explicitly settle/cancel the camera transaction leg." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_close_clears_map_highlight_gate"
fi

results_close_actions_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-actions-runtime.ts"
results_close_finalize_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-transition-finalize-runtime.ts"
profile_bridge_publication_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-root-profile-bridge-publication-runtime.ts"
if [[ -e "$results_close_actions_file" ]] && [[ -e "$results_close_finalize_file" ]] && [[ -e "$profile_bridge_publication_file" ]]; then
  profile_terminal_dismiss_single_owner_desc="Terminal dismiss from profile must use a dedicated restore-only profile bridge and leave search clear/sheet collapse to the results exit transaction."
  gate_ban_absent profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "dismissBehavior: 'clear'" --fixed-strings "$results_close_actions_file"
  gate_ban_absent profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "dismissBehavior: 'restore'" --fixed-strings "$results_close_actions_file"
  gate_require_present profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "prepareRestaurantProfileForTerminalSearchDismissRef.current();" --fixed-strings "$results_close_actions_file"
  gate_require_present profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "prepareRestaurantProfileForTerminalSearchDismiss" --fixed-strings "$profile_bridge_publication_file"
  gate_ban_absent profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "closeRestaurantProfile({" --fixed-strings "$profile_bridge_publication_file"
  gate_require_present profile_terminal_dismiss_single_owner_gate "$profile_terminal_dismiss_single_owner_desc" \
    "skipProfileDismissClear: terminalDismissSource !== 'profile'" --fixed-strings "$results_close_finalize_file"
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
if [[ -e "$restaurant_route_sheet_surface_file" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL parent_scoped_restaurant_shared_scene_gate: Non-search restaurant routes must not mount a separate global RestaurantRouteSheetSurface." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_local_sheet_runtime_deleted_gate"
fi

if [[ -e "$TARGET_PATH" ]]; then
  gate_ban_absent restaurant_global_source_contract_gate \
    "Restaurant route ownership must not use raw source:'global'; non-search restaurants must be parent-scoped children." \
    "source\\??:\\s*'search'\\s*\\|\\s*'global'|source:\\s*'global'" \
    --pcre2 "$TARGET_PATH"
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_global_source_contract_gate"
fi

restaurant_route_types_contract_file="$TARGET_PATH/navigation/runtime/app-overlay-route-types.ts"
# F9950 (2026-08-07) GATE ROT: two legitimate rederivations changed the spelling of this
# law without weakening it. a45b4a900/F5801 deleted `requiresOwnerSceneKey` from the route
# metadata (23 hits, all declarations/literals, ZERO readers — `role: 'child'` +
# `productSceneKey: null` already carried the fact). 6bf694e82/F5800 narrowed the restaurant
# params to {restaurantId, source?} after showing the five ownership params had no writer.
# The surviving, enforceable law: restaurant is a child route with no product scene of its
# own, riding the SHARED physical sheet, and its only source is 'search'.
if [[ -e "$restaurant_route_types_contract_file" ]] && {
  ! rg -q -U --pcre2 "restaurant\\?: \\{\\s*restaurantId: string \\| null;\\s*source\\?: 'search';\\s*\\}" "$restaurant_route_types_contract_file" ||
  ! rg -q -U --pcre2 "restaurant: \\{\\s*role: 'child',\\s*productSceneKey: null,[\\s\\S]{0,150}?sheetPolicy: 'sharedPhysicalSheet'" "$restaurant_route_types_contract_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL restaurant_parent_scoped_route_contract_gate: Restaurant routes must stay owner-scoped shared-sheet children (role child, no product scene) whose only source is 'search'." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_parent_scoped_route_contract_gate"
fi

native_overlay_target_authorities_file="$TARGET_PATH/navigation/runtime/app-route-native-overlay-target-authorities.ts"
app_route_scene_policy_registry_file="$TARGET_PATH/navigation/runtime/app-route-scene-policy-registry.ts"
if [[ -e "$native_overlay_target_authorities_file" ]]; then
  gate_ban_absent restaurant_shared_sheet_suppression_gate \
    "Shared sheet suppression must not branch on restaurant source; only root restaurant routes stay outside the shared shell." \
    "restaurant[\\s\\S]{0,240}source|source[\\s\\S]{0,240}restaurant" \
    --pcre2 "$native_overlay_target_authorities_file"
else
  echo "[app-route-runtime-delete-gate] PASS restaurant_shared_sheet_suppression_gate"
fi

app_overlay_route_types_file="$TARGET_PATH/navigation/runtime/app-overlay-route-types.ts"
app_overlay_route_command_runtime_file="$TARGET_PATH/navigation/runtime/app-overlay-route-command-runtime.ts"
if [[ -e "$app_overlay_route_command_runtime_file" ]]; then
  gate_ban_absent app_route_command_uses_taxonomy_gate \
    "Route command runtime must use app-overlay route taxonomy instead of a local transition-scene key list." \
    "APP_ROUTE_TRANSITION_SCENE_KEYS" \
    --fixed-strings "$app_overlay_route_command_runtime_file"
else
  echo "[app-route-runtime-delete-gate] PASS app_route_command_uses_taxonomy_gate"
fi

poll_creation_panel_spec_file="$TARGET_PATH/overlays/useSearchRoutePollCreationPanelSpec.ts"
if [[ -e "$poll_creation_panel_spec_file" ]]; then
  gate_ban_absent poll_creation_child_snap_is_not_parent_snap_gate \
    "Poll creation is a Polls child and must not write child settles into Polls snap memory." \
    "recordRouteSceneSheetSettle\\([\\s\\S]{0,160}sceneKey:\\s*'polls'" \
    --pcre2 "$poll_creation_panel_spec_file"
else
  echo "[app-route-runtime-delete-gate] PASS poll_creation_child_snap_is_not_parent_snap_gate"
fi

app_route_static_scene_descriptor_file="$TARGET_PATH/navigation/runtime/app-route-static-scene-descriptor-controller.ts"
app_route_overlay_command_controller_file="$TARGET_PATH/navigation/runtime/app-route-overlay-command-controller.ts"
# F9950 (2026-08-07) GATE ROT, same two rederivations as the restaurant gate above:
# a45b4a900/F5801 deleted the readerless `requiresOwnerSceneKey` flag, and 6bf694e82/F5424
# collapsed parentSceneKey/ownerSceneKey — one fact that could never differ — onto
# ownerSceneKey. The law is unchanged: saveList is a shared-sheet child whose params name
# the owning scene and a route instance, and it is never a paramless route.
if [[ -e "$app_overlay_route_types_file" ]] && {
  ! rg -q -U --pcre2 "saveList: \\{\\s*role: 'child',\\s*productSceneKey: null,[\\s\\S]{0,150}?sheetPolicy: 'sharedPhysicalSheet'" "$app_overlay_route_types_file" ||
  rg -q --fixed-strings "saveList?: undefined" "$app_overlay_route_types_file" ||
  ! rg -q -U --pcre2 "saveList\\?: \\{[\\s\\S]{0,150}?ownerSceneKey: AppOverlayTopLevelProductRouteKey;[\\s\\S]{0,100}?routeInstanceId: string;" "$app_overlay_route_types_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL save_list_scoped_route_contract_gate: saveList must stay an owner-scoped shared-sheet route child with explicit owner + route instance params." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS save_list_scoped_route_contract_gate"
fi

if [[ -e "$app_route_overlay_command_controller_file" ]]; then
  save_list_command_opens_scoped_route_desc="Save sheet open/restore must flow through the command controller and push the scoped saveList route."
  gate_require_present save_list_command_opens_scoped_route_gate "$save_list_command_opens_scoped_route_desc" \
    "routeOverlayRouteCommandRuntime.pushRoute('saveList'" --fixed-strings "$app_route_overlay_command_controller_file"
  gate_require_present save_list_command_opens_scoped_route_gate "$save_list_command_opens_scoped_route_desc" \
    "routeOverlayRouteCommandRuntime.closeActiveRoute()" --fixed-strings "$app_route_overlay_command_controller_file"
  gate_ban_absent save_list_command_opens_scoped_route_gate "$save_list_command_opens_scoped_route_desc" \
    'setSaveSheetState\(\{[\s\S]{0,120}visible:\s*true' \
    --pcre2 "$TARGET_PATH" --glob '!navigation/runtime/app-route-overlay-command-controller.ts'
else
  echo "[app-route-runtime-delete-gate] PASS save_list_command_opens_scoped_route_gate"
fi

if [[ -e "$app_route_static_scene_descriptor_file" ]]; then
  gate_ban_absent save_list_child_snap_is_not_parent_snap_gate \
    "saveList uses the shared physical shell and must not keep independent scene snap memory." \
    "recordRouteSceneSheetSettle\\([\\s\\S]{0,180}sceneKey:\\s*'saveList'" \
    --pcre2 "$app_route_static_scene_descriptor_file"
else
  echo "[app-route-runtime-delete-gate] PASS save_list_child_snap_is_not_parent_snap_gate"
fi

favorite_list_detail_scene_writer_file="$TARGET_PATH/navigation/runtime/use-app-route-favorite-list-detail-scene-input-writer-runtime.tsx"
favorite_list_detail_route_actions_file="$TARGET_PATH/navigation/runtime/use-favorite-list-detail-route-actions.ts"
favorite_list_detail_screen_file="$TARGET_PATH/screens/FavoritesListDetail.tsx"
app_shell_main_navigator_file="$TARGET_PATH/navigation/runtime/AppShellMainNavigator.tsx"
root_navigation_types_file="$TARGET_PATH/types/navigation.ts"
# Each arm of the former if/elif chain is an independent negative ban sharing one id;
# routing each through ban_absent (per the compound-arm guidance) gives every arm
# exit-2 discrimination. A match on any arm fails the gate, as before.
if [[ -e "$TARGET_PATH" ]]; then
  gate_ban_absent favorite_list_detail_no_native_navigation_gate \
    "Favorites list detail must open as a parent-scoped route child, not native stack navigation." \
    "navigate('FavoritesListDetail'" \
    --fixed-strings "$TARGET_PATH"
  gate_ban_absent favorite_list_detail_no_native_navigation_gate \
    "Favorites list detail must open as a parent-scoped route child, not native stack navigation." \
    'navigate("FavoritesListDetail"' \
    --fixed-strings "$TARGET_PATH"
fi
if [[ -e "$app_shell_main_navigator_file" ]]; then
  gate_ban_absent favorite_list_detail_no_native_navigation_gate \
    "FavoritesListDetail must not be registered as a native stack modal." \
    "FavoritesListDetail" \
    --fixed-strings "$app_shell_main_navigator_file"
fi
if [[ -e "$root_navigation_types_file" ]]; then
  gate_ban_absent favorite_list_detail_no_native_navigation_gate \
    "FavoritesListDetail must not be part of the native root stack params." \
    "FavoritesListDetail" \
    --fixed-strings "$root_navigation_types_file"
fi

if [[ -e "$favorite_list_detail_screen_file" ]]; then
  gate_ban_absent favorite_list_detail_hydration_failure_keeps_seed_gate \
    "Favorites list detail restaurant hydration GATE_FAILURES must keep the seeded restaurant route open and clear loading, not close the route." \
    "closeRestaurantRoute(sessionToken)" \
    --fixed-strings "$favorite_list_detail_screen_file"
else
  echo "[app-route-runtime-delete-gate] PASS favorite_list_detail_hydration_failure_keeps_seed_gate"
fi

if [[ -e "$favorite_list_detail_scene_writer_file" ]] && {
  ! rg -q --fixed-strings "publishRouteSceneDescriptor" "$favorite_list_detail_scene_writer_file" ||
  ! rg -q --fixed-strings "sceneKey: 'favoriteListDetail'" "$favorite_list_detail_scene_writer_file" ||
  ! rg -q --fixed-strings "clearRouteSceneInput('favoriteListDetail')" "$favorite_list_detail_scene_writer_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_scene_input_writer_gate: Favorites list detail must publish content/chrome/state into the shared route scene input lane." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
elif [[ -e "$TARGET_PATH" ]] && rg -q -U --pcre2 "recordRouteSceneSheetSettle\\([\\s\\S]{0,180}favoriteListDetail|settleRouteSceneTabSnap\\([\\s\\S]{0,180}favoriteListDetail|recordPersistentSnap\\([\\s\\S]{0,180}favoriteListDetail" "$TARGET_PATH"; then
  echo "[app-route-runtime-delete-gate] FAIL favorite_list_detail_child_snap_is_not_parent_snap_gate: Favorites list detail uses the shared physical shell and must not keep independent scene snap memory." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
android_package_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerPackage.java"
android_sheet_mask_view_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchRouteSheetNavExclusionMaskView.java"
android_nav_silhouette_view_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/SearchRouteNavSilhouetteHostView.java"
android_bottom_sheet_host_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/BottomSheetHostView.java"
android_bottom_sheet_host_manager_file="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave/BottomSheetHostViewManager.java"
android_native_root="$REPO_ROOT/apps/mobile/android/app/src/main/java/com/crave"
if [[ -e "$nav_silhouette_authority_file" ]] && {
  ! rg -q --fixed-strings "const isPersistentAppRouteNavSilhouetteMode =" "$nav_silhouette_authority_file" ||
  ! rg -q --fixed-strings "return isPersistentAppRouteNavSilhouetteMode(mode) ? 0 : Math.max(0, navTranslateY);" "$nav_silhouette_authority_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_forces_visible_boundary_gate: Persistent nav silhouette modes must ignore stale hidden nav translate and keep full sheet exclusion active." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_nav_silhouette_forces_visible_boundary_gate"
fi

if [[ -e "$nav_silhouette_authority_file" ]] && ! rg -q --fixed-strings "const sheetBottomExclusionHeight = bottomNavHeight;" "$nav_silhouette_authority_file"; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_cutout_reveal_boundary_gate: Persistent sheet snaps and masks must stop at the nav body while the painted cutout reveals sheet chrome behind it." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_nav_silhouette_cutout_reveal_boundary_gate"
fi

if [[ -e "$search_route_sheet_frame_host_file" ]] && {
  ! rg -q --fixed-strings "modeValue: AppRouteNavSilhouetteSheetExclusionModeValue;" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "if (isPersistentNavBodyExclusionMode(modeValue))" "$search_route_sheet_frame_host_file" ||
  ! rg -q --fixed-strings "navBodyBoundaryTranslateY: boundaryTranslateY" "$search_route_sheet_frame_host_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_sheet_mask_boundary_mode_gate: Native sheet mask boundary translation must be resolved from exclusion mode, not raw nav translate alone." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS persistent_sheet_hard_clip_boundary_gate"
fi

if [[ -e "$nav_silhouette_host_file" ]] && {
  ! rg -q --fixed-strings "const useStartupBottomNavVisualInputs =" "$nav_silhouette_host_file" ||
  ! rg -q --fixed-strings "getSearchStartupGeometrySeed()" "$nav_silhouette_host_file" ||
  ! rg -q --fixed-strings "bottomNavVisualInputs ?? startupBottomNavVisualInputs" "$nav_silhouette_host_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL persistent_nav_silhouette_startup_host_gate: Nav silhouette must mount from the same startup geometry as the sheet mask instead of waiting for shell visual inputs." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS native_nav_material_mask_sync_gate"
fi

if [[ -e "$android_package_file" ]] && {
  ! rg -q --fixed-strings "managers.add(new SearchRouteSheetNavExclusionMaskViewManager())" "$android_package_file" ||
  ! rg -q --fixed-strings "managers.add(new SearchRouteNavSilhouetteHostViewManager())" "$android_package_file" ||
  ! rg -q --fixed-strings "modules.add(new UIFrameSamplerModule(reactContext))" "$android_package_file" ||
  ! rg -q --fixed-strings "canvas.clipOutRect" "$android_sheet_mask_view_file" ||
  ! rg -q --fixed-strings "Path.FillType.EVEN_ODD" "$android_nav_silhouette_view_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL android_native_nav_silhouette_parity_gate: Android must register the same nav mask/material host contracts that JS renders for iOS." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS android_native_nav_silhouette_parity_gate"
fi

if [[ -d "$android_native_root" ]]; then
  gate_ban_absent android_stale_restaurant_snapshot_view_deleted_gate \
    "Android must not carry the old platform-only restaurant snapshot native view with no shared JS/iOS contract." \
    "RestaurantPanelSnapshot" \
    --fixed-strings "$android_native_root"
else
  echo "[app-route-runtime-delete-gate] PASS android_stale_restaurant_snapshot_view_deleted_gate"
fi

if [[ -e "$android_bottom_sheet_host_file" && -e "$android_bottom_sheet_host_manager_file" ]]; then
  android_bottom_sheet_host_ios_parity_desc="Android bottom sheet commands and gesture snap resolution must match the iOS shared-sheet host contract."
  gate_ban_absent android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    'lastCommandToken\s*=\s*token;[\s\S]{0,160}dispatchProgrammaticCommand\(snapTo, token\);' \
    --pcre2 "$android_bottom_sheet_host_file"
  gate_ban_absent android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "hiddenSnap - 80f" --fixed-strings "$android_bottom_sheet_host_file"
  gate_ban_absent android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "float dragDelta = value - gestureStartY;" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "resolveHeaderGatedSnapValue(" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "SNAP_VELOCITY_PROJECTION_SECONDS" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "hasAppliedSnapPoints" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "isKnownSnapPoint(snapTo)" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "public void onAnimationCancel(android.animation.Animator animation)" --fixed-strings "$android_bottom_sheet_host_file"
  gate_require_present android_bottom_sheet_host_ios_parity_gate "$android_bottom_sheet_host_ios_parity_desc" \
    "@ReactProp(name = \"snapStepThreshold\")" --fixed-strings "$android_bottom_sheet_host_manager_file"
else
  echo "[app-route-runtime-delete-gate] PASS android_bottom_sheet_host_ios_parity_gate"
fi

if [[ -e "$search_map_render_controller_android_file" ]] && {
  ! rg -q --fixed-strings "private boolean isVisualSourceInactiveOrDismissing(InstanceState state)" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "VISUAL_SOURCE_HIDDEN.equals(state.visualSourceLifecycleState)" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "state.visualSourceLifecycleState = VISUAL_SOURCE_DISMISSING;" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "frame_snapshot_bypass reason=dismiss_in_progress" "$search_map_render_controller_android_file" ||
  ! rg -q --fixed-strings "isNativePressSuppressed(state)" "$search_map_render_controller_android_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_android_exit_visual_freeze_parity_gate: Android must freeze visual source/highlight mutation during dismiss like iOS." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_android_exit_visual_freeze_parity_gate"
fi

if [[ -e "$android_native_root/UIFrameSamplerModule.java" ]] && {
  ! rg -q --fixed-strings "new Handler(Looper.getMainLooper())" "$android_native_root/UIFrameSamplerModule.java" ||
  ! rg -q --fixed-strings "mainHandler.post(() -> startOnMain" "$android_native_root/UIFrameSamplerModule.java" ||
  ! rg -q --fixed-strings "mainHandler.post(this::stopOnMain)" "$android_native_root/UIFrameSamplerModule.java" ||
  ! rg -q --fixed-strings "DEFAULT_WINDOW_MS = 500d" "$android_native_root/UIFrameSamplerModule.java" ||
  ! rg -q --fixed-strings "DEFAULT_STALL_FRAME_MS = 80d" "$android_native_root/UIFrameSamplerModule.java" ||
  ! rg -q --fixed-strings "DEFAULT_LOG_ONLY_BELOW_FPS = 58d" "$android_native_root/UIFrameSamplerModule.java"
}; then
  echo "[app-route-runtime-delete-gate] FAIL android_ui_frame_sampler_ios_parity_gate: Android UIFrameSampler must sample on the UI thread with the same defaults/listener semantics as iOS." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS android_ui_frame_sampler_ios_parity_gate"
fi

if [[ -e "$search_route_sheet_frame_host_file" || -e "$search_bottom_nav_file" || -e "$nav_silhouette_host_native_file" || -e "$native_nav_silhouette_file" ]]; then
  # Each arm scans only the files that exist among its subset, preserving the
  # original `2>/dev/null` tolerance for absent scan targets while giving each
  # arm ban_absent's exit-2 discrimination.
  nav_silhouette_diagnostic_bridge_deleted_desc="Temporary native mask measurement events must not remain in the runtime path."
  nav_diag_mask_perf_files=(); for f in "$search_route_sheet_frame_host_file" "$nav_silhouette_host_native_file" "$native_nav_silhouette_file"; do [[ -e "$f" ]] && nav_diag_mask_perf_files+=("$f"); done
  [[ ${#nav_diag_mask_perf_files[@]} -gt 0 ]] && gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
    "onMaskPerfEvent" --fixed-strings "${nav_diag_mask_perf_files[@]}"
  nav_diag_material_perf_files=(); for f in "$search_bottom_nav_file" "$nav_silhouette_host_native_file" "$native_nav_silhouette_file"; do [[ -e "$f" ]] && nav_diag_material_perf_files+=("$f"); done
  [[ ${#nav_diag_material_perf_files[@]} -gt 0 ]] && gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
    "onMaterialPerfEvent" --fixed-strings "${nav_diag_material_perf_files[@]}"
  nav_diag_mask_event_files=(); for f in "$search_route_sheet_frame_host_file" "$native_nav_silhouette_file"; do [[ -e "$f" ]] && nav_diag_mask_event_files+=("$f"); done
  [[ ${#nav_diag_mask_event_files[@]} -gt 0 ]] && gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
    "native_sheet_mask_event" --fixed-strings "${nav_diag_mask_event_files[@]}"
  nav_diag_material_event_files=(); for f in "$search_bottom_nav_file" "$native_nav_silhouette_file"; do [[ -e "$f" ]] && nav_diag_material_event_files+=("$f"); done
  [[ ${#nav_diag_material_event_files[@]} -gt 0 ]] && gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
    "native_nav_material_event" --fixed-strings "${nav_diag_material_event_files[@]}"
  if [[ -e "$native_nav_silhouette_file" ]]; then
    gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
      "native_sheet_mask_path_setup" --fixed-strings "$native_nav_silhouette_file"
    gate_ban_absent nav_silhouette_diagnostic_bridge_deleted_gate "$nav_silhouette_diagnostic_bridge_deleted_desc" \
      "native_nav_material_path_setup" --fixed-strings "$native_nav_silhouette_file"
  fi
else
  echo "[app-route-runtime-delete-gate] PASS nav_silhouette_diagnostic_bridge_deleted_gate"
fi

surface_enter_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/use-search-surface-results-enter-transaction-execution-runtime.ts"
if [[ -e "$surface_enter_transaction_file" ]]; then
  gate_ban_absent search_results_enter_bypass_visibility_controller \
    "Results enter must publish a SheetTransitionPlan instead of calling sheet motion directly." \
    '(requestLocalSheetMotion|animateSheetTo|snapSheetTo)\b' \
    --pcre2 "$surface_enter_transaction_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_results_enter_bypass_visibility_controller"
fi

gate_ban_absent stale_results_sheet_execution_lane_deleted_gate \
  "Results sheet execution lanes must not reintroduce page-owned sheet motion." \
  '\b(resultsSheetExecutionModel|ResultsSheetExecutionModel|requestResultsSheetMotion|hideResultsSheet|useResultsPresentationSheetExecutionRuntime|useResultsPresentationOwnerSheetExecutionStateRuntime)\b' \
  --pcre2 "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"

surface_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"
if [[ -e "$surface_transaction_file" ]]; then
  gate_ban_absent search_results_surface_marks_marker_ready \
    "Results surface transactions must wait for the native mounted-hidden marker acknowledgement." \
    'markRedrawMarkersReady\(' \
    --pcre2 "$surface_transaction_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_results_surface_marks_marker_ready"
fi

gate_ban_absent shared_sheet_motion_old_writers_deleted_gate \
  "Profile/results/polls local snap writers and native sheet command lanes must not return; sheet motion is route transition-plan owned." \
  '\b(requestMiddleSheetSnap|requestResultsSheetSnap|pollCreationSnapRequest|requestRouteScenePollCreationExpand|setPollCreationSnapRequest|requestRouteSceneDockedPollsRestore|restaurantSheetSnapController|resultsSheetCommand|executeAndStripNativeSheetCommands|executeAndStripNativeProfileSheetCommands)\b' \
  --pcre2 "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"

# Compound OR ban: each arm has its own pattern and flags, so each is routed
# through gate_ban_absent separately (per the compound-arm guidance). A match on
# EITHER arm fails the gate; an invalid regex in either arm now surfaces as a
# FAIL instead of a silent green.
gate_ban_absent shared_sheet_page_owned_motion_fields_deleted_gate \
  "Scene descriptors must not publish snap persistence, initial snap, swipe-dismiss config, sheet callbacks, runtime model, or direct sheet commands; SheetScenePolicy and SheetTransitionPlan own those fields." \
  "snapPersistenceKey" \
  --fixed-strings "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"
gate_ban_absent shared_sheet_page_owned_motion_fields_deleted_gate \
  "Scene descriptors must not publish snap persistence, initial snap, swipe-dismiss config, sheet callbacks, runtime model, or direct sheet commands; SheetScenePolicy and SheetTransitionPlan own those fields." \
  "normalizeSearchRouteSceneStackShellSpec\\(\\{[\\s\\S]{0,700}\\b(initialSnapPoint|dismissThreshold|onHidden|onSnapStart|onSnapChange|preventSwipeDismiss|runtimeModel|shellSnapRequest)\\b" \
  -U --pcre2 "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"

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
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS profile_native_sheet_command_lane_deleted_gate"
fi

gate_ban_absent page_local_motion_writer_deleted_gate \
  "Sheet motion must be SheetTransitionPlan-owned; page/local and direct bootstrap sheet-motion writers must not return." \
  "\\brequestLocalSheetMotion\\b|\\bpendingLocalSheetMotion\\b|\\breplayPendingLocalSheetMotion\\b|\\brequestBootstrapSheetMotion\\b" \
  --pcre2 "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"

gate_ban_absent route_sheet_direct_y_writer_gate \
  "Shared sheet Y must be written by the sheet host/bottom-sheet transport, not page or visibility runtimes." \
  "\\bsetSheetTranslateYTo\\b|\\bsheetTranslateY\\.value\\s*=" \
  --pcre2 "$TARGET_PATH/navigation/runtime" "$TARGET_PATH/screens/Search/runtime/shared"

gate_ban_absent shared_sheet_legacy_results_name_gate \
  "Route-owned shared sheet runtime must not use legacy results-sheet ownership names." \
  "\\b(AppRouteResultsSheet|appRouteResultsSheet|RouteResultsSheet|routeResultsSheet)\\b|app-route-results-sheet|route-results-sheet|\\b(resultsSheetRuntimeModel|resultsContainerAnimatedStyle|resultsScrollOffset|resultsMomentum|shouldRenderResultsSheetRef|resetResultsSheetToHidden|prepareShortcutSheetTransition|handleSheetSnapChange)\\b" \
  --pcre2 "$TARGET_PATH/navigation/runtime" "$TARGET_PATH/screens/Search/runtime/shared"

gate_ban_absent sheet_host_base_transport_fallback_name_gate \
  "The sheet host must use the shared sheet runtime directly, with no compatibility fallback/base transport naming." \
  "\\b(fallbackRuntimeModel|fallbackSheetY|fallbackSheetRuntimeModel|baseRuntimeModel|baseSheetY|FALLBACK_PRESENTATION_STATE|FALLBACK_CHROME_VISUAL_STATE)\\b" \
  --pcre2 "$TARGET_PATH/navigation/runtime/AppRouteSheetHostRuntimeProvider.tsx" "$TARGET_PATH/navigation/runtime/app-route-sheet-host-authority-controller.ts" "$TARGET_PATH/screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract.ts"

gate_ban_absent search_runtime_sheet_snap_commit_gate \
  "Search may observe dismiss boundaries, but shared sheet snap state must be published by the sheet host/transport." \
  "\\bmotionCallbacksEntry\\.onSnapChange\\b|\\brecordSharedSheetSnap\\b" \
  --pcre2 "$TARGET_PATH/screens/Search/runtime/shared"

gate_ban_absent route_scene_raw_settle_finalize_gate \
  "Raw settle callbacks must only mark transition planes ready; they must not directly finalize route switches." \
  "completeRouteSceneSwitchFromSettle" \
  --fixed-strings "$TARGET_PATH/navigation/runtime"

close_transition_finalize_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-close-transition-finalize-runtime.ts"
# F8900: the `rg … | grep -v | grep -v || true` pipeline read rg's exit 2 (bad
# pcre2 pattern) and 127 as "no extra callers → clean". gate_scan discriminates
# the status; the grep -v filtering then runs on a match set that is a FACT.
gate_scan "\\bcompleteDismissHandoff\\(" --pcre2 "$TARGET_PATH/navigation" "$TARGET_PATH/screens" "$TARGET_PATH/overlays"
if [[ "$GATE_STATUS" -gt 1 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL complete_dismiss_handoff_caller_scan: rg exited $GATE_STATUS — the extra-caller scan did NOT run." >&2
  echo "$GATE_OUT" >&2
  gate_note_failure
  GATE_OUT=""
fi
complete_dismiss_handoff_extra_callers="$(
  printf '%s\n' "$GATE_OUT" |
    grep -v "screens/Search/runtime/surface/search-surface-runtime.ts" |
    grep -v "screens/Search/runtime/shared/use-results-presentation-close-transition-finalize-runtime.ts" || true
)"
sheet_host_authority_file="$TARGET_PATH/navigation/runtime/app-route-sheet-host-authority-controller.ts"
if [[ -e "$sheet_host_authority_file" ]]; then
  route_sheet_transition_planner_live_snap_desc="SheetTransitionPlan current-snap resolution must read the live shared sheet state, not policy defaults or persisted snap memory."
  # R8 repoint (2026-08-08): the old shared-sheet presentation runtime died with the
  # old host. The LIVE source is now recordSharedSheetSnap — the settle-fact-fed
  # write the track's motion controller drives; its presence is the same claim
  # ("current snap comes from the live sheet, not policy/persisted memory").
  gate_require_present route_sheet_transition_planner_live_snap_gate "$route_sheet_transition_planner_live_snap_desc" \
    "recordSharedSheetSnap" --fixed-strings "$sheet_host_authority_file"
  gate_ban_absent route_sheet_transition_planner_live_snap_gate "$route_sheet_transition_planner_live_snap_desc" \
    'resolveCurrentSnapTarget[\s\S]{0,520}\b(hasUserSharedSnap|sharedSnap|resolvePolicyInitialSnap|getPersistentSnap)\b' \
    --pcre2 "$sheet_host_authority_file"
else
  echo "[app-route-runtime-delete-gate] PASS route_sheet_transition_planner_live_snap_gate"
fi

sheet_snap_session_file="$TARGET_PATH/navigation/runtime/app-route-sheet-snap-session-runtime.ts"
if [[ -e "$sheet_snap_session_file" ]]; then
  gate_ban_absent route_sheet_snap_session_fact_only_gate \
    "Sheet snap session may record snap facts and atomic snap-session state, but must not issue route/transition commands." \
    "\\b(routeSceneSwitchActions|routeSceneTransitionAuthority|returnToDockedSearch|requestOverlaySwitch|clearDockedPollsRestoreIntent)\\b" \
    --pcre2 "$sheet_snap_session_file"
else
  echo "[app-route-runtime-delete-gate] PASS route_sheet_snap_session_fact_only_gate"
fi

if [[ -e "$sheet_host_authority_file" ]]; then
  gate_ban_absent route_sheet_host_snap_fact_command_gate \
    "Host snap facts may update snap-session facts/readiness, but must not directly issue route commands from the raw snap callback." \
    "recordRouteSceneSnapFact[\\s\\S]{0,1400}\\b(requestOverlaySwitch|handleCloseSaveSheet|returnAppSearchRouteToDockedSearch)\\b" \
    --pcre2 "$sheet_host_authority_file"
else
  echo "[app-route-runtime-delete-gate] PASS route_sheet_host_snap_fact_command_gate"
fi

if [[ -d "$TARGET_PATH/overlays/panels" ]]; then
  gate_ban_absent panel_direct_sheet_transition_gate \
    "Panel content must use route command actions, not direct SheetTransitionPlan dispatch." \
    "\\brouteSceneSwitchRuntime\\.requestOverlaySwitch\\b|\\brouteOverlayTransitionActions\\.requestOverlaySwitch\\b" \
    --pcre2 "$TARGET_PATH/overlays/panels"
else
  echo "[app-route-runtime-delete-gate] PASS panel_direct_sheet_transition_gate"
fi

gate_ban_absent page_direct_sheet_transition_plan_gate \
  "Page/runtime code must use route command actions for transitions that move the shared sheet." \
  "requestOverlaySwitch\\(\\{[\\s\\S]{0,520}\\bsheetMotion\\b" \
  --pcre2 "$TARGET_PATH/screens" "$TARGET_PATH/overlays"

transition_contract_file="$TARGET_PATH/navigation/runtime/app-overlay-route-transition-contract.ts"
transition_policy_file="$TARGET_PATH/navigation/runtime/app-route-scene-transition-policy-runtime.ts"
transition_switch_file="$TARGET_PATH/navigation/runtime/app-route-scene-switch-controller.ts"
if [[ -e "$transition_contract_file" && -e "$transition_policy_file" && -e "$transition_switch_file" ]] && {
  ! rg -q --fixed-strings "RouteSceneSwitchSheetTransitionPlan" "$transition_contract_file" ||
  ! rg -q --fixed-strings "resolveDefaultSheetMotionPlan" "$transition_policy_file" ||
  ! rg -q --fixed-strings "sheetTransitionPlan: transitionPlan.sheetTransitionPlan" "$transition_switch_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL shared_sheet_transition_plan_contract_gate: Route switches must carry one SheetTransitionPlan-derived sheet motion contract." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS shared_sheet_transition_plan_contract_gate"
fi

native_render_owner_file="$TARGET_PATH/screens/Search/components/hooks/use-search-map-native-render-owner.ts"
if [[ -e "$native_render_owner_file" ]]; then
  gate_ban_absent search_native_enter_ack_not_bound_to_resident_cache_match \
    "Same-data results enter must still queue a native mounted-hidden acknowledgement when resident-source metadata is stale." \
    'shouldQueueNativeEnterMountAckFrame[\\s\\S]{0,320}residentSourceDataMatchesPreparedFrame' \
    --pcre2 "$native_render_owner_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_native_enter_ack_not_bound_to_resident_cache_match"
fi

if [[ -e "$native_render_owner_file" ]] && {
  ! rg -q --fixed-strings "const shouldQueueNativeEnterMountAckFrame =" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "nextPresentationState.executionStage === 'enter_pending_mount'" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "sourceSnapshotKind !== 'pending'" "$native_render_owner_file" ||
  ! rg -q --fixed-strings "presentationRequestKey != null" "$native_render_owner_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_native_enter_ack_queues_presentation_only_frame: Enter-pending-mount transactions with ready source data must be able to queue a native mounted-hidden ack frame." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_native_enter_ack_queues_presentation_only_frame"
fi

if [[ -e "$native_render_owner_file" && -e "$search_map_render_controller_native_file" && -e "$search_map_render_controller_android_file" ]]; then
  search_map_visual_frame_transaction_admission_desc="JS must publish one VisualFrameTransaction and native must own hidden/enter/dismiss source admission."
  search_map_render_controller_ts_file="$TARGET_PATH/screens/Search/runtime/map/search-map-render-controller.ts"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "type SearchMapVisualFrameTransaction" --fixed-strings "$search_map_render_controller_ts_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "visualFrameTransaction" --fixed-strings "$native_render_owner_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "parseVisualFrameTransaction" --fixed-strings "$search_map_render_controller_native_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "parseVisualFrameTransaction" --fixed-strings "$search_map_render_controller_android_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldSuppressIncompleteCoveredSourceApply" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldSplitEnterSourcePreapply" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceSnapshotSyncMode" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "residentSourceReuse" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldBuildSourceTransport" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "lastAppliedFrame" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "acknowledgedSourceRevisions" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "NativeRenderOwnerResidentSourceState" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceReadiness" --fixed-strings "$native_render_owner_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceReadiness" --fixed-strings "$search_map_render_controller_ts_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldDropHiddenSourcePayload" --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldDropHiddenSourcePayload" --fixed-strings "$search_map_render_controller_android_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldBypassEnterSnapshotApply" --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "shouldBypassEnterSnapshotApply" --fixed-strings "$search_map_render_controller_android_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "drop_hidden_source_payload" --fixed-strings "$search_map_render_controller_native_file"
  gate_ban_absent search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "drop_hidden_source_payload" --fixed-strings "$search_map_render_controller_android_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceAdmissionOutcome" --fixed-strings "$search_map_render_controller_ts_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceAdmissionOutcome" --fixed-strings "$search_map_render_controller_native_file"
  gate_require_present search_map_visual_frame_transaction_admission_gate "$search_map_visual_frame_transaction_admission_desc" \
    "sourceAdmissionOutcome" --fixed-strings "$search_map_render_controller_android_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_visual_frame_transaction_admission_gate"
fi

direct_map_source_controller_file="$TARGET_PATH/screens/Search/hooks/use-direct-search-map-source-controller.ts"
if [[ -e "$direct_map_source_controller_file" ]] && ! rg -q --fixed-strings "shouldPreserveResidentEnterSourceFrame" "$direct_map_source_controller_file"; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_source_preserves_resident_enter_frame: Results enter must not replace a resident non-empty source frame with an empty frame before native enter settles." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_source_preserves_resident_enter_frame"
fi

source_frame_publish_count=0
if [[ -e "$direct_map_source_controller_file" ]]; then
  # F8900: `rg -c … || true` folded rg's exit 127/2 into an empty string, which
  # then failed the `!= "1"` comparison for the WRONG reason (or, had the
  # comparison pointed the other way, passed). gate_scan_count fails the gate on
  # any status that is not "matched" or "did not match".
  source_frame_publish_count="$(gate_scan_count "sourceFramePort.publishSnapshot(" --fixed-strings "$direct_map_source_controller_file")"
fi
if [[ -e "$direct_map_source_controller_file" ]]; then
  search_map_source_frame_resident_commit_desc="Source frames must publish through one resident commit helper so cached replay, empty clear, and recompute cannot desync visual state from LOD memory."
  # The publish-count arm is a numeric-equality assertion, not an rg presence/ban
  # arm, so it stays an explicit conditional (no rg exit code to discriminate);
  # the diagnostic dump rides with it. The rg arms below carry ban_absent/
  # require_present exit-2 discrimination.
  if [[ "$source_frame_publish_count" != "1" ]]; then
    echo "[app-route-runtime-delete-gate] FAIL search_map_source_frame_resident_commit_gate: $search_map_source_frame_resident_commit_desc" >&2
    gate_scan "publishSnapshot(" --fixed-strings "$direct_map_source_controller_file"
    echo "$GATE_OUT" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  fi
  gate_require_present search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "const commitResidentSourceFrameSnapshot =" --fixed-strings "$direct_map_source_controller_file"
  gate_require_present search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "adoptResidentSourceFrameSnapshot(snapshot);" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "lodProposalPolicy" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "proposedPromoteSinceByMarkerKey" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "proposedDemoteSinceByMarkerKey" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "assignInitialShortcutLodSlots" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "shouldSeedInitialRankedShortcutFrame" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "initialRankedShortcut" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousPinSourceStoreRef.current = pinSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousDotSourceStoreRef.current = dotSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousPinInteractionSourceStoreRef.current = pinInteractionSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousDotInteractionSourceStoreRef.current = dotInteractionSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "dotInteractionSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "dotInteractions" --fixed-strings "$search_map_native_render_owner_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousLabelSourceStoreRef.current = labelSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "previousLabelCollisionSourceStoreRef.current = labelCollisionSourceStore" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "lodPinnedMarkersRef.current = nextModel.nextPinnedMarkers" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_source_frame_resident_commit_gate "$search_map_source_frame_resident_commit_desc" \
    "lodPinnedVisualKeyRef.current = nextPinnedVisualKey" --fixed-strings "$direct_map_source_controller_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_source_frame_resident_commit_gate"
fi

if [[ -e "$search_map_native_render_owner_file" ]] && {
  ! rg -q --fixed-strings "const markerRoleFrameBaselineSnapshot =" "$search_map_native_render_owner_file" ||
  ! rg -q --fixed-strings "transportState.queueState.inFlightFrame?.snapshot ??" "$search_map_native_render_owner_file" ||
  ! rg -q --fixed-strings "markerRoleFrameBaselineSnapshot" "$search_map_native_render_owner_file"
}; then
  echo "[app-route-runtime-delete-gate] FAIL search_map_live_role_frame_inflight_baseline_gate: Queued live LOD role patches must diff from the in-flight native snapshot when a native frame is still applying." >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
else
  echo "[app-route-runtime-delete-gate] PASS search_map_live_role_frame_inflight_baseline_gate"
fi

if [[ -e "$direct_map_source_controller_file" ]]; then
  search_map_single_visual_projector_desc="Map visual sources must flow through one restaurant-location projector, not inline result/coverage pin merges."
  gate_require_present search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    "const projectSearchMapVisualFrame =" --fixed-strings "$direct_map_source_controller_file"
  gate_require_present search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    "buildSearchMapVisualIdentityKey" --fixed-strings "$direct_map_source_controller_file"
  gate_require_present search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    "normalizeSearchMapVisualFeatureIdentity" --fixed-strings "$direct_map_source_controller_file"
  gate_require_present search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    "const assertProjectedVisualFrameInvariants =" --fixed-strings "$direct_map_source_controller_file"
  gate_require_present search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    "visualProjector:" --fixed-strings "$direct_map_source_controller_file"
  gate_ban_absent search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    '\[\s*\.\.\.shortcutResultFeatures,\s*\.\.\.shortcutCoverageFeatures' \
    --pcre2 "$direct_map_source_controller_file"
  gate_ban_absent search_map_single_visual_projector_gate "$search_map_single_visual_projector_desc" \
    '\[\s*\.\.\.shortcutCoverageFeatures,\s*\.\.\.shortcutResultFeatures' \
    --pcre2 "$direct_map_source_controller_file"
else
  echo "[app-route-runtime-delete-gate] PASS search_map_single_visual_projector_gate"
fi

surface_results_transaction_file="$TARGET_PATH/screens/Search/runtime/shared/search-surface-results-transaction.ts"
surface_results_transaction_runtime_file="$TARGET_PATH/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts"
direct_map_source_controller_file="$TARGET_PATH/screens/Search/hooks/use-direct-search-map-source-controller.ts"
search_surface_runtime_file="$TARGET_PATH/screens/Search/runtime/surface/search-surface-runtime.ts"
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
  GATE_FAILURES=$((GATE_FAILURES + 1))
elif [[ "$authority_files_status" -ne 0 && "$authority_files_status" -ne 1 ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: rg exited with status $authority_files_status" >&2
  echo "$search_submit_dismiss_authority_files" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
      GATE_FAILURES=$((GATE_FAILURES + 1))
    elif [[ "$lifecycle_status" -eq 0 ]]; then
      search_submit_dismiss_lifecycle_matches+="$lifecycle_matches"$'\n'
    elif [[ "$lifecycle_status" -ne 1 ]]; then
      echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: rg exited with status $lifecycle_status" >&2
      echo "$lifecycle_matches" >&2
      GATE_FAILURES=$((GATE_FAILURES + 1))
    fi
  done <<< "$search_submit_dismiss_candidate_files"
fi

if [[ -n "$search_submit_dismiss_lifecycle_matches" ]]; then
  echo "[app-route-runtime-delete-gate] FAIL search_submit_dismiss_authority_lifecycle_writer: SearchSubmitDismissTransitionVisualAuthority must not own submit/dismiss lifecycle writer APIs." >&2
  printf '%s' "$search_submit_dismiss_lifecycle_matches" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
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
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 0 ]]; then
    echo "[app-route-runtime-delete-gate] FAIL $id: $description" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  elif [[ "$status" -eq 1 ]]; then
    echo "[app-route-runtime-delete-gate] PASS $id"
  else
    echo "[app-route-runtime-delete-gate] FAIL $id: path scan exited with status $status" >&2
    echo "$matches" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
  fi
done

gate_summary "OK (${#CONTENT_CHECKS[@]} content checks, ${#PATH_CHECKS[@]} path checks)."
