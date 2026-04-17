import React from 'react';

import { buildMapStyleURL } from '../../../../constants/map';
import { USA_FALLBACK_ZOOM } from '../../constants/search';
import { getQualityColorFromScore } from '../../utils/quality';
import type { SearchRootMapPresentationEnvironment } from './search-root-environment-contract';
import type { SearchMapPresentationLifecyclePort } from './search-map-protocol-contract';
import type {
  SearchRootMapArgs,
  SearchRootMapRenderSurfaceModel,
} from './search-root-render-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootActionLanesRuntime } from './use-search-root-action-lanes-runtime-contract';

const MAX_FULL_PINS = 30;
const LOD_PIN_PROMOTE_STABLE_MS_MOVING = 48;
const LOD_PIN_DEMOTE_STABLE_MS_MOVING = 190;
const LOD_PIN_TOGGLE_STABLE_MS_IDLE = 0;
const LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING = 120;
const LOD_VISIBLE_CANDIDATE_BUFFER = 16;

type SearchRootMapRenderState = {
  restaurantOnlyId: SearchRootMapArgs['restaurantOnlyId'];
  mapRef: SearchRootMapArgs['mapRef'];
  cameraRef: SearchRootMapArgs['cameraRef'];
  mapCenter: SearchRootMapArgs['mapCenter'];
  mapZoom: SearchRootMapArgs['mapZoom'];
  mapCameraAnimation: SearchRootMapArgs['mapCameraAnimation'];
  isFollowingUser: SearchRootMapArgs['isFollowingUser'];
};

type SearchRootMapInteractionHandlers = {
  handleMapPress: SearchRootMapArgs['onPress'];
  handleNativeViewportChanged: SearchRootMapArgs['onNativeViewportChanged'];
  handleMapIdle: SearchRootMapArgs['onMapIdle'];
  handleMapTouchStart: SearchRootMapArgs['onTouchStart'];
  handleMapTouchEnd: SearchRootMapArgs['onTouchEnd'];
  handleMapLoaded: SearchRootMapArgs['onMapLoaded'];
};

type UseSearchRootMapRenderSurfaceRuntimeArgs = {
  environment: SearchRootMapPresentationEnvironment;
  sessionRuntime: Pick<
    SearchRootSessionRuntime,
    'runtimeOwner' | 'mapBootstrapRuntime' | 'filterStateRuntime' | 'primitives'
  >;
  scaffoldRuntime: Pick<
    SearchRootScaffoldRuntime,
    'resultsSheetRuntimeLane' | 'instrumentationRuntime'
  >;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  actionLanesRuntime: SearchRootActionLanesRuntime;
  mapState: SearchRootMapRenderState;
  mapInteractionHandlers: SearchRootMapInteractionHandlers;
};

