import React from 'react';
import { Dimensions } from 'react-native';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { registerOverlapAutoZoomHandler } from '../map/overlap-auto-zoom-bridge';
import { zoomToFitRadiusMiles } from '../../utils/overlap-region';
import { registerPerfScenarioCommands } from '../../../../perf/perf-scenario-command-registry';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  SCALE_PROBE_MAX_MARKERS,
  usePerfScaleProbeStore,
} from '../../../../perf/perf-scale-probe-store';
import {
  type SubmitShortcutScenarioCommandInput,
  type UseSearchRuntimeInstrumentationRuntimeArgs,
  type UseSearchRuntimeInstrumentationRuntimeResult,
} from './use-search-runtime-instrumentation-runtime-contract';
import type { MapBounds } from '../../../../types';
import { useSearchRuntimeProfilerInstrumentationRuntime } from './use-search-runtime-profiler-instrumentation-runtime';
import { useSearchRuntimeProfilerStageHintRuntime } from './use-search-runtime-profiler-stage-hint-runtime';
import { useSearchRuntimeSearchSurfaceRedrawTelemetryRuntime } from './use-search-runtime-surface-redraw-telemetry-runtime';
import { useSearchRuntimeStallInstrumentationRuntime } from './use-search-runtime-stall-instrumentation-runtime';
import { useSearchRuntimeStateTelemetryRuntime } from './use-search-runtime-state-telemetry-runtime';

const SHOULD_LOG_MAP_EVENT_RATES = false;
const MAP_EVENT_LOG_INTERVAL_MS = 0;
const SHOULD_LOG_SEARCH_COMPUTES = false;
const SHOULD_LOG_SEARCH_STATE_CHANGES = false;
const SHOULD_LOG_RESULTS_VIEWABILITY = false;

const clampLatitude = (value: number): number => Math.max(-89.9, Math.min(89.9, value));

const buildScenarioCameraBounds = ({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number;
}): MapBounds => {
  const latSpan = zoom >= 13 ? 0.045 : zoom >= 12 ? 0.08 : zoom >= 11 ? 0.16 : 0.3;
  const cosine = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  const lngSpan = latSpan / cosine;
  return {
    northEast: {
      lat: clampLatitude(lat + latSpan / 2),
      lng: lng + lngSpan / 2,
    },
    southWest: {
      lat: clampLatitude(lat - latSpan / 2),
      lng: lng - lngSpan / 2,
    },
  };
};

const summarizeBounds = (bounds: MapBounds): Record<string, unknown> => ({
  boundsNorthEastLat: bounds.northEast.lat,
  boundsNorthEastLng: bounds.northEast.lng,
  boundsSouthWestLat: bounds.southWest.lat,
  boundsSouthWestLng: bounds.southWest.lng,
  boundsCenterLat: Number(((bounds.northEast.lat + bounds.southWest.lat) / 2).toFixed(6)),
  boundsCenterLng: Number(((bounds.northEast.lng + bounds.southWest.lng) / 2).toFixed(6)),
});

