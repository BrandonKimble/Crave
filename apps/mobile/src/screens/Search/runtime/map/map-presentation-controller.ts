import React from 'react';
import type { Feature, Point } from 'geojson';

import type { MapBounds } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';
import { createMapQueryBudget, type MapQueryBudget } from './map-query-budget';
import { buildViewportMotionToken, decideMotionDerivation } from './map-motion-budget';
import { createMapViewportQueryService, type MarkerCatalogEntry } from './map-viewport-query';

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

const hashStringFNV1a = (value: string, seed: number = FNV1A_OFFSET_BASIS): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME) >>> 0;
  }
  return hash >>> 0;
};

const resolveCandidateIdentity = (
  entry: MarkerCatalogEntry,
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string
): string => {
  const featureId = entry.feature.id?.toString();
  if (featureId && featureId.length > 0) {
    return featureId;
  }
  return buildMarkerKey(entry.feature);
};

const buildCandidateFingerprint = (
  entries: readonly MarkerCatalogEntry[],
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string
): string => {
  if (entries.length === 0) {
    return '0:empty:empty:0';
  }

  let hash = FNV1A_OFFSET_BASIS;
  let firstKey = '';
  let lastKey = '';

  entries.forEach((entry, index) => {
    const identity = resolveCandidateIdentity(entry, buildMarkerKey);
    hash = hashStringFNV1a(identity, hash);
    if (index === 0) {
      firstKey = identity;
    }
    lastKey = identity;
  });

  return `${entries.length}:${firstKey}:${lastKey}:${hash.toString(36)}`;
};

type UseMapPresentationControllerArgs = {
  markerCatalogEntries: MarkerCatalogEntry[];
  searchMode: 'shortcut' | 'natural' | 'entity' | null;
  selectedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, durationMs: number) => void;
  externalMapQueryBudget?: MapQueryBudget;
};

export type MapPresentationController = {
  mapQueryBudget: MapQueryBudget;
  visibleMarkerCandidates: MarkerCatalogEntry[];
  markerCandidatesRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
};

type VisibleCandidateQuerySnapshot = {
  bounds: MapBounds | null;
  selectedRestaurantId: string | null;
  shouldPublishVisibleCandidates: boolean;
  markerCatalogEntries: MarkerCatalogEntry[];
};

