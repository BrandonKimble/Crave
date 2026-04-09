import React from 'react';

import { buildMapStyleURL } from '../../../../constants/map';
import type { SearchMapWithMarkerEngineProps } from '../../components/SearchMapWithMarkerEngine';
import { USA_FALLBACK_ZOOM } from '../../constants/search';
import { getQualityColorFromScore } from '../../utils/quality';

const MAX_FULL_PINS = 30;
const LOD_PIN_PROMOTE_STABLE_MS_MOVING = 48;
const LOD_PIN_DEMOTE_STABLE_MS_MOVING = 190;
const LOD_PIN_TOGGLE_STABLE_MS_IDLE = 0;
const LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING = 120;
const LOD_VISIBLE_CANDIDATE_BUFFER = 16;

type UseSearchMapPropsArgs = Omit<
  SearchMapWithMarkerEngineProps,
  | 'styleURL'
  | 'mapZoom'
  | 'getQualityColorFromScore'
  | 'maxFullPins'
  | 'lodVisibleCandidateBuffer'
  | 'lodPinPromoteStableMsMoving'
  | 'lodPinDemoteStableMsMoving'
  | 'lodPinToggleStableMsIdle'
  | 'lodPinOffscreenToggleStableMsMoving'
  | 'disableMarkers'
> & {
  accessToken: string | null | undefined;
  mapZoom: number | null;
};

export const useSearchMapProps = ({
  accessToken,
  scoreMode,
  restaurantOnlyId,
  highlightedRestaurantId,
  viewportBoundsService,
  resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation,
  mapGestureActiveRef,
  mapMotionPressureController,
  shouldLogSearchComputes,
  getPerfNow,
  logSearchCompute,
  mapQueryBudget,
  pendingMarkerOpenAnimationFrameRef,
  profileActions,
  mapRef,
  cameraRef,
  mapCenter,
  mapZoom,
  mapCameraAnimation,
  cameraPadding,
  isFollowingUser,
  onPress,
  onTouchStart,
  onTouchEnd,
  onNativeViewportChanged,
  onMapIdle,
  onCameraAnimationComplete,
  onMapLoaded,
  onMapFullyRendered,
  onExecutionBatchMountedHidden,
  onMarkerEnterStarted,
  onMarkerEnterSettled,
  onMarkerExitStarted,
  onMarkerExitSettled,
  isMapStyleReady,
  userLocation,
  userLocationSnapshot,
  disableBlur,
  onProfilerRender,
  onRuntimeMechanismEvent,
}: UseSearchMapPropsArgs): SearchMapWithMarkerEngineProps => {
  const styleURL = React.useMemo(() => buildMapStyleURL(accessToken ?? ''), [accessToken]);

  return React.useMemo(
    () => ({
      scoreMode,
      restaurantOnlyId,
      highlightedRestaurantId,
      viewportBoundsService,
      resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation,
      getQualityColorFromScore,
      mapGestureActiveRef,
      mapMotionPressureController,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      maxFullPins: MAX_FULL_PINS,
      lodVisibleCandidateBuffer: LOD_VISIBLE_CANDIDATE_BUFFER,
      lodPinPromoteStableMsMoving: LOD_PIN_PROMOTE_STABLE_MS_MOVING,
      lodPinDemoteStableMsMoving: LOD_PIN_DEMOTE_STABLE_MS_MOVING,
      lodPinToggleStableMsIdle: LOD_PIN_TOGGLE_STABLE_MS_IDLE,
      lodPinOffscreenToggleStableMsMoving: LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING,
      mapQueryBudget,
      pendingMarkerOpenAnimationFrameRef,
      profileActions,
      mapRef,
      cameraRef,
      styleURL,
      mapCenter,
      mapZoom: mapZoom ?? USA_FALLBACK_ZOOM,
      mapCameraAnimation,
      cameraPadding,
      isFollowingUser,
      onPress,
      onTouchStart,
      onTouchEnd,
      onNativeViewportChanged,
      onMapIdle,
      onCameraAnimationComplete,
      onMapLoaded,
      onMapFullyRendered,
      onExecutionBatchMountedHidden,
      onMarkerEnterStarted,
      onMarkerEnterSettled,
      onMarkerExitStarted,
      onMarkerExitSettled,
      isMapStyleReady,
      userLocation,
      userLocationSnapshot,
      disableMarkers: false,
      disableBlur,
      onProfilerRender,
      onRuntimeMechanismEvent,
    }),
    [
      cameraPadding,
      cameraRef,
      disableBlur,
      getPerfNow,
      highlightedRestaurantId,
      isFollowingUser,
      isMapStyleReady,
      logSearchCompute,
      mapCameraAnimation,
      mapCenter,
      mapGestureActiveRef,
      mapMotionPressureController,
      mapQueryBudget,
      mapRef,
      mapZoom,
      onCameraAnimationComplete,
      onExecutionBatchMountedHidden,
      onMapFullyRendered,
      onMapIdle,
      onMapLoaded,
      onMarkerEnterSettled,
      onMarkerEnterStarted,
      onMarkerExitSettled,
      onMarkerExitStarted,
      onNativeViewportChanged,
      onPress,
      onProfilerRender,
      onRuntimeMechanismEvent,
      onTouchEnd,
      onTouchStart,
      pendingMarkerOpenAnimationFrameRef,
      pickPreferredRestaurantMapLocation,
      profileActions,
      resolveRestaurantLocationSelectionAnchor,
      resolveRestaurantMapLocations,
      restaurantOnlyId,
      scoreMode,
      shouldLogSearchComputes,
      styleURL,
      userLocation,
      userLocationSnapshot,
      viewportBoundsService,
    ]
  );
};
