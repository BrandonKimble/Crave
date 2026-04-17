import type { Coordinate, RestaurantResult } from '../../../../types';
import type { ProfileOpenActionModel, SearchProfileSource } from './profile-action-model-contract';
import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileTransitionSnapshotCapture } from './profile-transition-state-contract';
import {
  resolveProfileOpenPresentationPlan,
  type ProfileOpenPresentationPlan,
} from './profile-open-presentation-plan-runtime';

export const executeProfileOpenPresentationPlan = ({
  plan,
  restaurant,
  source,
  forceMiddleSnap,
  queryLabel,
  transitionSnapshotCapture,
  ports,
}: {
  plan: ProfileOpenPresentationPlan;
  restaurant: RestaurantResult;
  source: SearchProfileSource;
  forceMiddleSnap: boolean;
  queryLabel: string;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
  ports: ProfileActionExecutionPorts;
}): void => {
  ports.setDismissBehavior(plan.dismissBehavior);
  ports.setShouldClearSearchOnDismiss(plan.shouldClearSearchOnDismiss);
  const savedForegroundUiState = ports.prepareForegroundUiForProfileOpen({
    captureSaveSheetState: true,
  });
  ports.capturePreparedProfileTransitionSnapshot(transitionSnapshotCapture);
  if (plan.nextFocusSession) {
    ports.setNextFocusSession(plan.nextFocusSession);
  }
  ports.setMultiLocationZoomBaseline(plan.nextMultiLocationZoomBaseline);
  if (plan.updatedLastCameraState !== undefined) {
    ports.setLastCameraState(plan.updatedLastCameraState);
  }
  ports.openPreparedProfilePresentation(
    restaurant.restaurantId,
    plan.targetCamera,
    forceMiddleSnap,
    'opening'
  );
  ports.capturePreviousForegroundUiRestoreStateIfAbsent(savedForegroundUiState);
  ports.seedRestaurantProfile(restaurant, queryLabel);
  ports.hydrateRestaurantProfileById(restaurant.restaurantId, restaurant.marketKey ?? null);
  if (plan.shouldTrackRestaurantView) {
    ports.deferRecentlyViewedTrack(restaurant.restaurantId, restaurant.restaurantName);
    void ports.recordRestaurantView(restaurant.restaurantId, source);
  }
};

export const executeProfileOpenAction = ({
  restaurant,
  source,
  pressedCoordinate,
  forceMiddleSnap,
  actionModel,
  ports,
}: {
  restaurant: RestaurantResult;
  source: SearchProfileSource;
  pressedCoordinate: Coordinate | null;
  forceMiddleSnap: boolean;
  actionModel: ProfileOpenActionModel;
  ports: ProfileActionExecutionPorts;
}): void => {
  const plan = resolveProfileOpenPresentationPlan({
    restaurant,
    source,
    pressedCoordinate,
    actionModel,
  });
  if (!plan) {
    return;
  }
  executeProfileOpenPresentationPlan({
    plan,
    restaurant,
    source,
    forceMiddleSnap,
    queryLabel: actionModel.queryLabel,
    transitionSnapshotCapture: actionModel.transitionSnapshotCapture,
    ports,
  });
};