export const useMapPresentationController = (
  args: UseMapPresentationControllerArgs
): MapPresentationController => {
  const {
    markerCatalogEntries,
    searchMode,
    selectedRestaurantId,
    viewportBoundsService,
    mapGestureActiveRef,
    buildMarkerKey,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
  } = args;

  const mapViewportQueryServiceRef = React.useRef(createMapViewportQueryService());
  const internalMapQueryBudgetRef = React.useRef<MapQueryBudget | null>(null);
  if (!args.externalMapQueryBudget && !internalMapQueryBudgetRef.current) {
    internalMapQueryBudgetRef.current = createMapQueryBudget();
  }
  const mapViewportQueryService = mapViewportQueryServiceRef.current;
  const mapQueryBudget = args.externalMapQueryBudget ?? internalMapQueryBudgetRef.current!;

  const markerCandidatesRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const [visibleMarkerCandidates, setVisibleMarkerCandidates] = React.useState<
    MarkerCatalogEntry[]
  >([]);
  const visibleMarkerCandidateKeyRef = React.useRef('');
  const lastVisibleCandidateQueryRef = React.useRef<VisibleCandidateQuerySnapshot | null>(null);
  const lastMovingVisibleCandidateDerivationRef = React.useRef<{
    token: ReturnType<typeof buildViewportMotionToken>;
    runAtMs: number;
  }>({
    token: null,
    runAtMs: 0,
  });
  const shouldTrackViewportCandidates = searchMode !== 'shortcut' || selectedRestaurantId !== null;
  const shouldPublishVisibleCandidates = shouldTrackViewportCandidates;

  const recomputeVisibleCandidates = React.useCallback(
    (bounds: MapBounds | null) => {
      const start = shouldLogSearchComputes ? getPerfNow() : 0;
      const lastQuery = lastVisibleCandidateQueryRef.current;
      const isMoving = mapGestureActiveRef.current;
      const nowMs = Date.now();
      const boundsUnchanged =
        lastQuery?.bounds?.northEast.lat === bounds?.northEast.lat &&
        lastQuery?.bounds?.northEast.lng === bounds?.northEast.lng &&
        lastQuery?.bounds?.southWest.lat === bounds?.southWest.lat &&
        lastQuery?.bounds?.southWest.lng === bounds?.southWest.lng;
      const canCoalesceMovingBoundsOnly =
        isMoving &&
        lastQuery != null &&
        lastQuery.selectedRestaurantId === selectedRestaurantId &&
        lastQuery.shouldPublishVisibleCandidates === shouldPublishVisibleCandidates &&
        lastQuery.markerCatalogEntries === markerCatalogEntries;
      if (canCoalesceMovingBoundsOnly) {
        const motionDecision = decideMotionDerivation({
          budgetClass: 'moving',
          previousToken: lastMovingVisibleCandidateDerivationRef.current.token,
          nextToken: buildViewportMotionToken({
            bounds,
            budgetClass: 'moving',
          }),
          lastRunAtMs: lastMovingVisibleCandidateDerivationRef.current.runAtMs,
          nowMs,
          minIntervalMs: 90,
        });
        if (!motionDecision.shouldRun) {
          mapQueryBudget.incrementRuntimeCounter('map_visible_candidates_moving_coalesced');
          return;
        }
        lastMovingVisibleCandidateDerivationRef.current = {
          token: motionDecision.token,
          runAtMs: nowMs,
        };
        mapQueryBudget.incrementRuntimeCounter(
          `map_visible_candidates_moving_runs_${motionDecision.reason}`
        );
      } else if (!isMoving) {
        lastMovingVisibleCandidateDerivationRef.current = {
          token: buildViewportMotionToken({
            bounds,
            budgetClass: 'settled',
          }),
          runAtMs: nowMs,
        };
      }
      if (
        lastQuery &&
        boundsUnchanged &&
        lastQuery.selectedRestaurantId === selectedRestaurantId &&
        lastQuery.shouldPublishVisibleCandidates === shouldPublishVisibleCandidates &&
        lastQuery.markerCatalogEntries === markerCatalogEntries
      ) {
        return;
      }
      lastVisibleCandidateQueryRef.current = {
        bounds,
        selectedRestaurantId,
        shouldPublishVisibleCandidates,
        markerCatalogEntries,
      };
      const candidates = mapViewportQueryService.queryVisibleCandidates(
        {
          bounds,
          selectedRestaurantId,
        },
        mapQueryBudget
      );
      markerCandidatesRef.current = candidates.map((entry) => entry.feature);
      if (shouldPublishVisibleCandidates) {
        const nextCandidateKey = buildCandidateFingerprint(candidates, buildMarkerKey);
        if (nextCandidateKey !== visibleMarkerCandidateKeyRef.current) {
          visibleMarkerCandidateKeyRef.current = nextCandidateKey;
          setVisibleMarkerCandidates(candidates);
        }
      }
      if (shouldLogSearchComputes) {
        logSearchCompute(
          `visibleMarkerCandidates count=${candidates.length} bounds=${bounds ? 'yes' : 'no'}`,
          getPerfNow() - start
        );
      }
    },
    [
      buildMarkerKey,
      getPerfNow,
      logSearchCompute,
      mapGestureActiveRef,
      mapQueryBudget,
      mapViewportQueryService,
      shouldPublishVisibleCandidates,
      selectedRestaurantId,
      shouldLogSearchComputes,
    ]
  );

  React.useEffect(() => {
    if (shouldTrackViewportCandidates) {
      return;
    }
    markerCandidatesRef.current = [];
    visibleMarkerCandidateKeyRef.current = '';
    lastVisibleCandidateQueryRef.current = null;
    if (visibleMarkerCandidates.length !== 0) {
      setVisibleMarkerCandidates([]);
    }
  }, [shouldTrackViewportCandidates, visibleMarkerCandidates.length]);

  React.useEffect(() => {
    mapViewportQueryService.setCatalogEntries(markerCatalogEntries);
    recomputeVisibleCandidates(viewportBoundsService.getBounds());
  }, [
    mapViewportQueryService,
    markerCatalogEntries,
    recomputeVisibleCandidates,
    viewportBoundsService,
  ]);

  React.useEffect(() => {
    if (!shouldTrackViewportCandidates) {
      return;
    }
    return viewportBoundsService.subscribe((bounds) => {
      recomputeVisibleCandidates(bounds);
    });
  }, [recomputeVisibleCandidates, shouldTrackViewportCandidates, viewportBoundsService]);

  return {
    mapQueryBudget,
    visibleMarkerCandidates,
    markerCandidatesRef,
  };
};
