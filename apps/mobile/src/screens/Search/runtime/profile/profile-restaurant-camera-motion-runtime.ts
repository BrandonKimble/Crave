import { Dimensions } from 'react-native';
import type {
  CameraSnapshot,
  RestaurantFocusSession,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { MapBounds } from '../../../../types';
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

const shouldAlwaysIssueCameraCommandForProfileSource = (source: SearchProfileSource): boolean =>
  source === 'results_sheet';

const shouldUseMultiLocationZoomForSource = (source: SearchProfileSource): boolean =>
  source === 'results_sheet' ||
  source === 'auto_open_single_candidate' ||
  source === 'autocomplete';

const MAX_MERCATOR_LAT = 85.05112878;
const MIN_WORLD_SPAN = 1e-7;
const MULTI_LOCATION_FIT_MARGIN = 1.12;
const MIN_USABLE_VIEWPORT_FRACTION = 0.2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lngToWorldX = (lng: number): number => (lng + 180) / 360;

const worldXToLng = (x: number): number => x * 360 - 180;

const latToWorldY = (lat: number): number => {
  const clampedLat = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const radians = (clampedLat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
};

const worldYToLat = (y: number): number =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

const resolveUsableViewportFractions = (
  padding: CameraSnapshot['padding']
): { x: number; y: number } => {
  if (!padding) {
    return { x: 1, y: 1 };
  }
  const { width, height } = Dimensions.get('window');
  const usableWidth =
    width > 0 ? (width - padding.paddingLeft - padding.paddingRight) / width : 1;
  const usableHeight =
    height > 0 ? (height - padding.paddingTop - padding.paddingBottom) / height : 1;
  return {
    x: clamp(usableWidth, MIN_USABLE_VIEWPORT_FRACTION, 1),
    y: clamp(usableHeight, MIN_USABLE_VIEWPORT_FRACTION, 1),
  };
};

const resolveCurrentWorldSpan = (bounds: MapBounds): { x: number; y: number } => {
  const westX = lngToWorldX(bounds.southWest.lng);
  const eastX = lngToWorldX(bounds.northEast.lng);
  const southY = latToWorldY(bounds.southWest.lat);
  const northY = latToWorldY(bounds.northEast.lat);
  return {
    x: Math.max(Math.abs(eastX - westX), MIN_WORLD_SPAN),
    y: Math.max(Math.abs(southY - northY), MIN_WORLD_SPAN),
  };
};

const resolveMultiLocationFitCamera = ({
  locations,
  currentBounds,
  currentZoom,
  padding,
  minZoom,
}: {
  locations: ProfileRestaurantCameraActionModel['restaurantLocations'];
  currentBounds: MapBounds | null;
  currentZoom: number;
  padding: CameraSnapshot['padding'];
  minZoom: number;
}): Pick<CameraSnapshot, 'center' | 'zoom'> | null => {
  if (!currentBounds || locations.length < 2) {
    return null;
  }
  const worldPoints = locations
    .map((location) => ({
      x: lngToWorldX(location.longitude),
      y: latToWorldY(location.latitude),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y)
    );
  if (worldPoints.length < 2) {
    return null;
  }
  const minX = Math.min(...worldPoints.map((point) => point.x));
  const maxX = Math.max(...worldPoints.map((point) => point.x));
  const minY = Math.min(...worldPoints.map((point) => point.y));
  const maxY = Math.max(...worldPoints.map((point) => point.y));
  const targetSpanX = Math.max(maxX - minX, MIN_WORLD_SPAN);
  const targetSpanY = Math.max(maxY - minY, MIN_WORLD_SPAN);
  const currentSpan = resolveCurrentWorldSpan(currentBounds);
  const usableFractions = resolveUsableViewportFractions(padding);
  const requiredSpanX = (targetSpanX * MULTI_LOCATION_FIT_MARGIN) / usableFractions.x;
  const requiredSpanY = (targetSpanY * MULTI_LOCATION_FIT_MARGIN) / usableFractions.y;
  const fitZoomX = currentZoom + Math.log2(currentSpan.x / requiredSpanX);
  const fitZoomY = currentZoom + Math.log2(currentSpan.y / requiredSpanY);
  const fitZoom = Math.min(fitZoomX, fitZoomY);
  if (!Number.isFinite(fitZoom)) {
    return null;
  }
  return {
    center: [worldXToLng((minX + maxX) / 2), worldYToLat((minY + maxY) / 2)],
    zoom: Math.max(minZoom, Math.min(currentZoom, fitZoom)),
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
    currentViewportBounds,
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
      const multiLocationFitCamera = resolveMultiLocationFitCamera({
        locations: restaurantLocations,
        currentBounds: currentViewportBounds,
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
