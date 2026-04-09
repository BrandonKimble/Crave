import React from 'react';

import {
  createRestaurantRouteHostModel,
  type RestaurantRouteHostSnapController,
  type RestaurantRouteHostVisualState,
  type RestaurantRouteHostModel,
} from '../../../../overlays/restaurantRouteHostContract';
import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from '../../../../overlays/restaurantRoutePanelContract';
import { useSearchRestaurantRouteHostStateRuntime } from './use-search-restaurant-route-host-state-runtime';
import { useSearchRestaurantRoutePanelRuntime } from './use-search-restaurant-route-panel-runtime';

type UseSearchRestaurantRouteHostModelRuntimeArgs = {
  restaurantPanelSnapshot: RestaurantOverlayData | null;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
  hostConfig: RestaurantRoutePanelHostConfig | null;
  restaurantSheetSnapController: RestaurantRouteHostSnapController;
  searchSheetVisualContextValue: RestaurantRouteHostVisualState;
};

export const useSearchRestaurantRouteHostModelRuntime = ({
  restaurantPanelSnapshot,
  onRequestClose,
  onToggleFavorite,
  hostConfig,
  restaurantSheetSnapController,
  searchSheetVisualContextValue,
}: UseSearchRestaurantRouteHostModelRuntimeArgs): RestaurantRouteHostModel => {
  const panel = useSearchRestaurantRoutePanelRuntime({
    restaurantPanelSnapshot,
    onRequestClose,
    onToggleFavorite,
  });
  const hostState = useSearchRestaurantRouteHostStateRuntime({
    hostConfig,
    restaurantSheetSnapController,
    searchSheetVisualContextValue,
  });

  return React.useMemo(
    () =>
      createRestaurantRouteHostModel({
        panel,
        hostState,
      }),
    [hostState, panel]
  );
};
