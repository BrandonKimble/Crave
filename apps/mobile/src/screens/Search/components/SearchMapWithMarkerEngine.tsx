import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';
import { withSearchNavSwitchRuntimeAttribution } from '../runtime/shared/search-nav-switch-runtime-attribution';
import { useDirectSearchMapSourceController } from '../hooks/use-direct-search-map-source-controller';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import type { SearchMapPresentationScene } from '../runtime/map/map-presentation-runtime-contract';
import type {
  MapMotionPressureController,
  MotionPressureState,
} from '../runtime/map/map-motion-pressure';
import type { ResolvedRestaurantMapLocation } from '../runtime/map/restaurant-location-selection';
import { type SearchRuntimeBus, useSearchBus } from '../runtime/shared/search-runtime-bus';
import {
  useResultsPresentationAuthority,
  type ResultsPresentationAuthority,
} from '../runtime/shared/results-presentation-authority';
import { useResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import type {
  SearchMapPresentationLifecyclePort,
  SearchMapProfileCommandPort,
} from '../runtime/shared/search-map-protocol-contract';
import {
  EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT,
  useSearchMapSourceFramePort,
} from '../runtime/map/search-map-source-frame-port';
import { mapStateBoundsToMapBounds } from '../utils/geo';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchMapRenderInteractionMode } from '../runtime/map/search-map-render-controller';
import SearchMap, { type MapboxMapRef } from './search-map';

const shouldAdvanceMapPolishLane = ({
  mapPresentationSettled,
  shouldDeferMapFromPressure,
  nativeSyncInFlight,
}: {
  mapPresentationSettled: boolean;
  shouldDeferMapFromPressure: boolean;
  nativeSyncInFlight: boolean;
}): boolean => mapPresentationSettled && !shouldDeferMapFromPressure && !nativeSyncInFlight;

const isMapNativeSyncInFlight = (
  mapMotionPressureController: MapMotionPressureController
): boolean => {
  const controller = mapMotionPressureController as {
    getState: () => MotionPressureState;
  };
  return controller.getState().nativeSyncInFlight;
};

const useSearchMapNativeInteractionMode = ({
  disableMarkers,
  highlightedRestaurantId,
  restaurantOnlyId,
  resultsPresentationAuthority,
}: {
  disableMarkers?: boolean;
  highlightedRestaurantId: string | null;
  restaurantOnlyId: string | null;
  resultsPresentationAuthority: ResultsPresentationAuthority;
}): SearchMapRenderInteractionMode => {
  const canInteract = React.useSyncExternalStore(
    React.useCallback(
      (listener) =>
        resultsPresentationAuthority.subscribe(
          listener,
          ['resultsPresentation', 'resultsPresentationTransport'],
          'search_map_native_interaction_mode'
        ),
      [resultsPresentationAuthority]
    ),
    React.useCallback(() => {
      const snapshot = resultsPresentationAuthority.getSnapshot();
      const isResultsExitActive =
        snapshot.resultsPresentationTransport.snapshotKind === 'results_exit';
      const isResultsPresentationVisible =
        snapshot.resultsPresentation.contentVisibility === 'visible';

      return (
        disableMarkers !== true &&
        !isResultsExitActive &&
        (isResultsPresentationVisible ||
          highlightedRestaurantId != null ||
          restaurantOnlyId != null)
      );
    }, [disableMarkers, highlightedRestaurantId, restaurantOnlyId, resultsPresentationAuthority]),
    () => false
  );

  return canInteract ? 'enabled' : 'suppressed';
};

