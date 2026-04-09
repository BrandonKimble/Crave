import type { RestaurantResult } from '../../../../types';
import type { ProfileRestaurantActionModelRuntimeArgs } from './profile-action-runtime-port-contract';
import type {
  ProfileFocusActionModel,
  ProfileOpenActionModel,
  ProfileRestaurantCameraActionModel,
} from './profile-action-model-contract';
import {
  createProfileFocusActionModel,
  createProfileOpenActionModel,
  createProfileRestaurantCameraActionModel,
} from './profile-action-models';

export type ProfileRestaurantActionModelRuntime = {
  createRestaurantCameraActionModel: (
    restaurant: RestaurantResult
  ) => ProfileRestaurantCameraActionModel;
  createOpenActionModel: (restaurant: RestaurantResult) => ProfileOpenActionModel;
  createFocusActionModel: (restaurant: RestaurantResult) => ProfileFocusActionModel;
};

export const createProfileRestaurantActionModelRuntime = ({
  queryState: { currentQueryLabel, restaurantOnlyId },
  selectionState: {
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
    profileMultiLocationZoomOutDelta,
    profileMultiLocationMinZoom,
    restaurantFocusCenterEpsilon,
    restaurantFocusZoomEpsilon,
  },
  runtimeState: {
    getProfileTransitionStatus,
    getCurrentPanelRestaurantId,
    getCurrentLastCameraState,
    getCurrentMapZoom,
    resolveProfileCameraPadding,
    getProfileTransitionSnapshotCapture,
    getProfileMultiLocationZoomBaseline,
    getRestaurantFocusSession,
    getRestaurantOnlySearchId,
  },
}: ProfileRestaurantActionModelRuntimeArgs): ProfileRestaurantActionModelRuntime => {
  const createRestaurantCameraActionModel = (
    restaurant: RestaurantResult
  ): ProfileRestaurantCameraActionModel =>
    createProfileRestaurantCameraActionModel({
      profilePadding: resolveProfileCameraPadding(),
      restaurantLocations: resolveRestaurantMapLocations(restaurant),
      locationSelectionAnchor: resolveRestaurantLocationSelectionAnchor(),
      previousFocusSession: getRestaurantFocusSession(),
      currentLastCameraState: getCurrentLastCameraState(),
      currentMapZoom: getCurrentMapZoom(),
      multiLocationZoomBaseline: getProfileMultiLocationZoomBaseline(),
      profileMultiLocationZoomOutDelta,
      profileMultiLocationMinZoom,
      restaurantFocusCenterEpsilon,
      restaurantFocusZoomEpsilon,
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
    });

  const createOpenActionModel = (restaurant: RestaurantResult): ProfileOpenActionModel =>
    createProfileOpenActionModel({
      transitionStatus: getProfileTransitionStatus(),
      currentPanelRestaurantId: getCurrentPanelRestaurantId(),
      restaurantOnlyId,
      restaurantOnlySearchId: getRestaurantOnlySearchId(),
      queryLabel: currentQueryLabel,
      transitionSnapshotCapture: getProfileTransitionSnapshotCapture(),
      restaurantCameraActionModel: createRestaurantCameraActionModel(restaurant),
    });

  const createFocusActionModel = (restaurant: RestaurantResult): ProfileFocusActionModel =>
    createProfileFocusActionModel({
      restaurantCameraActionModel: createRestaurantCameraActionModel(restaurant),
    });

  return {
    createRestaurantCameraActionModel,
    createOpenActionModel,
    createFocusActionModel,
  };
};
