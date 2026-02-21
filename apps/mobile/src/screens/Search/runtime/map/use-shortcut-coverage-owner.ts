import React from 'react';
import type { Feature, FeatureCollection, Point } from 'geojson';

import { searchService, type StructuredSearchRequest } from '../../../../services/search';
import type { MapBounds, Coordinate, RestaurantResult } from '../../../../types';
import { logger } from '../../../../utils';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';
import {
  buildAnchoredShortcutCoverage,
  buildRankedShortcutCoverageFeatures,
  type ResolvedRestaurantMapLocation,
} from './map-read-model-builder';
import { useSearchBus } from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type UseShortcutCoverageOwnerArgs = {
  searchMode: 'shortcut' | 'natural' | 'entity' | null;
  activeTab: 'dishes' | 'restaurants';
  scoreMode: 'coverage_display' | 'global_quality';
  searchRequestId: string | null;
  viewportBoundsService: ViewportBoundsService;
  restaurantsById: Map<string, RestaurantResult>;
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getQualityColorFromScore: (score: number | null | undefined) => string;
};

type ShortcutCoverageSnapshot = {
  searchRequestId: string;
  bounds: MapBounds | null;
  entities: StructuredSearchRequest['entities'];
};

type UseShortcutCoverageOwnerResult = {
  handleShortcutSearchCoverageSnapshot: (snapshot: ShortcutCoverageSnapshot) => void;
  resetShortcutCoverageState: () => void;
  isShortcutCoverageLoading: boolean;
  shortcutCoverageDotFeatures: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  anchoredShortcutCoverageFeatures: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  rankedShortcutCoverageFeatures: Array<Feature<Point, RestaurantFeatureProperties>>;
  shortcutCoverageRankedRef: React.MutableRefObject<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >;
};

const buildCoverageEntitiesFingerprint = (
  entities: StructuredSearchRequest['entities'] | undefined
): string => {
  if (!entities) {
    return 'none';
  }
  try {
    return JSON.stringify(entities);
  } catch {
    return 'unserializable';
  }
};