const useSearchMapLaneAdvancement = ({
  mapMotionPressureController,
  searchRuntimeBus,
  resultsPresentationAuthority,
}: {
  mapMotionPressureController: MapMotionPressureController;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
}): void => {
  const mapMotionPressureControllerRef = React.useRef(mapMotionPressureController);

  React.useEffect(() => {
    mapMotionPressureControllerRef.current = mapMotionPressureController;
  }, [mapMotionPressureController]);

  React.useEffect(() => {
    let animationFrameHandle: number | null = null;
    let microtaskReleaseCancelled = false;

    const clearScheduledRelease = () => {
      if (animationFrameHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
      microtaskReleaseCancelled = true;
    };

    const canAdvanceMapPolishLane = () => {
      const presentationState = resultsPresentationAuthority.getSnapshot();
      const runtimeState = searchRuntimeBus.getState();
      return shouldAdvanceMapPolishLane({
        mapPresentationSettled: presentationState.resultsPresentation.isSettled,
        shouldDeferMapFromPressure:
          runtimeState.isMapActivationDeferred ||
          runtimeState.searchSurfaceRedrawCommitSpanPressureActive,
        nativeSyncInFlight: isMapNativeSyncInFlight(mapMotionPressureControllerRef.current),
      });
    };

    const releaseIdleIfReady = (operationId: string) => {
      const state = searchRuntimeBus.getState();
      if (
        state.activeOperationId !== operationId ||
        state.activeOperationLane !== 'lane_f_polish'
      ) {
        return;
      }
      if (!canAdvanceMapPolishLane()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'idle',
        activeOperationId: null,
      });
    };

    const scheduleRelease = (operationId: string) => {
      clearScheduledRelease();
      microtaskReleaseCancelled = false;
      if (typeof requestAnimationFrame === 'function') {
        animationFrameHandle = requestAnimationFrame(() => {
          animationFrameHandle = null;
          releaseIdleIfReady(operationId);
        });
        return;
      }
      queueMicrotask(() => {
        if (microtaskReleaseCancelled) {
          return;
        }
        releaseIdleIfReady(operationId);
      });
    };

    const maybeAdvancePolishLane = () => {
      const state = searchRuntimeBus.getState();
      const activeOperationId = state.activeOperationId;
      if (!activeOperationId || state.activeOperationLane !== 'lane_e_map_pins') {
        return;
      }
      if (!canAdvanceMapPolishLane()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'lane_f_polish',
      });
      scheduleRelease(activeOperationId);
    };

    maybeAdvancePolishLane();
    const unsubscribeBus = searchRuntimeBus.subscribe(
      maybeAdvancePolishLane,
      [
        'activeOperationId',
        'activeOperationLane',
        'isMapActivationDeferred',
        'searchSurfaceRedrawCommitSpanPressureActive',
      ] as const,
      'search_map_lane_advancement_controller'
    );
    const unsubscribePresentation = resultsPresentationAuthority.subscribe(
      maybeAdvancePolishLane,
      ['resultsPresentation'] as const,
      'search_map_lane_advancement_controller'
    );

    return () => {
      clearScheduledRelease();
      unsubscribeBus();
      unsubscribePresentation();
    };
  }, [resultsPresentationAuthority, searchRuntimeBus]);
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Imperative handle type
// ---------------------------------------------------------------------------

