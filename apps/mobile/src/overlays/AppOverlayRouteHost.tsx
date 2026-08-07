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
import {
  areAppRouteSheetHostRuntimesFieldEqual,
  markAppRouteSheetHostRuntimeDiffs,
} from '../navigation/runtime/app-route-sheet-host-runtime-contract';

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
  routeSheetHostRuntime,
}: AppOverlayRouteHostRuntime) => {
  const trackFlip = useTrackFlipState();
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <>
        <SearchOverlayChromeHost overlayChromeHostAuthority={overlayChromeHostAuthority} />
        <SearchOverlayShellHost overlayShellHostAuthority={overlayShellHostAuthority} />
        <RestaurantRouteSceneInputHost
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
  markAppRouteSheetHostRuntimeDiffs(
    'app_overlay_route_host_props_diff',
    previousProps.routeSheetHostRuntime,
    nextProps.routeSheetHostRuntime
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
    previousProps.routeSheetSnapSessionActions === nextProps.routeSheetSnapSessionActions &&
    // BAIL-OUT (perf attribution 2026-07-12): the runtime bundle is a MERGE object whose
    // wrapper identity churns even when every field is stable, so compare by FIELD — a fresh
    // wrapper with identical members bails instead of cascading the 12-level chain. The
    // comparison has ONE home (app-route-sheet-host-runtime-contract), which is also where
    // `routeSceneDisplayTargetRegistry` is deliberately EXCLUDED: it is a singleton
    // constructed once (app-route-scene-runtime.ts) and threaded unchanged for process
    // lifetime, so comparing it per field can never be false. This host compares it as a
    // top-level prop above, which is a real guard; a second always-true one is not (F1486).
    areAppRouteSheetHostRuntimesFieldEqual(
      previousProps.routeSheetHostRuntime,
      nextProps.routeSheetHostRuntime
    )
  );
};

export default React.memo(AppOverlayRouteHost, areAppOverlayRouteHostPropsEqual);
