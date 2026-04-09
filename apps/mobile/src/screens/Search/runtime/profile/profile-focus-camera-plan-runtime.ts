import type { Coordinate, RestaurantResult } from '../../../../types';
import type { ProfileFocusActionModel, SearchProfileSource } from './profile-action-model-contract';
import { resolveRestaurantProfileCameraMotion } from './profile-restaurant-camera-motion-runtime';
import { resolveRestaurantProfileFocusTarget } from './profile-restaurant-focus-target-runtime';

export const resolveProfileFocusCameraPlan = ({
  restaurant,
  source,
  pressedCoordinate,
  preferPressedCoordinate,
  actionModel,
}: {
  restaurant: RestaurantResult;
  source: SearchProfileSource;
  pressedCoordinate?: Coordinate | null;
  preferPressedCoordinate?: boolean;
  actionModel: ProfileFocusActionModel;
}) => {
  const focusTarget = resolveRestaurantProfileFocusTarget({
    restaurant,
    pressedCoordinate,
    preferPressedCoordinate,
    cameraActionModel: actionModel.restaurantCameraActionModel,
  });

  return resolveRestaurantProfileCameraMotion({
    restaurantId: restaurant.restaurantId,
    source,
    focusTarget,
    cameraActionModel: actionModel.restaurantCameraActionModel,
  });
};