const areSearchMapPropsEqual = (
  left: SearchRootMapRenderSurfaceModel['searchMapProps'],
  right: SearchRootMapRenderSurfaceModel['searchMapProps']
): boolean =>
  Object.is(left.restaurantOnlyId, right.restaurantOnlyId) &&
  Object.is(left.highlightedRestaurantId, right.highlightedRestaurantId) &&
  Object.is(left.viewportBoundsService, right.viewportBoundsService) &&
  Object.is(left.resolveRestaurantMapLocations, right.resolveRestaurantMapLocations) &&
  Object.is(
    left.resolveRestaurantLocationSelectionAnchor,
    right.resolveRestaurantLocationSelectionAnchor
  ) &&
  Object.is(left.pickPreferredRestaurantMapLocation, right.pickPreferredRestaurantMapLocation) &&
  Object.is(left.getQualityColorFromScore, right.getQualityColorFromScore) &&
  Object.is(left.mapGestureActiveRef, right.mapGestureActiveRef) &&
  Object.is(left.mapMotionPressureController, right.mapMotionPressureController) &&
  Object.is(left.shouldLogSearchComputes, right.shouldLogSearchComputes) &&
  Object.is(left.getPerfNow, right.getPerfNow) &&
  Object.is(left.logSearchCompute, right.logSearchCompute) &&
  Object.is(left.maxFullPins, right.maxFullPins) &&
  Object.is(left.lodVisibleCandidateBuffer, right.lodVisibleCandidateBuffer) &&
  Object.is(left.lodPinPromoteStableMsMoving, right.lodPinPromoteStableMsMoving) &&
  Object.is(left.lodPinDemoteStableMsMoving, right.lodPinDemoteStableMsMoving) &&
  Object.is(left.lodPinToggleStableMsIdle, right.lodPinToggleStableMsIdle) &&
  Object.is(left.lodPinOffscreenToggleStableMsMoving, right.lodPinOffscreenToggleStableMsMoving) &&
  Object.is(left.mapQueryBudget, right.mapQueryBudget) &&
  Object.is(left.profileCommandPort, right.profileCommandPort) &&
  Object.is(left.mapRef, right.mapRef) &&
  Object.is(left.cameraRef, right.cameraRef) &&
  Object.is(left.styleURL, right.styleURL) &&
  Object.is(left.mapCenter, right.mapCenter) &&
  Object.is(left.mapZoom, right.mapZoom) &&
  Object.is(left.mapCameraAnimation, right.mapCameraAnimation) &&
  Object.is(left.cameraPadding, right.cameraPadding) &&
  Object.is(left.isFollowingUser, right.isFollowingUser) &&
  Object.is(left.onPress, right.onPress) &&
  Object.is(left.onTouchStart, right.onTouchStart) &&
  Object.is(left.onTouchEnd, right.onTouchEnd) &&
  Object.is(left.onNativeViewportChanged, right.onNativeViewportChanged) &&
  Object.is(left.onMapIdle, right.onMapIdle) &&
  Object.is(left.onMapLoaded, right.onMapLoaded) &&
  Object.is(left.onMapFullyRendered, right.onMapFullyRendered) &&
  Object.is(left.presentationLifecyclePort, right.presentationLifecyclePort) &&
  Object.is(left.isMapStyleReady, right.isMapStyleReady) &&
  Object.is(left.userLocation, right.userLocation) &&
  Object.is(left.userLocationSnapshot, right.userLocationSnapshot) &&
  Object.is(left.disableMarkers, right.disableMarkers) &&
  Object.is(left.disableBlur, right.disableBlur) &&
  Object.is(left.onProfilerRender, right.onProfilerRender);

