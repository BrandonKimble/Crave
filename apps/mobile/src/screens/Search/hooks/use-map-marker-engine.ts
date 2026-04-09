import React from 'react';
import type { Feature, FeatureCollection, Point } from 'geojson';
import MapboxGL from '@rnmapbox/maps';

import { searchService, type StructuredSearchRequest } from '../../../services/search';
import { logger } from '../../../utils';
import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../types';
import type { RestaurantFeatureProperties } from '../components/search-map';
import { ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE } from '../constants/search';
import { createMapQueryBudget, type MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  buildAnchoredShortcutCoverage,
  buildMarkerCatalogReadModel,
  buildRankedShortcutCoverageFeatures,
} from '../runtime/map/map-read-model-builder';
import { useMapDiffApplier } from '../runtime/map/map-diff-applier';
import {
  type MapMotionPressureController,
  resolveMapPlannerAdmission,
} from '../runtime/map/map-motion-pressure';
import {
  createMapViewportQueryService,
  type MarkerCatalogEntry,
} from '../runtime/map/map-viewport-query';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import type { ResolvedRestaurantMapLocation } from '../runtime/map/restaurant-location-selection';

const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_DISHES: FoodResult[] = [];

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

const buildStableKeyFingerprint = (keys: readonly string[]): string => {
  if (!keys.length) {
    return '0:empty:empty:0';
  }

  let hash = FNV1A_OFFSET_BASIS;
  for (const key of keys) {
    hash = hashStringFNV1a(key, hash);
  }

  const firstKey = keys[0] ?? 'empty';
  const lastKey = keys[keys.length - 1] ?? 'empty';
  return `${keys.length}:${firstKey}:${lastKey}:${hash.toString(36)}`;
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

const buildPinSemanticRevision = ({
  baseDiffKey,
  markerKey,
  nativeLodZ,
}: {
  baseDiffKey: string;
  markerKey: string;
  nativeLodZ: number | null | undefined;
}): string =>
  `${baseDiffKey}|pin|marker:${markerKey}|lodZ:${
    typeof nativeLodZ === 'number' && Number.isFinite(nativeLodZ) ? nativeLodZ : ''
  }`;

const buildDotSemanticRevision = ({
  baseDiffKey,
  markerKey,
}: {
  baseDiffKey: string;
  markerKey: string;
}): string => `${baseDiffKey}|dot|marker:${markerKey}`;

const buildInteractionSemanticRevision = ({
  markerKey,
  restaurantId,
  lng,
  lat,
  family,
}: {
  markerKey: string;
  restaurantId: string | null | undefined;
  lng: number;
  lat: number;
  family: 'pinInteraction' | 'dotInteraction';
}): string =>
  `${family}|marker:${markerKey}|restaurant:${restaurantId ?? ''}|lng:${lng}|lat:${lat}`;

type UseMapMarkerEngineArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  scoreMode: 'global_quality' | 'coverage_display';
  restaurantOnlyId: string | null;
  highlightedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getQualityColorFromScore: (score: number | null | undefined) => string;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  mapMotionPressureController: MapMotionPressureController;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinPromoteStableMsMoving: number;
  lodPinDemoteStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
  isMapMoving: boolean;
  externalMapQueryBudget?: MapQueryBudget;
};

type ShortcutCoverageSnapshot = {
  searchRequestId: string;
  bounds: MapBounds | null;
  entities: StructuredSearchRequest['entities'];
};

type ShortcutCoverageOwnerResult = {
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

type UseMapPresentationControllerArgs = {
  markerCatalogEntries: MarkerCatalogEntry[];
  searchMode: 'shortcut' | 'natural' | 'entity' | null;
  selectedRestaurantId: string | null;
  mapMotionPressureController: MapMotionPressureController;
  viewportBoundsService: ViewportBoundsService;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, durationMs: number) => void;
  externalMapQueryBudget?: MapQueryBudget;
};

type VisibleCandidatePlannerInputSnapshot<TMarkerCatalogEntry> = {
  bounds: MapBounds | null;
  selectedRestaurantId: string | null;
  shouldPublishVisibleCandidates: boolean;
  markerCatalogEntries: readonly TMarkerCatalogEntry[];
};

type MapPresentationController = {
  mapQueryBudget: MapQueryBudget;
  visibleMarkerCandidates: MarkerCatalogEntry[];
  markerCandidatesRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
};

