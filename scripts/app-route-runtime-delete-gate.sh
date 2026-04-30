#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_ROOT="${1:-apps/mobile/src}"
TARGET_PATH="$REPO_ROOT/$TARGET_ROOT"

if [[ ! -e "$TARGET_PATH" ]]; then
  echo "[app-route-runtime-delete-gate] Target not found: $TARGET_ROOT" >&2
  exit 1
fi

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
)

declare -a PATH_CHECKS=(
  "polls_panel_sheet_control_runtime_path::(^|/)overlays/panels/runtime/polls-panel-sheet-control-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted polls panel sheet-control runtime file must not return."
  "app_route_scene_chrome_snaps_runtime_path::(^|/)navigation/runtime/use-app-route-scene-chrome-snaps-runtime\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted chrome-snaps runtime hook file must not return."
  "app_route_scene_sheet_session_authority_path::(^|/)navigation/runtime/app-route-scene-sheet-session-authority\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted scene sheet-session authority file must not return."
  "app_route_scene_sheet_snap_authority_path::(^|/)navigation/runtime/app-route-scene-sheet-snap-authority\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted scene sheet-snap authority file must not return."
  "overlay_sheet_position_store_path::(^|/)overlays/useOverlaySheetPositionStore\\.(ts|tsx|js|jsx|d\\.ts)$::Deleted overlay sheet position store file must not return."
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
)

failures=0

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
