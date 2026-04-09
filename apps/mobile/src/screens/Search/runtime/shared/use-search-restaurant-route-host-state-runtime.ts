import React from 'react';

import {
  createRestaurantRouteHostState,
  type RestaurantRouteHostPresentationState,
  type RestaurantRouteHostSnapController,
  type RestaurantRouteHostState,
  type RestaurantRouteHostVisualState,
} from '../../../../overlays/restaurantRouteHostContract';
import type { RestaurantRoutePanelHostConfig } from '../../../../overlays/restaurantRoutePanelContract';

type UseSearchRestaurantRouteHostStateRuntimeArgs = {
  hostConfig: RestaurantRoutePanelHostConfig | null;
  restaurantSheetSnapController: RestaurantRouteHostSnapController;
  searchSheetVisualContextValue: RestaurantRouteHostVisualState;
};

export const useSearchRestaurantRouteHostStateRuntime = ({
  hostConfig,
  restaurantSheetSnapController,
  searchSheetVisualContextValue,
}: UseSearchRestaurantRouteHostStateRuntimeArgs): RestaurantRouteHostState => {
  const presentationState = React.useMemo<RestaurantRouteHostPresentationState>(
    () => ({
      sheetY: searchSheetVisualContextValue.sheetTranslateY,
      scrollOffset: searchSheetVisualContextValue.resultsScrollOffset,
      momentumFlag: searchSheetVisualContextValue.resultsMomentum,
    }),
    [searchSheetVisualContextValue]
  );

  return React.useMemo(
    () =>
      createRestaurantRouteHostState({
        hostConfig,
        presentationState,
        snapController: restaurantSheetSnapController,
        navBarTop: searchSheetVisualContextValue.navBarTopForSnaps,
        searchBarTop: searchSheetVisualContextValue.searchBarTop,
        headerActionProgress: searchSheetVisualContextValue.overlayHeaderActionProgress,
        navBarHeight: searchSheetVisualContextValue.navBarCutoutHeight,
        navBarHiddenTranslateY: searchSheetVisualContextValue.bottomNavHiddenTranslateY,
      }),
    [hostConfig, presentationState, restaurantSheetSnapController, searchSheetVisualContextValue]
  );
};
