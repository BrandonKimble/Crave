import React from 'react';
import type { Feature, Point } from 'geojson';
import MapboxGL from '@rnmapbox/maps';

import { logger } from '../../../utils';
import type { Coordinate, FoodResult, RestaurantResult } from '../../../types';
import type { RestaurantFeatureProperties } from '../components/search-map';
import { ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE } from '../constants/search';
import { useMapPresentationController } from '../runtime/map/map-presentation-controller';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import { buildMarkerCatalogReadModel } from '../runtime/map/map-read-model-builder';
import { useMapDiffApplier } from '../runtime/map/map-diff-applier';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import { useShortcutCoverageOwner } from '../runtime/map/use-shortcut-coverage-owner';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import type { ResolvedRestaurantMapLocation } from './use-restaurant-location-selection';

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
  isMapMoving: boolean;
  externalMapQueryBudget?: MapQueryBudget;
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
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useShortcutCoverageOwner
  >['handleShortcutSearchCoverageSnapshot'];
  resetShortcutCoverageState: () => void;
  isShortcutCoverageLoading: boolean;
  anchoredShortcutCoverageFeatures: ReturnType<
    typeof useShortcutCoverageOwner
  >['anchoredShortcutCoverageFeatures'];
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
  restaurants: RestaurantResult[];
};

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

  const selectedRestaurantId = overlaySelectedRestaurantId ?? highlightedRestaurantId;

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
      viewportBoundsService,
      mapGestureActiveRef,
      isMapMoving,
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
      isMapMoving,
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

  const pinsRenderKey = React.useMemo(() => {
    const markerKeys = lodSortedRestaurantMarkers.map((feature) => buildMarkerKey(feature));
    return buildStableKeyFingerprint(markerKeys);
  }, [buildMarkerKey, lodSortedRestaurantMarkers]);

  const visibleSortedRestaurantMarkers = lodSortedRestaurantMarkers;
  const previousPinSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const pinSourceStore = React.useMemo(() => {
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
    previousPinSourceStoreRef.current = pinSourceStore;
  }, [pinSourceStore]);

  const previousDotSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const dotSourceStore = React.useMemo(() => {
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
    previousDotSourceStoreRef.current = dotSourceStore;
  }, [dotSourceStore]);

  const visibleDotRenderKey = React.useMemo(() => {
    if (!dotSourceStore || dotSourceStore.idsInOrder.length === 0) {
      return '0:empty:empty:0';
    }
    return buildStableKeyFingerprint(dotSourceStore.idsInOrder);
  }, [dotSourceStore]);

  const markersRenderKey = React.useMemo(
    () => `pins:${pinsRenderKey}:dots:${visibleDotRenderKey}`,
    [pinsRenderKey, visibleDotRenderKey]
  );

  const settledPinInteractionSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const pinInteractionSourceStore = React.useMemo(() => {
    if (isMapMoving && settledPinInteractionSourceStoreRef.current) {
      return settledPinInteractionSourceStoreRef.current;
    }
    const builder = createSearchMapSourceStoreBuilder(settledPinInteractionSourceStoreRef.current);
    pinSourceStore.idsInOrder.forEach((markerKey) => {
      const feature = pinSourceStore.featureById.get(markerKey);
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
  }, [isMapMoving, pinSourceStore]);
  React.useEffect(() => {
    if (!isMapMoving) {
      settledPinInteractionSourceStoreRef.current = pinInteractionSourceStore;
    }
  }, [isMapMoving, pinInteractionSourceStore]);

  const settledDotInteractionSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const dotInteractionSourceStore = React.useMemo(() => {
    if (isMapMoving && settledDotInteractionSourceStoreRef.current) {
      return settledDotInteractionSourceStoreRef.current;
    }
    if (!dotSourceStore || dotSourceStore.idsInOrder.length === 0) {
      return EMPTY_SEARCH_MAP_SOURCE_STORE;
    }
    const builder = createSearchMapSourceStoreBuilder(settledDotInteractionSourceStoreRef.current);
    dotSourceStore.idsInOrder.forEach((markerKey) => {
      const feature = dotSourceStore.featureById.get(markerKey);
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
  }, [dotSourceStore, isMapMoving]);
  React.useEffect(() => {
    settledDotInteractionSourceStoreRef.current =
      !isMapMoving && dotSourceStore && dotSourceStore.idsInOrder.length > 0
        ? dotInteractionSourceStore
        : null;
  }, [dotInteractionSourceStore, dotSourceStore, isMapMoving]);

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
