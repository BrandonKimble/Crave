import type { Coordinate, RestaurantResult } from '../../../../types';
import type { ProfileRestaurantCameraActionModel } from './profile-action-model-contract';

export type RestaurantProfileFocusTarget = {
  focusCoordinate: Coordinate;
  focusLocationKey: string;
};

export const resolveRestaurantProfileFocusTarget = ({
  restaurant,
  pressedCoordinate,
  preferPressedCoordinate,
  cameraActionModel: {
    restaurantLocations,
    locationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
  },
}: {
  restaurant: RestaurantResult;
  pressedCoordinate?: Coordinate | null;
  preferPressedCoordinate?: boolean;
  cameraActionModel: ProfileRestaurantCameraActionModel;
}): RestaurantProfileFocusTarget | null => {
  const nextPressedCoordinate = pressedCoordinate ?? null;
  const shouldPreferPressed = preferPressedCoordinate === true;
  const pressedFocusLocation =
    shouldPreferPressed && nextPressedCoordinate
      ? pickClosestLocationToCenter(restaurantLocations, nextPressedCoordinate)
      : null;
  const focusLocation =
    pressedFocusLocation ??
    pickPreferredRestaurantMapLocation(restaurant, locationSelectionAnchor) ??
    null;
  const focusCoordinate = focusLocation
    ? ({ lng: focusLocation.longitude, lat: focusLocation.latitude } as Coordinate)
    : nextPressedCoordinate ?? null;

  if (!focusCoordinate) {
    return null;
  }

  return {
    focusCoordinate,
    focusLocationKey: focusLocation
      ? `${restaurant.restaurantId}:${focusLocation.locationId}`
      : nextPressedCoordinate
      ? `${restaurant.restaurantId}:${nextPressedCoordinate.lng.toFixed(
          5
        )}:${nextPressedCoordinate.lat.toFixed(5)}`
      : `${restaurant.restaurantId}:anchor`,
  };
};
