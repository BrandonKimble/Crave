import { Dimensions } from 'react-native';
import type {
  CameraSnapshot,
  RestaurantFocusSession,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type {
  ProfileRestaurantCameraActionModel,
  SearchProfileSource,
} from './profile-action-model-contract';
import type { RestaurantProfileFocusTarget } from './profile-restaurant-focus-target-runtime';
import { FOCUS_CAMERA_TUNABLES, resolveFocusCamera } from '../camera/resolve-focus-camera';

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

const shouldAlwaysIssueCameraCommandForProfileSource = (source: SearchProfileSource): boolean =>
  source === 'results_sheet';

const shouldUseMultiLocationZoomForSource = (source: SearchProfileSource): boolean =>
  source === 'auto_open_single_candidate' || source === 'autocomplete';

const MIN_USABLE_VIEWPORT_FRACTION = 0.2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// World-camera L2→profile integration (parent §3.3, owner-ratified Q3): the multi-location
// fit slot runs the shipped anchored robust-cluster focus-fit (resolve-focus-camera.ts)
// instead of the old bounding-box fit. Behavioral intent of the swap: the camera centers
// the ANCHOR (the P5 pick the focus target already carries) and grows a radius over the
// distance-sorted siblings with the self-median outlier cut — so ONE cross-market location
// can no longer drag the zoom out to fit everything (the exact Q3 complaint). The session
// machinery around this slot (zoom baseline restore, epsilon no-ops, per-source policies)
// is untouched.
const resolveMultiLocationFocusCamera = ({
  locations,
  anchor,
  currentZoom,
  padding,
  minZoom,
}: {
  locations: ProfileRestaurantCameraActionModel['restaurantLocations'];
  anchor: { locationKey: string; lng: number; lat: number };
  currentZoom: number;
  padding: CameraSnapshot['padding'];
  minZoom: number;
}): Pick<CameraSnapshot, 'center' | 'zoom'> | null => {
  if (locations.length < 2) {
    return null;
  }
  const { width, height } = Dimensions.get('window');
  const usableWidthPx = padding
    ? Math.max(
        width * MIN_USABLE_VIEWPORT_FRACTION,
        width - padding.paddingLeft - padding.paddingRight
      )
    : width;
  const usableHeightPx = padding
    ? Math.max(
        height * MIN_USABLE_VIEWPORT_FRACTION,
        height - padding.paddingTop - padding.paddingBottom
      )
    : height;
  const focusLocations = locations
    .filter((location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
    .map((location, index) => ({
      locationId: `${location.latitude}:${location.longitude}:${index}`,
      latitude: location.latitude,
      longitude: location.longitude,
    }));
  if (focusLocations.length < 2) {
    return null;
  }
  // The anchor is the focus target's coordinate — match it into the set (the P5 pick is
  // upstream; coordinates are the honest join key here).
  const anchorEntry =
    focusLocations.find(
      (location) =>
        Math.abs(location.latitude - anchor.lat) < 1e-9 &&
        Math.abs(location.longitude - anchor.lng) < 1e-9
    ) ?? focusLocations[0];
  const result = resolveFocusCamera({
    locations: focusLocations,
    anchorLocationId: anchorEntry.locationId,
    safeRegion: { widthPx: usableWidthPx, heightPx: usableHeightPx, mapHeightPx: height },
    currentZoom,
    tunables: { ...FOCUS_CAMERA_TUNABLES, zCityFloor: minZoom },
  });
  return {
    center: [result.center.longitude, result.center.latitude],
    zoom: clamp(result.zoom, minZoom, currentZoom),
  };
};

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
    fallbackZoom,
    multiLocationZoomBaseline,
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
  let nextCenter: [number, number] = [focusCoordinate.lng, focusCoordinate.lat];
  let nextHasAppliedMultiLocationZoomOut =
    previousFocusSession.hasAppliedInitialMultiLocationZoomOut;
  let nextMultiLocationZoomBaseline = multiLocationZoomBaseline;
  const currentZoom =
    currentLastCameraState?.zoom ??
    (typeof currentMapZoom === 'number' ? currentMapZoom : fallbackZoom);

  if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
    let nextZoom = currentZoom;

    if (isMultiLocationTarget) {
      if (
        typeof nextMultiLocationZoomBaseline !== 'number' ||
        !Number.isFinite(nextMultiLocationZoomBaseline)
      ) {
        nextMultiLocationZoomBaseline = currentZoom;
      }
      const multiLocationFitCamera = resolveMultiLocationFocusCamera({
        locations: restaurantLocations,
        anchor: {
          locationKey: focusLocationKey,
          lng: focusCoordinate.lng,
          lat: focusCoordinate.lat,
        },
        currentZoom,
        padding: profilePadding,
        minZoom: profileMultiLocationMinZoom,
      });
      if (multiLocationFitCamera) {
        nextCenter = multiLocationFitCamera.center;
        nextZoom = multiLocationFitCamera.zoom;
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

    if (
      !shouldAlwaysIssueCameraCommandForProfileSource(source) &&
      isSameFocusedLocation &&
      isAlreadyCenteredOnTarget &&
      isAlreadyAtTargetZoom
    ) {
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
