import type { Coordinate } from '../../../../types';
import type { ProfilePreviewActionModel } from './profile-action-model-contract';
import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileTransitionSnapshotCapture } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import {
  resolveProfilePreviewPresentationPlan,
  type ProfilePreviewPresentationPlan,
} from './profile-preview-presentation-plan-runtime';

export const executeProfilePreviewPresentationPlan = ({
  plan,
  placeId,
  transitionSnapshotCapture,
  ports,
}: {
  plan: ProfilePreviewPresentationPlan;
  placeId: string;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
  ports: ProfileActionExecutionPorts;
}): void => {
  ports.prepareForegroundUiForProfileOpen();
  ports.setDismissBehavior(plan.dismissBehavior);
  ports.setShouldClearSearchOnDismiss(plan.shouldClearSearchOnDismiss);
  ports.capturePreparedProfileTransitionSnapshot(transitionSnapshotCapture);
  if (plan.updatedLastCameraState !== undefined) {
    ports.setLastCameraState(plan.updatedLastCameraState);
  }
  ports.setMapHighlightedRestaurantId(placeId);
  ports.seedRestaurantProfile(plan.seededRestaurant, plan.seededRestaurant.placeName);
  ports.openPreparedProfilePresentation(placeId, plan.targetCamera);
  ports.hydrateRestaurantProfileById(placeId);
};

export const executeProfilePreviewAction = ({
  placeId,
  placeName,
  pressedCoordinate,
  previewModel,
  transitionSnapshotCapture,
  ports,
}: {
  placeId: string;
  placeName: string;
  pressedCoordinate: Coordinate | null;
  previewModel: ProfilePreviewActionModel;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
  ports: ProfileActionExecutionPorts;
}): void => {
  const plan = resolveProfilePreviewPresentationPlan({
    placeId,
    placeName,
    pressedCoordinate,
    previewModel,
  });
  if (!plan) {
    return;
  }
  executeProfilePreviewPresentationPlan({
    plan,
    placeId,
    transitionSnapshotCapture,
    ports,
  });
};
