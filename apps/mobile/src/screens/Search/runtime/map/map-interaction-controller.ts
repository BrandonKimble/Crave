import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { MapBounds } from '../../../../types';
import {
  getBoundsCenter,
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

const shouldAutoCollapseResultsSheetForGesture = ({
  hasAlreadyCollapsed,
  startedWithResultsSheetOpen,
  sheetState,
  isSearchOverlay,
  hasResults,
  isSearchSessionActive,
  shouldDisableResultsSheetInteraction,
}: {
  hasAlreadyCollapsed: boolean;
  startedWithResultsSheetOpen: boolean;
  sheetState: 'expanded' | 'middle' | 'collapsed' | 'hidden';
  isSearchOverlay: boolean;
  hasResults: boolean;
  isSearchSessionActive: boolean;
  shouldDisableResultsSheetInteraction: boolean;
}): boolean => {
  return (
    !hasAlreadyCollapsed &&
    startedWithResultsSheetOpen &&
    sheetState !== 'hidden' &&
    sheetState !== 'collapsed' &&
    isSearchOverlay &&
    hasResults &&
    isSearchSessionActive &&
    !shouldDisableResultsSheetInteraction
  );
};

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

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
  didCollapse: boolean;
  startedWithResultsSheetOpen: boolean;
};

type UseMapInteractionControllerArgs = {
  shouldLogMapEventRates: boolean;
  mapEventLogIntervalMs: number;
  shouldLogSearchStateChanges: boolean;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  anySheetDraggingRef: React.MutableRefObject<boolean>;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  suppressMapMovedRef: React.MutableRefObject<boolean>;
  shouldRenderResultsSheetRef: React.MutableRefObject<boolean>;
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
  markMapMovedIfNeeded: (bounds: MapBounds) => boolean;
  scheduleMapIdleEnter: () => void;
  sheetState: OverlaySheetSnap;
  isSearchOverlay: boolean;
  hasResults: boolean;
  shouldDisableResultsSheetInteraction: boolean;
  animateSheetTo: (state: Exclude<OverlaySheetSnap, 'hidden'>) => void;
  shouldShowPollsSheet: boolean;
  schedulePollBoundsUpdate: (bounds: MapBounds) => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number },
    options?: { allowDuringGesture?: boolean }
  ) => boolean;
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
    anySheetDraggingRef,
    mapGestureActiveRef,
    suppressMapMovedRef,
    shouldRenderResultsSheetRef,
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
    sheetState,
    isSearchOverlay,
    hasResults,
    shouldDisableResultsSheetInteraction,
    animateSheetTo,
    shouldShowPollsSheet,
    schedulePollBoundsUpdate,
    commitCameraViewport,
    lastCameraStateRef,
    lastPersistedCameraRef,
  } = args;

  const mapTouchActiveRef = React.useRef(false);
  const mapTouchStartedWithResultsSheetOpenRef = React.useRef(false);
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

      if (
        shouldDeferMapMovementWork({
          pressureState: mapMotionPressureController.getState(),
        })
      ) {
        cancelPendingMapMovementUpdates();
        return;
      }
      if (isUserViewportGestureActive) {
        if (!mapTouchActiveRef.current && mapGestureSessionRef.current === null) {
          mapGestureSessionRef.current = null;
          return;
        }
        const session = mapGestureSessionRef.current;
        if (!session) {
          mapGestureSessionRef.current = {
            startBounds: bounds,
            startZoom: zoom,
            eventCount: 1,
            didCollapse: false,
            startedWithResultsSheetOpen: mapTouchStartedWithResultsSheetOpenRef.current,
          };
          return;
        }

        session.eventCount += 1;
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

        if (
          shouldAutoCollapseResultsSheetForGesture({
            hasAlreadyCollapsed: session.didCollapse,
            startedWithResultsSheetOpen: session.startedWithResultsSheetOpen,
            sheetState,
            isSearchOverlay,
            hasResults,
            isSearchSessionActive,
            shouldDisableResultsSheetInteraction,
          })
        ) {
          mapInteractionDiagnostics.logAutoCollapse({
            movedMiles,
            zoomDelta,
            eventCount: session.eventCount,
            sheetState,
            touchActive: mapTouchActiveRef.current,
            startedOpen: session.startedWithResultsSheetOpen,
          });
          animateSheetTo('collapsed');
          session.didCollapse = true;
        }

        if (isSearchOverlay && isSearchSessionActive && markMapMovedIfNeeded(bounds)) {
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
      animateSheetTo,
      anySheetDraggingRef,
      cameraIntentArbiter,
      cancelPendingMapMovementUpdates,
      hasResults,
      isSearchOverlay,
      isSearchSessionActive,
      mapInteractionDiagnostics,
      mapGestureActiveRef,
      mapMotionPressureController,
      markMapMovedIfNeeded,
      scheduleMapIdleEnter,
      searchInteractionRef,
      sheetState,
      suppressMapMovedRef,
      shouldDisableResultsSheetInteraction,
      shouldLogMapEventRates,
      viewportBoundsService,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapInteractionDiagnostics.recordMapIdle();
      }
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
      if (
        suppressMapMovedRef.current &&
        cameraIntentArbiter.hasPendingProgrammaticCameraCompletion()
      ) {
        cameraIntentArbiter.resolvePendingProgrammaticCameraAnimation('finished');
        suppressMapMovedRef.current = false;
        return;
      }
      commitCameraViewport(
        {
          center: exactCenter,
          zoom: exactZoom,
        },
        { allowDuringGesture: true }
      );
      suppressMapMovedRef.current = false;
    },
    [
      anySheetDraggingRef,
      cameraIntentArbiter,
      cancelPendingMapMovementUpdates,
      commitCameraViewport,
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
    mapTouchStartedWithResultsSheetOpenRef.current = shouldRenderResultsSheetRef.current;
    mapGestureSessionRef.current = null;
    mapGestureActiveRef.current = true;
    suppressMapMovedRef.current = false;
    cameraIntentArbiter.setGestureActive(true);
  }, [cameraIntentArbiter, mapGestureActiveRef, suppressMapMovedRef, shouldRenderResultsSheetRef]);

  const handleMapTouchEnd = React.useCallback(() => {
    mapTouchActiveRef.current = false;
    mapTouchStartedWithResultsSheetOpenRef.current = false;
    const keepGestureActive = mapGestureSessionRef.current !== null;
    mapGestureActiveRef.current = keepGestureActive;
    cameraIntentArbiter.setGestureActive(keepGestureActive);
  }, [cameraIntentArbiter, mapGestureActiveRef]);

  return {
    handleMapPress,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapTouchStart,
    handleMapTouchEnd,
  };
};
