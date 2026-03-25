import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { MapBounds } from '../../../../types';
import { CAMERA_STORAGE_KEY } from '../../constants/search';
import {
  getBoundsCenter,
  haversineDistanceMiles,
  isLngLatTuple,
  mapStateBoundsToMapBounds,
} from '../../utils/geo';
import type { CameraIntentArbiter } from './camera-intent-arbiter';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';

const CAMERA_CENTER_PRECISION = 1e5;
const CAMERA_ZOOM_PRECISION = 1e2;

const roundCameraCenterValue = (value: number) =>
  Math.round(value * CAMERA_CENTER_PRECISION) / CAMERA_CENTER_PRECISION;
const roundCameraZoomValue = (value: number) =>
  Math.round(value * CAMERA_ZOOM_PRECISION) / CAMERA_ZOOM_PRECISION;

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
  lodCameraThrottleMs: number;
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
  isRestaurantOverlayVisible: boolean;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setMapHighlightedRestaurantId: React.Dispatch<React.SetStateAction<string | null>>;
  cancelAutocomplete: () => void;
  cameraIntentArbiter: CameraIntentArbiter;
  viewportBoundsService: ViewportBoundsService;
  cancelMapUpdateTimeouts: () => void;
  markMapMovedIfNeeded: (bounds: MapBounds) => boolean;
  scheduleMapIdleReveal: () => void;
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
    lodCameraThrottleMs,
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
    isRestaurantOverlayVisible,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setMapHighlightedRestaurantId,
    cancelAutocomplete,
    cameraIntentArbiter,
    viewportBoundsService,
    cancelMapUpdateTimeouts,
    markMapMovedIfNeeded,
    scheduleMapIdleReveal,
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
  const lastCameraChangedHandledRef = React.useRef(0);
  const mapEventStatsRef = React.useRef({
    cameraChanged: 0,
    mapIdle: 0,
    lastLog: 0,
  });

  const logMapEventRates = React.useCallback(() => {
    if (!shouldLogMapEventRates) {
      return;
    }
    const now = Date.now();
    const stats = mapEventStatsRef.current;
    if (stats.lastLog === 0) {
      stats.lastLog = now;
      return;
    }
    if (now - stats.lastLog < mapEventLogIntervalMs) {
      return;
    }
    const interactionState = searchInteractionRef.current;
    // eslint-disable-next-line no-console
    console.log(
      `[SearchPerf] Map events ${mapEventLogIntervalMs}ms cameraChanged=${stats.cameraChanged} mapIdle=${stats.mapIdle} drag=${interactionState.isResultsSheetDragging} scroll=${interactionState.isResultsListScrolling} settle=${interactionState.isResultsSheetSettling}`
    );
    stats.cameraChanged = 0;
    stats.mapIdle = 0;
    stats.lastLog = now;
  }, [mapEventLogIntervalMs, searchInteractionRef, shouldLogMapEventRates]);

  const handleMapPress = React.useCallback(() => {
    allowSearchBlurExitRef.current = true;
    suppressAutocompleteResults();
    dismissSearchKeyboard();
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
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
    setMapHighlightedRestaurantId(null);
    cancelAutocomplete();
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    cancelAutocomplete,
    dismissSearchKeyboard,
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    pendingMarkerOpenAnimationFrameRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setMapHighlightedRestaurantId,
    setShowSuggestions,
    setSuggestions,
    suppressAutocompleteResults,
  ]);

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapEventStatsRef.current.cameraChanged += 1;
        logMapEventRates();
      }
      const isGestureActive = Boolean(state?.gestures?.isGestureActive);
      mapGestureActiveRef.current = isGestureActive;
      cameraIntentArbiter.setGestureActive(isGestureActive);

      const now = Date.now();
      if (now - lastCameraChangedHandledRef.current < lodCameraThrottleMs) {
        return;
      }
      lastCameraChangedHandledRef.current = now;

      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }
      viewportBoundsService.setBounds(bounds);

      // Programmatic camera animations (profile open/restore) can emit many camera ticks.
      // Skip per-tick LOD churn there and refresh once on idle instead.
      if (suppressMapMovedRef.current && !isGestureActive) {
        mapGestureSessionRef.current = null;
        return;
      }

      if (searchInteractionRef.current.isInteracting || anySheetDraggingRef.current) {
        cancelMapUpdateTimeouts();
        return;
      }
      const zoomCandidate = state?.properties?.zoom as unknown;
      const zoom =
        typeof zoomCandidate === 'number' && Number.isFinite(zoomCandidate) ? zoomCandidate : null;

      if (isGestureActive) {
        if (!mapTouchActiveRef.current) {
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

        const didMoveEnoughForGesture = movedMiles >= 0.0015 || zoomDelta >= 0.01;
        if (session.eventCount < 2 || !didMoveEnoughForGesture) {
          return;
        }

        if (
          !session.didCollapse &&
          session.startedWithResultsSheetOpen &&
          sheetState !== 'hidden' &&
          sheetState !== 'collapsed' &&
          isSearchOverlay &&
          hasResults &&
          isSearchSessionActive &&
          !shouldDisableResultsSheetInteraction
        ) {
          if (shouldLogSearchStateChanges) {
            // eslint-disable-next-line no-console
            console.log(
              `[SearchPerf] AutoSnap collapsed reason=mapGesture movedMiles=${movedMiles.toFixed(
                4
              )} zoomDelta=${zoomDelta.toFixed(3)} eventCount=${
                session.eventCount
              } sheetState=${sheetState} touchActive=${mapTouchActiveRef.current} startedOpen=${
                session.startedWithResultsSheetOpen
              }`
            );
          }
          animateSheetTo('collapsed');
          session.didCollapse = true;
        }

        if (isSearchOverlay && isSearchSessionActive && markMapMovedIfNeeded(bounds)) {
          scheduleMapIdleReveal();
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
      cancelMapUpdateTimeouts,
      hasResults,
      isSearchOverlay,
      isSearchSessionActive,
      lodCameraThrottleMs,
      logMapEventRates,
      mapGestureActiveRef,
      markMapMovedIfNeeded,
      scheduleMapIdleReveal,
      searchInteractionRef,
      sheetState,
      suppressMapMovedRef,
      shouldDisableResultsSheetInteraction,
      shouldLogMapEventRates,
      shouldLogSearchStateChanges,
      viewportBoundsService,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapEventStatsRef.current.mapIdle += 1;
        logMapEventRates();
      }
      const isBusy = searchInteractionRef.current.isInteracting || anySheetDraggingRef.current;
      if (isBusy) {
        cancelMapUpdateTimeouts();
      }
      const bounds = mapStateBoundsToMapBounds(state);
      if (bounds) {
        if (!isBusy && shouldShowPollsSheet) {
          schedulePollBoundsUpdate(bounds);
        }
        viewportBoundsService.setBounds(bounds);
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
      lastCameraStateRef.current = { center: exactCenter, zoom: exactZoom };
      commitCameraViewport(
        {
          center: exactCenter,
          zoom: exactZoom,
        },
        { allowDuringGesture: true }
      );

      const roundedCenter: [number, number] = [
        roundCameraCenterValue(exactCenter[0]),
        roundCameraCenterValue(exactCenter[1]),
      ];
      const roundedZoom = roundCameraZoomValue(exactZoom);
      const payload = JSON.stringify({ center: roundedCenter, zoom: roundedZoom });
      if (payload === lastPersistedCameraRef.current) {
        return;
      }
      lastPersistedCameraRef.current = payload;
      void AsyncStorage.setItem(CAMERA_STORAGE_KEY, payload).catch(() => undefined);
    },
    [
      anySheetDraggingRef,
      cancelMapUpdateTimeouts,
      commitCameraViewport,
      lastCameraStateRef,
      lastPersistedCameraRef,
      logMapEventRates,
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
  }, [shouldRenderResultsSheetRef]);

  const handleMapTouchEnd = React.useCallback(() => {
    mapTouchActiveRef.current = false;
    mapTouchStartedWithResultsSheetOpenRef.current = false;
    mapGestureSessionRef.current = null;
  }, []);

  return {
    handleMapPress,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapTouchStart,
    handleMapTouchEnd,
  };
};
