import type { Coordinate } from '../../../../types';
import type { ProfilePreviewActionModel } from './profile-action-model-contract';
import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileTransitionSnapshotCapture } from './profile-transition-state-contract';
import {
  resolveProfilePreviewPresentationPlan,
  type ProfilePreviewPresentationPlan,
} from './profile-preview-presentation-plan-runtime';

export const executeProfilePreviewPresentationPlan = ({
  plan,
  restaurantId,
  forceMiddleSnap,
  transitionSnapshotCapture,
  ports,
}: {
  plan: ProfilePreviewPresentationPlan;
  restaurantId: string;
  forceMiddleSnap: boolean;
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
  if (plan.shouldResetSavedSheetSnap) {
    ports.resetPreparedProfileSavedSheetSnap();
  }
  ports.openPreparedProfilePresentation(
    restaurantId,
    plan.targetCamera,
    forceMiddleSnap,
    plan.status
  );
  ports.seedRestaurantProfile(plan.seededRestaurant, plan.seededRestaurant.restaurantName);
  ports.hydrateRestaurantProfileById(restaurantId, plan.seededRestaurant.marketKey ?? null);
};

export const executeProfilePreviewAction = ({
  restaurantId,
  restaurantName,
  pressedCoordinate,
  forceMiddleSnap,
  previewModel,
  transitionSnapshotCapture,
  ports,
}: {
  restaurantId: string;
  restaurantName: string;
  pressedCoordinate: Coordinate | null;
  forceMiddleSnap: boolean;
  previewModel: ProfilePreviewActionModel;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
  ports: ProfileActionExecutionPorts;
}): void => {
  const plan = resolveProfilePreviewPresentationPlan({
    restaurantId,
    restaurantName,
    pressedCoordinate,
    forceMiddleSnap,
    previewModel,
  });
  if (!plan) {
    return;
  }
  executeProfilePreviewPresentationPlan({
    plan,
    restaurantId,
    forceMiddleSnap,
    transitionSnapshotCapture,
    ports,
  });
};