const areBoundsMateriallyEqual = (left: MapBounds | null, right: MapBounds | null): boolean =>
  left?.northEast.lat === right?.northEast.lat &&
  left?.northEast.lng === right?.northEast.lng &&
  left?.southWest.lat === right?.southWest.lat &&
  left?.southWest.lng === right?.southWest.lng;

const hasMaterialVisibleCandidatePlannerInputChange = <TMarkerCatalogEntry>({
  previousInvocation,
  nextInvocation,
}: {
  previousInvocation: VisibleCandidatePlannerInputSnapshot<TMarkerCatalogEntry> | null;
  nextInvocation: VisibleCandidatePlannerInputSnapshot<TMarkerCatalogEntry>;
}): boolean =>
  previousInvocation == null ||
  !areBoundsMateriallyEqual(previousInvocation.bounds, nextInvocation.bounds) ||
  previousInvocation.selectedRestaurantId !== nextInvocation.selectedRestaurantId ||
  previousInvocation.shouldPublishVisibleCandidates !==
    nextInvocation.shouldPublishVisibleCandidates ||
  previousInvocation.markerCatalogEntries !== nextInvocation.markerCatalogEntries;

const useMapPresentationController = (
  args: UseMapPresentationControllerArgs
): MapPresentationController => {
  const {
    markerCatalogEntries,
    searchMode,
    selectedRestaurantId,
    mapMotionPressureController,
    viewportBoundsService,
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
  const lastVisibleCandidateQueryRef =
    React.useRef<VisibleCandidatePlannerInputSnapshot<MarkerCatalogEntry> | null>(null);
  const shouldTrackViewportCandidates = searchMode !== 'shortcut' || selectedRestaurantId !== null;
  const shouldPublishVisibleCandidates = shouldTrackViewportCandidates;

  const recomputeVisibleCandidates = React.useCallback(
    (bounds: MapBounds | null) => {
      const start = shouldLogSearchComputes ? getPerfNow() : 0;
      const lastQuery = lastVisibleCandidateQueryRef.current;
      const nextQuery: VisibleCandidatePlannerInputSnapshot<MarkerCatalogEntry> = {
        bounds,
        selectedRestaurantId,
        shouldPublishVisibleCandidates,
        markerCatalogEntries,
      };
      const nowMs = Date.now();
      const plannerAdmission = resolveMapPlannerAdmission({
        hasMaterialChange: hasMaterialVisibleCandidatePlannerInputChange({
          previousInvocation: lastQuery,
          nextInvocation: nextQuery,
        }),
        pressureState: mapMotionPressureController.getState(),
        nowMs,
        workClass: 'visible_candidates',
      });
      mapMotionPressureController.applyNormalWorkEffect(plannerAdmission.normalWorkEffect, nowMs);
      if (plannerAdmission.decision !== 'run_now') {
        return;
      }
      lastVisibleCandidateQueryRef.current = nextQuery;
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
      mapMotionPressureController,
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

type UseMapMarkerEngineResult = {
  visibleSortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotInteractionSourceStore: SearchMapSourceStore;
  markersRenderKey: string;
  pinsRenderKey: string;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  mapQueryBudget: MapQueryBudget;
  handleShortcutSearchCoverageSnapshot: ShortcutCoverageOwnerResult['handleShortcutSearchCoverageSnapshot'];
  resetShortcutCoverageState: () => void;
  isShortcutCoverageLoading: boolean;
  anchoredShortcutCoverageFeatures: ShortcutCoverageOwnerResult['anchoredShortcutCoverageFeatures'];
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
  restaurants: RestaurantResult[];
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

const useShortcutCoverageOwner = ({
  searchMode,
  activeTab,
  scoreMode,
  searchRequestId,
  viewportBoundsService,
  restaurantsById,
  resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation,
  getQualityColorFromScore,
}: {
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
}): ShortcutCoverageOwnerResult => {
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
  const shortcutCoverageResolvedTabRef = React.useRef<'dishes' | 'restaurants' | null>(null);
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
    shortcutCoverageResolvedTabRef.current = null;
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
        shortcutCoveragePendingSnapshotByRequestIdRef.current.set(snapshot.searchRequestId, {
          entities: snapshot.entities,
        });
        return;
      }
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
      shortcutCoverageFetchKeyRef.current = null;
      shortcutCoverageResolvedTabRef.current = null;
      shortcutCoverageRankedRef.current = [];
      setShortcutCoverageDotFeatures(null);
      setIsShortcutCoverageLoading(false);
      return;
    }
    {
      const hasResolvedCoverage = shortcutCoverageFetchKeyRef.current != null;
      const hasCoverageForActiveTab =
        hasResolvedCoverage && shortcutCoverageResolvedTabRef.current === activeTab;
      if (hasCoverageForActiveTab) {
        return;
      }
    }
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
        shortcutCoverageResolvedTabRef.current = activeTab;
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

export const useMapMarkerEngine = (args: UseMapMarkerEngineArgs): UseMapMarkerEngineResult => {
  const {
    searchRuntimeBus,
    scoreMode,
    restaurantOnlyId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinPromoteStableMsMoving,
    lodPinDemoteStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
    isMapMoving,
  } = args;

  const { mapMarkerRestaurants, mapMarkerDishes, mapSearchRequestId } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      mapMarkerRestaurants: state.results?.restaurants ?? EMPTY_RESTAURANTS,
      mapMarkerDishes: state.results?.dishes ?? EMPTY_DISHES,
      mapSearchRequestId: state.results?.metadata?.searchRequestId ?? null,
    }),
    (left, right) =>
      left.mapMarkerRestaurants === right.mapMarkerRestaurants &&
      left.mapMarkerDishes === right.mapMarkerDishes &&
      left.mapSearchRequestId === right.mapSearchRequestId,
    ['results'] as const
  );

  const runtimeMapPresentationInput = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      mode: state.searchMode,
      mapPresentationActiveTab: state.activeTab,
    }),
    (left, right) =>
      left.mode === right.mode && left.mapPresentationActiveTab === right.mapPresentationActiveTab,
    ['searchMode', 'activeTab'] as const
  );
  const mapPresentationMode = runtimeMapPresentationInput.mode;
  const mapPresentationActiveTab = runtimeMapPresentationInput.mapPresentationActiveTab;

  const precomputedMarkerData = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      catalog: state.precomputedMarkerCatalog,
      primaryCount: state.precomputedMarkerPrimaryCount,
      canonicalRankById: state.precomputedCanonicalRestaurantRankById,
      restaurantsById: state.precomputedRestaurantsById,
      resultsKey: state.precomputedMarkerResultsKey,
      activeTab: state.precomputedMarkerActiveTab,
    }),
    (left, right) =>
      left.catalog === right.catalog &&
      left.canonicalRankById === right.canonicalRankById &&
      left.restaurantsById === right.restaurantsById &&
      left.resultsKey === right.resultsKey &&
      left.activeTab === right.activeTab,
    [
      'precomputedMarkerCatalog',
      'precomputedMarkerPrimaryCount',
      'precomputedCanonicalRestaurantRankById',
      'precomputedRestaurantsById',
      'precomputedMarkerResultsKey',
      'precomputedMarkerActiveTab',
    ] as const
  );

  const missingRestaurantRankByIdRef = React.useRef<Set<string>>(new Set());
  const canonicalRestaurantRankById = React.useMemo(() => {
    if (
      precomputedMarkerData.canonicalRankById &&
      precomputedMarkerData.resultsKey === mapSearchRequestId
    ) {
      return precomputedMarkerData.canonicalRankById;
    }
    const map = new Map<string, number>();
    mapMarkerRestaurants.forEach((restaurant) => {
      if (
        typeof restaurant.rank === 'number' &&
        Number.isFinite(restaurant.rank) &&
        restaurant.rank >= 1
      ) {
        map.set(restaurant.restaurantId, restaurant.rank);
        return;
      }
      if (!missingRestaurantRankByIdRef.current.has(restaurant.restaurantId)) {
        missingRestaurantRankByIdRef.current.add(restaurant.restaurantId);
        logger.error('Restaurant missing canonical rank in search results', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
          searchRequestId: mapSearchRequestId,
        });
      }
    });
    return map;
  }, [mapMarkerRestaurants, mapSearchRequestId, precomputedMarkerData]);

  const restaurantsById = React.useMemo(() => {
    if (
      precomputedMarkerData.restaurantsById &&
      precomputedMarkerData.resultsKey === mapSearchRequestId
    ) {
      return precomputedMarkerData.restaurantsById;
    }
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const map = new Map<string, RestaurantResult>();
    mapMarkerRestaurants.forEach((restaurant) => {
      const locationList: Array<{ latitude?: number | null; longitude?: number | null }> =
        Array.isArray(restaurant.locations) ? restaurant.locations : [];
      const displayLocation =
        restaurant.displayLocation ??
        locationList.find(
          (loc) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
        );
      if (
        !displayLocation ||
        typeof displayLocation.latitude !== 'number' ||
        typeof displayLocation.longitude !== 'number'
      ) {
        logger.error('Restaurant missing coordinates', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
        });
        return;
      }
      map.set(restaurant.restaurantId, restaurant);
    });
    mapMarkerDishes.forEach((dish) => {
      if (
        !map.has(dish.restaurantId) &&
        (typeof dish.restaurantLatitude !== 'number' ||
          typeof dish.restaurantLongitude !== 'number')
      ) {
        logger.warn('Dish lacks restaurant coordinates', {
          dishId: dish.connectionId,
          restaurantId: dish.restaurantId,
          restaurantName: dish.restaurantName,
        });
      }
    });
    if (shouldLogSearchComputes) {
      logSearchCompute('restaurantsById', getPerfNow() - start);
    }
    return map;
  }, [
    mapMarkerDishes,
    getPerfNow,
    logSearchCompute,
    mapMarkerRestaurants,
    precomputedMarkerData,
    shouldLogSearchComputes,
  ]);

  const buildMarkerKey = React.useCallback(
    (feature: Feature<Point, RestaurantFeatureProperties>) => {
      const markerKey = feature.id?.toString() ?? null;
      if (markerKey && markerKey.length > 0) {
        return markerKey;
      }
      logger.error('Marker feature missing stable id', {
        restaurantId: feature.properties.restaurantId,
        rank: feature.properties.rank,
      });
      throw new Error(
        `Search map marker feature missing stable id for restaurant ${feature.properties.restaurantId}`
      );
    },
    []
  );

  const selectedRestaurantId = highlightedRestaurantId;

  const markerCatalogReadModel = React.useMemo(() => {
    if (
      precomputedMarkerData.catalog &&
      precomputedMarkerData.resultsKey === mapSearchRequestId &&
      precomputedMarkerData.activeTab === mapPresentationActiveTab &&
      restaurantOnlyId === null &&
      selectedRestaurantId === null
    ) {
      return {
        catalog: precomputedMarkerData.catalog,
        primaryCount: precomputedMarkerData.primaryCount,
      };
    }
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const nextModel = buildMarkerCatalogReadModel({
      activeTab: mapPresentationActiveTab,
      dishes: mapMarkerDishes,
      markerRestaurants: mapMarkerRestaurants,
      scoreMode,
      restaurantOnlyId,
      selectedRestaurantId,
      canonicalRestaurantRankById,
      locationSelectionAnchor: resolveRestaurantLocationSelectionAnchor(),
      resolveRestaurantMapLocations,
      pickPreferredRestaurantMapLocation,
      getQualityColorFromScore,
    });
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `markerCatalog total=${nextModel.catalog.length} primary=${nextModel.primaryCount} mode=${
          mapPresentationActiveTab === 'dishes' ? 'dishes' : 'restaurants'
        }`,
        getPerfNow() - start
      );
    }
    return nextModel;
  }, [
    mapPresentationActiveTab,
    canonicalRestaurantRankById,
    getPerfNow,
    getQualityColorFromScore,
    logSearchCompute,
    mapMarkerDishes,
    mapMarkerRestaurants,
    mapSearchRequestId,
    pickPreferredRestaurantMapLocation,
    precomputedMarkerData,
    resolveRestaurantLocationSelectionAnchor,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    scoreMode,
    selectedRestaurantId,
    shouldLogSearchComputes,
  ]);

  const markerCatalogEntries = markerCatalogReadModel.catalog;

  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const secondaryTextSize = LABEL_TEXT_SIZE * 0.85;
    return {
      textField: [
        'case',
        ['==', ['get', 'isDishPin'], true],
        [
          'format',
          ['coalesce', ['get', 'dishName'], ''],
          { 'font-scale': 1.0 },
          '\n',
          {},
          ['coalesce', ['get', 'restaurantName'], ''],
          { 'font-scale': secondaryTextSize / LABEL_TEXT_SIZE },
        ],
        ['coalesce', ['get', 'restaurantName'], ''],
      ],
      textJustify: 'auto',
      textAllowOverlap: false,
      textOptional: false,
      textIgnorePlacement: false,
      textSize: LABEL_TEXT_SIZE,
      textFont: ['Open Sans Semibold', 'Arial Unicode MS Regular'],
      textColor: [
        'case',
        ['==', ['get', 'restaurantId'], highlightedRestaurantId ?? ''],
        ACTIVE_TAB_COLOR_DARK,
        '#374151',
      ],
      textHaloColor: 'rgba(255, 255, 255, 0.9)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
      symbolZOrder: 'viewport-y',
    };
  }, [highlightedRestaurantId]);

  const { mapQueryBudget, markerCandidatesRef, visibleMarkerCandidates } =
    useMapPresentationController({
      markerCatalogEntries,
      searchMode: mapPresentationMode,
      selectedRestaurantId,
      mapMotionPressureController,
      viewportBoundsService,
      buildMarkerKey,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      externalMapQueryBudget: args.externalMapQueryBudget,
    });

  const {
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    shortcutCoverageDotFeatures,
    anchoredShortcutCoverageFeatures,
    rankedShortcutCoverageFeatures,
    shortcutCoverageRankedRef,
  } = useShortcutCoverageOwner({
    searchMode: mapPresentationMode,
    activeTab: mapPresentationActiveTab,
    scoreMode,
    searchRequestId: mapSearchRequestId,
    viewportBoundsService,
    restaurantsById,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
  });

  const { lodPinnedMarkerMeta, lodPinnedMarkersRef, recomputeLodPinnedMarkers } = useMapDiffApplier(
    {
      searchMode: mapPresentationMode,
      activeTab: mapPresentationActiveTab,
      selectedRestaurantId,
      scoreMode,
      markerCandidatesRef,
      shortcutCoverageRankedRef,
      mapGestureActiveRef,
      mapMotionPressureController,
      isMapMoving,
      buildMarkerKey,
      mapQueryBudget,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      maxPins: maxFullPins,
      visibleCandidateBuffer: lodVisibleCandidateBuffer,
      promoteStableMsMoving: lodPinPromoteStableMsMoving,
      demoteStableMsMoving: lodPinDemoteStableMsMoving,
      stableMsIdle: lodPinToggleStableMsIdle,
      offscreenStableMsMoving: lodPinOffscreenToggleStableMsMoving,
    }
  );

  React.useEffect(() => {
    recomputeLodPinnedMarkers(viewportBoundsService.getBounds());
  }, [
    mapPresentationActiveTab,
    mapPresentationMode,
    markerCatalogEntries,
    rankedShortcutCoverageFeatures,
    selectedRestaurantId,
    scoreMode,
    recomputeLodPinnedMarkers,
    viewportBoundsService,
  ]);

  React.useEffect(() => {
    return viewportBoundsService.subscribe((bounds) => {
      recomputeLodPinnedMarkers(bounds);
    });
  }, [recomputeLodPinnedMarkers, viewportBoundsService]);

  const lodPinnedMarkerFeatureByKey = React.useMemo(() => {
    const map = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    visibleMarkerCandidates.forEach((entry) => {
      map.set(buildMarkerKey(entry.feature), entry.feature);
    });
    if (mapPresentationMode === 'shortcut') {
      const shortcutFeatures = shortcutCoverageDotFeatures?.features ?? [];
      shortcutFeatures.forEach((feature) => {
        map.set(buildMarkerKey(feature), feature);
      });
    }
    return map;
  }, [
    buildMarkerKey,
    mapPresentationMode,
    shortcutCoverageDotFeatures?.features,
    visibleMarkerCandidates,
  ]);

  const lodSortedRestaurantMarkers = React.useMemo(() => {
    if (!lodPinnedMarkerMeta.length) {
      if (mapPresentationMode === 'shortcut' && rankedShortcutCoverageFeatures.length > 0) {
        return rankedShortcutCoverageFeatures.slice(0, maxFullPins).map((feature, index) => ({
          ...feature,
          properties: {
            ...feature.properties,
            lodZ: Math.max(0, maxFullPins - 1 - index),
          },
        }));
      }
      return [];
    }
    const fallbackByKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    lodPinnedMarkersRef.current.forEach((feature) => {
      fallbackByKey.set(buildMarkerKey(feature), feature);
    });

    return lodPinnedMarkerMeta
      .map(({ markerKey, lodZ }) => {
        const feature =
          fallbackByKey.get(markerKey) ?? lodPinnedMarkerFeatureByKey.get(markerKey) ?? null;
        if (!feature) {
          return null;
        }
        return {
          ...feature,
          properties: {
            ...feature.properties,
            nativeLodZ: lodZ,
            lodZ,
          },
        };
      })
      .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;
  }, [
    buildMarkerKey,
    lodPinnedMarkerFeatureByKey,
    lodPinnedMarkerMeta,
    lodPinnedMarkersRef,
    mapPresentationMode,
    maxFullPins,
    rankedShortcutCoverageFeatures,
  ]);

  const visibleDotRestaurantMarkerFeatures = React.useMemo<Array<
    Feature<Point, RestaurantFeatureProperties>
  > | null>(() => {
    if (mapPresentationMode === 'shortcut') {
      const shortcutFeatures =
        (anchoredShortcutCoverageFeatures ?? shortcutCoverageDotFeatures)?.features ?? [];
      if (shortcutFeatures.length > 0) {
        return shortcutFeatures;
      }
      return null;
    }
    const pinnedMarkerKeys = new Set(
      lodSortedRestaurantMarkers.map((feature) => buildMarkerKey(feature))
    );
    const visibleDotFeatures = visibleMarkerCandidates
      .map((entry) => entry.feature)
      .filter((feature) => !pinnedMarkerKeys.has(buildMarkerKey(feature)));
    return visibleDotFeatures.length ? visibleDotFeatures : null;
  }, [
    buildMarkerKey,
    lodSortedRestaurantMarkers,
    mapPresentationMode,
    anchoredShortcutCoverageFeatures,
    shortcutCoverageDotFeatures,
    visibleMarkerCandidates,
  ]);

  const visibleSortedRestaurantMarkers = lodSortedRestaurantMarkers;
  const previousPinSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const nextPinSourceStore = React.useMemo(() => {
    const builder = createSearchMapSourceStoreBuilder(previousPinSourceStoreRef.current);
    visibleSortedRestaurantMarkers.forEach((feature, index) => {
      const markerKey =
        typeof feature.id === 'string' && feature.id.length > 0
          ? feature.id
          : buildMarkerKey(feature);
      const labelOrder = index + 1;
      const nativeLodZ =
        typeof feature.properties.nativeLodZ === 'number'
          ? feature.properties.nativeLodZ
          : feature.properties.lodZ;
      const semanticRevision = buildPinSemanticRevision({
        baseDiffKey: getSearchMapSourceTransportFeature(feature).diffKey,
        markerKey,
        nativeLodZ,
      });
      const nextFeature = {
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          markerKey,
          labelOrder,
          nativeLodZ,
          nativeLodOpacity: 1,
          nativeLodRankOpacity: 1,
          nativePresentationOpacity: 1,
        },
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      builder.appendFeature(
        {
          ...nextFeature,
        },
        {
          semanticRevision,
          transportFeature: createSearchMapSourceTransportFeature({
            feature: nextFeature,
            diffKey: semanticRevision,
          }),
        }
      );
    });
    return builder.finish();
  }, [buildMarkerKey, visibleSortedRestaurantMarkers]);
  React.useEffect(() => {
    previousPinSourceStoreRef.current = nextPinSourceStore;
  }, [nextPinSourceStore]);
  const nextPinsRenderKey = React.useMemo(() => {
    return buildStableKeyFingerprint(nextPinSourceStore.idsInOrder);
  }, [nextPinSourceStore]);

  const previousDotSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const nextDotSourceStore = React.useMemo(() => {
    if (!visibleDotRestaurantMarkerFeatures) {
      return null;
    }
    const builder = createSearchMapSourceStoreBuilder(previousDotSourceStoreRef.current);
    visibleDotRestaurantMarkerFeatures.forEach((feature) => {
      const markerKey =
        typeof feature.id === 'string' && feature.id.length > 0
          ? feature.id
          : buildMarkerKey(feature);
      const semanticRevision = buildDotSemanticRevision({
        baseDiffKey: getSearchMapSourceTransportFeature(feature).diffKey,
        markerKey,
      });
      const nextFeature = {
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          markerKey,
          nativeDotOpacity: 1,
          nativePresentationOpacity: 1,
        },
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      builder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    return builder.finish();
  }, [buildMarkerKey, visibleDotRestaurantMarkerFeatures]);
  React.useEffect(() => {
    previousDotSourceStoreRef.current = nextDotSourceStore;
  }, [nextDotSourceStore]);
  const nextVisibleDotRenderKey = React.useMemo(() => {
    if (!nextDotSourceStore || nextDotSourceStore.idsInOrder.length === 0) {
      return '0:empty:empty:0';
    }
    return buildStableKeyFingerprint(nextDotSourceStore.idsInOrder);
  }, [nextDotSourceStore]);

  const previousPinInteractionSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const nextPinInteractionSourceStore = React.useMemo(() => {
    const builder = createSearchMapSourceStoreBuilder(previousPinInteractionSourceStoreRef.current);
    nextPinSourceStore.idsInOrder.forEach((markerKey) => {
      const feature = nextPinSourceStore.featureById.get(markerKey);
      if (!feature) {
        return;
      }
      const [lng, lat] = feature.geometry.coordinates;
      const nextFeature = {
        type: 'Feature',
        id: markerKey,
        geometry: feature.geometry,
        properties: {
          markerKey,
          restaurantId: feature.properties.restaurantId,
        } as RestaurantFeatureProperties,
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      const semanticRevision = buildInteractionSemanticRevision({
        family: 'pinInteraction',
        markerKey,
        restaurantId: feature.properties.restaurantId,
        lng,
        lat,
      });
      builder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    return builder.finish();
  }, [nextPinSourceStore]);
  React.useEffect(() => {
    previousPinInteractionSourceStoreRef.current = nextPinInteractionSourceStore;
  }, [nextPinInteractionSourceStore]);

  const previousDotInteractionSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const nextDotInteractionSourceStore = React.useMemo(() => {
    if (!nextDotSourceStore || nextDotSourceStore.idsInOrder.length === 0) {
      return EMPTY_SEARCH_MAP_SOURCE_STORE;
    }
    const builder = createSearchMapSourceStoreBuilder(previousDotInteractionSourceStoreRef.current);
    nextDotSourceStore.idsInOrder.forEach((markerKey) => {
      const feature = nextDotSourceStore.featureById.get(markerKey);
      if (!feature) {
        return;
      }
      const [lng, lat] = feature.geometry.coordinates;
      const nextFeature = {
        type: 'Feature',
        id: markerKey,
        geometry: feature.geometry,
        properties: {
          markerKey,
          restaurantId: feature.properties.restaurantId,
        } as RestaurantFeatureProperties,
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      const semanticRevision = buildInteractionSemanticRevision({
        family: 'dotInteraction',
        markerKey,
        restaurantId: feature.properties.restaurantId,
        lng,
        lat,
      });
      builder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    return builder.finish();
  }, [nextDotSourceStore]);
  React.useEffect(() => {
    previousDotInteractionSourceStoreRef.current = nextDotInteractionSourceStore;
  }, [nextDotInteractionSourceStore]);
  const pinSourceStore = nextPinSourceStore;
  const dotSourceStore = nextDotSourceStore;
  const pinInteractionSourceStore = nextPinInteractionSourceStore;
  const dotInteractionSourceStore = nextDotInteractionSourceStore;
  const pinsRenderKey = nextPinsRenderKey;
  const markersRenderKey = React.useMemo(
    () => `pins:${nextPinsRenderKey}:dots:${nextVisibleDotRenderKey}`,
    [nextPinsRenderKey, nextVisibleDotRenderKey]
  );

  return {
    visibleSortedRestaurantMarkers,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    markersRenderKey,
    pinsRenderKey,
    restaurantLabelStyle,
    buildMarkerKey,
    mapQueryBudget,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    anchoredShortcutCoverageFeatures,
    canonicalRestaurantRankById,
    restaurantsById,
    restaurants: mapMarkerRestaurants,
  };
};