export type SearchMapMarkerEngineHandle = {
  resetShortcutCoverageState: () => void;
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useDirectSearchMapSourceController
  >['handleShortcutSearchCoverageSnapshot'];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SearchMapWithMarkerEngineProps = {
  // --- Marker engine inputs ---
  restaurantOnlyId: string | null;
  highlightedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getCraveScoreColorFromScore: (score: number | null | undefined) => string;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  mapMotionPressureController: MapMotionPressureController;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  mapQueryBudget: MapQueryBudget;

  // --- Marker interaction inputs ---
  profileCommandPort: SearchMapProfileCommandPort;

  // --- SearchMap pass-through props ---
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<import('@rnmapbox/maps').Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapBearing: number | null;
  mapPitch: number | null;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
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
  onCameraAnimationComplete?: (event: {
    nativeEvent: {
      payload?: {
        animationCompletionId?: string | null;
        status?: 'finished' | 'cancelled';
      } | null;
    };
  }) => void;
  presentationLifecyclePort?: SearchMapPresentationLifecyclePort;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  userLocationSnapshot: StartupLocationSnapshot | null;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback | null;
};

type SearchMapRenderEngineInputKey =
  | 'restaurantOnlyId'
  | 'highlightedRestaurantId'
  | 'viewportBoundsService'
  | 'resolveRestaurantMapLocations'
  | 'resolveRestaurantLocationSelectionAnchor'
  | 'pickPreferredRestaurantMapLocation'
  | 'getCraveScoreColorFromScore'
  | 'mapGestureActiveRef'
  | 'mapMotionPressureController'
  | 'shouldLogSearchComputes'
  | 'getPerfNow'
  | 'logSearchCompute'
  | 'maxFullPins'
  | 'mapQueryBudget'
  | 'profileCommandPort';

type SearchMapRenderHostConfigKey =
  | 'mapRef'
  | 'cameraRef'
  | 'styleURL'
  | 'onPress'
  | 'onTouchStart'
  | 'onTouchEnd'
  | 'onNativeViewportChanged'
  | 'onMapIdle'
  | 'onMapLoaded'
  | 'onMapFullyRendered'
  | 'onCameraAnimationComplete'
  | 'presentationLifecyclePort'
  | 'onProfilerRender';

type SearchMapRenderPresentationPropKey =
  | 'mapCenter'
  | 'mapZoom'
  | 'mapBearing'
  | 'mapPitch'
  | 'mapCameraAnimation'
  | 'cameraPadding'
  | 'isFollowingUser'
  | 'isMapStyleReady'
  | 'userLocation'
  | 'userLocationSnapshot'
  | 'disableMarkers'
  | 'disableBlur';

export type SearchMapRenderEngineInputs = Pick<
  SearchMapWithMarkerEngineProps,
  SearchMapRenderEngineInputKey
>;

export type SearchMapRenderHostConfig = Pick<
  SearchMapWithMarkerEngineProps,
  SearchMapRenderHostConfigKey
>;

export type SearchMapRenderPresentationProps = Pick<
  SearchMapWithMarkerEngineProps,
  SearchMapRenderPresentationPropKey
>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SearchMapWithMarkerEngineInner: React.ForwardRefRenderFunction<
  SearchMapMarkerEngineHandle,
  SearchMapWithMarkerEngineProps
> = (
  {
    // Marker engine inputs
    restaurantOnlyId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getCraveScoreColorFromScore,
    mapGestureActiveRef,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    mapQueryBudget,

    // Marker interaction inputs
    profileCommandPort,

    // SearchMap pass-through props
    mapRef,
    cameraRef,
    styleURL,
    mapCenter,
    mapZoom,
    mapBearing,
    mapPitch,
    mapCameraAnimation,
    cameraPadding,
    isFollowingUser,
    onPress,
    onTouchStart,
    onTouchEnd,
    onNativeViewportChanged,
    onMapIdle,
    onMapLoaded,
    onMapFullyRendered,
    onCameraAnimationComplete,
    presentationLifecyclePort,
    isMapStyleReady,
    userLocation,
    userLocationSnapshot,
    disableMarkers,
    disableBlur,
    onProfilerRender,
  },
  ref
) => {
  const engineInstanceIdRef = React.useRef<string | null>(null);
  if (engineInstanceIdRef.current == null) {
    engineInstanceIdRef.current = `search-map-engine:${Math.random().toString(36).slice(2)}`;
  }
  const engineInstanceId = engineInstanceIdRef.current;
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
  const resultsPresentationAuthority = useResultsPresentationAuthority();
  const resultsPresentationSurfaceAuthority = useResultsPresentationSurfaceAuthority();

  // -------------------------------------------------------------------------
  // Handoff-derived state — read from the bus, published by the Search root handoff bridge.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Marker engine
  // -------------------------------------------------------------------------

  const sourceFramePort = useSearchMapSourceFramePort();
  const nativeInteractionMode = useSearchMapNativeInteractionMode({
    disableMarkers,
    highlightedRestaurantId,
    restaurantOnlyId,
    resultsPresentationAuthority,
  });

  const {
    restaurantLabelStyle,
    buildMarkerKey,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    handleMarkerPress,
  } = useDirectSearchMapSourceController({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    sourceFramePort,
    restaurantOnlyId,
    highlightedRestaurantId,
    viewportBoundsService,
    userLocation,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getCraveScoreColorFromScore,
    mapGestureActiveRef,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    isMapMoving: nativeViewportState.isMoving,
    externalMapQueryBudget: mapQueryBudget,
    profileCommandPort,
  });

  React.useEffect(
    () =>
      viewportBoundsService.subscribe((bounds) => {
        setNativeViewportState((previous) => {
          if (previous.isMoving || previous.isGestureActive) {
            return previous;
          }
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
      withSearchNavSwitchRuntimeAttribution('searchMapHost', 'mapIdle', () => {
        const idleBounds = viewportBoundsService.getBounds() ?? mapStateBoundsToMapBounds(state);
        setNativeViewportState((previous) => {
          const boundsUnchanged =
            previous.bounds?.northEast.lat === idleBounds?.northEast.lat &&
            previous.bounds?.northEast.lng === idleBounds?.northEast.lng &&
            previous.bounds?.southWest.lat === idleBounds?.southWest.lat &&
            previous.bounds?.southWest.lng === idleBounds?.southWest.lng;
          if (
            boundsUnchanged &&
            previous.isGestureActive === false &&
            previous.isMoving === false
          ) {
            return previous;
          }
          return {
            bounds: idleBounds,
            isGestureActive: false,
            isMoving: false,
          };
        });
        onMapIdle(state);
      });
    },
    [onMapIdle, viewportBoundsService]
  );

  const handleSearchMapNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      withSearchNavSwitchRuntimeAttribution('searchMapHost', 'nativeViewportChanged', () => {
        const nextIsGestureActive = Boolean(state?.gestures?.isGestureActive);
        const nextBounds = mapStateBoundsToMapBounds(state);
        setNativeViewportState((previous) => {
          if (previous.isGestureActive === nextIsGestureActive && previous.isMoving) {
            return previous;
          }
          return {
            bounds: previous.bounds ?? nextBounds,
            isGestureActive: nextIsGestureActive,
            isMoving: true,
          };
        });
        onNativeViewportChanged(state);
      });
    },
    [onNativeViewportChanged]
  );

  const handleSearchMapTouchStart = React.useCallback(() => {
    withSearchNavSwitchRuntimeAttribution('searchMapHost', 'touchStart', () => {
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
    });
  }, [onTouchStart]);

  const handleSearchMapTouchEnd = React.useCallback(() => {
    withSearchNavSwitchRuntimeAttribution('searchMapHost', 'touchEnd', () => {
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
    });
  }, [onTouchEnd]);

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

  useSearchMapLaneAdvancement({
    mapMotionPressureController,
    searchRuntimeBus,
    resultsPresentationAuthority,
  });

  // -------------------------------------------------------------------------
  // Map tree props
  // -------------------------------------------------------------------------

  const emptyMapSceneSnapshot = React.useMemo<SearchMapPresentationScene>(
    () => ({
      selectedRestaurantId: highlightedRestaurantId,
      pinSourceStore: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.pinSourceStore,
      dotSourceStore: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.dotSourceStore,
      pinInteractionSourceStore: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.pinInteractionSourceStore,
      markersRenderKey: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.markersRenderKey,
      labelSourceStore: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.labelSourceStore,
      labelCollisionSourceStore: EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.labelCollisionSourceStore,
      labelDerivedSourceIdentityKey:
        EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT.labelDerivedSourceIdentityKey,
    }),
    [highlightedRestaurantId]
  );

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
      mapCenter={mapCenter}
      mapZoom={mapZoom}
      mapBearing={mapBearing}
      mapPitch={mapPitch}
      mapCameraAnimation={mapCameraAnimation}
      cameraPadding={cameraPadding}
      isFollowingUser={isFollowingUser}
      onPress={onPress}
      onTouchStart={handleSearchMapTouchStart}
      onTouchEnd={handleSearchMapTouchEnd}
      onNativeViewportChanged={handleSearchMapNativeViewportChanged}
      onMapIdle={handleSearchMapIdle}
      onMapLoaded={onMapLoaded}
      onMapFullyRendered={onMapFullyRendered}
      onCameraAnimationComplete={onCameraAnimationComplete}
      onMarkerPress={stableHandleMarkerPress}
      presentationLifecyclePort={presentationLifecyclePort}
      sourceFramePort={sourceFramePort}
      resultsPresentationAuthority={resultsPresentationAuthority}
      emptyMapSceneSnapshot={emptyMapSceneSnapshot}
      buildMarkerKey={buildMarkerKey}
      restaurantLabelStyle={restaurantLabelStyle}
      isMapStyleReady={isMapStyleReady}
      userLocation={userLocation}
      userLocationSnapshot={userLocationSnapshot}
      disableMarkers={disableMarkers}
      disableBlur={disableBlur}
      onProfilerRender={onProfilerRender}
      mapQueryBudget={mapQueryBudget}
      nativeViewportState={nativeViewportState}
      nativeInteractionMode={nativeInteractionMode}
      mapMotionPressureController={mapMotionPressureController}
      maxFullPins={maxFullPins}
    />
  );
};

const SearchMapWithMarkerEngine = React.memo(React.forwardRef(SearchMapWithMarkerEngineInner));

export default SearchMapWithMarkerEngine;
