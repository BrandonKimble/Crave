import React from 'react';
import { Animated } from 'react-native';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';
import type { Feature, Point } from 'geojson';

import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';
import { useMapMarkerEngine } from '../hooks/use-map-marker-engine';
import type { ResolvedRestaurantMapLocation } from '../hooks/use-restaurant-location-selection';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import { useMarkerInteractionController } from '../runtime/map/marker-interaction-controller';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import { useSearchBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import type { useShortcutCoverageOwner } from '../runtime/map/use-shortcut-coverage-owner';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { ProfileRuntimeController } from '../runtime/profile/profile-runtime-controller';
import SearchMap, { type MapboxMapRef, type RestaurantFeatureProperties } from './search-map';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Imperative handle type
// ---------------------------------------------------------------------------

export type SearchMapMarkerEngineHandle = {
  resetShortcutCoverageState: () => void;
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useShortcutCoverageOwner
  >['handleShortcutSearchCoverageSnapshot'];
  recomputeLodPinnedMarkers: (bounds: MapBounds | null) => void;
  lodPinnedMarkersRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
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
  onCameraChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onVisualReady?: (requestKey: string) => void;
  onMarkerRevealSettled?: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  locationPulse: Animated.Value;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
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
    onCameraChanged,
    onMapIdle,
    onMapLoaded,
    onVisualReady,
    onMarkerRevealSettled,
    isMapStyleReady,
    userLocation,
    locationPulse,
    disableMarkers,
    disableBlur,
    onProfilerRender,
    runtimeWorkSchedulerRef,
    onRuntimeMechanismEvent,
  },
  ref
) => {
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
    Object.is
  );

  // -------------------------------------------------------------------------
  // Handoff-derived state — read from bus (bridged via useHandoffBusBridge)
  // -------------------------------------------------------------------------

  const isSearchLoading = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.isSearchLoading,
    Object.is
  );

  const selectionFeedbackOperationId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.runOneSelectionFeedbackOperationId,
    Object.is
  );

  const isRunOneHandoffActive = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.isRun1HandoffActive,
    Object.is
  );

  const isRunOneChromeDeferred = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) =>
      state.isRunOneChromeFreezeActive ||
      state.runOneCommitSpanPressureActive ||
      state.isChromeDeferred,
    Object.is
  );

  // -------------------------------------------------------------------------
  // Marker engine
  // -------------------------------------------------------------------------

  const {
    visibleSortedRestaurantMarkers,
    visibleDotRestaurantFeatures,
    visibleRestaurantFeatures,
    markersRenderKey,
    pinsRenderKey: visiblePinsRenderKey,
    restaurantLabelStyle,
    buildMarkerKey,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    anchoredShortcutCoverageFeatures,
    lodPinnedMarkersRef,
    recomputeLodPinnedMarkers,
    restaurants,
    shouldHoldMapMarkerReveal,
    isVisualSyncPending,
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
    externalMapQueryBudget: mapQueryBudget,
  });

  // -------------------------------------------------------------------------
  // Publish marker telemetry to bus for harness observer
  // -------------------------------------------------------------------------

  const markerCount = visibleSortedRestaurantMarkers.length;
  const dotCount = visibleDotRestaurantFeatures?.features?.length ?? 0;

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

  // -------------------------------------------------------------------------
  // Visual sync state — read from bus for freeze gate + signal props
  // -------------------------------------------------------------------------

  const resultsVisualSyncCandidate = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.visualSyncCandidateRequestKey,
    Object.is
  );

  const hasAnySearchResults = restaurants.length > 0;
  const areSearchVisualsSettled = !isSearchLoading && !isShortcutCoverageLoading;
  const shouldSignalMapVisualReady =
    isVisualSyncPending &&
    resultsVisualSyncCandidate != null &&
    (!hasAnySearchResults || areSearchVisualsSettled);

  // -------------------------------------------------------------------------
  // Map tree props
  // -------------------------------------------------------------------------

  const nextMapTreeProps = {
    selectedRestaurantId: highlightedRestaurantId,
    sortedRestaurantMarkers: visibleSortedRestaurantMarkers,
    dotRestaurantFeatures: visibleDotRestaurantFeatures,
    markersRenderKey,
    pinsRenderKey: visiblePinsRenderKey,
    visualSyncCandidateKey: resultsVisualSyncCandidate,
    shouldSignalVisualReady: shouldSignalMapVisualReady,
    requireMarkerVisualsForVisualReady: !shouldHoldMapMarkerReveal,
    restaurantFeatures: visibleRestaurantFeatures,
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
      recomputeLodPinnedMarkers,
      lodPinnedMarkersRef,
    }),
    [
      resetShortcutCoverageState,
      handleShortcutSearchCoverageSnapshot,
      recomputeLodPinnedMarkers,
      lodPinnedMarkersRef,
    ]
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onCameraChanged={onCameraChanged}
      onMapIdle={onMapIdle}
      onMapLoaded={onMapLoaded}
      onMarkerPress={stableHandleMarkerPress}
      onVisualReady={onVisualReady}
      onMarkerRevealSettled={onMarkerRevealSettled}
      selectedRestaurantId={mapTreePropsForRender.selectedRestaurantId}
      sortedRestaurantMarkers={mapTreePropsForRender.sortedRestaurantMarkers}
      dotRestaurantFeatures={mapTreePropsForRender.dotRestaurantFeatures}
      markersRenderKey={mapTreePropsForRender.markersRenderKey}
      pinsRenderKey={mapTreePropsForRender.pinsRenderKey}
      shouldSignalVisualReady={mapTreePropsForRender.shouldSignalVisualReady}
      requireMarkerVisualsForVisualReady={mapTreePropsForRender.requireMarkerVisualsForVisualReady}
      buildMarkerKey={buildMarkerKey}
      restaurantFeatures={mapTreePropsForRender.restaurantFeatures}
      restaurantLabelStyle={restaurantLabelStyle}
      isMapStyleReady={isMapStyleReady}
      userLocation={userLocation}
      locationPulse={locationPulse}
      disableMarkers={disableMarkers}
      disableBlur={disableBlur}
      onProfilerRender={onProfilerRender}
      mapQueryBudget={mapQueryBudget}
      runtimeWorkSchedulerRef={runtimeWorkSchedulerRef}
      selectionFeedbackOperationId={selectionFeedbackOperationId}
      isRunOneHandoffActive={isRunOneHandoffActive}
      isRunOneChromeDeferred={isRunOneChromeDeferred}
      searchRuntimeBus={searchRuntimeBus}
      onRuntimeMechanismEvent={onRuntimeMechanismEvent}
    />
  );
};

const SearchMapWithMarkerEngine = React.memo(React.forwardRef(SearchMapWithMarkerEngineInner));

export default SearchMapWithMarkerEngine;
