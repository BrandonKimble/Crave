import React from 'react';

import type { Coordinate, MapBounds, NaturalSearchRequest } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';
import { logger } from '../../../utils';
import { DEFAULT_PAGE_SIZE, MINIMUM_VOTES_FILTER } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { boundsFromPairs, isLngLatTuple } from '../utils/geo';
import { normalizePriceFilter } from '../utils/price';

export type StructuredSearchFilters = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
};

export type SearchRequestPreparationTuple = {
  requestId: number;
};

export type PrepareStructuredInitialRequestPayloadOptions = {
  tuple: SearchRequestPreparationTuple;
  logLabel: string;
  loadingMoreLogLabel?: string;
  filters?: StructuredSearchFilters;
  scoreMode?: NaturalSearchRequest['scoreMode'];
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
  scoreModeOverride?: NaturalSearchRequest['scoreMode'];
  submissionSource?: NaturalSearchRequest['submissionSource'];
  submissionContext?: NaturalSearchRequest['submissionContext'];
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  forceFreshBounds?: boolean;
};

export type PrepareNaturalSearchAttemptPayloadResult = {
  payload: NaturalSearchRequest;
  requestBounds: MapBounds | null;
};

type UseSearchRequestPreparationOwnerArgs = {
  isLoadingMore: boolean;
  scoreMode: NaturalSearchRequest['scoreMode'];
  openNow: boolean;
  priceLevels: number[];
  votes100Plus: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  viewportBoundsService: ViewportBoundsService;
  mapRef: React.RefObject<MapboxMapRef | null>;
  ensureUserLocation: () => Promise<Coordinate | null>;
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

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const useSearchRequestPreparationOwner = ({
  isLoadingMore,
  scoreMode,
  openNow,
  priceLevels,
  votes100Plus,
  searchRuntimeBus,
  latestBoundsRef,
  viewportBoundsService,
  mapRef,
  ensureUserLocation,
  userLocationRef,
  lastSearchRequestIdRef,
  isOperationTupleStillActive,
  setError,
  logSearchPhase = () => {},
  shouldLogSearchResponseTimings = false,
  logSearchResponseTiming = () => {},
}: UseSearchRequestPreparationOwnerArgs): SearchRequestPreparationOwner => {
  const resolveRequestBounds = React.useCallback(
    async (options: {
      shouldCaptureBounds: boolean;
      forceFreshBounds?: boolean;
      logLabel: 'natural' | 'structured';
    }): Promise<MapBounds | null> => {
      if (!options.shouldCaptureBounds) {
        return latestBoundsRef.current;
      }

      const viewportBounds = viewportBoundsService.getBounds();
      if (viewportBounds) {
        latestBoundsRef.current = viewportBounds;
        return viewportBounds;
      }

      const shouldCaptureFromMap =
        (options.forceFreshBounds || !latestBoundsRef.current) && mapRef.current?.getVisibleBounds;
      if (shouldCaptureFromMap) {
        const boundsStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        try {
          const visibleBounds = await mapRef.current!.getVisibleBounds();
          if (
            Array.isArray(visibleBounds) &&
            visibleBounds.length >= 2 &&
            isLngLatTuple(visibleBounds[0]) &&
            isLngLatTuple(visibleBounds[1])
          ) {
            const nextBounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
            latestBoundsRef.current = nextBounds;
            return nextBounds;
          }
        } catch (boundsError) {
          logger.warn(
            `Unable to determine map bounds before submitting ${options.logLabel} search`,
            {
              message: boundsError instanceof Error ? boundsError.message : 'unknown error',
            }
          );
        } finally {
          if (shouldLogSearchResponseTimings && boundsStart > 0) {
            logSearchResponseTiming(
              `getVisibleBounds:${options.logLabel}`,
              getPerfNow() - boundsStart
            );
          }
        }
      }

      return latestBoundsRef.current;
    },
    [
      latestBoundsRef,
      logSearchResponseTiming,
      mapRef,
      shouldLogSearchResponseTimings,
      viewportBoundsService,
    ]
  );

  const buildStructuredSearchPayload = React.useCallback(
    async (
      page: number,
      filters: StructuredSearchFilters = {},
      scoreModeOverride?: NaturalSearchRequest['scoreMode'],
      options?: {
        forceFreshBounds?: boolean;
      }
    ): Promise<StructuredSearchRequest> => {
      const buildStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination: { page, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
        scoreMode: scoreModeOverride ?? scoreMode,
      };

      const effectiveOpenNow = filters.openNow ?? openNow;
      const effectivePriceLevels =
        filters.priceLevels !== undefined ? filters.priceLevels : priceLevels;
      const normalizedPriceLevels = normalizePriceFilter(effectivePriceLevels);
      const effectiveMinimumVotes =
        filters.minimumVotes !== undefined
          ? filters.minimumVotes
          : votes100Plus
          ? MINIMUM_VOTES_FILTER
          : null;

      if (effectiveOpenNow) {
        payload.openNow = true;
      }

      if (normalizedPriceLevels.length > 0) {
        payload.priceLevels = normalizedPriceLevels;
      }

      if (typeof effectiveMinimumVotes === 'number' && effectiveMinimumVotes > 0) {
        payload.minimumVotes = effectiveMinimumVotes;
      }

      const bounds = await resolveRequestBounds({
        shouldCaptureBounds: page === 1,
        forceFreshBounds: options?.forceFreshBounds,
        logLabel: 'structured',
      });
      if (bounds) {
        payload.bounds = bounds;
      }

      const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      if (shouldLogSearchResponseTimings && buildStart > 0) {
        logSearchResponseTiming('buildStructuredSearchPayload', getPerfNow() - buildStart);
      }

      return payload;
    },
    [
      ensureUserLocation,
      logSearchResponseTiming,
      openNow,
      priceLevels,
      resolveRequestBounds,
      scoreMode,
      shouldLogSearchResponseTimings,
      userLocationRef,
      votes100Plus,
    ]
  );

  const prepareStructuredInitialRequestPayload = React.useCallback(
    async ({
      tuple,
      logLabel,
      loadingMoreLogLabel,
      filters,
      scoreMode: scoreModeOverride,
      forceFreshBounds,
    }: PrepareStructuredInitialRequestPayloadOptions): Promise<StructuredSearchRequest | null> => {
      if (isLoadingMore) {
        searchRuntimeBus.publish({ isLoadingMore: false });
        if (loadingMoreLogLabel) {
          logSearchPhase(loadingMoreLogLabel);
        }
      }
      logSearchPhase(logLabel);
      const payload = await buildStructuredSearchPayload(1, filters, scoreModeOverride, {
        forceFreshBounds,
      });
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      return payload;
    },
    [
      buildStructuredSearchPayload,
      isLoadingMore,
      isOperationTupleStillActive,
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
      scoreModeOverride,
      submissionSource,
      submissionContext,
      openNow: nextOpenNow,
      priceLevels: nextPriceLevels,
      minimumVotes,
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
        scoreMode: scoreModeOverride ?? scoreMode,
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

      if (typeof minimumVotes === 'number' && minimumVotes > 0) {
        payload.minimumVotes = minimumVotes;
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
      if (requestBounds) {
        payload.bounds = requestBounds;
      }

      const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
      if (!isOperationTupleStillActive(tuple)) {
        return null;
      }
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      return {
        payload,
        requestBounds: append ? null : requestBounds ?? null,
      };
    },
    [
      ensureUserLocation,
      isOperationTupleStillActive,
      lastSearchRequestIdRef,
      logSearchPhase,
      resolveRequestBounds,
      scoreMode,
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
