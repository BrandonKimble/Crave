import React from 'react';

import {
  createGlobalRestaurantRoutePublication,
  type RestaurantRoutePanelDraft,
} from './restaurantRouteHostContract';
import { useRestaurantRouteRuntimeStore } from './restaurantRouteRuntimeStore';
import {
  appOverlayRouteController,
  useAppOverlayRouteController,
} from './useAppOverlayRouteController';
import { useOverlayStore, type OverlayRouteEntry } from '../store/overlayStore';

type OpenRestaurantRouteArgs = {
  restaurantId: string;
  panel: RestaurantRoutePanelDraft;
};

type RestaurantRouteProducer = {
  openRestaurantRoute: (args: OpenRestaurantRouteArgs) => number;
  updateRestaurantRoutePanel: (sessionToken: number, panel: RestaurantRoutePanelDraft) => boolean;
  closeRestaurantRoute: (sessionToken?: number | null) => void;
  getActiveRestaurantRouteSessionToken: () => number | null;
};

let nextRestaurantRouteSessionToken = 1;

const createRestaurantRouteSessionToken = () => nextRestaurantRouteSessionToken++;

const isGlobalRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'global';

const getRestaurantRouteSessionToken = (): number | null =>
  useRestaurantRouteRuntimeStore.getState().globalRestaurantRoutePublication?.sessionToken ?? null;

export const isRestaurantRouteSessionActive = (
  sessionToken: number | null | undefined
): boolean => {
  if (sessionToken == null) {
    return false;
  }
  const overlayState = useOverlayStore.getState();
  if (!isGlobalRestaurantRouteEntry(overlayState.activeOverlayRoute)) {
    return false;
  }
  if (overlayState.activeOverlayRoute.params?.sessionToken !== sessionToken) {
    return false;
  }
  return getRestaurantRouteSessionToken() === sessionToken;
};

export const closeRestaurantRouteSession = (sessionToken?: number | null): void => {
  const targetSessionToken = sessionToken ?? getRestaurantRouteSessionToken();
  if (targetSessionToken == null) {
    return;
  }
  useRestaurantRouteRuntimeStore
    .getState()
    .clearGlobalRestaurantRoutePublication(targetSessionToken);
  if (isRestaurantRouteSessionActive(targetSessionToken)) {
    appOverlayRouteController.closeActiveRoute();
  }
};

export const useRestaurantRouteProducer = (): RestaurantRouteProducer => {
  const { pushRoute } = useAppOverlayRouteController();
  const publishGlobalRestaurantRoutePublication = useRestaurantRouteRuntimeStore(
    (state) => state.publishGlobalRestaurantRoutePublication
  );
  const closeRestaurantRoute = React.useCallback((sessionToken?: number | null) => {
    closeRestaurantRouteSession(sessionToken);
  }, []);

  const updateRestaurantRoutePanel = React.useCallback(
    (sessionToken: number, panel: RestaurantRoutePanelDraft) => {
      if (getRestaurantRouteSessionToken() !== sessionToken) {
        return false;
      }
      publishGlobalRestaurantRoutePublication(
        createGlobalRestaurantRoutePublication({
          sessionToken,
          panel,
          onRequestClose: () => {
            if (getRestaurantRouteSessionToken() !== sessionToken) {
              return;
            }
            closeRestaurantRoute(sessionToken);
          },
        })
      );
      return true;
    },
    [closeRestaurantRoute, publishGlobalRestaurantRoutePublication]
  );

  const openRestaurantRoute = React.useCallback(
    ({ restaurantId, panel }: OpenRestaurantRouteArgs) => {
      const sessionToken = createRestaurantRouteSessionToken();
      publishGlobalRestaurantRoutePublication(
        createGlobalRestaurantRoutePublication({
          sessionToken,
          panel,
          onRequestClose: () => {
            if (getRestaurantRouteSessionToken() !== sessionToken) {
              return;
            }
            closeRestaurantRoute(sessionToken);
          },
        })
      );
      pushRoute('restaurant', {
        restaurantId,
        source: 'global',
        sessionToken,
      });
      return sessionToken;
    },
    [closeRestaurantRoute, publishGlobalRestaurantRoutePublication, pushRoute]
  );

  const getActiveRestaurantRouteSessionToken = React.useCallback(
    () => getRestaurantRouteSessionToken(),
    []
  );

  return React.useMemo(
    () => ({
      openRestaurantRoute,
      updateRestaurantRoutePanel,
      closeRestaurantRoute,
      getActiveRestaurantRouteSessionToken,
    }),
    [
      closeRestaurantRoute,
      getActiveRestaurantRouteSessionToken,
      openRestaurantRoute,
      updateRestaurantRoutePanel,
    ]
  );
};
