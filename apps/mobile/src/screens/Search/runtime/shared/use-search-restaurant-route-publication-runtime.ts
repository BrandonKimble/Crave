import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import {
  type RestaurantRouteHostSnapController,
  type RestaurantRouteHostVisualState,
} from '../../../../overlays/restaurantRouteHostContract';
import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
} from '../../../../overlays/restaurantRoutePanelContract';
import { useRestaurantRouteRuntimeStore } from '../../../../overlays/restaurantRouteRuntimeStore';
import { useSearchRestaurantRouteHostConfigRuntime } from './use-search-restaurant-route-host-config-runtime';
import { useSearchRestaurantRouteHostModelRuntime } from './use-search-restaurant-route-host-model-runtime';

type UseSearchRestaurantRoutePublicationRuntimeArgs = {
  shouldPublish: boolean;
  restaurantPanelSnapshot: RestaurantOverlayData | null;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  shouldSuppressRestaurantOverlay: boolean;
  suggestionProgress: SharedValue<number>;
  restaurantSheetSnapController: RestaurantRouteHostSnapController;
  searchSheetVisualContextValue: RestaurantRouteHostVisualState;
};

export const useSearchRestaurantRoutePublicationRuntime = ({
  shouldPublish,
  restaurantPanelSnapshot,
  onRequestClose,
  onToggleFavorite,
  shouldFreezeRestaurantPanelContent,
  shouldEnableRestaurantOverlayInteraction,
  shouldSuppressRestaurantOverlay,
  suggestionProgress,
  restaurantSheetSnapController,
  searchSheetVisualContextValue,
}: UseSearchRestaurantRoutePublicationRuntimeArgs): void => {
  const publishRestaurantRouteHostModel = useRestaurantRouteRuntimeStore(
    (state) => state.publishRestaurantRouteHostModel
  );
  const hostConfig = useSearchRestaurantRouteHostConfigRuntime({
    shouldFreezeRestaurantPanelContent,
    shouldEnableRestaurantOverlayInteraction,
    shouldSuppressRestaurantOverlay,
    suggestionProgress,
  });
  const restaurantRouteHostModel = useSearchRestaurantRouteHostModelRuntime({
    restaurantPanelSnapshot,
    onRequestClose,
    onToggleFavorite,
    hostConfig,
    restaurantSheetSnapController,
    searchSheetVisualContextValue,
  });

  React.useEffect(() => {
    if (!shouldPublish) {
      publishRestaurantRouteHostModel(null);
      return;
    }

    publishRestaurantRouteHostModel(restaurantRouteHostModel);
  }, [publishRestaurantRouteHostModel, restaurantRouteHostModel, shouldPublish]);

  React.useEffect(
    () => () => {
      publishRestaurantRouteHostModel(null);
    },
    [publishRestaurantRouteHostModel]
  );
};
