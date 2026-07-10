import type { Coordinate, RestaurantResult } from '../../../../types';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileOpenActionModel, SearchProfileSource } from './profile-action-model-contract';
import {
  resolveRestaurantProfileCameraMotion,
  type RestaurantProfileCameraMotionResolution,
} from './profile-restaurant-camera-motion-runtime';
import { resolveRestaurantProfileFocusTarget } from './profile-restaurant-focus-target-runtime';

const resolveShouldClearSearchOnProfileDismiss = (source: SearchProfileSource): boolean =>
  source === 'auto_open_single_candidate' || source === 'autocomplete';

const shouldTrackOpenedRestaurantProfile = (source: SearchProfileSource): boolean =>
  source !== 'autocomplete' && source !== 'dish_card';

const shouldPreferPressedCoordinateForProfileOpen = ({
  source,
  pressedCoordinate,
}: {
  source: SearchProfileSource;
  pressedCoordinate: Coordinate | null;
}): boolean => source === 'results_sheet' && Boolean(pressedCoordinate);

export type ProfileOpenPresentationPlan = {
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: boolean;
  shouldTrackRestaurantView: boolean;
  targetCamera: CameraSnapshot | null;
  selectedLocationId: string | null;
  nextFocusSession: RestaurantProfileCameraMotionResolution['nextFocusSession'];
  nextMultiLocationZoomBaseline: number | null;
  updatedLastCameraState: RestaurantProfileCameraMotionResolution['updatedLastCameraState'];
};

export const resolveProfileOpenPresentationPlan = ({
  restaurant,
  source,
  pressedCoordinate,
  actionModel,
}: {
  restaurant: RestaurantResult;
  source: SearchProfileSource;
  pressedCoordinate: Coordinate | null;
  actionModel: Omit<ProfileOpenActionModel, 'queryLabel' | 'transitionSnapshotCapture'>;
}): ProfileOpenPresentationPlan | null => {
  const { restaurantCameraActionModel } = actionModel;
  const shouldClearSearchOnDismiss = resolveShouldClearSearchOnProfileDismiss(source);
  const shouldPreferPressedCoordinate = shouldPreferPressedCoordinateForProfileOpen({
    source,
    pressedCoordinate,
  });
  const focusTarget = resolveRestaurantProfileFocusTarget({
    restaurant,
    pressedCoordinate,
    preferPressedCoordinate: shouldPreferPressedCoordinate,
    cameraActionModel: restaurantCameraActionModel,
  });
  const cameraTargetResolution = resolveRestaurantProfileCameraMotion({
    restaurantId: restaurant.restaurantId,
    source,
    focusTarget,
    cameraActionModel: restaurantCameraActionModel,
  });
  return {
    dismissBehavior: shouldClearSearchOnDismiss ? 'clear' : 'restore',
    shouldClearSearchOnDismiss,
    shouldTrackRestaurantView: shouldTrackOpenedRestaurantProfile(source),
    targetCamera: cameraTargetResolution.targetCamera,
    selectedLocationId: focusTarget?.focusLocationId ?? null,
    nextFocusSession: cameraTargetResolution.nextFocusSession,
    nextMultiLocationZoomBaseline: cameraTargetResolution.nextMultiLocationZoomBaseline,
    updatedLastCameraState: cameraTargetResolution.updatedLastCameraState,
  };
};
