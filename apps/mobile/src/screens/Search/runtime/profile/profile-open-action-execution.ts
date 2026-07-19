import type { Coordinate, RestaurantResult } from '../../../../types';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { ProfileOpenActionModel, SearchProfileSource } from './profile-action-model-contract';
import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileTransitionSnapshotCapture } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import {
  resolveProfileOpenPresentationPlan,
  type ProfileOpenPresentationPlan,
} from './profile-open-presentation-plan-runtime';

const APPROX_METERS_PER_LAT_DEGREE = 111_320;
const SELECTED_PIN_CAMERA_TARGET_TOLERANCE_METERS = 8;

const approximateCoordinateDistanceMeters = (first: Coordinate, second: Coordinate): number => {
  const averageLatRadians = (((first.lat + second.lat) / 2) * Math.PI) / 180;
  const metersPerLngDegree = APPROX_METERS_PER_LAT_DEGREE * Math.cos(averageLatRadians);
  const dx = (first.lng - second.lng) * metersPerLngDegree;
  const dy = (first.lat - second.lat) * APPROX_METERS_PER_LAT_DEGREE;
  return Math.sqrt(dx * dx + dy * dy);
};

export const executeProfileOpenPresentationPlan = ({
  plan,
  restaurant,
  source,
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
  ports.setMapHighlightedRestaurantId(restaurant.restaurantId);
  ports.seedRestaurantProfile(restaurant, queryLabel, {
    selectedLocationId: plan.selectedLocationId,
  });
  ports.openPreparedProfilePresentation(restaurant.restaurantId, plan.targetCamera);
  ports.capturePreviousForegroundUiRestoreStateIfAbsent(savedForegroundUiState);
  ports.hydrateRestaurantProfileById(restaurant.restaurantId);
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
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (isPerfScenarioAttributionActive(scenarioConfig)) {
    const targetPadding = plan.targetCamera?.padding ?? null;
    const targetCenter = plan.targetCamera?.center ?? null;
    const pressedTargetDistanceMeters =
      pressedCoordinate != null && targetCenter != null
        ? approximateCoordinateDistanceMeters(pressedCoordinate, {
            lng: targetCenter[0],
            lat: targetCenter[1],
          })
        : null;
    const targetMatchesPressedPin =
      pressedTargetDistanceMeters != null &&
      pressedTargetDistanceMeters <= SELECTED_PIN_CAMERA_TARGET_TOLERANCE_METERS;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'profile_pin_selection_camera_contract',
      restaurantId: restaurant.restaurantId,
      source,
      hasPressedCoordinate: pressedCoordinate != null,
      pressedLng: pressedCoordinate?.lng ?? null,
      pressedLat: pressedCoordinate?.lat ?? null,
      selectedLocationId: plan.selectedLocationId,
      hasTargetCamera: plan.targetCamera != null,
      targetLng: targetCenter?.[0] ?? null,
      targetLat: targetCenter?.[1] ?? null,
      targetZoom: plan.targetCamera?.zoom ?? null,
      paddingTop: targetPadding?.paddingTop ?? null,
      paddingBottom: targetPadding?.paddingBottom ?? null,
      paddingLeft: targetPadding?.paddingLeft ?? null,
      paddingRight: targetPadding?.paddingRight ?? null,
      pressedTargetDistanceMeters,
      targetMatchesPressedPin,
      centersAboveSheet:
        targetPadding != null &&
        typeof targetPadding.paddingBottom === 'number' &&
        targetPadding.paddingBottom > targetPadding.paddingTop,
    });
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
