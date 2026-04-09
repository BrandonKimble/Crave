import React from 'react';

import {
  pickClosestLocationToCenter as pickClosestRestaurantLocationToCenter,
  pickPreferredRestaurantMapLocation as pickPreferredRestaurantLocation,
  resolveRestaurantLocationSelectionAnchor as resolveRestaurantLocationAnchor,
  resolveRestaurantMapLocations as resolveRestaurantLocations,
} from '../map/restaurant-location-selection';
import type {
  SearchRootRestaurantSelectionModel,
  UseSearchRootProfileActionRuntimeArgs,
} from './use-search-root-profile-action-runtime-contract';

type UseSearchRootProfileSelectionModelRuntimeArgs = Pick<
  UseSearchRootProfileActionRuntimeArgs,
  'userLocation' | 'userLocationRef' | 'rootSessionRuntime'
>;

export const useSearchRootProfileSelectionModelRuntime = ({
  userLocation,
  userLocationRef,
  rootSessionRuntime,
}: UseSearchRootProfileSelectionModelRuntimeArgs): SearchRootRestaurantSelectionModel => {
  const {
    runtimeOwner: { viewportBoundsService },
  } = rootSessionRuntime;

  const resolveRestaurantMapLocations = React.useCallback(
    (restaurant: Parameters<typeof resolveRestaurantLocations>[0]) =>
      resolveRestaurantLocations(restaurant),
    []
  );
  const resolveRestaurantLocationSelectionAnchor = React.useCallback(
    () =>
      resolveRestaurantLocationAnchor({
        viewportBoundsService,
        userLocation,
        fallbackUserLocation: userLocationRef.current,
      }),
    [userLocation, userLocationRef, viewportBoundsService]
  );
  const pickClosestLocationToCenter = React.useCallback(
    (
      locations: ReturnType<typeof resolveRestaurantLocations>,
      center: Parameters<typeof pickClosestRestaurantLocationToCenter>[1]
    ) => pickClosestRestaurantLocationToCenter(locations, center),
    []
  );
  const pickPreferredRestaurantMapLocation = React.useCallback(
    (
      restaurant: Parameters<typeof pickPreferredRestaurantLocation>[0],
      anchor: Parameters<typeof pickPreferredRestaurantLocation>[1]
    ) => pickPreferredRestaurantLocation(restaurant, anchor),
    []
  );

  return {
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
  };
};
