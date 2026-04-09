import type { CameraSnapshot, RestaurantFocusSession } from './profile-transition-state-contract';
import type {
  ProfileRestaurantCameraActionModel,
  SearchProfileSource,
} from './profile-action-model-contract';
import type { RestaurantProfileFocusTarget } from './profile-restaurant-focus-target-runtime';

export type RestaurantProfileCameraMotionResolution = {
  targetCamera: CameraSnapshot | null;
  nextFocusSession: RestaurantFocusSession | null;
  nextMultiLocationZoomBaseline: number | null;
  updatedLastCameraState: { center: [number, number]; zoom: number } | null | undefined;
};

const shouldMoveCameraForProfileSource = (source: SearchProfileSource): boolean =>
  source === 'results_sheet' ||
  source === 'dish_card' ||
  source === 'autocomplete' ||
  source === 'auto_open_single_candidate';

const shouldUseMultiLocationZoomForSource = (source: SearchProfileSource): boolean =>
  source === 'results_sheet' ||
  source === 'auto_open_single_candidate' ||
  source === 'autocomplete';

export const resolveRestaurantProfileCameraMotion = ({
  restaurantId,
  source,
  focusTarget,
  cameraActionModel: {
    profilePadding,
    restaurantLocations,
    previousFocusSession,
    currentLastCameraState,
    currentMapZoom,
    multiLocationZoomBaseline,
    profileMultiLocationZoomOutDelta,
    profileMultiLocationMinZoom,
    restaurantFocusCenterEpsilon,
    restaurantFocusZoomEpsilon,
  },
}: {
  restaurantId: string;
  source: SearchProfileSource;
  focusTarget: RestaurantProfileFocusTarget | null;
  cameraActionModel: ProfileRestaurantCameraActionModel;
}): RestaurantProfileCameraMotionResolution => {
  if (!shouldMoveCameraForProfileSource(source) || !focusTarget) {
    return {
      targetCamera: null,
      nextFocusSession: null,
      nextMultiLocationZoomBaseline: multiLocationZoomBaseline,
      updatedLastCameraState: undefined,
    };
  }

  const { focusCoordinate, focusLocationKey } = focusTarget;
  const isSameRestaurantFocusSession = previousFocusSession.restaurantId === restaurantId;
  const isMultiLocationTarget =
    shouldUseMultiLocationZoomForSource(source) && restaurantLocations.length > 1;
  const nextCenter: [number, number] = [focusCoordinate.lng, focusCoordinate.lat];
  let nextHasAppliedMultiLocationZoomOut =
    previousFocusSession.hasAppliedInitialMultiLocationZoomOut;
  let nextMultiLocationZoomBaseline = multiLocationZoomBaseline;
  const currentZoom =
    currentLastCameraState?.zoom ?? (typeof currentMapZoom === 'number' ? currentMapZoom : null);

  if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
    let nextZoom = currentZoom;

    if (isMultiLocationTarget) {
      if (
        typeof nextMultiLocationZoomBaseline !== 'number' ||
        !Number.isFinite(nextMultiLocationZoomBaseline)
      ) {
        nextMultiLocationZoomBaseline = currentZoom;
        nextZoom = Math.max(
          currentZoom - profileMultiLocationZoomOutDelta,
          profileMultiLocationMinZoom
        );
      }
      nextHasAppliedMultiLocationZoomOut = true;
    } else if (
      typeof nextMultiLocationZoomBaseline === 'number' &&
      Number.isFinite(nextMultiLocationZoomBaseline)
    ) {
      nextZoom = nextMultiLocationZoomBaseline;
      nextMultiLocationZoomBaseline = null;
      nextHasAppliedMultiLocationZoomOut = false;
    } else {
      nextHasAppliedMultiLocationZoomOut = false;
    }

    const isSameFocusedLocation =
      isSameRestaurantFocusSession && previousFocusSession.locationKey === focusLocationKey;
    const currentCenter = currentLastCameraState?.center ?? null;
    const isAlreadyCenteredOnTarget =
      currentCenter != null &&
      Math.abs(currentCenter[0] - nextCenter[0]) <= restaurantFocusCenterEpsilon &&
      Math.abs(currentCenter[1] - nextCenter[1]) <= restaurantFocusCenterEpsilon;
    const isAlreadyAtTargetZoom = Math.abs(currentZoom - nextZoom) <= restaurantFocusZoomEpsilon;

    if (isSameFocusedLocation && isAlreadyCenteredOnTarget && isAlreadyAtTargetZoom) {
      return {
        targetCamera: null,
        nextFocusSession: null,
        nextMultiLocationZoomBaseline,
        updatedLastCameraState: undefined,
      };
    }

    return {
      targetCamera: {
        center: nextCenter,
        zoom: nextZoom,
        padding: profilePadding,
      },
      nextFocusSession: {
        restaurantId,
        locationKey: focusLocationKey,
        hasAppliedInitialMultiLocationZoomOut: nextHasAppliedMultiLocationZoomOut,
      },
      nextMultiLocationZoomBaseline,
      updatedLastCameraState: undefined,
    };
  }

  if (currentLastCameraState) {
    return {
      targetCamera: null,
      nextFocusSession: {
        restaurantId,
        locationKey: focusLocationKey,
        hasAppliedInitialMultiLocationZoomOut: nextHasAppliedMultiLocationZoomOut,
      },
      nextMultiLocationZoomBaseline,
      updatedLastCameraState: {
        ...currentLastCameraState,
        center: nextCenter,
      },
    };
  }

  return {
    targetCamera: null,
    nextFocusSession: null,
    nextMultiLocationZoomBaseline,
    updatedLastCameraState: undefined,
  };
};
