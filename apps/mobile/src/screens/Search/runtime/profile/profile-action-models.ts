import type { CameraSnapshot } from './profile-transition-state-contract';
import type {
  ProfileCloseActionModel,
  ProfileFocusActionModel,
  ProfileOpenActionModel,
  ProfileOpenActionModelInputs,
  ProfilePreviewActionModel,
  ProfilePreviewActionModelInputs,
  ProfileRefreshSelectionActionModel,
  ProfileRestaurantCameraActionModel,
  ProfileRestaurantCameraActionModelInputs,
} from './profile-action-model-contract';

export const createProfilePreviewActionModel = ({
  transitionStatus,
  currentZoom,
  currentLastCameraState,
  profilePadding,
}: ProfilePreviewActionModelInputs): ProfilePreviewActionModel => ({
  transitionStatus,
  currentZoom,
  currentLastCameraState,
  profilePadding,
});

export const createProfileRestaurantCameraActionModel = ({
  profilePadding,
  restaurantLocations,
  locationSelectionAnchor,
  previousFocusSession,
  currentLastCameraState,
  currentMapZoom,
  multiLocationZoomBaseline,
  profileMultiLocationZoomOutDelta,
  profileMultiLocationMinZoom,
  restaurantFocusCenterEpsilon,
  restaurantFocusZoomEpsilon,
  pickClosestLocationToCenter,
  pickPreferredRestaurantMapLocation,
}: {
  profilePadding: CameraSnapshot['padding'];
  restaurantLocations: ProfileRestaurantCameraActionModel['restaurantLocations'];
} & ProfileRestaurantCameraActionModelInputs): ProfileRestaurantCameraActionModel => ({
  profilePadding,
  restaurantLocations,
  locationSelectionAnchor,
  previousFocusSession,
  currentLastCameraState,
  currentMapZoom,
  multiLocationZoomBaseline,
  profileMultiLocationZoomOutDelta,
  profileMultiLocationMinZoom,
  restaurantFocusCenterEpsilon,
  restaurantFocusZoomEpsilon,
  pickClosestLocationToCenter,
  pickPreferredRestaurantMapLocation,
});

export const createProfileCloseActionModel = ({
  hasPanelSnapshot,
  transitionStatus,
  currentRestaurantId,
  options,
}: ProfileCloseActionModel): ProfileCloseActionModel => ({
  hasPanelSnapshot,
  transitionStatus,
  currentRestaurantId,
  options,
});

export const createProfileOpenActionModel = ({
  transitionStatus,
  currentPanelRestaurantId,
  restaurantOnlyId,
  restaurantOnlySearchId,
  queryLabel,
  transitionSnapshotCapture,
  restaurantCameraActionModel,
}: {
  restaurantCameraActionModel: ProfileRestaurantCameraActionModel;
} & ProfileOpenActionModelInputs): ProfileOpenActionModel => ({
  transitionStatus,
  currentPanelRestaurantId,
  restaurantOnlyId,
  restaurantOnlySearchId,
  queryLabel,
  transitionSnapshotCapture,
  restaurantCameraActionModel,
});

export const createProfileFocusActionModel = ({
  restaurantCameraActionModel,
}: ProfileFocusActionModel): ProfileFocusActionModel => ({
  restaurantCameraActionModel,
});

export const createProfileRefreshSelectionActionModel = ({
  restaurant,
  queryLabel,
}: ProfileRefreshSelectionActionModel): ProfileRefreshSelectionActionModel => ({
  restaurant,
  queryLabel,
});
