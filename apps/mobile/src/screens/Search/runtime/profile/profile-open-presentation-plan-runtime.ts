import type { Coordinate, RestaurantResult } from '../../../../types';
import type { CameraSnapshot } from './profile-transition-state-contract';
import type { ProfileOpenActionModel, SearchProfileSource } from './profile-action-model-contract';
import {
  resolveRestaurantProfileCameraMotion,
  type RestaurantProfileCameraMotionResolution,
} from './profile-restaurant-camera-motion-runtime';
import { resolveRestaurantProfileFocusTarget } from './profile-restaurant-focus-target-runtime';

const resolveShouldClearSearchOnProfileDismiss = ({
  restaurantId,
  source,
  restaurantOnlyId,
  restaurantOnlySearchId,
}: {
  restaurantId: string;
  source: SearchProfileSource;
  restaurantOnlyId: string | null;
  restaurantOnlySearchId: string | null;
}): boolean => {
  if (source === 'auto_open_single_candidate' || source === 'autocomplete') {
    return true;
  }
  return restaurantOnlySearchId === restaurantId || restaurantOnlyId === restaurantId;
};

const shouldTrackOpenedRestaurantProfile = (source: SearchProfileSource): boolean =>
  source !== 'autocomplete' && source !== 'dish_card';

const shouldPreferPressedCoordinateForProfileOpen = ({
  source,
  pressedCoordinate,
  transitionStatus,
  currentPanelRestaurantId,
  nextRestaurantId,
}: {
  source: SearchProfileSource;
  pressedCoordinate: Coordinate | null;
  transitionStatus: ProfileOpenActionModel['transitionStatus'];
  currentPanelRestaurantId: string | null;
  nextRestaurantId: string;
}): boolean =>
  source === 'results_sheet' &&
  Boolean(pressedCoordinate) &&
  (transitionStatus === 'opening' || transitionStatus === 'open') &&
  currentPanelRestaurantId === nextRestaurantId;

export type ProfileOpenPresentationPlan = {
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: boolean;
  shouldTrackRestaurantView: boolean;
  targetCamera: CameraSnapshot | null;
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
  const {
    transitionStatus,
    currentPanelRestaurantId,
    restaurantOnlyId,
    restaurantOnlySearchId,
    restaurantCameraActionModel,
  } = actionModel;
  if (transitionStatus === 'closing') {
    return null;
  }
  const shouldClearSearchOnDismiss = resolveShouldClearSearchOnProfileDismiss({
    restaurantId: restaurant.restaurantId,
    source,
    restaurantOnlyId,
    restaurantOnlySearchId,
  });
  const shouldPreferPressedCoordinate = shouldPreferPressedCoordinateForProfileOpen({
    source,
    pressedCoordinate,
    transitionStatus,
    currentPanelRestaurantId,
    nextRestaurantId: restaurant.restaurantId,
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
    nextFocusSession: cameraTargetResolution.nextFocusSession,
    nextMultiLocationZoomBaseline: cameraTargetResolution.nextMultiLocationZoomBaseline,
    updatedLastCameraState: cameraTargetResolution.updatedLastCameraState,
  };
};
