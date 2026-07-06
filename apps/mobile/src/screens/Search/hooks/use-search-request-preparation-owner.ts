import React from 'react';
import { Dimensions } from 'react-native';

import {
  getActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import type { Coordinate, MapBounds, NaturalSearchRequest } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';
import { logger } from '../../../utils';
import { DEFAULT_PAGE_SIZE } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { boundsFromPairs, hasBoundsMovedSignificantly, isLngLatTuple } from '../utils/geo';
import { normalizePriceFilter } from '../utils/price';
import type { SearchSubmitActiveOperationTuple } from './use-search-submit-response-owner';

export type StructuredSearchFilters = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  includeSimilar?: boolean;
  rising?: boolean;
};

export type SearchRequestPreparationTuple = SearchSubmitActiveOperationTuple;

export type PrepareStructuredInitialRequestPayloadOptions = {
  tuple: SearchRequestPreparationTuple;
  logLabel: string;
  loadingMoreLogLabel?: string;
  filters?: StructuredSearchFilters;
  forceFreshBounds?: boolean;
};

export type PrepareStructuredAppendRequestPayloadOptions = {
  tuple: SearchRequestPreparationTuple;
  targetPage: number;
};

export type PrepareNaturalSearchAttemptPayloadOptions = {
  tuple: SearchRequestPreparationTuple;
  append: boolean;
  targetPage: number;
  trimmedQuery: string;
  submissionSource?: NaturalSearchRequest['submissionSource'];
  submissionContext?: NaturalSearchRequest['submissionContext'];
  openNow?: boolean;
  priceLevels?: number[] | null;
  includeSimilar?: boolean;
  rising?: boolean;
  forceFreshBounds?: boolean;
};

export type PrepareNaturalSearchAttemptPayloadResult = {
  payload: NaturalSearchRequest;
  requestBounds: MapBounds | null;
};

type UseSearchRequestPreparationOwnerArgs = {
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  risingActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  viewportBoundsService: ViewportBoundsService;
  mapRef: React.RefObject<MapboxMapRef | null>;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  isOperationTupleStillActive: (tuple: SearchRequestPreparationTuple) => boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  logSearchPhase?: (label: string) => void;
  shouldLogSearchResponseTimings?: boolean;
  logSearchResponseTiming?: (label: string, durationMs: number) => void;
};

export type SearchRequestPreparationOwner = {
  prepareStructuredInitialRequestPayload: (
    options: PrepareStructuredInitialRequestPayloadOptions
  ) => Promise<StructuredSearchRequest | null>;
  prepareStructuredAppendRequestPayload: (
    options: PrepareStructuredAppendRequestPayloadOptions
  ) => Promise<StructuredSearchRequest | null>;
  prepareNaturalSearchAttemptPayload: (
    options: PrepareNaturalSearchAttemptPayloadOptions
  ) => Promise<PrepareNaturalSearchAttemptPayloadResult | null>;
};

// Upper bound on how long submit will wait for the screen-accurate viewport-polygon projection
// before falling back to the AABB baseline. getCoordinateFromView resolves in ~1 frame on a warm
// map; this only bites when the native view isn't ready (cold-launch first submit), where the
// projection can hang indefinitely and would otherwise block the search request from firing.
const SUBMITTED_POLYGON_CAPTURE_TIMEOUT_MS = 500;

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

type RequestBoundsSource =
  | 'map_visible_bounds'
  | 'viewport_bounds_service'
  | 'latest_bounds_ref'
  | 'none';

type RequestBoundsFallbackReason =
  | 'get_visible_bounds_failed'
  | 'get_visible_bounds_invalid'
  | 'get_visible_bounds_unavailable'
  | 'map_ref_unavailable'
  | null;

