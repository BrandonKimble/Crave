import React from 'react';

import {
  createRouteRestaurantOverlayRuntime,
  type RouteRestaurantOverlayRuntime,
} from '../../../../navigation/runtime/route-restaurant-overlay-runtime';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import type {
  RouteOverlayNavigationAuthority,
  RouteSceneLayoutAuthority,
  RouteSceneSwitchAuthority,
} from './search-root-route-runtime-contract';

export const useSearchRootRouteControlRuntime = ({
  routeSceneRuntime: providedRouteSceneRuntime,
}: {
  routeSceneRuntime?: AppRouteSceneRuntime;
}): {
  routeSceneRuntime: AppRouteSceneRuntime;
  routeRestaurantOverlayRuntime: RouteRestaurantOverlayRuntime;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  routeOverlayNavigationAuthority: RouteOverlayNavigationAuthority;
  routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
} => {
  const routeRestaurantOverlayRuntimeRef = React.useRef<RouteRestaurantOverlayRuntime | null>(null);
  const contextRouteSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneRuntime = providedRouteSceneRuntime ?? contextRouteSceneRuntime;

  if (!routeRestaurantOverlayRuntimeRef.current) {
    routeRestaurantOverlayRuntimeRef.current = createRouteRestaurantOverlayRuntime({
      routeOverlayNavigationAuthority: routeSceneRuntime.routeSheetHostNavigationAuthority,
    });
  }

  const routeRestaurantOverlayRuntime = routeRestaurantOverlayRuntimeRef.current;

  React.useEffect(
    () => () => {
      routeRestaurantOverlayRuntime.dispose();
    },
    [routeRestaurantOverlayRuntime]
  );

  return {
    routeSceneRuntime,
    routeRestaurantOverlayRuntime,
    routeSceneSwitchAuthority: routeSceneRuntime.sceneSwitchAuthority,
    routeOverlayNavigationAuthority: routeSceneRuntime.routeOverlayNavigationAuthority,
    routeSceneLayoutAuthority: routeSceneRuntime.routeSceneLayoutAuthority,
  };
};
