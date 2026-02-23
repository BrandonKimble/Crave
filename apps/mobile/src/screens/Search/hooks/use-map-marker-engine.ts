import React from 'react';
import type { Feature, FeatureCollection, Point } from 'geojson';
import MapboxGL from '@rnmapbox/maps';

import { logger } from '../../../utils';
import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../types';
import type { RestaurantFeatureProperties } from '../components/search-map';
import { ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE } from '../constants/search';
import { useMapPresentationController } from '../runtime/map/map-presentation-controller';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import { buildMarkerCatalogReadModel } from '../runtime/map/map-read-model-builder';
import { useMapDiffApplier } from '../runtime/map/map-diff-applier';
import { useShortcutCoverageOwner } from '../runtime/map/use-shortcut-coverage-owner';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import type { ResolvedRestaurantMapLocation } from './use-restaurant-location-selection';

const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_SORTED_RESTAURANT_MARKERS: Array<Feature<Point, RestaurantFeatureProperties>> = [];

// ---------------------------------------------------------------------------
// Stable-key fingerprinting (mirrored from index.tsx)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseMapMarkerEngineArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  scoreMode: 'global_quality' | 'coverage_display';
  restaurantOnlyId: string | null;
  overlaySelectedRestaurantId: string | null;
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
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinToggleStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
  externalMapQueryBudget?: MapQueryBudget;
};

