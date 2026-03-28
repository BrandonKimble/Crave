import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';
import { useMapMarkerEngine } from '../hooks/use-map-marker-engine';
import type { ResolvedRestaurantMapLocation } from '../hooks/use-restaurant-location-selection';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import { useMarkerInteractionController } from '../runtime/map/marker-interaction-controller';
import { useSearchBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import { mapStateBoundsToMapBounds } from '../utils/geo';
import type { useShortcutCoverageOwner } from '../runtime/map/use-shortcut-coverage-owner';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { ProfileRuntimeController } from '../runtime/profile/profile-runtime-controller';
import { useSearchMapPresentationAdapter } from './hooks/use-search-map-presentation-adapter';
import { useSearchMapLaneAdvancement } from '../runtime/map/use-search-map-lane-advancement';
import SearchMap, { type MapboxMapRef } from './search-map';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Imperative handle type
// ---------------------------------------------------------------------------

export type SearchMapMarkerEngineHandle = {
  resetShortcutCoverageState: () => void;
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useShortcutCoverageOwner
  >['handleShortcutSearchCoverageSnapshot'];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SearchMapWithMarkerEngineProps = {
  // --- Marker engine inputs ---
  scoreMode: 'global_quality' | 'coverage_display';
  restaurantOnlyId: string | null;
  overlaySelectedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getQualityColorFromScore: (score: number | null | undefined) => string;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinToggleStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
  mapQueryBudget: MapQueryBudget;

  // --- Marker interaction inputs ---
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  forceRestaurantProfileMiddleSnapRef: React.MutableRefObject<boolean>;
  profileRuntimeController: ProfileRuntimeController;

  // --- SearchMap pass-through props ---
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<import('@rnmapbox/maps').Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  cameraPadding?: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  } | null;
  isFollowingUser: boolean;
  onPress: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMapFullyRendered?: () => void;
  onRevealBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerRevealStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    startedAtMs: number;
  }) => void;
  onMarkerRevealFirstVisibleFrame?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    syncedAtMs: number;
  }) => void;
  onMarkerRevealSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  onMarkerDismissStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerDismissSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  userLocationSnapshot: StartupLocationSnapshot | null;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SearchMapWithMarkerEngineInner: React.ForwardRefRenderFunction<
  SearchMapMarkerEngineHandle,
  SearchMapWithMarkerEngineProps
