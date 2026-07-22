import React from 'react';
import { Dimensions } from 'react-native';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import type { MapBounds } from '../../../types';
import type { MapboxMapRef } from '../components/search-map';
import {
  type MapMotionPressureController,
  shouldDeferMapMovementWork,
} from '../runtime/map/map-motion-pressure';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from '../runtime/native/search-chrome-scalar-surface-primitive-source-runtime';
import { MAP_MOVE_MIN_DISTANCE_MILES } from '../constants/search';
import {
  boundsFromCoordinates,
  getBoundsCenter,
  hasBoundsMovedSignificantly,
  haversineDistanceMiles,
  isLngLatTuple,
} from '../utils/geo';
import type { LngLat } from '../utils/overlap-region';

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsListScrolling: boolean;
};

type UseSearchMapMovementStateArgs = {
  startupPollBounds: MapBounds | null;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  searchRuntimeBus: Pick<SearchRuntimeBus, 'getState' | 'subscribe'>;
  viewportBoundsService: ViewportBoundsService;
  mapRef: React.RefObject<MapboxMapRef | null>;
  mapMotionPressureController: MapMotionPressureController;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  anySheetDraggingRef: React.MutableRefObject<boolean>;
  lastSearchBoundsCaptureSeqRef: React.MutableRefObject<number>;
  searchChromeScalarSurfacePrimitiveSourceRuntime?: SearchChromeScalarSurfacePrimitiveSourceRuntime;
};

type UseSearchMapMovementStateResult = {
  mapMovedSinceSearch: boolean;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  resetMapMoveFlag: () => void;
  markMapMovedIfNeeded: (
    bounds: MapBounds,
    options?: { fallbackBaselineBounds?: MapBounds | null }
  ) => boolean;
  scheduleMapIdleEnter: (options?: { releaseGestureGate?: boolean }) => void;
  flushDeferredMapMovementState: () => void;
};

const shouldMarkMapMovedForBounds = ({
  fallbackBaselineBounds,
  nextBounds,
  searchBaselineBounds,
  hasMapMovedSinceSearch,
}: {
  fallbackBaselineBounds: MapBounds | null;
  nextBounds: MapBounds;
  searchBaselineBounds: MapBounds | null;
  hasMapMovedSinceSearch: boolean;
}): boolean => {
  if (hasMapMovedSinceSearch) {
    return true;
  }
  if (
    searchBaselineBounds != null &&
    hasBoundsMovedSignificantly(searchBaselineBounds, nextBounds)
  ) {
    return true;
  }
  if (
    fallbackBaselineBounds != null &&
    haversineDistanceMiles(getBoundsCenter(fallbackBaselineBounds), getBoundsCenter(nextBounds)) >=
      MAP_MOVE_MIN_DISTANCE_MILES
  ) {
    return true;
  }
  return false;
};

const resolveMapMovedEnterAdmission = ({
  hasMapMovedSinceSearch,
  isMapGestureActive,
  isSearchInteracting,
  isAnySheetDragging,
  shouldDeferMapFromPressure,
}: {
  hasMapMovedSinceSearch: boolean;
  isMapGestureActive: boolean;
  isSearchInteracting: boolean;
  isAnySheetDragging: boolean;
  shouldDeferMapFromPressure: boolean;
}): 'publish_now' | 'defer_until_idle' | 'skip_no_move' => {
  if (!hasMapMovedSinceSearch) {
    return 'skip_no_move';
  }
  if (
    shouldDeferMapFromPressure ||
    isMapGestureActive ||
    isSearchInteracting ||
    isAnySheetDragging
  ) {
    return 'defer_until_idle';
  }
  return 'publish_now';
};

