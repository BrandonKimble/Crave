import React from 'react';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type {
  OverlayKey,
  OverlayRouteParamsMap,
} from '../navigation/runtime/app-overlay-route-types';

export const useAppOverlayRouteController = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const appOverlayRouteController = routeSceneRuntime.routeOverlayRouteCommandRuntime;
  const setRootRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.setRootRoute(overlay, params);
    },
    [appOverlayRouteController]
  );

  const updateRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.updateRoute(overlay, params);
    },
    [appOverlayRouteController]
  );

  const pushRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.pushRoute(overlay, params);
    },
    [appOverlayRouteController]
  );

  const closeActiveRoute = React.useCallback(() => {
    appOverlayRouteController.closeActiveRoute();
  }, [appOverlayRouteController]);

  const collapseActiveSheet = React.useCallback(() => {
    appOverlayRouteController.collapseActiveSheet();
  }, [appOverlayRouteController]);

  const promoteActiveSheet = React.useCallback(() => {
    appOverlayRouteController.promoteActiveSheet();
  }, [appOverlayRouteController]);

  const popToRootRoute = React.useCallback(() => {
    appOverlayRouteController.popToRootRoute();
  }, [appOverlayRouteController]);

  return React.useMemo(
    () => ({
      setRootRoute,
      updateRoute,
      pushRoute,
      collapseActiveSheet,
      promoteActiveSheet,
      closeActiveRoute,
      popToRootRoute,
    }),
    [
      collapseActiveSheet,
      promoteActiveSheet,
      closeActiveRoute,
      popToRootRoute,
      pushRoute,
      setRootRoute,
      updateRoute,
    ]
  );
};
