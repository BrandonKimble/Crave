import React from 'react';
import { Dimensions } from 'react-native';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { registerOverlapAutoZoomHandler } from '../map/overlap-auto-zoom-bridge';
import { zoomToFitRadiusMiles } from '../../utils/overlap-region';
import { registerPerfScenarioCommands } from '../../../../perf/perf-scenario-command-registry';
import { writeSearchDesiredTuple } from './search-desired-state-writer';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  SCALE_PROBE_MAX_MARKERS,
  usePerfScaleProbeStore,
} from '../../../../perf/perf-scale-probe-store';
import {
  type SubmitShortcutScenarioCommandInput,
  type UseSearchRuntimeInstrumentationRuntimeArgs,
  type UseSearchRuntimeInstrumentationRuntimeResult,
} from './search-runtime-instrumentation-runtime-contract';
import type { MapBounds } from '../../../../types';
import { useSearchRuntimeProfilerInstrumentationRuntime } from './use-search-runtime-profiler-instrumentation-runtime';
import { useSearchRuntimeProfilerStageHintRuntime } from './use-search-runtime-profiler-stage-hint-runtime';
import { useSearchRuntimeStallInstrumentationRuntime } from './use-search-runtime-stall-instrumentation-runtime';
import { useSearchRuntimeRootStateCommitTelemetryRuntime } from './use-search-runtime-root-state-commit-telemetry-runtime';
import searchPerfDebug from '../../search-perf-debug';
import { logger } from '../../../../utils';

// Dormant map-event-rate instrument. The `false` flag is the blessed pattern
// (same shape as the Swift map controller's `lodDebugLoggingEnabled`): map
// instrumentation stays compiled and off rather than being deleted.
//
// D45/F1070 (2026-08-03): the flag was fine, the INTERVAL was broken. It was
// `0`, which DEFEATS the rate limiter it feeds — `now - state.lastLog < 0` is
// never true, so the "rate-limited" logger would have fired on EVERY camera
// frame the first time anyone flipped the flag. The flag and the interval had
// never been exercised together, so nobody had paid for it yet. A dormant
// instrument must still be CORRECT when woken; 1000ms is one flush per second,
// which is what the log line's own `windowMs`/counters were written to read as.
// The consumer also clamps this defensively — see map-interaction-diagnostics.
const SHOULD_LOG_MAP_EVENT_RATES = false;
const MAP_EVENT_LOG_INTERVAL_MS = 1000;
// F1333 — THESE WERE HARDCODED `false`, WHILE A REAL CONFIG FOR THE SAME DECISION EXISTED.
//
// `SHOULD_LOG_SEARCH_COMPUTES` was a bare `false` threaded through FIVE files
// (map-presentation runtime -> map-engine-input controller -> SearchMapWithMarkerEngine ->
// use-direct-search-map-source-controller) alongside a `logSearchCompute` wired to an empty
// function — an entire plumbing run for a decision that could not be made and a channel that
// could not report. Meanwhile `searchPerfDebug` already owned exactly this switch
// (`logSearchComputes`, with a matching `logSearchComputeMinMs` threshold), dev-gated behind
// DEV_FLAGS.perfLogsEnabled, and had owned it all along.
//
// Two sources of truth for "should we log search computes", one of them a literal that always
// answered no. They are one now: the flags come from searchPerfDebug, and the channel below
// actually writes. Same for the state-change flag, which had the same shape.
const SHOULD_LOG_SEARCH_COMPUTES = searchPerfDebug.enabled && searchPerfDebug.logSearchComputes;
const SHOULD_LOG_SEARCH_STATE_CHANGES =
  searchPerfDebug.enabled && searchPerfDebug.logSearchStateChanges;

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
  ensureInitialCameraReady,
  isSearchOverlay,
  resultsPage,
}: UseSearchRuntimeInstrumentationRuntimeArgs): UseSearchRuntimeInstrumentationRuntimeResult => {
  // F1333: this was `(_label, _duration) => {}` — a channel the map's compute instrumentation
  // wrote into and nothing ever read. It reports now, under the same dev gate as its flag, and
  // honours searchPerfDebug's own minimum-duration threshold so it cannot flood.
  const logSearchCompute = React.useCallback((label: string, duration: number) => {
    if (!SHOULD_LOG_SEARCH_COMPUTES || duration < searchPerfDebug.logSearchComputeMinMs) {
      return;
    }
    logger.debug(`[SearchPerf] compute ${label} ${duration.toFixed(1)}ms`);
  }, []);
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
        transitionFromDockedScene: true,
        forceFreshBounds: false,
      }),
    []
  );
  const toggleTabPerfCommand = React.useCallback(({ tab }: { tab: 'dishes' | 'restaurants' }) => {
    tabToggleScenarioCommandRef.current(tab);
  }, []);
  // The harness's lens-flip lever IS the chip's one setter (lens exit §6: every openNow
  // caller flows through this exact write) — byte-identical cause and patch.
  const flipOpenNowPerfCommand = React.useCallback(
    ({ openNow }: { openNow: boolean }) => {
      writeSearchDesiredTuple(searchRuntimeBus, { filterVariant: { openNow } }, 'chip_open_now');
    },
    [searchRuntimeBus]
  );
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
        // Leg 3: viewportBoundsService.setBounds IS the poll-feed feed line now —
        // the subject store settles from the same stream; no direct poke needed.
        viewportBoundsService.setBounds(bounds, { center: [lng, lat], zoom });
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
        submitShortcutRestaurants: submitShortcutRestaurantsPerfCommand,
        toggleTab: toggleTabPerfCommand,
        flipOpenNow: flipOpenNowPerfCommand,
        setScaleProbeMarkers: setScaleProbeMarkersPerfCommand,
      }),
    [
      animateMapCameraPerfCommand,
      closeResultsPerfCommand,
      setMapCameraPerfCommand,
      submitShortcutRestaurantsPerfCommand,
      toggleTabPerfCommand,
      flipOpenNowPerfCommand,
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
        if (zoom == null) {
          // F2308: the fit zoom is not measurable (no viewport width yet), and a
          // CameraIntent requires a zoom. Skip the auto-zoom rather than commit a
          // fabricated camera — the user keeps their own framing.
          return;
        }
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
    resultsPresentationAuthority,
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
    resolveProfilerStageHint,
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

  useSearchRuntimeRootStateCommitTelemetryRuntime({
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
    shouldLogMapEventRates: SHOULD_LOG_MAP_EVENT_RATES,
    mapEventLogIntervalMs: MAP_EVENT_LOG_INTERVAL_MS,
  };
};
