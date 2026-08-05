import React from 'react';

import { TrackSheetRouteHost } from '../tracksheet/TrackSheetRouteHost';
import { useTrackFlipState } from '../tracksheet/track-flip-store';
import { StyleSheet, View } from 'react-native';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import type { RouteShellSceneInputLane } from '../navigation/runtime/app-route-scene-runtime';
import type { RouteSceneSwitchTransitionActions } from '../navigation/runtime/app-route-scene-switch-controller';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import type {
  SearchOverlayChromeHostAuthority,
  SearchOverlayGateHostAuthority,
  SearchOverlayGlobalRestaurantHostAuthority,
  SearchOverlayLocalRestaurantSheetHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { AppRouteSheetHostRuntime } from '../navigation/runtime/app-route-sheet-host-runtime-contract';
import { SearchOverlayChromeHost } from './SearchOverlayChromeHost';
import RestaurantRouteSceneInputHost from './RestaurantRouteSceneInputHost';
import { SearchOverlayRouteGateHost } from './SearchOverlayRouteGateHost';
import { SearchOverlayRouteSheetSurfaceHost } from './SearchOverlayRouteSheetSurfaceHost';
import { SearchOverlayShellHost } from './SearchOverlayShellHost';
import { NavSilhouetteHost } from './NavSilhouetteHost';
import { SearchResultsExternalPreMeasureHost } from './SearchResultsPreMeasureHost';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';
import { areAppRouteSheetHostRuntimesFieldEqual } from '../navigation/runtime/app-route-sheet-host-runtime-contract';

export type AppOverlayRouteHostRuntime = {
  overlayChromeHostAuthority: SearchOverlayChromeHostAuthority;
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  overlayGlobalRestaurantHostAuthority: SearchOverlayGlobalRestaurantHostAuthority;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeSceneInputLane: RouteShellSceneInputLane;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: Pick<
    AppRouteSheetSnapSessionActions,
    'getRouteSceneSwitchSceneSnap'
  >;
  routeSheetHostRuntime: AppRouteSheetHostRuntime;
};

const markAppOverlayRouteHostPropDiff = (field: string, left: unknown, right: unknown): void => {
  if (Object.is(left, right)) {
    return;
  }
  logPerfScenarioStackAttribution({
    owner: 'app_overlay_route_host_props_diff',
    path: `field:${field}`,
  });
};

const markRouteSheetHostRuntimeDiffs = (
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): void => {
  markAppOverlayRouteHostPropDiff('routeSheetHostRuntimeRef', left, right);
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.searchInteractionRef',
    left.searchInteractionRef,
    right.searchInteractionRef
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.routeSheetSurfaceAuthority',
    left.routeSheetSurfaceAuthority,
    right.routeSheetSurfaceAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.routeSheetSurfaceBodyAuthority',
    left.routeSheetSurfaceBodyAuthority,
    right.routeSheetSurfaceBodyAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.routeSheetRuntimeConfigAuthority',
    left.routeSheetRuntimeConfigAuthority,
    right.routeSheetRuntimeConfigAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.sceneStackSurfaceAuthority',
    left.sceneStackSurfaceAuthority,
    right.sceneStackSurfaceAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.routeSceneDisplayTargetRegistry',
    left.routeSceneDisplayTargetRegistry,
    right.routeSceneDisplayTargetRegistry
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetHostRuntime.routeHostVisualRuntimeAuthority',
    left.routeHostVisualRuntimeAuthority,
    right.routeHostVisualRuntimeAuthority
  );
};

// BAIL-OUT (perf attribution 2026-07-12): the runtime bundle is a MERGE object whose
// wrapper identity can churn even when every field is stable — compare by FIELD so a
// fresh wrapper with identical members bails instead of cascading the 12-level chain.
const areRouteSheetHostRuntimesFieldEqual = (
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): boolean =>
  // F975(e): the shared field comparison has ONE home now
  // (app-route-sheet-host-runtime-contract). `routeSceneDisplayTargetRegistry` is EXCLUDED
  // there deliberately — it is a singleton constructed once (app-route-scene-runtime.ts) and
  // threaded unchanged for process lifetime, so any per-field comparison of it can never be
  // false. This host already compares it as a top-level prop (see
  // areAppOverlayRouteHostPropsEqual below); a second, always-true comparison here is not a
  // guard (F1486).
  areAppRouteSheetHostRuntimesFieldEqual(left, right);

