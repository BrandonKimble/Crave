import React from 'react';

import { TrackSheetRouteHost } from '../tracksheet/TrackSheetRouteHost';
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
  SearchOverlayLocalRestaurantSheetHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { SearchOverlayChromeHost } from './SearchOverlayChromeHost';
import RestaurantRouteSceneInputHost from './RestaurantRouteSceneInputHost';
import { SearchOverlayShellHost } from './SearchOverlayShellHost';
import { NavSilhouetteHost } from './NavSilhouetteHost';
import { SearchResultsExternalPreMeasureHost } from './SearchResultsPreMeasureHost';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';

export type AppOverlayRouteHostRuntime = {
  overlayChromeHostAuthority: SearchOverlayChromeHostAuthority;
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeSceneInputLane: RouteShellSceneInputLane;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: Pick<
    AppRouteSheetSnapSessionActions,
    'getRouteSceneSwitchSceneSnap'
  >;
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

const AppOverlayRouteHost = ({
  overlayChromeHostAuthority,
  overlayGateHostAuthority,
  overlayShellHostAuthority,
  overlayLocalRestaurantSheetHostAuthority,
  routeSceneDisplayTargetRegistry,
  routeSceneInputLane,
  routeOverlayTransitionActions,
  routeSheetSnapSessionAuthority,
  routeSheetSnapSessionActions,
}: AppOverlayRouteHostRuntime) => {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <>
        <SearchOverlayChromeHost overlayChromeHostAuthority={overlayChromeHostAuthority} />
        <SearchOverlayShellHost overlayShellHostAuthority={overlayShellHostAuthority} />
        <RestaurantRouteSceneInputHost
          overlayLocalRestaurantSheetHostAuthority={overlayLocalRestaurantSheetHostAuthority}
          routeSceneInputLane={routeSceneInputLane}
        />
        {/* R8 (2026-08-08): the old sheet system (SearchOverlayRouteGateHost →
            BottomSheetSceneStackHost) is DELETED. The track host is the one
            sheet system; the flip's off-branch died with it. */}
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

  return (
    previousProps.overlayChromeHostAuthority === nextProps.overlayChromeHostAuthority &&
    previousProps.overlayGateHostAuthority === nextProps.overlayGateHostAuthority &&
    previousProps.overlayShellHostAuthority === nextProps.overlayShellHostAuthority &&
    previousProps.overlayLocalRestaurantSheetHostAuthority ===
      nextProps.overlayLocalRestaurantSheetHostAuthority &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.routeSceneInputLane === nextProps.routeSceneInputLane &&
    previousProps.routeOverlayTransitionActions === nextProps.routeOverlayTransitionActions &&
    previousProps.routeSheetSnapSessionAuthority === nextProps.routeSheetSnapSessionAuthority &&
    previousProps.routeSheetSnapSessionActions === nextProps.routeSheetSnapSessionActions
  );
};

export default React.memo(AppOverlayRouteHost, areAppOverlayRouteHostPropsEqual);
