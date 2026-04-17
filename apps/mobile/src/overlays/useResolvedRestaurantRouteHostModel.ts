import React from 'react';

import {
  createRestaurantRouteHostModel,
  createRestaurantRouteHostState,
  type RestaurantRouteHostModel,
} from './restaurantRouteHostContract';
import { useRestaurantRouteRuntimeStore } from './restaurantRouteRuntimeStore';
import { useBottomSheetProgrammaticRuntimeModel } from './useBottomSheetRuntime';
import { closeRestaurantRouteSession } from './useRestaurantRouteProducer';
import { useOverlayStore, type OverlayRouteEntry } from '../store/overlayStore';

const isGlobalRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'global';

const useGlobalRestaurantRouteHostModel = (
  activeSessionToken: number | null,
  panel: RestaurantRouteHostModel['panel'] | null
): RestaurantRouteHostModel | null => {
  const runtimeModel = useBottomSheetProgrammaticRuntimeModel({
    onProgrammaticHidden: () => {
      closeRestaurantRouteSession(activeSessionToken);
    },
  });

  return React.useMemo(() => {
    if (!panel) {
      return null;
    }

    return createRestaurantRouteHostModel({
      panel,
      hostState: createRestaurantRouteHostState({
        hostConfig: null,
        presentationState: runtimeModel.presentationState,
        snapController: runtimeModel.snapController,
      }),
    });
  }, [panel, runtimeModel]);
};

export const useResolvedRestaurantRouteHostModel = (): RestaurantRouteHostModel | null => {
  const activeOverlayRoute = useOverlayStore((state) => state.activeOverlayRoute);
  const globalRestaurantRoutePublication = useRestaurantRouteRuntimeStore(
    (state) => state.globalRestaurantRoutePublication
  );
  const publishedRestaurantRouteHostModel = useRestaurantRouteRuntimeStore(
    (state) => state.publishedRestaurantRouteHostModel
  );

  const activeGlobalRestaurantRoute = isGlobalRestaurantRouteEntry(activeOverlayRoute)
    ? activeOverlayRoute
    : null;
  const isGlobalRestaurantRouteActive = activeGlobalRestaurantRoute != null;
  const activeGlobalRestaurantSessionToken = isGlobalRestaurantRouteActive
    ? (activeGlobalRestaurantRoute.params?.sessionToken ?? null)
    : null;
  const globalRestaurantPanel =
    isGlobalRestaurantRouteActive &&
    activeGlobalRestaurantSessionToken != null &&
    globalRestaurantRoutePublication?.sessionToken === activeGlobalRestaurantSessionToken
      ? globalRestaurantRoutePublication.panel
      : null;

  const globalRestaurantRouteHostModel = useGlobalRestaurantRouteHostModel(
    activeGlobalRestaurantSessionToken,
    globalRestaurantPanel
  );

  if (isGlobalRestaurantRouteActive) {
    return globalRestaurantRouteHostModel;
  }

  return publishedRestaurantRouteHostModel;
};