type UseMapMarkerEngineResult = {
  visibleSortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  visibleDotRestaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  visibleRestaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties>;
  markersRenderKey: string;
  pinsRenderKey: string;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  mapQueryBudget: MapQueryBudget;
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useShortcutCoverageOwner
  >['handleShortcutSearchCoverageSnapshot'];
  resetShortcutCoverageState: () => void;
  isShortcutCoverageLoading: boolean;
  anchoredShortcutCoverageFeatures: ReturnType<
    typeof useShortcutCoverageOwner
  >['anchoredShortcutCoverageFeatures'];
  lodPinnedMarkersRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
  recomputeLodPinnedMarkers: (bounds: MapBounds | null) => void;
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
  restaurants: RestaurantResult[];
  shouldHoldMapMarkerReveal: boolean;
  isVisualSyncPending: boolean;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useMapMarkerEngine = (args: UseMapMarkerEngineArgs): UseMapMarkerEngineResult => {
  const {
    searchRuntimeBus,
    scoreMode,
    restaurantOnlyId,
    overlaySelectedRestaurantId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinToggleStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
  } = args;

  // -------------------------------------------------------------------------
  // Bus selectors — results + presentation mode
  // -------------------------------------------------------------------------

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
      activeTab: state.activeTab,
    }),
    (left, right) => left.mode === right.mode && left.activeTab === right.activeTab,
    ['searchMode', 'activeTab'] as const
  );
  const mapPresentationMode = runtimeMapPresentationInput.mode;
  const mapPresentationActiveTab = runtimeMapPresentationInput.activeTab;

  const isVisualSyncPending = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.isVisualSyncPending,
    Object.is,
    ['isVisualSyncPending'] as const
  );

  // Pre-computed marker pipeline (populated by response handler)
  const precomputedMarkerData = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      catalog: state.precomputedMarkerCatalog,
      primaryCount: state.precomputedMarkerPrimaryCount,
      canonicalRankById: state.precomputedCanonicalRestaurantRankById,
      restaurantsById: state.precomputedRestaurantsById,
      resultsKey: state.precomputedMarkerResultsKey,
    }),
    (left, right) =>
      left.catalog === right.catalog &&
      left.canonicalRankById === right.canonicalRankById &&
      left.restaurantsById === right.restaurantsById &&
      left.resultsKey === right.resultsKey,
    [
      'precomputedMarkerCatalog',
      'precomputedMarkerPrimaryCount',
      'precomputedCanonicalRestaurantRankById',
      'precomputedRestaurantsById',
      'precomputedMarkerResultsKey',
    ] as const
  );

  // -------------------------------------------------------------------------
  // Inline read model (canonicalRestaurantRankById + restaurantsById)
  // -------------------------------------------------------------------------

  const missingRestaurantRankByIdRef = React.useRef<Set<string>>(new Set());

  const canonicalRestaurantRankById = React.useMemo(() => {
    // Use pre-computed rank map when available and matching current results
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
    // Use pre-computed restaurant lookup when available and matching current results
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

  // -------------------------------------------------------------------------
  // 1. buildMarkerKey
  // -------------------------------------------------------------------------

  const buildMarkerKey = React.useCallback(
    (feature: Feature<Point, RestaurantFeatureProperties>) =>
      feature.id?.toString() ?? `${feature.properties.restaurantId}-${feature.properties.rank}`,
    []
  );

  // -------------------------------------------------------------------------
  // 2. markerCatalogReadModel
  // -------------------------------------------------------------------------

  const markerCatalogReadModel = React.useMemo(() => {
    // Use pre-computed catalog when it matches current results AND no entity/selection filters
    if (
      precomputedMarkerData.catalog &&
      precomputedMarkerData.resultsKey === mapSearchRequestId &&
      restaurantOnlyId === null &&
      overlaySelectedRestaurantId === null
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
      selectedRestaurantId: overlaySelectedRestaurantId,
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
    overlaySelectedRestaurantId,
    pickPreferredRestaurantMapLocation,
    precomputedMarkerData,
    resolveRestaurantLocationSelectionAnchor,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    scoreMode,
    shouldLogSearchComputes,
  ]);

  const markerCatalogEntries = markerCatalogReadModel.catalog;
  const selectedRestaurantId = overlaySelectedRestaurantId;

  // -------------------------------------------------------------------------
  // 3. restaurantLabelStyle
  // -------------------------------------------------------------------------

  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const secondaryTextSize = LABEL_TEXT_SIZE * 0.85;
    return {
      // For dish pins: show dish name + restaurant name on two lines
      // For restaurant pins: show just restaurant name
      textField: [
        'case',
        ['==', ['get', 'isDishPin'], true],
        // Dish pin: two-line label using format for different sizes
        [
          'format',
          ['coalesce', ['get', 'dishName'], ''],
          { 'font-scale': 1.0 },
          '\n',
          {},
          ['coalesce', ['get', 'restaurantName'], ''],
          { 'font-scale': secondaryTextSize / LABEL_TEXT_SIZE },
        ],
        // Restaurant pin: single line
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
    // Depend on the exported geometry constants so Fast Refresh picks up tuning changes without
    // requiring a full app reload.
  }, [ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE, highlightedRestaurantId]);

  // -------------------------------------------------------------------------
  // 4. useMapPresentationController
  // -------------------------------------------------------------------------

  const {
    mapQueryBudget,
    markerCandidatesRef,
    visibleMarkerCandidates,
    recomputeVisibleCandidates,
  } = useMapPresentationController({
    markerCatalogEntries,
    searchMode: mapPresentationMode,
    selectedRestaurantId,
    viewportBoundsService,
    buildMarkerKey,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    externalMapQueryBudget: args.externalMapQueryBudget,
  });

  // -------------------------------------------------------------------------
  // 5. useShortcutCoverageOwner
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // 6. useMapDiffApplier
  // -------------------------------------------------------------------------

  const { lodPinnedMarkerMeta, lodPinnedMarkersRef, recomputeLodPinnedMarkers } = useMapDiffApplier(
    {
      searchMode: mapPresentationMode,
      activeTab: mapPresentationActiveTab,
      selectedRestaurantId,
      scoreMode,
      markerCandidatesRef,
      shortcutCoverageRankedRef,
      mapGestureActiveRef,
      buildMarkerKey,
      mapQueryBudget,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      maxPins: maxFullPins,
      visibleCandidateBuffer: lodVisibleCandidateBuffer,
      stableMsMoving: lodPinToggleStableMsMoving,
      stableMsIdle: lodPinToggleStableMsIdle,
      offscreenStableMsMoving: lodPinOffscreenToggleStableMsMoving,
    }
  );

  // -------------------------------------------------------------------------
  // 7. Recompute effects
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    recomputeLodPinnedMarkers(viewportBoundsService.getBounds());
  }, [
    mapPresentationActiveTab,
    mapSearchRequestId,
    mapPresentationMode,
    selectedRestaurantId,
    scoreMode,
    recomputeLodPinnedMarkers,
    viewportBoundsService,
  ]);

  React.useEffect(() => {
    if (mapPresentationMode !== 'shortcut' || selectedRestaurantId !== null) {
      return;
    }
    recomputeVisibleCandidates(viewportBoundsService.getBounds());
  }, [
    mapSearchRequestId,
    mapPresentationMode,
    selectedRestaurantId,
    recomputeVisibleCandidates,
    viewportBoundsService,
  ]);

  // -------------------------------------------------------------------------
  // 8. LOD memos
  // -------------------------------------------------------------------------

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
            lodZ,
          },
        };
      })
      .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;
  }, [
    buildMarkerKey,
    lodPinnedMarkerFeatureByKey,
    lodPinnedMarkerMeta,
    mapPresentationMode,
    maxFullPins,
    rankedShortcutCoverageFeatures,
  ]);

  // Recompute LOD pinned markers when shortcut coverage ranked features change.
  React.useEffect(() => {
    if (mapPresentationMode !== 'shortcut') {
      return;
    }
    recomputeLodPinnedMarkers(viewportBoundsService.getBounds());
  }, [
    rankedShortcutCoverageFeatures,
    recomputeLodPinnedMarkers,
    mapPresentationMode,
    viewportBoundsService,
  ]);

  const dotRestaurantFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    if (mapPresentationMode === 'shortcut') {
      const coverageFeatureCollection =
        anchoredShortcutCoverageFeatures ?? shortcutCoverageDotFeatures;
      const shortcutFeatures = coverageFeatureCollection?.features ?? [];
      if (shortcutFeatures.length > 0) {
        return coverageFeatureCollection;
      }
      return null;
    }
    const features = visibleMarkerCandidates.map((entry) => entry.feature);
    return features.length ? { type: 'FeatureCollection', features } : null;
  }, [
    anchoredShortcutCoverageFeatures,
    mapPresentationMode,
    shortcutCoverageDotFeatures,
    visibleMarkerCandidates,
  ]);

  const pinsRenderKey = React.useMemo(() => {
    const markerKeys = lodSortedRestaurantMarkers.map((feature) => buildMarkerKey(feature));
    return buildStableKeyFingerprint(markerKeys);
  }, [buildMarkerKey, lodSortedRestaurantMarkers]);

  // -------------------------------------------------------------------------
  // Marker hold — freeze visible markers during loading / visual sync
  // -------------------------------------------------------------------------

  const shouldHoldMapMarkerReveal = false;

  const heldSortedRestaurantMarkersRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >(EMPTY_SORTED_RESTAURANT_MARKERS);
  const heldDotRestaurantFeaturesRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);
  const heldPinsRenderKeyRef = React.useRef('0:empty:empty:0');

  React.useEffect(() => {
    if (shouldHoldMapMarkerReveal) {
      return;
    }
    heldSortedRestaurantMarkersRef.current = lodSortedRestaurantMarkers;
    heldDotRestaurantFeaturesRef.current = dotRestaurantFeatures;
    heldPinsRenderKeyRef.current = pinsRenderKey;
  }, [dotRestaurantFeatures, lodSortedRestaurantMarkers, pinsRenderKey, shouldHoldMapMarkerReveal]);

  const visibleSortedRestaurantMarkers = shouldHoldMapMarkerReveal
    ? heldSortedRestaurantMarkersRef.current
    : lodSortedRestaurantMarkers;
  const visibleDotRestaurantFeatures = shouldHoldMapMarkerReveal
    ? heldDotRestaurantFeaturesRef.current
    : dotRestaurantFeatures;

  const visibleRestaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(
    () => ({
      type: 'FeatureCollection',
      features: visibleSortedRestaurantMarkers,
    }),
    [visibleSortedRestaurantMarkers]
  );

  const visiblePinsRenderKey = shouldHoldMapMarkerReveal
    ? `hold::${heldPinsRenderKeyRef.current}`
    : pinsRenderKey;

  const visibleDotRenderKey = React.useMemo(() => {
    const dotFeatures = visibleDotRestaurantFeatures?.features ?? [];
    if (dotFeatures.length === 0) {
      return '0:empty:empty:0';
    }
    const dotKeys = dotFeatures.map((feature) => buildMarkerKey(feature));
    return buildStableKeyFingerprint(dotKeys);
  }, [buildMarkerKey, visibleDotRestaurantFeatures?.features]);

  const markersRenderKey = React.useMemo(
    () => `dots:${visibleDotRenderKey}`,
    [visibleDotRenderKey]
  );

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    visibleSortedRestaurantMarkers,
    visibleDotRestaurantFeatures,
    visibleRestaurantFeatures,
    markersRenderKey,
    pinsRenderKey: visiblePinsRenderKey,
    restaurantLabelStyle,
    buildMarkerKey,
    mapQueryBudget,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    anchoredShortcutCoverageFeatures,
    lodPinnedMarkersRef,
    recomputeLodPinnedMarkers,
    canonicalRestaurantRankById,
    restaurantsById,
    restaurants: mapMarkerRestaurants,
    shouldHoldMapMarkerReveal,
    isVisualSyncPending,
  };
};
