import React from 'react';

import type { RestaurantRouteHostPresentationState } from './restaurantRouteHostContract';
import type { SearchRouteHostVisualState } from './searchOverlayRouteHostContract';

type UseRestaurantRoutePresentationStateRuntimeArgs = {
  visualState: Pick<
    SearchRouteHostVisualState,
    'sheetTranslateY' | 'resultsScrollOffset' | 'resultsMomentum'
  >;
};

export type RestaurantRoutePresentationStateRuntime = {
  presentationState: RestaurantRouteHostPresentationState;
};

export const useRestaurantRoutePresentationStateRuntime = ({
  visualState,
}: UseRestaurantRoutePresentationStateRuntimeArgs): RestaurantRoutePresentationStateRuntime => {
  const presentationState = React.useMemo(
    () => ({
      sheetY: visualState.sheetTranslateY,
      scrollOffset: visualState.resultsScrollOffset,
      momentumFlag: visualState.resultsMomentum,
    }),
    [visualState.resultsMomentum, visualState.resultsScrollOffset, visualState.sheetTranslateY]
  );

  return React.useMemo(
    () => ({
      presentationState,
    }),
    [presentationState]
  );
};