> = (
  {
    // Marker engine inputs
    scoreMode,
    restaurantOnlyId,
    overlaySelectedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinToggleStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
    mapQueryBudget,

    // Marker interaction inputs
    pendingMarkerOpenAnimationFrameRef,
    forceRestaurantProfileMiddleSnapRef,
    profileRuntimeController,

    // SearchMap pass-through props
    mapRef,
    cameraRef,
    styleURL,
    mapCenter,
    mapZoom,
    cameraPadding,
    isFollowingUser,
    onPress,
    onTouchStart,
    onTouchEnd,
    onNativeViewportChanged,
    onMapIdle,
    onMapLoaded,
    onMapFullyRendered,
    onRevealBatchMountedHidden,
    onMarkerRevealStarted,
    onMarkerRevealFirstVisibleFrame,
    onMarkerRevealSettled,
    onMarkerDismissStarted,
    onMarkerDismissSettled,
    isMapStyleReady,
    userLocation,
    userLocationSnapshot,
    disableMarkers,
    disableBlur,
    onProfilerRender,
    onRuntimeMechanismEvent,
  },
  ref
) => {
  const engineInstanceIdRef = React.useRef<string | null>(null);
  if (engineInstanceIdRef.current == null) {
    engineInstanceIdRef.current = `search-map-engine:${Math.random().toString(36).slice(2)}`;
  }
  const [nativeViewportState, setNativeViewportState] = React.useState<{
    bounds: MapBounds | null;
    isGestureActive: boolean;
    isMoving: boolean;
  }>({
    bounds: viewportBoundsService.getBounds(),
    isGestureActive: mapGestureActiveRef.current,
    isMoving: mapGestureActiveRef.current,
  });

  // -------------------------------------------------------------------------
  // Bus — read from context (decoupled from parent props)
  // -------------------------------------------------------------------------

  const searchRuntimeBus = useSearchBus();

  // -------------------------------------------------------------------------
  // Highlighted restaurant ID — read from bus
  // -------------------------------------------------------------------------

  const highlightedRestaurantId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.mapHighlightedRestaurantId,
    Object.is,
    ['mapHighlightedRestaurantId'] as const
  );

  const { isMapActivationDeferred, runOneCommitSpanPressureActive } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isMapActivationDeferred: state.isMapActivationDeferred,
      runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
    }),
    (left, right) =>
      left.isMapActivationDeferred === right.isMapActivationDeferred &&
      left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive,
    ['isMapActivationDeferred', 'runOneCommitSpanPressureActive'] as const
  );

  const promotedRestaurantId = overlaySelectedRestaurantId ?? highlightedRestaurantId;

  // -------------------------------------------------------------------------
  // Handoff-derived state — read from bus (bridged via useHandoffBusBridge)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Marker engine
  // -------------------------------------------------------------------------

  const { nativePresentationState, nativeInteractionMode, labelResetRequestKey } =
    useSearchMapPresentationAdapter({
      searchRuntimeBus,
      selectedRestaurantId: promotedRestaurantId,
      disableMarkers: disableMarkers === true,
    });

  const {
    visibleSortedRestaurantMarkers,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    markersRenderKey,
    restaurantLabelStyle,
    buildMarkerKey,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    anchoredShortcutCoverageFeatures,
    restaurants,
  } = useMapMarkerEngine({
    searchRuntimeBus,
    scoreMode,
    restaurantOnlyId,
    overlaySelectedRestaurantId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinToggleStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
    isMapMoving: nativeViewportState.isMoving,
    externalMapQueryBudget: mapQueryBudget,
  });

  React.useEffect(
    () =>
      viewportBoundsService.subscribe((bounds) => {
        setNativeViewportState((previous) => {
          const boundsUnchanged =
            previous.bounds?.northEast.lat === bounds?.northEast.lat &&
            previous.bounds?.northEast.lng === bounds?.northEast.lng &&
            previous.bounds?.southWest.lat === bounds?.southWest.lat &&
            previous.bounds?.southWest.lng === bounds?.southWest.lng;
          if (boundsUnchanged) {
            return previous;
          }
          return {
            bounds,
            isGestureActive: previous.isGestureActive,
            isMoving: previous.isMoving,
          };
        });
      }),
    [viewportBoundsService]
  );

  const handleSearchMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      const idleBounds = viewportBoundsService.getBounds() ?? mapStateBoundsToMapBounds(state);
      setNativeViewportState((previous) => {
        const boundsUnchanged =
          previous.bounds?.northEast.lat === idleBounds?.northEast.lat &&
          previous.bounds?.northEast.lng === idleBounds?.northEast.lng &&
          previous.bounds?.southWest.lat === idleBounds?.southWest.lat &&
          previous.bounds?.southWest.lng === idleBounds?.southWest.lng;
        if (boundsUnchanged && previous.isGestureActive === false && previous.isMoving === false) {
          return previous;
        }
        return {
          bounds: idleBounds,
          isGestureActive: false,
          isMoving: false,
        };
      });
      onMapIdle(state);
    },
    [onMapIdle, viewportBoundsService]
  );

  const handleSearchMapNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      const nextIsGestureActive = Boolean(state?.gestures?.isGestureActive);
      const nextBounds = mapStateBoundsToMapBounds(state);
      setNativeViewportState((previous) => {
        const boundsUnchanged =
          previous.bounds?.northEast.lat === nextBounds?.northEast.lat &&
          previous.bounds?.northEast.lng === nextBounds?.northEast.lng &&
          previous.bounds?.southWest.lat === nextBounds?.southWest.lat &&
          previous.bounds?.southWest.lng === nextBounds?.southWest.lng;
        if (
          boundsUnchanged &&
          previous.isGestureActive === nextIsGestureActive &&
          previous.isMoving
        ) {
          return previous;
        }
        return {
          bounds: nextBounds,
          isGestureActive: nextIsGestureActive,
          isMoving: true,
        };
      });
      onNativeViewportChanged(state);
    },
    [onNativeViewportChanged]
  );

  const handleSearchMapTouchStart = React.useCallback(() => {
    setNativeViewportState((previous) =>
      previous.isGestureActive && previous.isMoving
        ? previous
        : {
            bounds: previous.bounds,
            isGestureActive: true,
            isMoving: true,
          }
    );
    onTouchStart?.();
  }, [onTouchStart]);

  const handleSearchMapTouchEnd = React.useCallback(() => {
    setNativeViewportState((previous) =>
      previous.isGestureActive === false
        ? previous
        : {
            bounds: previous.bounds,
            isGestureActive: false,
            isMoving: previous.isMoving,
          }
    );
    onTouchEnd?.();
  }, [onTouchEnd]);

  // -------------------------------------------------------------------------
  // Publish marker telemetry to bus for harness observer
  // -------------------------------------------------------------------------

  const markerCount = visibleSortedRestaurantMarkers.length;
  const dotCount = dotSourceStore?.idsInOrder.length ?? 0;

  React.useEffect(() => {
    searchRuntimeBus.publish({
      visibleSortedRestaurantMarkersCount: markerCount,
      visibleDotRestaurantFeaturesCount: dotCount,
      isShortcutCoverageLoading,
    });
  }, [searchRuntimeBus, markerCount, dotCount, isShortcutCoverageLoading]);

  // -------------------------------------------------------------------------
  // Marker interaction controller
  // -------------------------------------------------------------------------

  const setMapHighlightedRestaurantId = React.useCallback(
    (updater: React.SetStateAction<string | null>) => {
      if (typeof updater === 'function') {
        const current = searchRuntimeBus.getState().mapHighlightedRestaurantId;
        const next = updater(current);
        searchRuntimeBus.publish({ mapHighlightedRestaurantId: next });
      } else {
        searchRuntimeBus.publish({ mapHighlightedRestaurantId: updater });
      }
    },
    [searchRuntimeBus]
  );

  const { handleMarkerPress } = useMarkerInteractionController({
    anchoredShortcutCoverageFeatures,
    restaurants,
    setMapHighlightedRestaurantId,
    pendingMarkerOpenAnimationFrameRef,
    forceRestaurantProfileMiddleSnapRef,
    profileRuntimeController,
  });

  // -------------------------------------------------------------------------
  // Stable marker press ref (avoids SearchMap memo invalidation)
  // -------------------------------------------------------------------------

  const handleMarkerPressRef = React.useRef(handleMarkerPress);
  handleMarkerPressRef.current = handleMarkerPress;

  const stableHandleMarkerPress = React.useMemo(
    () => (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      handleMarkerPressRef.current(restaurantId, pressedCoordinate);
    },
    []
  );

  const shouldDeferMapFromPressure = isMapActivationDeferred || runOneCommitSpanPressureActive;

  useSearchMapLaneAdvancement({
    searchRuntimeBus,
    shouldDeferMapFromPressure,
  });

  // -------------------------------------------------------------------------
  // Map tree props
  // -------------------------------------------------------------------------

  const nextMapTreeProps = {
    selectedRestaurantId: promotedRestaurantId,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    markersRenderKey,
  };
  const mapTreePropsForRender = nextMapTreeProps;

  // -------------------------------------------------------------------------
  // Imperative handle
  // -------------------------------------------------------------------------

  React.useImperativeHandle(
    ref,
    () => ({
      resetShortcutCoverageState,
      handleShortcutSearchCoverageSnapshot,
    }),
    [resetShortcutCoverageState, handleShortcutSearchCoverageSnapshot]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SearchMap
      mapRef={mapRef}
      cameraRef={cameraRef}
      styleURL={styleURL}
      scoreMode={scoreMode}
      mapCenter={mapCenter}
      mapZoom={mapZoom}
      cameraPadding={cameraPadding}
      isFollowingUser={isFollowingUser}
      onPress={onPress}
      onTouchStart={handleSearchMapTouchStart}
      onTouchEnd={handleSearchMapTouchEnd}
      onNativeViewportChanged={handleSearchMapNativeViewportChanged}
      onMapIdle={handleSearchMapIdle}
      onMapLoaded={onMapLoaded}
      onMapFullyRendered={onMapFullyRendered}
      onMarkerPress={stableHandleMarkerPress}
      onRevealBatchMountedHidden={onRevealBatchMountedHidden}
      onMarkerRevealStarted={onMarkerRevealStarted}
      onMarkerRevealFirstVisibleFrame={onMarkerRevealFirstVisibleFrame}
      onMarkerRevealSettled={onMarkerRevealSettled}
      onMarkerDismissStarted={onMarkerDismissStarted}
      onMarkerDismissSettled={onMarkerDismissSettled}
      selectedRestaurantId={mapTreePropsForRender.selectedRestaurantId}
      pinSourceStore={mapTreePropsForRender.pinSourceStore}
      dotSourceStore={mapTreePropsForRender.dotSourceStore}
      pinInteractionSourceStore={mapTreePropsForRender.pinInteractionSourceStore}
      dotInteractionSourceStore={mapTreePropsForRender.dotInteractionSourceStore}
      markersRenderKey={mapTreePropsForRender.markersRenderKey}
      buildMarkerKey={buildMarkerKey}
      restaurantLabelStyle={restaurantLabelStyle}
      isMapStyleReady={isMapStyleReady}
      userLocation={userLocation}
      userLocationSnapshot={userLocationSnapshot}
      disableMarkers={disableMarkers}
      disableBlur={disableBlur}
      onProfilerRender={onProfilerRender}
      mapQueryBudget={mapQueryBudget}
      onRuntimeMechanismEvent={onRuntimeMechanismEvent}
      nativeViewportState={nativeViewportState}
      nativePresentationState={nativePresentationState}
      nativeInteractionMode={nativeInteractionMode}
      labelResetRequestKey={labelResetRequestKey}
      maxFullPins={maxFullPins}
      lodVisibleCandidateBuffer={lodVisibleCandidateBuffer}
      lodPinToggleStableMsMoving={lodPinToggleStableMsMoving}
      lodPinToggleStableMsIdle={lodPinToggleStableMsIdle}
      lodPinOffscreenToggleStableMsMoving={lodPinOffscreenToggleStableMsMoving}
    />
  );
};

const SearchMapWithMarkerEngine = React.memo(React.forwardRef(SearchMapWithMarkerEngineInner));

export default SearchMapWithMarkerEngine;
