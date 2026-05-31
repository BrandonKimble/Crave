import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { MapBounds } from '../../../../types';
import { MAP_MOVE_MIN_DISTANCE_MILES } from '../../constants/search';
import {
  getBoundsCenter,
  hasBoundsMovedSignificantly,
  haversineDistanceMiles,
  isLngLatTuple,
  mapStateBoundsToMapBounds,
} from '../../utils/geo';
import type { CameraIntentArbiter } from './camera-intent-arbiter';
import { createMapInteractionDiagnostics } from './map-interaction-diagnostics';
import {
  shouldDeferMapMovementWork,
  type MotionPressureState,
  type MapMotionPressureController,
} from './map-motion-pressure';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { withSearchNavSwitchRuntimeAttribution } from '../shared/search-nav-switch-runtime-attribution';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';

const CAMERA_CENTER_PRECISION = 1e5;
const CAMERA_ZOOM_PRECISION = 1e2;
const VIEWPORT_CENTER_PRECISION = 1e4;
const VIEWPORT_SPAN_PRECISION = 1e4;
const VIEWPORT_ZOOM_PRECISION = 1e1;

const roundCameraCenterValue = (value: number) =>
  Math.round(value * CAMERA_CENTER_PRECISION) / CAMERA_CENTER_PRECISION;
const roundCameraZoomValue = (value: number) =>
  Math.round(value * CAMERA_ZOOM_PRECISION) / CAMERA_ZOOM_PRECISION;
const quantizeViewportValue = (value: number, precision: number): number =>
  Math.round(value * precision) / precision;

const buildMapViewportMotionToken = ({
  bounds,
  zoom,
  phase,
}: {
  bounds: MapBounds;
  zoom: number | null;
  phase: MotionPressureState['phase'];
}): string => {
  const center = getBoundsCenter(bounds);
  const latSpan = Math.abs(bounds.northEast.lat - bounds.southWest.lat);
  const lngSpan = Math.abs(bounds.northEast.lng - bounds.southWest.lng);

  return [
    phase,
    quantizeViewportValue(center.lat, VIEWPORT_CENTER_PRECISION),
    quantizeViewportValue(center.lng, VIEWPORT_CENTER_PRECISION),
    quantizeViewportValue(latSpan, VIEWPORT_SPAN_PRECISION),
    quantizeViewportValue(lngSpan, VIEWPORT_SPAN_PRECISION),
    zoom == null ? 'z:none' : `z:${quantizeViewportValue(zoom, VIEWPORT_ZOOM_PRECISION)}`,
  ].join('|');
};

const resolveMapViewportGesturePhase = ({
  nativeGestureActive,
  isMapTouchActive,
}: {
  nativeGestureActive: boolean;
  isMapTouchActive: boolean;
}): MotionPressureState['phase'] => {
  if (!nativeGestureActive) {
    return 'settled';
  }
  return isMapTouchActive ? 'gesture' : 'inertia';
};

const hasMaterialUserMapGestureDelta = ({
  movedMiles,
  zoomDelta,
  eventCount,
}: {
  movedMiles: number;
  zoomDelta: number;
  eventCount: number;
}): boolean => eventCount >= 2 && (movedMiles >= 0.0015 || zoomDelta >= 0.01);

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type MapGestureSession = {
  startBounds: MapBounds;
  startZoom: number | null;
  eventCount: number;
};

type UseMapInteractionControllerArgs = {
  shouldLogMapEventRates: boolean;
  mapEventLogIntervalMs: number;
  shouldLogSearchStateChanges: boolean;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  suppressMapMovedRef: React.MutableRefObject<boolean>;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  suppressAutocompleteResults: () => void;
  dismissSearchKeyboard: () => void;
  beginSuggestionCloseHold: (variant?: 'default' | 'submitting') => boolean;
  isSearchSessionActive: boolean;
  isProfilePresentationActive: boolean;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  clearMapHighlightedRestaurantId: () => void;
  cancelAutocomplete: () => void;
  mapMotionPressureController: MapMotionPressureController;
  cameraIntentArbiter: CameraIntentArbiter;
  viewportBoundsService: ViewportBoundsService;
  cancelPendingMapMovementUpdates: () => void;
  markMapMovedIfNeeded: (
    bounds: MapBounds,
    options?: { fallbackBaselineBounds?: MapBounds | null }
  ) => boolean;
  scheduleMapIdleEnter: (options?: { releaseGestureGate?: boolean }) => void;
  isSearchOverlay: boolean;
  shouldShowPollsSheet: boolean;
  schedulePollBoundsUpdate: (bounds: MapBounds) => void;
  lastCameraStateRef: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  lastPersistedCameraRef: React.MutableRefObject<string | null>;
};