export const useSearchMapMovementState = ({
  startupPollBounds,
  latestBoundsRef,
  searchRuntimeBus,
  viewportBoundsService,
  mapRef,
  mapMotionPressureController,
  searchInteractionRef,
  anySheetDraggingRef,
  lastSearchBoundsCaptureSeqRef,
  searchChromeScalarSurfacePrimitiveSourceRuntime,
}: UseSearchMapMovementStateArgs): UseSearchMapMovementStateResult => {
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = React.useState(false);
  const mapMovedSinceSearchRef = React.useRef(false);
  const pendingMapMovedEnterRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);

  const writeMapMovedScalarPrimitive = React.useCallback(
    (mapMovedNext: boolean) => {
      searchChromeScalarSurfacePrimitiveSourceRuntime?.updatePrimitiveSnapshot({
        mapMovedSinceSearch: mapMovedNext,
      });
    },
    [searchChromeScalarSurfacePrimitiveSourceRuntime]
  );

  // Startup viewport seed: before the first native camera event, the bootstrap
  // camera's derived bounds fill the ViewportBoundsService so every settled-
  // viewport consumer (subject store, feed, dwell) has a world to judge. The
  // old pollBounds mirror died in leg 3 — the subject store's settledBounds is
  // the one settled-viewport authority now.
  React.useEffect(() => {
    if (!startupPollBounds) {
      return;
    }
    if (!latestBoundsRef.current) {
      viewportBoundsService.setBounds(startupPollBounds);
    }
  }, [latestBoundsRef, startupPollBounds, viewportBoundsService]);

  // Refine the mirrored AABB baseline with the SCREEN-ACCURATE visible polygon:
  // project the 4 view corners to lng/lat (pitch/twist-aware) and re-capture, with the
  // polygon as the single source of truth and its bbox as the derived AABB. An accuracy
  // upgrade of the SAME submitted viewport — never written back to the tuple (the
  // refined AABB differs slightly from the committed bounds and would phantom-classify
  // an area_rerun). Async + sequence-guarded so a superseding capture wins. The map is
  // full-bleed, so the window corners are the map's visible corners.
  const refineSubmittedPolygon = React.useCallback(
    (captureSeq: number) => {
      const map = mapRef.current;
      if (!map?.getCoordinateFromView) {
        return;
      }
      const { width, height } = Dimensions.get('window');
      if (!(width > 0) || !(height > 0)) {
        return;
      }
      const cornerPoints: Array<[number, number]> = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ];
      void Promise.all(
        cornerPoints.map((point) => map.getCoordinateFromView!(point).catch(() => null))
      ).then((positions) => {
        if (lastSearchBoundsCaptureSeqRef.current !== captureSeq) {
          return;
        }
        const polygon = positions
          .filter((p): p is [number, number] => isLngLatTuple(p))
          .map(([lng, lat]) => [lng, lat] as LngLat);
        if (polygon.length < 3) {
          return;
        }
        const polygonBounds = boundsFromCoordinates(polygon);
        if (!polygonBounds) {
          return;
        }
        viewportBoundsService.captureSearchBaseline(polygonBounds, polygon);
      });
    },
    [lastSearchBoundsCaptureSeqRef, mapRef, viewportBoundsService]
  );

  // PURE flag reset (the "map moved" boolean + its scalar mirror + the deferred-enter
  // latch). The BASELINE is no longer captured here — it is a MIRROR of the desired
  // tuple's committedBounds (the effect below), so "the area STA compares against" and
  // "the area the search ran on" are one value by construction. The seq bump cancels
  // any in-flight polygon refine for a superseded submit.
  const resetMapMoveFlag = React.useCallback(() => {
    pendingMapMovedEnterRef.current = false;
    ++lastSearchBoundsCaptureSeqRef.current;
    mapMovedSinceSearchRef.current = false;
    writeMapMovedScalarPrimitive(false);
    setMapMovedSinceSearch(false);
  }, [lastSearchBoundsCaptureSeqRef, writeMapMovedScalarPrimitive]);

  // THE BASELINE MIRROR (§D remaining slice): searchBaselineBounds+submittedPolygon are
  // a PROJECTION of tuple.committedBounds — written here at every committedBounds
  // change, never captured independently (the old resetMapMoveFlag capture was a second
  // instant that could drift from the searched area: clear-time and results-teardown
  // re-baselines pointed STA's "map moved" at a viewport no search ran on). Keyed to
  // the committedBounds.bounds object identity (turns over only at a search commit —
  // same key the origin-camera runtime uses). A null committedBounds (dismiss) clears
  // the baseline: with no searched area there is nothing to have "moved since", and
  // shouldMarkMapMovedForBounds treats a null baseline as don't-mark. When the commit
  // carries no polygon (sync submits), the async corner-projection refine upgrades the
  // service copy — service-only, seq-guarded, same viewport.
  const lastMirroredCommittedBoundsRef = React.useRef<object | null>(null);
  React.useEffect(() => {
    const syncBaselineFromDesire = () => {
      const committed = searchRuntimeBus.getState().desiredTuple.committedBounds;
      const key = committed?.bounds ?? null;
      if (key === lastMirroredCommittedBoundsRef.current) {
        return;
      }
      lastMirroredCommittedBoundsRef.current = key;
      const captureSeq = ++lastSearchBoundsCaptureSeqRef.current;
      if (committed == null) {
        viewportBoundsService.captureSearchBaseline(null);
        return;
      }
      const polygon =
        committed.viewportPolygon != null && committed.viewportPolygon.length >= 3
          ? committed.viewportPolygon.map(([lng, lat]) => [lng, lat] as LngLat)
          : null;
      viewportBoundsService.captureSearchBaseline(committed.bounds, polygon);
      if (polygon == null) {
        refineSubmittedPolygon(captureSeq);
      }
    };
    syncBaselineFromDesire();
    return searchRuntimeBus.subscribe(syncBaselineFromDesire);
  }, [
    lastSearchBoundsCaptureSeqRef,
    refineSubmittedPolygon,
    searchRuntimeBus,
    viewportBoundsService,
  ]);

  const markMapMovedIfNeeded = React.useCallback(
    (bounds: MapBounds, options?: { fallbackBaselineBounds?: MapBounds | null }) => {
      if (
        !shouldMarkMapMovedForBounds({
          fallbackBaselineBounds: options?.fallbackBaselineBounds ?? null,
          nextBounds: bounds,
          searchBaselineBounds: viewportBoundsService.getSearchBaselineBounds(),
          hasMapMovedSinceSearch: mapMovedSinceSearchRef.current,
        })
      ) {
        return false;
      }
      mapMovedSinceSearchRef.current = true;
      return true;
    },
    [viewportBoundsService]
  );

  const scheduleMapIdleEnter = React.useCallback(
    (options?: { releaseGestureGate?: boolean }) => {
      const pressureState = mapMotionPressureController.getState();
      const shouldDeferMapFromPressure = shouldDeferMapMovementWork({
        pressureState,
      });
      const isMapGestureActive =
        options?.releaseGestureGate === true ? false : mapGestureActiveRef.current;
      const mapMovedRevealAdmission = resolveMapMovedEnterAdmission({
        hasMapMovedSinceSearch: mapMovedSinceSearchRef.current,
        isMapGestureActive,
        isSearchInteracting: searchInteractionRef.current.isInteracting,
        isAnySheetDragging: anySheetDraggingRef.current,
        shouldDeferMapFromPressure,
      });
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_moved_reveal_admission_contract',
          mapMovedRevealAdmission,
          hasMapMovedSinceSearch: mapMovedSinceSearchRef.current,
          isMapGestureActive,
          mapGestureSessionActive: mapGestureActiveRef.current,
          releaseGestureGate: options?.releaseGestureGate === true,
          isSearchInteracting: searchInteractionRef.current.isInteracting,
          isAnySheetDragging: anySheetDraggingRef.current,
          shouldDeferMapFromPressure,
          pressurePhase: pressureState.phase,
          pressureIsSearchInteracting: pressureState.isSearchInteracting,
          pressureIsAnySheetDragging: pressureState.isAnySheetDragging,
          pressureNativeSyncInFlight: pressureState.nativeSyncInFlight,
          activePresentationTransactionPhase:
            pressureState.activePresentationTransaction?.phase ?? null,
        });
      }
      pendingMapMovedEnterRef.current = mapMovedRevealAdmission === 'defer_until_idle';
      if (mapMovedRevealAdmission === 'publish_now') {
        writeMapMovedScalarPrimitive(true);
        setMapMovedSinceSearch(true);
      }
    },
    [
      anySheetDraggingRef,
      mapMotionPressureController,
      searchInteractionRef,
      writeMapMovedScalarPrimitive,
    ]
  );

  const flushPendingMapMovedEnter = React.useCallback(() => {
    if (!pendingMapMovedEnterRef.current) {
      return;
    }
    scheduleMapIdleEnter();
  }, [scheduleMapIdleEnter]);

  const flushDeferredMapMovementState = React.useCallback(() => {
    flushPendingMapMovedEnter();
  }, [flushPendingMapMovedEnter]);

  return {
    mapMovedSinceSearch,
    mapGestureActiveRef,
    resetMapMoveFlag,
    markMapMovedIfNeeded,
    scheduleMapIdleEnter,
    flushDeferredMapMovementState,
  };
};
