import React from 'react';

import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
} from '../../../../overlays/restaurantRoutePanelContract';
import {
  createRestaurantRoutePanelContract,
  createRestaurantRoutePanelDraft,
} from '../../../../overlays/restaurantRoutePanelContract';

type UseSearchRestaurantRoutePanelRuntimeArgs = {
  restaurantPanelSnapshot: RestaurantOverlayData | null;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
};

export const useSearchRestaurantRoutePanelRuntime = ({
  restaurantPanelSnapshot,
  onRequestClose,
  onToggleFavorite,
}: UseSearchRestaurantRoutePanelRuntimeArgs): RestaurantRoutePanelContract =>
  React.useMemo(
    () =>
      createRestaurantRoutePanelContract({
        ...createRestaurantRoutePanelDraft({
          data: restaurantPanelSnapshot,
          onToggleFavorite,
        }),
        onRequestClose,
      }),
    [onRequestClose, onToggleFavorite, restaurantPanelSnapshot]
  );
