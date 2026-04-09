import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileSelectionModel } from './profile-owner-runtime-contract';

type UseProfileOwnerSelectionActionContextRuntimeArgs = {
  selectionModel: ProfileSelectionModel;
};

export const useProfileOwnerSelectionActionContextRuntime = ({
  selectionModel,
}: UseProfileOwnerSelectionActionContextRuntimeArgs): CreateProfileActionRuntimeArgs['selectionState'] =>
  React.useMemo(
    () => ({
      resolveRestaurantMapLocations: selectionModel.resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor:
        selectionModel.resolveRestaurantLocationSelectionAnchor,
      pickClosestLocationToCenter: selectionModel.pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation: selectionModel.pickPreferredRestaurantMapLocation,
      profileMultiLocationZoomOutDelta: selectionModel.profileMultiLocationZoomOutDelta,
      profileMultiLocationMinZoom: selectionModel.profileMultiLocationMinZoom,
      restaurantFocusCenterEpsilon: selectionModel.restaurantFocusCenterEpsilon,
      restaurantFocusZoomEpsilon: selectionModel.restaurantFocusZoomEpsilon,
    }),
    [
      selectionModel.pickClosestLocationToCenter,
      selectionModel.pickPreferredRestaurantMapLocation,
      selectionModel.profileMultiLocationMinZoom,
      selectionModel.profileMultiLocationZoomOutDelta,
      selectionModel.resolveRestaurantLocationSelectionAnchor,
      selectionModel.resolveRestaurantMapLocations,
      selectionModel.restaurantFocusCenterEpsilon,
      selectionModel.restaurantFocusZoomEpsilon,
    ]
  );
