import React from 'react';
import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { RestaurantRoutePanelHostConfig } from '../../../../overlays/restaurantRoutePanelContract';

type UseSearchRestaurantRouteHostConfigRuntimeArgs = {
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  shouldSuppressRestaurantOverlay: boolean;
  suggestionProgress: SharedValue<number>;
};

export const useSearchRestaurantRouteHostConfigRuntime = ({
  shouldFreezeRestaurantPanelContent,
  shouldEnableRestaurantOverlayInteraction,
  shouldSuppressRestaurantOverlay,
  suggestionProgress,
}: UseSearchRestaurantRouteHostConfigRuntimeArgs): RestaurantRoutePanelHostConfig | null => {
  const restaurantOverlayAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: shouldSuppressRestaurantOverlay ? 1 - suggestionProgress.value : 1,
    }),
    [shouldSuppressRestaurantOverlay]
  );

  return React.useMemo(
    () => ({
      shouldFreezeContent: shouldFreezeRestaurantPanelContent,
      interactionEnabled: shouldEnableRestaurantOverlayInteraction,
      containerStyle: restaurantOverlayAnimatedStyle,
    }),
    [
      restaurantOverlayAnimatedStyle,
      shouldEnableRestaurantOverlayInteraction,
      shouldFreezeRestaurantPanelContent,
    ]
  );
};