type UseMapInteractionControllerResult = {
  handleMapPress: () => void;
  handleNativeViewportChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapTouchStart: () => void;
  handleMapTouchEnd: () => void;
};

export const useMapInteractionController = (
  args: UseMapInteractionControllerArgs
): UseMapInteractionControllerResult => {
  const {
    shouldLogMapEventRates,
    mapEventLogIntervalMs,
    shouldLogSearchStateChanges,
    searchInteractionRef,
    mapGestureActiveRef,
    suppressMapMovedRef,
    pendingMarkerOpenAnimationFrameRef,
    allowSearchBlurExitRef,
    suppressAutocompleteResults,
    dismissSearchKeyboard,
    beginSuggestionCloseHold,
    isSearchSessionActive,
    isProfilePresentationActive,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    clearMapHighlightedRestaurantId,
    cancelAutocomplete,
    mapMotionPressureController,
    cameraIntentArbiter,
    viewportBoundsService,
    cancelPendingMapMovementUpdates,
    markMapMovedIfNeeded,
    scheduleMapIdleEnter,
    isSearchOverlay,
    shouldShowPollsSheet,
    schedulePollBoundsUpdate,
    lastCameraStateRef,
    lastPersistedCameraRef,
  } = args;

  const mapTouchActiveRef = React.useRef(false);
  const mapGestureSessionRef = React.useRef<MapGestureSession | null>(null);
  const lastViewportMotionTokenRef = React.useRef<string | null>(null);
  const mapEventStatsRef = React.useRef({
    cameraChanged: 0,
    mapIdle: 0,
    lastLog: 0,
  });
  const mapInteractionDiagnostics = React.useMemo(
    () =>
      createMapInteractionDiagnostics({
        enabled: shouldLogMapEventRates,
        logIntervalMs: mapEventLogIntervalMs,
        shouldLogSearchStateChanges,
        state: mapEventStatsRef.current,
        getSearchInteractionState: () => searchInteractionRef.current,
      }),
    [
      mapEventLogIntervalMs,
      searchInteractionRef,
      shouldLogMapEventRates,
      shouldLogSearchStateChanges,
    ]
  );
  const persistSettledCameraViewport = React.useCallback(
    (center: [number, number], zoom: number) => {
      lastCameraStateRef.current = { center, zoom };

      const roundedCenter: [number, number] = [
        roundCameraCenterValue(center[0]),
        roundCameraCenterValue(center[1]),
      ];
      const roundedZoom = roundCameraZoomValue(zoom);
      const payload = JSON.stringify({ center: roundedCenter, zoom: roundedZoom });
      if (payload === lastPersistedCameraRef.current) {
        return;
      }
      lastPersistedCameraRef.current = payload;
    },
    [lastCameraStateRef, lastPersistedCameraRef]
  );

  const handleMapPress = React.useCallback(() => {
    allowSearchBlurExitRef.current = true;
    suppressAutocompleteResults();
    dismissSearchKeyboard();
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      isSearchSessionActive || isProfilePresentationActive ? 'submitting' : 'default'
    );
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    if (pendingMarkerOpenAnimationFrameRef.current != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    }
    clearMapHighlightedRestaurantId();
    cancelAutocomplete();
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    cancelAutocomplete,
    dismissSearchKeyboard,
    isProfilePresentationActive,
    isSearchSessionActive,
    pendingMarkerOpenAnimationFrameRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    clearMapHighlightedRestaurantId,
    setShowSuggestions,
    setSuggestions,
    suppressAutocompleteResults,
  ]);

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapInteractionDiagnostics.recordCameraChanged();
      }
      const nativeGestureActive = Boolean(state?.gestures?.isGestureActive);
      // Mapbox's gesture flag is not reliable across every runtime path.
      // Treat a touch-backed viewport session as the real owner for
      // "user is moving the map" semantics, and use the native flag as advisory.
      const isUserViewportGestureActive =
        nativeGestureActive || mapTouchActiveRef.current || mapGestureSessionRef.current !== null;
      mapGestureActiveRef.current = isUserViewportGestureActive;
      cameraIntentArbiter.setGestureActive(isUserViewportGestureActive);

      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }
      const zoomCandidate = state?.properties?.zoom as unknown;
      const zoom =
        typeof zoomCandidate === 'number' && Number.isFinite(zoomCandidate) ? zoomCandidate : null;

      // NOTE: the camera is uncontrolled for center/zoom (see <Camera> in
      // search-map.tsx). User gestures own the live camera directly, so there is
      // nothing to mirror per-tick here — doing so previously re-applied a
      // JS-lagged center every frame and fought the gesture (the "bounce").
      const viewportMotionToken = buildMapViewportMotionToken({
        bounds,
        zoom,
        phase: resolveMapViewportGesturePhase({
          nativeGestureActive: isUserViewportGestureActive,
          isMapTouchActive: mapTouchActiveRef.current,
        }),
      });
      mapMotionPressureController.updateViewportState({
        motionTokenIdentity: viewportMotionToken,
        phase: resolveMapViewportGesturePhase({
          nativeGestureActive: isUserViewportGestureActive,
          isMapTouchActive: mapTouchActiveRef.current,
        }),
        nowMs: Date.now(),
      });
      if (lastViewportMotionTokenRef.current === viewportMotionToken) {
        return;
      }
      lastViewportMotionTokenRef.current = viewportMotionToken;
      viewportBoundsService.setBounds(bounds);

      // Programmatic camera animations (profile open/restore) can emit many camera ticks.
      // Skip per-tick LOD churn there and refresh once on idle instead.
      if (suppressMapMovedRef.current && !isUserViewportGestureActive) {
        mapGestureSessionRef.current = null;
        return;
      }

      let didStartGestureSession = false;
      if (isUserViewportGestureActive && mapGestureSessionRef.current === null) {
        mapGestureSessionRef.current = {
          startBounds: bounds,
          startZoom: zoom,
          eventCount: 1,
        };
        didStartGestureSession = true;
      }

      if (
        shouldDeferMapMovementWork({
          pressureState: mapMotionPressureController.getState(),
        })
      ) {
        cancelPendingMapMovementUpdates();
        return;
      }
      if (isUserViewportGestureActive) {
        const session = mapGestureSessionRef.current;
        if (!session) {
          return;
        }

        if (!didStartGestureSession) {
          session.eventCount += 1;
        }
        const startCenter = getBoundsCenter(session.startBounds);
        const nextCenter = getBoundsCenter(bounds);
        const movedMiles = haversineDistanceMiles(startCenter, nextCenter);
        const zoomDelta =
          zoom !== null && session.startZoom !== null ? Math.abs(zoom - session.startZoom) : 0;

        if (
          !hasMaterialUserMapGestureDelta({
            movedMiles,
            zoomDelta,
            eventCount: session.eventCount,
          })
        ) {
          return;
        }

        const searchBaselineBounds = viewportBoundsService.getSearchBaselineBounds();
        const searchBaselineWouldMark =
          searchBaselineBounds != null && hasBoundsMovedSignificantly(searchBaselineBounds, bounds);
        const gestureBaselineWouldMark = movedMiles >= MAP_MOVE_MIN_DISTANCE_MILES;
        const didMarkMapMoved =
          isSearchOverlay &&
          isSearchSessionActive &&
          markMapMovedIfNeeded(bounds, { fallbackBaselineBounds: session.startBounds });
        const mapMoveAdmissionSource = didMarkMapMoved
          ? searchBaselineWouldMark
            ? 'search_baseline'
            : gestureBaselineWouldMark
              ? 'gesture_baseline'
              : 'already_marked'
          : 'blocked';
        const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(scenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'map_post_results_movement_contract',
            source: 'map_interaction_controller',
            materialUserGesture: true,
            mapMovedSinceSearchRequested: didMarkMapMoved,
            mapMoveAdmissionSource,
            resultSheetSnapRequested: false,
            searchThisAreaRevealScheduled: didMarkMapMoved,
            searchBaselinePresent: searchBaselineBounds != null,
            searchBaselineWouldMark,
            gestureBaselineWouldMark,
            movedMiles,
            zoomDelta,
            eventCount: session.eventCount,
            isSearchOverlay,
            isSearchSessionActive,
          });
        }
        if (didMarkMapMoved) {
          scheduleMapIdleEnter();
        }
        return;
      }

      mapGestureSessionRef.current = null;

      if (!isSearchOverlay || !isSearchSessionActive) {
        return;
      }
      // Do not surface "Search this area" from non-gesture map changes.
      // Programmatic camera moves (pin open/close, restore, autofocus) should not count as
      // user-driven exploration.
    },
    [
      cameraIntentArbiter,
      cancelPendingMapMovementUpdates,
      isSearchOverlay,
      isSearchSessionActive,
      mapInteractionDiagnostics,
      mapGestureActiveRef,
      mapMotionPressureController,
      markMapMovedIfNeeded,
      scheduleMapIdleEnter,
      searchInteractionRef,
      suppressMapMovedRef,
      shouldLogMapEventRates,
      viewportBoundsService,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapInteractionDiagnostics.recordMapIdle();
      }
      const endingGestureSession = mapGestureSessionRef.current;
      mapGestureSessionRef.current = null;
      mapGestureActiveRef.current = false;
      cameraIntentArbiter.setGestureActive(false);
      const isBusy = shouldDeferMapMovementWork({
        pressureState: mapMotionPressureController.getState(),
      });
      if (isBusy) {
        cancelPendingMapMovementUpdates();
      }
      const bounds = mapStateBoundsToMapBounds(state);
      if (bounds) {
        const zoomCandidate = state?.properties?.zoom as unknown;
        const zoom =
          typeof zoomCandidate === 'number' && Number.isFinite(zoomCandidate)
            ? zoomCandidate
            : null;
        lastViewportMotionTokenRef.current = buildMapViewportMotionToken({
          bounds,
          zoom,
          phase: 'settled',
        });
        mapMotionPressureController.updateViewportState({
          motionTokenIdentity: lastViewportMotionTokenRef.current,
          phase: 'settled',
          nowMs: Date.now(),
        });
        if (shouldShowPollsSheet) {
          schedulePollBoundsUpdate(bounds);
        }
        viewportBoundsService.setBounds(bounds);
        if (isSearchOverlay && isSearchSessionActive && endingGestureSession != null) {
          const startCenter = getBoundsCenter(endingGestureSession.startBounds);
          const nextCenter = getBoundsCenter(bounds);
          const movedMiles = haversineDistanceMiles(startCenter, nextCenter);
          const zoomDelta =
            zoom !== null && endingGestureSession.startZoom !== null
              ? Math.abs(zoom - endingGestureSession.startZoom)
              : 0;
          const searchBaselineBounds = viewportBoundsService.getSearchBaselineBounds();
          const searchBaselineWouldMark =
            searchBaselineBounds != null &&
            hasBoundsMovedSignificantly(searchBaselineBounds, bounds);
          const gestureBaselineWouldMark = movedMiles >= MAP_MOVE_MIN_DISTANCE_MILES;
          const shouldAdmitIdleGestureMove =
            searchBaselineWouldMark ||
            gestureBaselineWouldMark ||
            hasMaterialUserMapGestureDelta({
              movedMiles,
              zoomDelta,
              eventCount: endingGestureSession.eventCount,
            });
          if (shouldAdmitIdleGestureMove) {
            const didMarkMapMoved = markMapMovedIfNeeded(bounds, {
              fallbackBaselineBounds: endingGestureSession.startBounds,
            });
            const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
            if (isPerfScenarioAttributionActive(scenarioConfig)) {
              logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                event: 'map_post_results_movement_contract',
                source: 'map_interaction_controller_idle',
                materialUserGesture: true,
                mapMovedSinceSearchRequested: didMarkMapMoved,
                mapMoveAdmissionSource: didMarkMapMoved
                  ? searchBaselineWouldMark
                    ? 'search_baseline'
                    : gestureBaselineWouldMark
                      ? 'gesture_baseline'
                      : 'material_idle_gesture'
                  : 'blocked',
                resultSheetSnapRequested: false,
                searchThisAreaRevealScheduled: didMarkMapMoved,
                searchBaselinePresent: searchBaselineBounds != null,
                searchBaselineWouldMark,
                gestureBaselineWouldMark,
                movedMiles,
                zoomDelta,
                eventCount: endingGestureSession.eventCount,
                isSearchOverlay,
                isSearchSessionActive,
              });
            }
            if (didMarkMapMoved) {
              scheduleMapIdleEnter();
            }
          }
        }
      }
      if (isSearchOverlay && isSearchSessionActive) {
        scheduleMapIdleEnter();
      }

      if (isBusy) {
        return;
      }

      const nextCenter = state?.properties?.center as unknown;
      const nextZoom = state?.properties?.zoom as unknown;
      if (
        !isLngLatTuple(nextCenter) ||
        typeof nextZoom !== 'number' ||
        !Number.isFinite(nextZoom)
      ) {
        return;
      }

      const exactCenter: [number, number] = [nextCenter[0], nextCenter[1]];
      const exactZoom = nextZoom;
      persistSettledCameraViewport(exactCenter, exactZoom);
      if (suppressMapMovedRef.current) {
        suppressMapMovedRef.current = false;
        return;
      }
      if (isProfilePresentationActive) {
        return;
      }
      cameraIntentArbiter.syncObservedCameraViewport({
        center: exactCenter,
        zoom: exactZoom,
      });
      suppressMapMovedRef.current = false;
    },
    [
      cameraIntentArbiter,
      cancelPendingMapMovementUpdates,
      isSearchOverlay,
      isSearchSessionActive,
      isProfilePresentationActive,
      mapInteractionDiagnostics,
      mapGestureActiveRef,
      mapMotionPressureController,
      persistSettledCameraViewport,
      scheduleMapIdleEnter,
      schedulePollBoundsUpdate,
      searchInteractionRef,
      shouldLogMapEventRates,
      shouldShowPollsSheet,
      viewportBoundsService,
    ]
  );

  const handleMapTouchStart = React.useCallback(() => {
    mapTouchActiveRef.current = true;
    mapGestureSessionRef.current = null;
    mapGestureActiveRef.current = true;
    suppressMapMovedRef.current = false;
    cameraIntentArbiter.setGestureActive(true);
  }, [cameraIntentArbiter, mapGestureActiveRef, suppressMapMovedRef]);

  const handleMapTouchEnd = React.useCallback(() => {
    mapTouchActiveRef.current = false;
    const keepGestureActive = mapGestureSessionRef.current !== null;
    mapGestureActiveRef.current = keepGestureActive;
    cameraIntentArbiter.setGestureActive(keepGestureActive);
    scheduleMapIdleEnter({ releaseGestureGate: true });
  }, [cameraIntentArbiter, mapGestureActiveRef, scheduleMapIdleEnter]);

  const attributedHandleMapPress = React.useCallback(
    () =>
      withSearchNavSwitchRuntimeAttribution('mapInteraction', 'mapPress', () => {
        handleMapPress();
      }),
    [handleMapPress]
  );
  const attributedHandleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) =>
      withSearchNavSwitchRuntimeAttribution('mapInteraction', 'nativeViewportChanged', () => {
        handleNativeViewportChanged(state);
      }),
    [handleNativeViewportChanged]
  );
  const attributedHandleMapIdle = React.useCallback(
    (state: MapboxMapState) =>
      withSearchNavSwitchRuntimeAttribution('mapInteraction', 'mapIdle', () => {
        handleMapIdle(state);
      }),
    [handleMapIdle]
  );
  const attributedHandleMapTouchStart = React.useCallback(
    () =>
      withSearchNavSwitchRuntimeAttribution('mapInteraction', 'mapTouchStart', () => {
        handleMapTouchStart();
      }),
    [handleMapTouchStart]
  );
  const attributedHandleMapTouchEnd = React.useCallback(
    () =>
      withSearchNavSwitchRuntimeAttribution('mapInteraction', 'mapTouchEnd', () => {
        handleMapTouchEnd();
      }),
    [handleMapTouchEnd]
  );

  return {
    handleMapPress: attributedHandleMapPress,
    handleNativeViewportChanged: attributedHandleNativeViewportChanged,
    handleMapIdle: attributedHandleMapIdle,
    handleMapTouchStart: attributedHandleMapTouchStart,
    handleMapTouchEnd: attributedHandleMapTouchEnd,
  };
};
