import React from 'react';

import {
  useOverlayStore,
  type OverlayKey,
  type OverlayRouteParamsMap,
} from '../store/overlayStore';

export const appOverlayRouteController = {
  setRootRoute<K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) {
    useOverlayStore.getState().setOverlay(overlay, params);
  },
  updateRoute<K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) {
    useOverlayStore.getState().setOverlayParams(overlay, params);
  },
  pushRoute<K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) {
    useOverlayStore.getState().pushOverlay(overlay, params);
  },
  closeActiveRoute() {
    useOverlayStore.getState().popOverlay();
  },
  popToRootRoute() {
    useOverlayStore.getState().popToRootOverlay();
  },
};

export const useAppOverlayRouteController = () => {
  const setRootRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.setRootRoute(overlay, params);
    },
    []
  );

  const updateRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.updateRoute(overlay, params);
    },
    []
  );

  const pushRoute = React.useCallback(
    <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => {
      appOverlayRouteController.pushRoute(overlay, params);
    },
    []
  );

  const closeActiveRoute = React.useCallback(() => {
    appOverlayRouteController.closeActiveRoute();
  }, []);

  const popToRootRoute = React.useCallback(() => {
    appOverlayRouteController.popToRootRoute();
  }, []);

  return React.useMemo(
    () => ({
      setRootRoute,
      updateRoute,
      pushRoute,
      closeActiveRoute,
      popToRootRoute,
    }),
    [closeActiveRoute, popToRootRoute, pushRoute, setRootRoute, updateRoute]
  );
};
