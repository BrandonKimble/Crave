import type { Coordinate, RestaurantResult } from '../../../../types';
import type { CameraSnapshot } from './profile-transition-state-contract';
import type { ProfilePreviewActionModel } from './profile-action-model-contract';
import {
  resolveProfilePreviewCameraTarget,
  type ProfilePreviewCameraTargetResolution,
} from './profile-preview-camera-target-runtime';

export type ProfilePreviewPresentationPlan = {
  seededRestaurant: RestaurantResult;
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: false;
  targetCamera: CameraSnapshot | null;
  updatedLastCameraState: ProfilePreviewCameraTargetResolution['updatedLastCameraState'];
  shouldResetSavedSheetSnap: boolean;
  status: 'opening' | 'open';
};

export const resolveProfilePreviewPresentationPlan = ({
  restaurantId,
  restaurantName,
  pressedCoordinate,
  forceMiddleSnap,
  previewModel,
}: {
  restaurantId: string;
  restaurantName: string;
  pressedCoordinate: Coordinate | null;
  forceMiddleSnap: boolean;
  previewModel: ProfilePreviewActionModel;
}): ProfilePreviewPresentationPlan | null => {
  const trimmedName = restaurantName.trim();
  const { transitionStatus } = previewModel;
  if (!restaurantId || !trimmedName || transitionStatus === 'closing') {
    return null;
  }
  const previewCameraResolution = resolveProfilePreviewCameraTarget({
    pressedCoordinate,
    previewModel,
  });
  return {
    seededRestaurant: {
      restaurantId,
      restaurantName: trimmedName,
      restaurantAliases: [],
      contextualScore: 0,
      totalDishCount: 0,
      topFood: [],
    },
    dismissBehavior: forceMiddleSnap ? 'restore' : 'clear',
    shouldClearSearchOnDismiss: false,
    targetCamera: previewCameraResolution.targetCamera,
    updatedLastCameraState: previewCameraResolution.updatedLastCameraState,
    shouldResetSavedSheetSnap: !forceMiddleSnap,
    status: forceMiddleSnap ? 'opening' : 'open',
  };
};