type ResolvedRequestBounds = {
  bounds: MapBounds | null;
  source: RequestBoundsSource;
  freshBoundsRequested: boolean;
  freshBoundsCaptured: boolean;
  fallbackReason: RequestBoundsFallbackReason;
  previousSearchBaselineBounds: MapBounds | null;
  previousLastRequestBounds: MapBounds | null;
  previousViewportServiceBounds: MapBounds | null;
};

const hasBoundsChanged = (previous: MapBounds | null, next: MapBounds | null): boolean | null => {
  if (!previous || !next) {
    return null;
  }
  return hasBoundsMovedSignificantly(previous, next);
};

export const useSearchRequestPreparationOwner = ({
  isLoadingMore,
  openNow,
  priceLevels,
  risingActive,
  searchRuntimeBus,
  latestBoundsRef,
  viewportBoundsService,
  mapRef,
  userLocationRef,
  lastSearchRequestIdRef,
  isOperationTupleStillActive,
  setError,
  logSearchPhase = () => {},
  shouldLogSearchResponseTimings = false,
  logSearchResponseTiming = () => {},
}: UseSearchRequestPreparationOwnerArgs): SearchRequestPreparationOwner => {
  const lastResolvedStructuredRequestBoundsRef = React.useRef<ResolvedRequestBounds | null>(null);

  const captureVisibleMapBounds = React.useCallback(
    async (
      logLabel: 'natural' | 'structured'
    ): Promise<{ bounds: MapBounds | null; fallbackReason: RequestBoundsFallbackReason }> => {
      const map = mapRef.current;
      if (!map) {
        return { bounds: null, fallbackReason: 'map_ref_unavailable' };
      }
      if (!map.getVisibleBounds) {
        return { bounds: null, fallbackReason: 'get_visible_bounds_unavailable' };
      }

      const boundsStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      try {
        const visibleBounds = await map.getVisibleBounds();
        if (
          Array.isArray(visibleBounds) &&
          visibleBounds.length >= 2 &&
          isLngLatTuple(visibleBounds[0]) &&
          isLngLatTuple(visibleBounds[1])
        ) {
          return {
            bounds: boundsFromPairs(visibleBounds[0], visibleBounds[1]),
            fallbackReason: null,
          };
        }
        return { bounds: null, fallbackReason: 'get_visible_bounds_invalid' };
      } catch (boundsError) {
        logger.warn(`Unable to determine map bounds before submitting ${logLabel} search`, {
          message: boundsError instanceof Error ? boundsError.message : 'unknown error',
        });
        return { bounds: null, fallbackReason: 'get_visible_bounds_failed' };
      } finally {
        if (shouldLogSearchResponseTimings && boundsStart > 0) {
          logSearchResponseTiming(`getVisibleBounds:${logLabel}`, getPerfNow() - boundsStart);
        }
      }
    },
    [logSearchResponseTiming, mapRef, shouldLogSearchResponseTimings]
  );

  // Project the 4 screen corners to lng/lat and capture the SCREEN-ACCURATE viewport polygon
  // (pitch/twist-aware) BEFORE the search request is built — so the payload always carries the
  // CURRENT polygon and the search never falls back to the AABB box. getCoordinateFromView is async
  // (it otherwise lagged a tick behind the sync AABB = the first-frame race); awaiting it here at
  // submit closes that race so the polygon is the source of truth, not a fallback.
  const captureSubmittedPolygon = React.useCallback(async (): Promise<void> => {
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
    try {
      // getCoordinateFromView can HANG (never resolve AND never reject) when the native map view
      // isn't ready yet — e.g. the first submit right after a cold launch. The per-corner .catch
      // only handles a REJECTION, not a hung promise, so awaiting Promise.all unguarded here would
      // block resolveRequestBounds forever and the search request would never fire (eternal
      // spinner). Race the projection against a short timeout; on timeout we keep whatever AABB
      // baseline is in place (the guarded fallback) so the polygon is strictly a best-effort
      // enhancement that can NEVER block submit.
      const projection = Promise.all(
        cornerPoints.map((point) => map.getCoordinateFromView!(point).catch(() => null))
      );
      const positions = await Promise.race([
        projection,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SUBMITTED_POLYGON_CAPTURE_TIMEOUT_MS);
        }),
      ]);
      if (!positions) {
        return;
      }
      const polygon = positions.filter((p): p is [number, number] => isLngLatTuple(p));
      if (polygon.length < 3) {
        return;
      }
      const lngs = polygon.map(([lng]) => lng);
      const lats = polygon.map(([, lat]) => lat);
      const polygonBounds = boundsFromPairs(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      );
      viewportBoundsService.captureSearchBaseline(polygonBounds, polygon);
    } catch {
      // Leave whatever AABB baseline is in place — the guarded fallback.
    }
  }, [mapRef, viewportBoundsService]);

  const resolveRequestBounds = React.useCallback(
    async (options: {
      shouldCaptureBounds: boolean;
      forceFreshBounds?: boolean;
      logLabel: 'natural' | 'structured';
    }): Promise<ResolvedRequestBounds> => {
      const previousViewportServiceBounds = viewportBoundsService.getBounds();
      const previousLastRequestBounds = latestBoundsRef.current;
      const previousSearchBaselineBounds = viewportBoundsService.getSearchBaselineBounds();
      const freshBoundsRequested = Boolean(options.forceFreshBounds && options.shouldCaptureBounds);

      if (!options.shouldCaptureBounds) {
        const latestBounds = latestBoundsRef.current;
        return {
          bounds: latestBounds,
          source: latestBounds ? 'latest_bounds_ref' : 'none',
          freshBoundsRequested: false,
          freshBoundsCaptured: false,
          fallbackReason: null,
          previousSearchBaselineBounds,
          previousLastRequestBounds,
          previousViewportServiceBounds,
        };
      }

      if (freshBoundsRequested) {
        const freshCapture = await captureVisibleMapBounds(options.logLabel);
        if (freshCapture.bounds) {
          latestBoundsRef.current = freshCapture.bounds;
          viewportBoundsService.setBounds(freshCapture.bounds);
          // Capture the screen-accurate polygon in the SAME awaited step as the fresh bounds, so the
          // payload's getSubmittedPolygon() is the current viewport (no first-frame AABB fallback).
          await captureSubmittedPolygon();
          return {
            bounds: freshCapture.bounds,
            source: 'map_visible_bounds',
            freshBoundsRequested: true,
            freshBoundsCaptured: true,
            fallbackReason: null,
            previousSearchBaselineBounds,
            previousLastRequestBounds,
            previousViewportServiceBounds,
          };
        }
        const fallbackViewportBounds = viewportBoundsService.getBounds();
        if (fallbackViewportBounds) {
          latestBoundsRef.current = fallbackViewportBounds;
          return {
            bounds: fallbackViewportBounds,
            source: 'viewport_bounds_service',
            freshBoundsRequested: true,
            freshBoundsCaptured: false,
            fallbackReason: freshCapture.fallbackReason,
            previousSearchBaselineBounds,
            previousLastRequestBounds,
            previousViewportServiceBounds,
          };
        }
        const latestBounds = latestBoundsRef.current;
        return {
          bounds: latestBounds,
          source: latestBounds ? 'latest_bounds_ref' : 'none',
          freshBoundsRequested: true,
          freshBoundsCaptured: false,
          fallbackReason: freshCapture.fallbackReason,
          previousSearchBaselineBounds,
          previousLastRequestBounds,
          previousViewportServiceBounds,
        };
      }

      if (previousViewportServiceBounds) {
        latestBoundsRef.current = previousViewportServiceBounds;
        return {
          bounds: previousViewportServiceBounds,
          source: 'viewport_bounds_service',
          freshBoundsRequested: false,
          freshBoundsCaptured: false,
          fallbackReason: null,
          previousSearchBaselineBounds,
          previousLastRequestBounds,
          previousViewportServiceBounds,
        };
      }

      if (!latestBoundsRef.current) {
        const mapCapture = await captureVisibleMapBounds(options.logLabel);
        if (mapCapture.bounds) {
          latestBoundsRef.current = mapCapture.bounds;
          viewportBoundsService.setBounds(mapCapture.bounds);
          return {
            bounds: mapCapture.bounds,
            source: 'map_visible_bounds',
            freshBoundsRequested: false,
            freshBoundsCaptured: true,
            fallbackReason: null,
            previousSearchBaselineBounds,
            previousLastRequestBounds,
            previousViewportServiceBounds,
          };
        }
      }

      const latestBounds = latestBoundsRef.current;
      return {
        bounds: latestBounds,
        source: latestBounds ? 'latest_bounds_ref' : 'none',
        freshBoundsRequested: false,
        freshBoundsCaptured: false,
        fallbackReason: null,
        previousSearchBaselineBounds,
        previousLastRequestBounds,
        previousViewportServiceBounds,
      };
    },
    [captureVisibleMapBounds, captureSubmittedPolygon, latestBoundsRef, viewportBoundsService]
  );

  const logForceFreshBoundsTelemetry = React.useCallback(
    (options: {
      tuple: SearchRequestPreparationTuple;
      logLabel: 'natural' | 'structured';
      page: number;
      append: boolean;
      resolvedRequestBounds: ResolvedRequestBounds;
    }) => {
      const { resolvedRequestBounds } = options;
      if (!resolvedRequestBounds.freshBoundsRequested) {
        return;
      }
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (!isPerfScenarioAttributionActive(scenarioConfig)) {
        return;
      }
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'search_this_area_request_bounds_contract',
        append: options.append,
        fallbackReason: resolvedRequestBounds.fallbackReason,
        forceFreshBounds: true,
        freshMapBoundsCaptured: resolvedRequestBounds.freshBoundsCaptured,
        logLabel: options.logLabel,
        operationId: options.tuple.operationId,
        page: options.page,
        requestBoundsChangedFromLastRequestBounds: hasBoundsChanged(
          resolvedRequestBounds.previousLastRequestBounds,
          resolvedRequestBounds.bounds
        ),
        requestBoundsChangedFromPreviousSearchBaseline: hasBoundsChanged(
          resolvedRequestBounds.previousSearchBaselineBounds,
          resolvedRequestBounds.bounds
        ),
        requestBoundsChangedFromViewportService: hasBoundsChanged(
          resolvedRequestBounds.previousViewportServiceBounds,
          resolvedRequestBounds.bounds
        ),
        requestBoundsSource: resolvedRequestBounds.source,
        requestId: options.tuple.requestId,
        searchThisAreaSubmitId: getActivePerfScenarioSearchThisAreaSubmitId(),
      });
    },
    []
  );

  const buildStructuredSearchPayload = React.useCallback(
    async (
      page: number,
      filters: StructuredSearchFilters = {},
      options?: {
        forceFreshBounds?: boolean;
      }
    ): Promise<StructuredSearchRequest> => {
      const buildStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination: { page, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
      };

      const effectiveOpenNow = filters.openNow ?? openNow;
      const effectivePriceLevels =
        filters.priceLevels !== undefined ? filters.priceLevels : priceLevels;
      const normalizedPriceLevels = normalizePriceFilter(effectivePriceLevels);
      // includeSimilar is session-scoped bus state; the toggle publishes the optimistic
      // value before the debounced rerun fires, so the bus read here is the effective
      // value for this request. Always sent EXPLICITLY: false suppresses the server's
      // silent dense widening (env default), true opts in.
      const effectiveIncludeSimilar =
        filters.includeSimilar ?? searchRuntimeBus.getState().includeSimilarActive;
      const effectiveRising = filters.rising ?? risingActive;

      if (effectiveOpenNow) {
        payload.openNow = true;
      }

      if (normalizedPriceLevels.length > 0) {
        payload.priceLevels = normalizedPriceLevels;
      }

      // TODO(shared-types): once the API's include-similar contract is live on main,
      // send this ALWAYS-EXPLICITLY (false suppresses the server env default's silent
      // dense widening). Today's backend rejects unknown properties, so the field is
      // attached only when it is true or the caller explicitly overrode it.
      if (effectiveIncludeSimilar || filters.includeSimilar !== undefined) {
        payload.includeSimilar = effectiveIncludeSimilar;
      }

      if (effectiveRising) {
        payload.risingActive = true;
      }

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          `[REQPROBE] structured page=${page} openNow=${payload.openNow ?? false} price=${(payload.priceLevels ?? []).length} rising=${payload.risingActive ?? false} includeSimilar=${payload.includeSimilar ?? 'unset'}`
        );
      }
      const requestBounds = await resolveRequestBounds({
        shouldCaptureBounds: page === 1,
        forceFreshBounds: options?.forceFreshBounds,
        logLabel: 'structured',
      });
      lastResolvedStructuredRequestBoundsRef.current = requestBounds;
      if (requestBounds.bounds) {
        payload.bounds = requestBounds.bounds;
      }
      // Screen-accurate viewport polygon (pitch/twist-aware). When present, the backend filters by
      // the EXACT polygon (ST_Covers) instead of the AABB bounds box — so results match the visible
      // viewport, not the larger north-up box. bounds stays as the guarded fallback (first-frame race
      // before the async corner projection resolves).
      const submittedPolygon = viewportBoundsService.getSubmittedPolygon();
      if (submittedPolygon && submittedPolygon.length >= 3) {
        payload.viewportPolygon = submittedPolygon.map(
          ([lng, lat]) => [lng, lat] as [number, number]
        );
      }

      const resolvedLocation = userLocationRef.current;
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      if (shouldLogSearchResponseTimings && buildStart > 0) {
        logSearchResponseTiming('buildStructuredSearchPayload', getPerfNow() - buildStart);
      }

      return payload;
    },
    [
      logSearchResponseTiming,
      openNow,
      priceLevels,
      resolveRequestBounds,
      risingActive,
      searchRuntimeBus,
      shouldLogSearchResponseTimings,
      userLocationRef,
    ]
  );

  const prepareStructuredInitialRequestPayload = React.useCallback(
    async ({
      tuple,
      logLabel,
      loadingMoreLogLabel,
      filters,
      forceFreshBounds,
    }: PrepareStructuredInitialRequestPayloadOptions): Promise<StructuredSearchRequest | null> => {
      if (isLoadingMore) {
        searchRuntimeBus.publish({ isLoadingMore: false });
        if (loadingMoreLogLabel) {
          logSearchPhase(loadingMoreLogLabel);
        }
      }
      logSearchPhase(logLabel);
      const payload = await buildStructuredSearchPayload(1, filters, {
        forceFreshBounds,
      });
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      if (forceFreshBounds && lastResolvedStructuredRequestBoundsRef.current) {
        logForceFreshBoundsTelemetry({
          tuple,
          logLabel: 'structured',
          page: 1,
          append: false,
          resolvedRequestBounds: lastResolvedStructuredRequestBoundsRef.current,
        });
      }
      return payload;
    },
    [
      buildStructuredSearchPayload,
      isLoadingMore,
      isOperationTupleStillActive,
      logForceFreshBoundsTelemetry,
      logSearchPhase,
      searchRuntimeBus,
    ]
  );

  const prepareStructuredAppendRequestPayload = React.useCallback(
    async ({
      tuple,
      targetPage,
    }: PrepareStructuredAppendRequestPayloadOptions): Promise<StructuredSearchRequest | null> => {
      const payload = await buildStructuredSearchPayload(targetPage);
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      return payload;
    },
    [buildStructuredSearchPayload, isOperationTupleStillActive]
  );

  const prepareNaturalSearchAttemptPayload = React.useCallback(
    async ({
      tuple,
      append,
      targetPage,
      trimmedQuery,
      submissionSource,
      submissionContext,
      openNow: nextOpenNow,
      priceLevels: nextPriceLevels,
      includeSimilar,
      rising,
      forceFreshBounds,
    }: PrepareNaturalSearchAttemptPayloadOptions): Promise<PrepareNaturalSearchAttemptPayloadResult | null> => {
      if (append) {
        logSearchPhase('submitSearch:loading-more');
      } else {
        setError(null);
        logSearchPhase('submitSearch:loading-state');
      }

      const payload: NaturalSearchRequest = {
        query: trimmedQuery,
        pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
      };
      if (append && lastSearchRequestIdRef.current) {
        payload.searchRequestId = lastSearchRequestIdRef.current;
      }

      if (!append) {
        payload.submissionSource = submissionSource ?? 'manual';
        if (submissionContext) {
          payload.submissionContext = submissionContext;
        }
      }

      if (nextOpenNow) {
        payload.openNow = true;
      }

      const normalizedPriceLevels = normalizePriceFilter(nextPriceLevels ?? []);
      if (normalizedPriceLevels.length > 0) {
        payload.priceLevels = normalizedPriceLevels;
      }

      // Reads the session bus value when the caller did not pass one (e.g. search-this-area
      // reruns keep the current toggle). TODO(shared-types): once the API contract is live,
      // send ALWAYS-EXPLICITLY (false suppresses env-default silent dense widening); today's
      // backend rejects unknown properties, so attach only when true or explicitly overridden.
      const effectiveIncludeSimilar =
        includeSimilar ?? searchRuntimeBus.getState().includeSimilarActive;
      if (effectiveIncludeSimilar || includeSimilar !== undefined) {
        payload.includeSimilar = effectiveIncludeSimilar;
      }

      if (rising) {
        payload.risingActive = true;
      }
      logSearchPhase('submitSearch:payload-ready');

      const requestBounds = await resolveRequestBounds({
        shouldCaptureBounds: !append,
        forceFreshBounds,
        logLabel: 'natural',
      });
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      logForceFreshBoundsTelemetry({
        tuple,
        logLabel: 'natural',
        page: targetPage,
        append,
        resolvedRequestBounds: requestBounds,
      });
      if (requestBounds.bounds) {
        payload.bounds = requestBounds.bounds;
      }
      // Screen-accurate viewport polygon (pitch/twist-aware). When present, the backend filters by
      // the EXACT polygon (ST_Covers) instead of the AABB bounds box — so results match the visible
      // viewport, not the larger north-up box. bounds stays as the guarded fallback (first-frame race
      // before the async corner projection resolves).
      const submittedPolygon = viewportBoundsService.getSubmittedPolygon();
      if (submittedPolygon && submittedPolygon.length >= 3) {
        payload.viewportPolygon = submittedPolygon.map(
          ([lng, lat]) => [lng, lat] as [number, number]
        );
      }

      const resolvedLocation = userLocationRef.current;
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      return {
        payload,
        requestBounds: append ? null : (requestBounds.bounds ?? null),
      };
    },
    [
      isOperationTupleStillActive,
      lastSearchRequestIdRef,
      logForceFreshBoundsTelemetry,
      logSearchPhase,
      resolveRequestBounds,
      searchRuntimeBus,
      setError,
      userLocationRef,
    ]
  );

  return React.useMemo(
    () => ({
      prepareStructuredInitialRequestPayload,
      prepareStructuredAppendRequestPayload,
      prepareNaturalSearchAttemptPayload,
    }),
    [
      prepareNaturalSearchAttemptPayload,
      prepareStructuredAppendRequestPayload,
      prepareStructuredInitialRequestPayload,
    ]
  );
};
