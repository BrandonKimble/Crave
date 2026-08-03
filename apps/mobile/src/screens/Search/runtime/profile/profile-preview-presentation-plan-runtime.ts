import type { Coordinate, RestaurantResultScorePreview } from '../../../../types';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfilePreviewActionModel } from './profile-action-model-contract';
import {
  resolveProfilePreviewCameraTarget,
  type ProfilePreviewCameraTargetResolution,
} from './profile-preview-camera-target-runtime';

export type ProfilePreviewPresentationPlan = {
  seededRestaurant: RestaurantResultScorePreview;
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: false;
  targetCamera: CameraSnapshot | null;
  updatedLastCameraState: ProfilePreviewCameraTargetResolution['updatedLastCameraState'];
};

export const resolveProfilePreviewPresentationPlan = ({
  restaurantId,
  restaurantName,
  pressedCoordinate,
  previewModel,
}: {
  restaurantId: string;
  restaurantName: string;
  pressedCoordinate: Coordinate | null;
  previewModel: ProfilePreviewActionModel;
}): ProfilePreviewPresentationPlan | null => {
  const trimmedName = restaurantName.trim();
  if (!restaurantId || !trimmedName) {
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
      scoreSubjectType: 'restaurant',
      scoreSubjectId: restaurantId,
      craveScore: null,
      totalDishCount: 0,
      topFood: [],
    },
    // F1057: 'restore', unconditionally. This used to read
    // `forceMiddleSnap ? 'restore' : 'clear'` — a sheet-snap boolean choosing a dismiss
    // behavior. The 'clear' arm was unreachable anyway: the sole consumer
    // (profile-owner-action-surface-runtime.ts:97) requires dismissBehavior === 'clear' AND
    // getProfileShouldClearSearchOnDismiss(), and this plan hardcodes the latter false.
    // Dismiss behavior is a property of the OPEN SOURCE — the open plan already derives it
    // that way (profile-open-presentation-plan-runtime.ts:10-11).
    dismissBehavior: 'restore',
    shouldClearSearchOnDismiss: false,
    targetCamera: previewCameraResolution.targetCamera,
    updatedLastCameraState: previewCameraResolution.updatedLastCameraState,
  };
};