export const useShortcutCoverageOwner = ({
  searchMode,
  activeTab,
  scoreMode,
  searchRequestId,
  viewportBoundsService,
  restaurantsById,
  resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation,
  getQualityColorFromScore,
}: UseShortcutCoverageOwnerArgs): UseShortcutCoverageOwnerResult => {
  const searchRuntimeBus = useSearchBus();

  // Read isVisualSyncPending imperatively to avoid making the coverage fetch
  // effect depend on visual-sync state. When the effect depended on it
  // reactively, every visual-sync toggle caused effect cleanup → cancelled
  // in-flight fetches or unnecessary re-fetch cycles.
  const isVisualSyncPendingRef = React.useRef(false);
  isVisualSyncPendingRef.current = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.isVisualSyncPending,
    Object.is
  );

  const shortcutCoverageSnapshotByRequestIdRef = React.useRef<
    Map<
      string,
      {
        bounds: MapBounds;
        entities: StructuredSearchRequest['entities'];
      }
    >
  >(new Map());
  const shortcutCoverageFetchKeyRef = React.useRef<string | null>(null);
  const shortcutCoverageEntitiesFingerprintByRequestIdRef = React.useRef<Map<string, string>>(
    new Map()
  );
  const shortcutCoveragePendingSnapshotByRequestIdRef = React.useRef<
    Map<
      string,
      {
        entities: StructuredSearchRequest['entities'];
      }
    >
  >(new Map());
  const shortcutCoverageFetchSeqRef = React.useRef(0);
  const deferredCoverageRequestIdRef = React.useRef<string | null>(null);
  const shortcutCoverageRankedRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >([]);
  const [coverageBoundsRevision, setCoverageBoundsRevision] = React.useState(0);
  const [isShortcutCoverageLoading, setIsShortcutCoverageLoading] = React.useState(false);
  const [shortcutCoverageDotFeatures, setShortcutCoverageDotFeatures] =
    React.useState<FeatureCollection<Point, RestaurantFeatureProperties> | null>(null);

  const resetShortcutCoverageState = React.useCallback(() => {
    shortcutCoverageFetchKeyRef.current = null;
    shortcutCoverageSnapshotByRequestIdRef.current.clear();
    shortcutCoveragePendingSnapshotByRequestIdRef.current.clear();
    shortcutCoverageEntitiesFingerprintByRequestIdRef.current.clear();
    shortcutCoverageRankedRef.current = [];
    shortcutCoverageFetchSeqRef.current += 1;
    setShortcutCoverageDotFeatures(null);
    setIsShortcutCoverageLoading(false);
  }, []);

  React.useEffect(
    () =>
      viewportBoundsService.subscribe((bounds) => {
        if (!bounds) {
          return;
        }
        setCoverageBoundsRevision((previous) => previous + 1);
      }),
    [viewportBoundsService]
  );

  const handleShortcutSearchCoverageSnapshot = React.useCallback(
    (snapshot: ShortcutCoverageSnapshot) => {
      shortcutCoverageEntitiesFingerprintByRequestIdRef.current.set(
        snapshot.searchRequestId,
        buildCoverageEntitiesFingerprint(snapshot.entities)
      );
      if (!snapshot.bounds) {
        logger.info('Shortcut coverage snapshot pending (missing bounds)', {
          searchRequestId: snapshot.searchRequestId,
        });
        shortcutCoveragePendingSnapshotByRequestIdRef.current.set(snapshot.searchRequestId, {
          entities: snapshot.entities,
        });
        return;
      }
      logger.info('Shortcut coverage snapshot stored', {
        searchRequestId: snapshot.searchRequestId,
      });
      shortcutCoveragePendingSnapshotByRequestIdRef.current.delete(snapshot.searchRequestId);
      shortcutCoverageSnapshotByRequestIdRef.current.set(snapshot.searchRequestId, {
        bounds: snapshot.bounds,
        entities: snapshot.entities,
      });
    },
    []
  );

  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      const hasRecoverableSnapshotForRequest =
        searchMode == null &&
        !!searchRequestId &&
        (shortcutCoverageSnapshotByRequestIdRef.current.has(searchRequestId) ||
          shortcutCoveragePendingSnapshotByRequestIdRef.current.has(searchRequestId));
      if (!hasRecoverableSnapshotForRequest) {
        resetShortcutCoverageState();
      }
      return;
    }
    if (!searchRequestId) {
      deferredCoverageRequestIdRef.current = null;
      shortcutCoverageFetchKeyRef.current = null;
      shortcutCoverageRankedRef.current = [];
      setShortcutCoverageDotFeatures(null);
      setIsShortcutCoverageLoading(false);
      return;
    }
    if (isVisualSyncPendingRef.current) {
      const hasResolvedCoverage = shortcutCoverageFetchKeyRef.current != null;
      if (hasResolvedCoverage) {
        return;
      }
      shortcutCoverageRankedRef.current = [];
      setShortcutCoverageDotFeatures(null);
      setIsShortcutCoverageLoading(false);
      if (deferredCoverageRequestIdRef.current !== searchRequestId) {
        deferredCoverageRequestIdRef.current = searchRequestId;
        logger.info('Shortcut coverage fetch deferred (visual sync pending)', {
          searchRequestId,
        });
      }
      return;
    }
    deferredCoverageRequestIdRef.current = null;
    const snapshot = shortcutCoverageSnapshotByRequestIdRef.current.get(searchRequestId) ?? null;
    const pendingSnapshot =
      shortcutCoveragePendingSnapshotByRequestIdRef.current.get(searchRequestId) ?? null;
    let boundsSnapshot = snapshot?.bounds ?? null;
    let entitiesSnapshot = snapshot?.entities ?? pendingSnapshot?.entities ?? undefined;

    if (!boundsSnapshot && pendingSnapshot) {
      const lateBoundsSnapshot = viewportBoundsService.getBounds();
      if (lateBoundsSnapshot) {
        boundsSnapshot = lateBoundsSnapshot;
        entitiesSnapshot = pendingSnapshot.entities;
        shortcutCoverageSnapshotByRequestIdRef.current.set(searchRequestId, {
          bounds: lateBoundsSnapshot,
          entities: pendingSnapshot.entities,
        });
        shortcutCoveragePendingSnapshotByRequestIdRef.current.delete(searchRequestId);
        logger.info('Shortcut coverage snapshot recovered from late bounds', {
          searchRequestId,
        });
      }
    }

    if (!boundsSnapshot) {
      shortcutCoverageRankedRef.current = [];
      setShortcutCoverageDotFeatures(null);
      setIsShortcutCoverageLoading(false);
      return;
    }
    const includeTopDish = activeTab === 'dishes';
    const boundsKey = `${boundsSnapshot.northEast.lat.toFixed(
      4
    )},${boundsSnapshot.northEast.lng.toFixed(4)},${boundsSnapshot.southWest.lat.toFixed(
      4
    )},${boundsSnapshot.southWest.lng.toFixed(4)}`;
    const entitiesKey =
      shortcutCoverageEntitiesFingerprintByRequestIdRef.current.get(searchRequestId) ??
      buildCoverageEntitiesFingerprint(entitiesSnapshot);
    const fetchKey = `${boundsKey}::${
      includeTopDish ? 'dishes' : 'restaurants'
    }::${scoreMode}::${entitiesKey}`;
    if (shortcutCoverageFetchKeyRef.current === fetchKey) {
      return;
    }
    shortcutCoverageFetchKeyRef.current = fetchKey;

    const fetchSeq = ++shortcutCoverageFetchSeqRef.current;
    setIsShortcutCoverageLoading(true);
    logger.info('Shortcut coverage fetch start', {
      searchRequestId,
      fetchSeq,
      includeTopDish,
      scoreMode,
    });

    void searchService
      .shortcutCoverage({
        entities: entitiesSnapshot,
        bounds: boundsSnapshot,
        includeTopDish,
        scoreMode,
      })
      .then((collection) => {
        if (fetchSeq !== shortcutCoverageFetchSeqRef.current) {
          return;
        }
        setIsShortcutCoverageLoading(false);
        const sourceFeatureCount = collection?.features?.length ?? 0;
        const features = (collection?.features ?? [])
          .map((feature) => {
            const properties =
              feature?.properties && typeof feature.properties === 'object'
                ? (feature.properties as Record<string, unknown>)
                : {};
            const restaurantId = (properties.restaurantId as string) ?? '';
            const restaurantName = (properties.restaurantName as string) ?? '';
            if (!restaurantId || !restaurantName) {
              return null;
            }
            const rank = properties.rank;
            if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 1) {
              logger.error('Shortcut coverage feature missing canonical rank', {
                restaurantId,
                restaurantName,
                searchRequestId,
              });
              return null;
            }
            const contextualScore =
              typeof properties.contextualScore === 'number'
                ? (properties.contextualScore as number)
                : 0;
            const restaurantQualityScore =
              typeof properties.restaurantQualityScore === 'number'
                ? (properties.restaurantQualityScore as number)
                : null;
            const displayScore =
              typeof properties.displayScore === 'number'
                ? (properties.displayScore as number)
                : null;
            const displayPercentile =
              typeof properties.displayPercentile === 'number'
                ? (properties.displayPercentile as number)
                : null;
            const topDishDisplayPercentile =
              includeTopDish && typeof properties.topDishDisplayPercentile === 'number'
                ? (properties.topDishDisplayPercentile as number)
                : null;
            const topDishDisplayScore =
              includeTopDish && typeof properties.topDishDisplayScore === 'number'
                ? (properties.topDishDisplayScore as number)
                : null;
            const scoreForColor =
              scoreMode === 'coverage_display'
                ? includeTopDish
                  ? topDishDisplayScore
                  : displayScore
                : includeTopDish
                ? contextualScore
                : typeof restaurantQualityScore === 'number'
                ? restaurantQualityScore
                : null;
            const globalScoreForColor = includeTopDish
              ? contextualScore
              : typeof restaurantQualityScore === 'number'
              ? restaurantQualityScore
              : null;
            const localScoreForColor = includeTopDish ? topDishDisplayScore : displayScore;
            const pinColorGlobal = getQualityColorFromScore(globalScoreForColor);
            const pinColorLocal = getQualityColorFromScore(localScoreForColor);
            const pinColor = getQualityColorFromScore(scoreForColor);
            const isDishPin = includeTopDish ? true : false;
            const dishName =
              includeTopDish && typeof properties.dishName === 'string'
                ? (properties.dishName as string)
                : undefined;
            const connectionId =
              includeTopDish && typeof properties.connectionId === 'string'
                ? (properties.connectionId as string)
                : undefined;
            return {
              ...feature,
              id: feature.id ?? restaurantId,
              properties: {
                restaurantId,
                restaurantName,
                contextualScore,
                rank,
                displayScore,
                displayPercentile,
                restaurantQualityScore:
                  typeof restaurantQualityScore === 'number' ? restaurantQualityScore : null,
                pinColor,
                pinColorGlobal,
                pinColorLocal,
                ...(isDishPin
                  ? {
                      isDishPin: true,
                      dishName,
                      connectionId,
                      topDishDisplayPercentile,
                      topDishDisplayScore,
                    }
                  : null),
              },
            } as Feature<Point, RestaurantFeatureProperties>;
          })
          .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;
        logger.info('Shortcut coverage fetch resolved', {
          searchRequestId,
          fetchSeq,
          sourceFeatureCount,
          usableFeatureCount: features.length,
        });

        setShortcutCoverageDotFeatures({
          type: 'FeatureCollection',
          features,
        });
      })
      .catch((err) => {
        if (fetchSeq !== shortcutCoverageFetchSeqRef.current) {
          return;
        }
        setIsShortcutCoverageLoading(false);
        logger.warn('Shortcut coverage dot fetch failed', {
          message: err instanceof Error ? err.message : 'unknown error',
          requestId: searchRequestId,
        });
        setShortcutCoverageDotFeatures(null);
        shortcutCoverageRankedRef.current = [];
      });

    return () => {
      if (fetchSeq === shortcutCoverageFetchSeqRef.current) {
        setIsShortcutCoverageLoading(false);
      }
    };
  }, [
    activeTab,
    coverageBoundsRevision,
    getQualityColorFromScore,
    resetShortcutCoverageState,
    scoreMode,
    searchMode,
    searchRequestId,
    viewportBoundsService,
  ]);

  // When a coverage fetch was deferred because isVisualSyncPending was true,
  // bump coverageBoundsRevision to re-trigger the effect once visual sync clears.
  React.useEffect(() => {
    if (searchMode !== 'shortcut' || !searchRequestId) {
      return;
    }
    return searchRuntimeBus.subscribe(() => {
      const pending = searchRuntimeBus.getState().isVisualSyncPending;
      if (!pending && deferredCoverageRequestIdRef.current != null) {
        deferredCoverageRequestIdRef.current = null;
        setCoverageBoundsRevision((prev) => prev + 1);
      }
    });
  }, [searchMode, searchRequestId, searchRuntimeBus]);

  const anchoredShortcutCoverageFeatures = React.useMemo(
    () =>
      buildAnchoredShortcutCoverage({
        collection: shortcutCoverageDotFeatures,
        restaurantsById,
        anchor: resolveRestaurantLocationSelectionAnchor(),
        pickPreferredRestaurantMapLocation,
      }),
    [
      pickPreferredRestaurantMapLocation,
      resolveRestaurantLocationSelectionAnchor,
      restaurantsById,
      shortcutCoverageDotFeatures,
    ]
  );
  const rankedShortcutCoverageFeatures = React.useMemo(
    () => buildRankedShortcutCoverageFeatures(anchoredShortcutCoverageFeatures),
    [anchoredShortcutCoverageFeatures]
  );

  React.useEffect(() => {
    shortcutCoverageRankedRef.current =
      searchMode === 'shortcut' ? rankedShortcutCoverageFeatures : [];
  }, [rankedShortcutCoverageFeatures, searchMode]);

  return {
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    shortcutCoverageDotFeatures,
    anchoredShortcutCoverageFeatures,
    rankedShortcutCoverageFeatures,
    shortcutCoverageRankedRef,
  };
};