export const useSearchRuntimeInstrumentationRuntime = ({
  getPerfNow,
  searchMode,
  isSearchLoading,
  resultsRequestKey,
  searchInteractionRef,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  mapQueryBudget,
  searchSurfaceRedrawCoordinatorRef,
  searchSurfaceRedrawCommitSpanPressureByOperationRef,
  isSearchRequestLoadingRef,
  readRuntimeMemoryDiagnostics,
  isSearchSessionActive,
  isAutocompleteSuppressed,
  rootOverlay,
  activeOverlayKey,
  cameraIntentArbiter,
  viewportBoundsService,
  markMapMovedIfNeeded,
  scheduleMapIdleEnter,
  schedulePollBoundsUpdate,
  ensureInitialCameraReady,
  isSearchOverlay,
  resultsPage,
}: UseSearchRuntimeInstrumentationRuntimeArgs): UseSearchRuntimeInstrumentationRuntimeResult => {
  const logSearchCompute = React.useCallback((_label: string, _duration: number) => {}, []);
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const activeScenarioConfigRef = React.useRef(activeScenarioConfig);
  activeScenarioConfigRef.current = activeScenarioConfig;
  const submitShortcutScenarioCommandRef = React.useRef<
    (input: SubmitShortcutScenarioCommandInput) => Promise<void>
  >(async () => undefined);
  const closeSearchScenarioCommandRef = React.useRef<() => void>(() => undefined);
  const tabToggleScenarioCommandRef = React.useRef<(next: 'dishes' | 'restaurants') => void>(
    () => undefined
  );
  const getActiveScenarioRunNumber = React.useCallback((): number | null => {
    const scenarioConfig = activeScenarioConfigRef.current;
    return isPerfScenarioAttributionActive(scenarioConfig) ? 1 : null;
  }, []);
  const emitRuntimeMechanismEvent = React.useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      const scenarioConfig = activeScenarioConfigRef.current;
      if (!isPerfScenarioAttributionActive(scenarioConfig)) {
        return;
      }
      logPerfScenarioAttributionEvent('RuntimeMechanism', scenarioConfig, {
        event,
        mechanismSource: 'runtime',
        nowMs: Number(getPerfNow().toFixed(1)),
        ...payload,
      });
    },
    [getPerfNow]
  );
  const closeResultsPerfCommand = React.useCallback(() => {
    closeSearchScenarioCommandRef.current();
  }, []);
  const submitShortcutRestaurantsPerfCommand = React.useCallback(
    async () =>
      submitShortcutScenarioCommandRef.current({
        targetTab: 'restaurants',
        label: 'Best restaurants',
        preserveSheetState: false,
        transitionFromDockedPolls: true,
        forceFreshBounds: false,
      }),
    []
  );
  const toggleTabPerfCommand = React.useCallback(({ tab }: { tab: 'dishes' | 'restaurants' }) => {
    tabToggleScenarioCommandRef.current(tab);
  }, []);
  const setMapCameraPerfCommand = React.useCallback(
    ({
      lat,
      lng,
      zoom,
      bearing,
      pitch,
    }: {
      lat: number;
      lng: number;
      zoom: number;
      bearing?: number | null;
      pitch?: number | null;
      label?: string | null;
    }) => {
      ensureInitialCameraReady();
      const accepted = cameraIntentArbiter.commit({
        center: [lng, lat],
        zoom,
        bearing,
        pitch,
        animationMode: 'none',
        animationDurationMs: 0,
        allowDuringGesture: true,
      });
      if (accepted) {
        const bounds = buildScenarioCameraBounds({ lat, lng, zoom });
        viewportBoundsService.setBounds(bounds);
        schedulePollBoundsUpdate(bounds);
        emitRuntimeMechanismEvent('perf_scenario_camera_bounds_seeded', {
          bearing: bearing ?? null,
          pitch: pitch ?? null,
          ...summarizeBounds(bounds),
          zoom,
        });
      }
      return accepted;
    },
    [
      cameraIntentArbiter,
      emitRuntimeMechanismEvent,
      ensureInitialCameraReady,
      schedulePollBoundsUpdate,
      viewportBoundsService,
    ]
  );
  const animateMapCameraPerfCommand = React.useCallback(
    ({
      lat,
      lng,
      zoom,
      bearing,
      pitch,
      cameraDurationMs,
      label,
    }: {
      lat: number;
      lng: number;
      zoom: number;
      bearing?: number | null;
      pitch?: number | null;
      cameraDurationMs: number;
      label?: string | null;
    }) => {
      ensureInitialCameraReady();
      const accepted = cameraIntentArbiter.commit({
        center: [lng, lat],
        zoom,
        bearing,
        pitch,
        animationMode: 'easeTo',
        animationDurationMs: cameraDurationMs,
        allowDuringGesture: true,
      });
      if (accepted) {
        const targetBounds = buildScenarioCameraBounds({ lat, lng, zoom });
        emitRuntimeMechanismEvent('perf_scenario_animated_camera_committed', {
          animationMode: 'easeTo',
          bearing: bearing ?? null,
          cameraDurationMs,
          label: label ?? null,
          pitch: pitch ?? null,
          ...summarizeBounds(targetBounds),
          zoom,
        });
      }
      return accepted;
    },
    [cameraIntentArbiter, emitRuntimeMechanismEvent, ensureInitialCameraReady]
  );
  const moveMapForSearchThisAreaPerfCommand = React.useCallback(
    ({ lat, lng, zoom }: { lat: number; lng: number; zoom: number; label?: string | null }) => {
      const previousBounds = viewportBoundsService.getBounds();
      ensureInitialCameraReady();
      const accepted = cameraIntentArbiter.commit({
        center: [lng, lat],
        zoom,
        animationMode: 'none',
        animationDurationMs: 0,
        allowDuringGesture: true,
      });
      if (!accepted) {
        return false;
      }
      const bounds = buildScenarioCameraBounds({ lat, lng, zoom });
      viewportBoundsService.setBounds(bounds);
      schedulePollBoundsUpdate(bounds);
      const didMarkMapMoved =
        isSearchOverlay && isSearchSessionActive
          ? markMapMovedIfNeeded(bounds, { fallbackBaselineBounds: previousBounds })
          : false;
      const scenarioConfig = activeScenarioConfigRef.current;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_post_results_movement_contract',
          source: 'perf_scenario_command',
          syntheticUserGesture: true,
          materialUserGesture: true,
          mapMovedSinceSearchRequested: didMarkMapMoved,
          mapMoveAdmissionSource: didMarkMapMoved ? 'perf_command' : 'blocked',
          resultSheetSnapRequested: false,
          searchThisAreaRevealScheduled: didMarkMapMoved,
          searchBaselinePresent: viewportBoundsService.getSearchBaselineBounds() != null,
          gestureBaselineWouldMark: previousBounds != null,
          isSearchOverlay,
          isSearchSessionActive,
          ...summarizeBounds(bounds),
          zoom,
        });
      }
      if (!didMarkMapMoved) {
        return false;
      }
      scheduleMapIdleEnter({ releaseGestureGate: true });
      return true;
    },
    [
      cameraIntentArbiter,
      isSearchOverlay,
      isSearchSessionActive,
      markMapMovedIfNeeded,
      scheduleMapIdleEnter,
      schedulePollBoundsUpdate,
      ensureInitialCameraReady,
      viewportBoundsService,
    ]
  );

  const setScaleProbeMarkersPerfCommand = React.useCallback(
    ({
      count,
      lat,
      lng,
      collide,
      spreadDeg,
    }: {
      count: number;
      lat: number;
      lng: number;
      collide?: boolean;
      spreadDeg?: number | null;
      label?: string | null;
    }) => {
      const clampedCount = Math.max(0, Math.min(SCALE_PROBE_MAX_MARKERS, Math.round(count)));
      if (clampedCount <= 0) {
        usePerfScaleProbeStore.getState().clearProbe();
      } else {
        usePerfScaleProbeStore.getState().setProbe({
          count: clampedCount,
          lng,
          lat,
          collide: collide === true,
          spreadDeg: spreadDeg ?? undefined,
        });
      }
      emitRuntimeMechanismEvent('map_scale_probe_marker_count_applied', {
        requestedCount: count,
        markerCount: clampedCount,
        collide: collide === true,
        spreadDeg: spreadDeg ?? null,
        centerLat: lat,
        centerLng: lng,
      });
      return true;
    },
    [emitRuntimeMechanismEvent]
  );

  React.useEffect(
    () =>
      registerPerfScenarioCommands({
        closeResults: closeResultsPerfCommand,
        setMapCamera: setMapCameraPerfCommand,
        animateMapCamera: animateMapCameraPerfCommand,
        moveMapForSearchThisArea: moveMapForSearchThisAreaPerfCommand,
        submitShortcutRestaurants: submitShortcutRestaurantsPerfCommand,
        toggleTab: toggleTabPerfCommand,
        setScaleProbeMarkers: setScaleProbeMarkersPerfCommand,
      }),
    [
      animateMapCameraPerfCommand,
      closeResultsPerfCommand,
      moveMapForSearchThisAreaPerfCommand,
      setMapCameraPerfCommand,
      submitShortcutRestaurantsPerfCommand,
      toggleTabPerfCommand,
      setScaleProbeMarkersPerfCommand,
    ]
  );

  // Auto-zoom for far-out shortcut searches: the source builder posts the resolved
  // overlap radius (center + miles around the user); animate the camera to fit it so
  // the user lands in their vicinity. easeTo + allowDuringGesture:false so it never
  // fights a live gesture; programmatic, so it doesn't trip "map moved since search".
  React.useEffect(
    () =>
      registerOverlapAutoZoomHandler(({ center, radiusMiles }) => {
        ensureInitialCameraReady();
        const viewportWidthPx = Dimensions.get('window').width;
        const zoom = zoomToFitRadiusMiles(center.lat, radiusMiles, viewportWidthPx);
        cameraIntentArbiter.commit({
          center: [center.lng, center.lat],
          zoom,
          animationMode: 'easeTo',
          animationDurationMs: 700,
          allowDuringGesture: false,
        });
      }),
    [cameraIntentArbiter, ensureInitialCameraReady]
  );

  const { resolveProfilerStageHint } = useSearchRuntimeProfilerStageHintRuntime({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    isSearchRequestLoadingRef,
  });
  const readRuntimeDiagnostics = React.useCallback(() => {
    const baseDiagnostics = readRuntimeMemoryDiagnostics();
    return {
      ...(baseDiagnostics && typeof baseDiagnostics === 'object' ? baseDiagnostics : {}),
      searchRuntimeBus: searchRuntimeBus.readDiagnostics(),
      resultsPresentationSurfaceAuthority: resultsPresentationSurfaceAuthority.readDiagnostics(),
    };
  }, [readRuntimeMemoryDiagnostics, resultsPresentationSurfaceAuthority, searchRuntimeBus]);

  const handleProfilerRender = useSearchRuntimeProfilerInstrumentationRuntime({
    getPerfNow,
    getActiveScenarioRunNumber,
    mapQueryBudget,
    resolveProfilerStageHint,
    searchSurfaceRedrawCommitSpanPressureByOperationRef,
    searchSurfaceRedrawCoordinatorRef,
    searchMode,
    scenarioRunId: isPerfScenarioAttributionActive(activeScenarioConfig)
      ? activeScenarioConfig.runId
      : null,
  });

  useSearchRuntimeStallInstrumentationRuntime({
    getPerfNow,
    getActiveScenarioRunNumber,
    resolveProfilerStageHint,
    searchInteractionRef,
    readRuntimeMemoryDiagnostics: readRuntimeDiagnostics,
    scenarioRunId: isPerfScenarioAttributionActive(activeScenarioConfig)
      ? activeScenarioConfig.runId
      : null,
  });

  useSearchRuntimeSearchSurfaceRedrawTelemetryRuntime({
    getActiveScenarioRunNumber,
    emitRuntimeMechanismEvent,
    searchSurfaceRedrawCoordinatorRef,
  });

  useSearchRuntimeStateTelemetryRuntime({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    getActiveScenarioRunNumber,
    emitRuntimeMechanismEvent,
    searchMode,
    isSearchSessionActive,
    isSearchLoading,
    isAutocompleteSuppressed,
    rootOverlay,
    activeOverlayKey,
    isSearchOverlay,
    resultsRequestKey,
    resultsPage,
  });

  return {
    emitRuntimeMechanismEvent,
    submitShortcutScenarioCommandRef,
    closeSearchScenarioCommandRef,
    tabToggleScenarioCommandRef,
    handleProfilerRender,
    shouldLogSearchComputes: SHOULD_LOG_SEARCH_COMPUTES,
    logSearchCompute,
    shouldLogSearchStateChanges: SHOULD_LOG_SEARCH_STATE_CHANGES,
    shouldLogResultsViewability: SHOULD_LOG_RESULTS_VIEWABILITY,
    shouldLogMapEventRates: SHOULD_LOG_MAP_EVENT_RATES,
    mapEventLogIntervalMs: MAP_EVENT_LOG_INTERVAL_MS,
  };
};
