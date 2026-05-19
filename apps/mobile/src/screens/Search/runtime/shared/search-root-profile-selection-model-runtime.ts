import React from 'react';

import {
  pickClosestLocationToCenter as pickClosestRestaurantLocationToCenter,
  pickPreferredRestaurantMapLocation as pickPreferredRestaurantLocation,
  resolveRestaurantLocationSelectionAnchor as resolveRestaurantLocationAnchor,
  resolveRestaurantMapLocations as resolveRestaurantLocations,
} from '../map/restaurant-location-selection';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type {
  ProfileSelectionModel,
} from '../profile/profile-owner-runtime-contract';
import type { SearchRootRestaurantSelectionModel } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

const PROFILE_MULTI_LOCATION_MIN_ZOOM = 3.5;
const RESTAURANT_FOCUS_CENTER_EPSILON = 1e-5;
const RESTAURANT_FOCUS_ZOOM_EPSILON = 0.01;

export const useSearchRootProfileSelectionModelRuntime = ({
  sessionCoreLane,
  userLocation,
  userLocationRef,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  userLocation: SearchRootEnvironment['userLocation'];
  userLocationRef: SearchRootEnvironment['userLocationRef'];
}) => {
  const { viewportBoundsService } = sessionCoreLane;

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
        latestUserLocation: userLocationRef.current,
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

  const selectionModel = React.useMemo(
    () => ({
      resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor,
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
    }),
    [
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
      resolveRestaurantLocationSelectionAnchor,
      resolveRestaurantMapLocations,
    ]
  );

  const selectionModelForProfileOwner = React.useMemo<ProfileSelectionModel>(
    () => ({
      ...(selectionModel as unknown as Omit<
        ProfileSelectionModel,
        | 'profileMultiLocationMinZoom'
        | 'restaurantFocusCenterEpsilon'
        | 'restaurantFocusZoomEpsilon'
      >),
      profileMultiLocationMinZoom: PROFILE_MULTI_LOCATION_MIN_ZOOM,
      restaurantFocusCenterEpsilon: RESTAURANT_FOCUS_CENTER_EPSILON,
      restaurantFocusZoomEpsilon: RESTAURANT_FOCUS_ZOOM_EPSILON,
    }),
    [selectionModel]
  );

  const restaurantSelectionModel = React.useMemo<
    Pick<
      SearchRootRestaurantSelectionModel,
      | 'resolveRestaurantMapLocations'
      | 'resolveRestaurantLocationSelectionAnchor'
      | 'pickPreferredRestaurantMapLocation'
    >
  >(
    () => ({
      resolveRestaurantMapLocations: selectionModel.resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor:
        selectionModel.resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation:
        selectionModel.pickPreferredRestaurantMapLocation,
    }),
    [selectionModel]
  );

  return {
    selectionModelForProfileOwner,
    restaurantSelectionModel,
  };
};