export const useSearchRootMapRenderSurfaceRuntime = ({
  environment,
  sessionRuntime,
  scaffoldRuntime,
  requestLaneRuntime,
  actionLanesRuntime,
  mapState,
  mapInteractionHandlers,
}: UseSearchRootMapRenderSurfaceRuntimeArgs): SearchRootMapRenderSurfaceModel => {
  const configuredStyleURL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? '';
  const styleURL = React.useMemo(
    () => buildMapStyleURL(environment.accessToken ?? ''),
    [configuredStyleURL, environment.accessToken]
  );

  const handleMapPressRef = React.useRef(mapInteractionHandlers.handleMapPress);
  const handleNativeViewportChangedRef = React.useRef(
    mapInteractionHandlers.handleNativeViewportChanged
  );
  const handleMapIdleRef = React.useRef(mapInteractionHandlers.handleMapIdle);
  const handleMapTouchStartRef = React.useRef(mapInteractionHandlers.handleMapTouchStart);
  const handleMapTouchEndRef = React.useRef(mapInteractionHandlers.handleMapTouchEnd);
  const handleMapLoadedRef = React.useRef(mapInteractionHandlers.handleMapLoaded);
  const presentationLifecycleHandlersRef = React.useRef({
    handleExecutionBatchMountedHidden:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleExecutionBatchMountedHidden,
    handleMarkerEnterStarted:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerEnterStarted,
    handleMarkerEnterSettled:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerEnterSettled,
    handleMarkerExitStarted:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerExitStarted,
    handleMarkerExitSettled:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerExitSettled,
  });

  handleMapPressRef.current = mapInteractionHandlers.handleMapPress;
  handleNativeViewportChangedRef.current = mapInteractionHandlers.handleNativeViewportChanged;
  handleMapIdleRef.current = mapInteractionHandlers.handleMapIdle;
  handleMapTouchStartRef.current = mapInteractionHandlers.handleMapTouchStart;
  handleMapTouchEndRef.current = mapInteractionHandlers.handleMapTouchEnd;
  handleMapLoadedRef.current = mapInteractionHandlers.handleMapLoaded;
  presentationLifecycleHandlersRef.current = {
    handleExecutionBatchMountedHidden:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleExecutionBatchMountedHidden,
    handleMarkerEnterStarted:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerEnterStarted,
    handleMarkerEnterSettled:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerEnterSettled,
    handleMarkerExitStarted:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerExitStarted,
    handleMarkerExitSettled:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.handleMarkerExitSettled,
  };

  const stableMapHandlersRef = React.useRef<{
    onMapPress: SearchRootMapArgs['onPress'];
    onNativeViewportChanged: SearchRootMapArgs['onNativeViewportChanged'];
    onMapIdle: SearchRootMapArgs['onMapIdle'];
    onMapTouchStart: NonNullable<SearchRootMapArgs['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchRootMapArgs['onTouchEnd']>;
    onMapLoaded: SearchRootMapArgs['onMapLoaded'];
  } | null>(null);

  if (!stableMapHandlersRef.current) {
    stableMapHandlersRef.current = {
      onMapPress: () => {
        handleMapPressRef.current();
      },
      onNativeViewportChanged: (state) => {
        handleNativeViewportChangedRef.current(state);
      },
      onMapIdle: (state) => {
        handleMapIdleRef.current(state);
      },
      onMapTouchStart: () => {
        handleMapTouchStartRef.current?.();
      },
      onMapTouchEnd: () => {
        handleMapTouchEndRef.current?.();
      },
      onMapLoaded: () => {
        handleMapLoadedRef.current();
      },
    };
  }

  const stableMapInteractionRuntime = stableMapHandlersRef.current!;
  const presentationLifecyclePortRef = React.useRef<SearchMapPresentationLifecyclePort | null>(
    null
  );
  const stableSearchMapPropsRef = React.useRef<
    SearchRootMapRenderSurfaceModel['searchMapProps'] | null
  >(null);
  const stableMapRenderSurfaceModelRef = React.useRef<SearchRootMapRenderSurfaceModel | null>(null);

  if (!presentationLifecyclePortRef.current) {
    presentationLifecyclePortRef.current = {
      handleExecutionBatchMountedHidden: (payload) => {
        presentationLifecycleHandlersRef.current.handleExecutionBatchMountedHidden(payload);
      },
      handleMarkerEnterStarted: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerEnterStarted(payload);
      },
      handleMarkerEnterSettled: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerEnterSettled(payload);
      },
      handleMarkerExitStarted: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerExitStarted(payload);
      },
      handleMarkerExitSettled: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerExitSettled(payload);
      },
    };
  }

  const nextSearchMapProps = React.useMemo<SearchRootMapRenderSurfaceModel['searchMapProps']>(
    () => ({
      restaurantOnlyId: mapState.restaurantOnlyId,
      highlightedRestaurantId:
        actionLanesRuntime.profileActionRuntime.mapViewState.highlightedRestaurantId,
      viewportBoundsService: sessionRuntime.runtimeOwner.viewportBoundsService,
      resolveRestaurantMapLocations:
        actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
          .resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor:
        actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
          .resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation:
        actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
          .pickPreferredRestaurantMapLocation,
      getQualityColorFromScore,
      mapGestureActiveRef: scaffoldRuntime.resultsSheetRuntimeLane.mapGestureActiveRef,
      mapMotionPressureController:
        scaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController,
      shouldLogSearchComputes: scaffoldRuntime.instrumentationRuntime.shouldLogSearchComputes,
      getPerfNow: sessionRuntime.primitives.getPerfNow,
      logSearchCompute: scaffoldRuntime.instrumentationRuntime.logSearchCompute,
      maxFullPins: MAX_FULL_PINS,
      lodVisibleCandidateBuffer: LOD_VISIBLE_CANDIDATE_BUFFER,
      lodPinPromoteStableMsMoving: LOD_PIN_PROMOTE_STABLE_MS_MOVING,
      lodPinDemoteStableMsMoving: LOD_PIN_DEMOTE_STABLE_MS_MOVING,
      lodPinToggleStableMsIdle: LOD_PIN_TOGGLE_STABLE_MS_IDLE,
      lodPinOffscreenToggleStableMsMoving: LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING,
      mapQueryBudget: sessionRuntime.runtimeOwner.mapQueryBudget,
      profileCommandPort: actionLanesRuntime.profileActionRuntime.mapProfileCommandPort,
      mapRef: mapState.mapRef,
      cameraRef: mapState.cameraRef,
      styleURL,
      mapCenter: mapState.mapCenter,
      mapZoom: mapState.mapZoom ?? USA_FALLBACK_ZOOM,
      mapCameraAnimation: mapState.mapCameraAnimation,
      cameraPadding: actionLanesRuntime.profileActionRuntime.mapViewState.mapCameraPadding,
      isFollowingUser: mapState.isFollowingUser,
      onPress: stableMapInteractionRuntime.onMapPress,
      onTouchStart: stableMapInteractionRuntime.onMapTouchStart,
      onTouchEnd: stableMapInteractionRuntime.onMapTouchEnd,
      onNativeViewportChanged: stableMapInteractionRuntime.onNativeViewportChanged,
      onMapIdle: stableMapInteractionRuntime.onMapIdle,
      onMapLoaded: stableMapInteractionRuntime.onMapLoaded,
      onMapFullyRendered: sessionRuntime.mapBootstrapRuntime.handleMainMapFullyRendered,
      presentationLifecyclePort: presentationLifecyclePortRef.current!,
      isMapStyleReady: sessionRuntime.mapBootstrapRuntime.isMapStyleReady,
      userLocation: environment.userLocation,
      userLocationSnapshot: environment.startupLocationSnapshot,
      disableMarkers: false,
      disableBlur: false,
      onProfilerRender: scaffoldRuntime.instrumentationRuntime.handleProfilerRender,
    }),
    [
      actionLanesRuntime.profileActionRuntime.mapProfileCommandPort,
      actionLanesRuntime.profileActionRuntime.mapViewState.highlightedRestaurantId,
      actionLanesRuntime.profileActionRuntime.mapViewState.mapCameraPadding,
      actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
        .pickPreferredRestaurantMapLocation,
      actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
        .resolveRestaurantLocationSelectionAnchor,
      actionLanesRuntime.profileActionRuntime.restaurantSelectionModel
        .resolveRestaurantMapLocations,
      environment.startupLocationSnapshot,
      environment.userLocation,
      mapState.cameraRef,
      mapState.isFollowingUser,
      mapState.mapCameraAnimation,
      mapState.mapCenter,
      mapState.mapRef,
      mapState.mapZoom,
      mapState.restaurantOnlyId,
      scaffoldRuntime.instrumentationRuntime.handleProfilerRender,
      scaffoldRuntime.instrumentationRuntime.logSearchCompute,
      scaffoldRuntime.instrumentationRuntime.shouldLogSearchComputes,
      scaffoldRuntime.resultsSheetRuntimeLane.mapGestureActiveRef,
      scaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController,
      sessionRuntime.mapBootstrapRuntime.handleMainMapFullyRendered,
      sessionRuntime.mapBootstrapRuntime.isMapStyleReady,
      sessionRuntime.primitives.getPerfNow,
      sessionRuntime.runtimeOwner.mapQueryBudget,
      sessionRuntime.runtimeOwner.viewportBoundsService,
      stableMapInteractionRuntime.onMapIdle,
      stableMapInteractionRuntime.onMapLoaded,
      stableMapInteractionRuntime.onMapPress,
      stableMapInteractionRuntime.onMapTouchEnd,
      stableMapInteractionRuntime.onMapTouchStart,
      stableMapInteractionRuntime.onNativeViewportChanged,
      styleURL,
    ]
  );

  const previousSearchMapProps = stableSearchMapPropsRef.current;
  const searchMapProps =
    previousSearchMapProps && areSearchMapPropsEqual(previousSearchMapProps, nextSearchMapProps)
      ? previousSearchMapProps
      : nextSearchMapProps;
  stableSearchMapPropsRef.current = searchMapProps;

  const previousMapRenderSurfaceModel = stableMapRenderSurfaceModelRef.current;
  const mapRenderSurfaceModel: SearchRootMapRenderSurfaceModel =
    previousMapRenderSurfaceModel?.searchMapProps === searchMapProps
      ? previousMapRenderSurfaceModel
      : { searchMapProps };
  stableMapRenderSurfaceModelRef.current = mapRenderSurfaceModel;

  return mapRenderSurfaceModel;
};
