import React from 'react';

import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootMapViewportIntentRuntime = (
  stateFoundationLane: SearchRootStateFoundationLane
): SearchRootMapViewportIntentRuntime => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      restaurantOnlyId: rootPrimitivesRuntime.searchState.restaurantOnlyId,
      mapCenter: rootPrimitivesRuntime.mapState.mapCenter,
      mapZoom: rootPrimitivesRuntime.mapState.mapZoom,
      mapCameraAnimation: rootPrimitivesRuntime.mapState.mapCameraAnimation,
      isFollowingUser: rootPrimitivesRuntime.mapState.isFollowingUser,
    }),
    [
      rootPrimitivesRuntime.mapState.isFollowingUser,
      rootPrimitivesRuntime.mapState.mapCameraAnimation,
      rootPrimitivesRuntime.mapState.mapCenter,
      rootPrimitivesRuntime.mapState.mapZoom,
      rootPrimitivesRuntime.searchState.restaurantOnlyId,
    ]
  );
};