const AppOverlayRouteHost = ({
  overlayChromeHostAuthority,
  overlayGateHostAuthority,
  overlayShellHostAuthority,
  overlayGlobalRestaurantHostAuthority,
  overlayLocalRestaurantSheetHostAuthority,
  routeSceneDisplayTargetRegistry,
  routeSceneInputLane,
  routeOverlayTransitionActions,
  routeSheetSnapSessionAuthority,
  routeSheetSnapSessionActions,
  routeSheetHostRuntime,
}: AppOverlayRouteHostRuntime) => {
  const trackFlip = useTrackFlipState();
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <>
        <SearchOverlayChromeHost overlayChromeHostAuthority={overlayChromeHostAuthority} />
        <SearchOverlayShellHost overlayShellHostAuthority={overlayShellHostAuthority} />
        <RestaurantRouteSceneInputHost
          overlayGlobalRestaurantHostAuthority={overlayGlobalRestaurantHostAuthority}
          overlayLocalRestaurantSheetHostAuthority={overlayLocalRestaurantSheetHostAuthority}
          routeSceneInputLane={routeSceneInputLane}
        />
        {/* THE FLIP (rung 5): the old sheet system renders ONLY when the track
            flip is off (crave://tracksheet-host?on=0 = emergency rollback).
            Deletion of the old system follows after burn-in. */}
        {trackFlip.on ? null : (
          <SearchOverlayRouteGateHost overlayGateHostAuthority={overlayGateHostAuthority}>
            <SearchOverlayRouteSheetSurfaceHost routeSheetHostRuntime={routeSheetHostRuntime} />
          </SearchOverlayRouteGateHost>
        )}
        <TrackSheetRouteHost />
        <NavSilhouetteHost
          overlayGateHostAuthority={overlayGateHostAuthority}
          overlayShellHostAuthority={overlayShellHostAuthority}
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          routeOverlayTransitionActions={routeOverlayTransitionActions}
          routeSheetSnapSessionAuthority={routeSheetSnapSessionAuthority}
          routeSheetSnapSessionActions={routeSheetSnapSessionActions}
        />
        <SearchResultsExternalPreMeasureHost />
      </>
    </View>
  );
};

const areAppOverlayRouteHostPropsEqual = (
  previousProps: AppOverlayRouteHostRuntime,
  nextProps: AppOverlayRouteHostRuntime
): boolean => {
  markAppOverlayRouteHostPropDiff(
    'overlayChromeHostAuthority',
    previousProps.overlayChromeHostAuthority,
    nextProps.overlayChromeHostAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'overlayGateHostAuthority',
    previousProps.overlayGateHostAuthority,
    nextProps.overlayGateHostAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'overlayShellHostAuthority',
    previousProps.overlayShellHostAuthority,
    nextProps.overlayShellHostAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'overlayGlobalRestaurantHostAuthority',
    previousProps.overlayGlobalRestaurantHostAuthority,
    nextProps.overlayGlobalRestaurantHostAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'overlayLocalRestaurantSheetHostAuthority',
    previousProps.overlayLocalRestaurantSheetHostAuthority,
    nextProps.overlayLocalRestaurantSheetHostAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSceneDisplayTargetRegistry',
    previousProps.routeSceneDisplayTargetRegistry,
    nextProps.routeSceneDisplayTargetRegistry
  );
  markAppOverlayRouteHostPropDiff(
    'routeSceneInputLane',
    previousProps.routeSceneInputLane,
    nextProps.routeSceneInputLane
  );
  markAppOverlayRouteHostPropDiff(
    'routeOverlayTransitionActions',
    previousProps.routeOverlayTransitionActions,
    nextProps.routeOverlayTransitionActions
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetSnapSessionAuthority',
    previousProps.routeSheetSnapSessionAuthority,
    nextProps.routeSheetSnapSessionAuthority
  );
  markAppOverlayRouteHostPropDiff(
    'routeSheetSnapSessionActions',
    previousProps.routeSheetSnapSessionActions,
    nextProps.routeSheetSnapSessionActions
  );
  markRouteSheetHostRuntimeDiffs(
    previousProps.routeSheetHostRuntime,
    nextProps.routeSheetHostRuntime
  );

  return (
    previousProps.overlayChromeHostAuthority === nextProps.overlayChromeHostAuthority &&
    previousProps.overlayGateHostAuthority === nextProps.overlayGateHostAuthority &&
    previousProps.overlayShellHostAuthority === nextProps.overlayShellHostAuthority &&
    previousProps.overlayGlobalRestaurantHostAuthority ===
      nextProps.overlayGlobalRestaurantHostAuthority &&
    previousProps.overlayLocalRestaurantSheetHostAuthority ===
      nextProps.overlayLocalRestaurantSheetHostAuthority &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.routeSceneInputLane === nextProps.routeSceneInputLane &&
    previousProps.routeOverlayTransitionActions === nextProps.routeOverlayTransitionActions &&
    previousProps.routeSheetSnapSessionAuthority === nextProps.routeSheetSnapSessionAuthority &&
    previousProps.routeSheetSnapSessionActions === nextProps.routeSheetSnapSessionActions &&
    areRouteSheetHostRuntimesFieldEqual(
      previousProps.routeSheetHostRuntime,
      nextProps.routeSheetHostRuntime
    )
  );
};

export default React.memo(AppOverlayRouteHost, areAppOverlayRouteHostPropsEqual);
