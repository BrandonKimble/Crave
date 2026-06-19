import React from 'react';
import type { Feature, FeatureCollection, Point } from 'geojson';
import MapboxGL from '@rnmapbox/maps';

import { searchService, type StructuredSearchRequest } from '../../../services/search';
import { logger } from '../../../utils';
import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../types';
import {
  buildLabelCandidateFeatureId,
  type LabelCandidate,
  type RestaurantFeatureProperties,
} from '../components/search-map';
import { ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE } from '../constants/search';
import { buildMarkerRenderModel } from '../utils/map-render-model';
import {
  buildSearchMapVisualIdentityKey,
  normalizeSearchMapVisualFeatureIdentity,
  type SearchMapVisualIdentityKey,
} from '../utils/search-map-visual-identity';
import {
  buildAnchoredShortcutCoverage,
  buildMarkerCatalogReadModel,
  buildRankedShortcutCoverageFeatures,
} from '../runtime/map/map-read-model-builder';
import { type MapMotionPressureController } from '../runtime/map/map-motion-pressure';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { isWithinOverlapRegion, resolveOverlapRegion } from '../utils/overlap-region';
import { requestOverlapAutoZoom } from '../runtime/map/overlap-auto-zoom-bridge';
import { rankBadgeImageId, scoreBadgeImageId } from '../../../utils/quality-color';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ResultsPresentationAuthority } from '../runtime/shared/results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import { getSearchSurfaceRuntime } from '../runtime/surface/search-surface-runtime';
import {
  getSearchMountedResultsDataSnapshot,
  subscribeSearchMountedResultsDataSnapshot,
} from '../runtime/shared/search-mounted-results-data-store';
import type { ResolvedRestaurantMapLocation } from '../runtime/map/restaurant-location-selection';
import {
  type SearchMapCandidateCatalogEntry,
  type SearchMapSourceFramePort,
  type SearchMapSourceFrameSnapshot,
} from '../runtime/map/search-map-source-frame-port';
import {
  isPerfScenarioAttributionActive,
  isPerfScenarioQuietMeasuredLoopActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';

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

const arePinInteractionSourcesComplete = ({
  pinSourceStore,
  pinInteractionSourceStore,
}: Pick<SearchMapSourceFrameSnapshot, 'pinSourceStore' | 'pinInteractionSourceStore'>): boolean =>
  pinSourceStore.idsInOrder.length === pinInteractionSourceStore.idsInOrder.length;

const SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES = 0.01;
const SEARCH_MAP_VISUAL_PROJECTOR_VERSION = 'single-writer-stable-label-source-v4';
const VIEWPORT_PROJECTION_MIN_SPAN = 1e-6;
const VIEWPORT_PROJECTION_MIN_CELL_SIZE = 0.0001;
const VIEWPORT_PROJECTION_CELL_DIVISOR = 10;
const VIEWPORT_PROJECTION_SCALE_BUCKET_GRANULARITY = 4;

// Materiality memo for the viewport LOD path: carries only the last projection token
// that was admitted (run_now). The fixed 90ms cadence is gone — admission (materiality
// + motion-pressure + fairness) is the sole gate now. See resolveMapPlannerAdmission.
type ShortcutViewportLodCadence = {
  tokenIdentity: string | null;
};

type SearchMapSourcePublishReason = 'full' | 'viewport_lod';

type PublishSearchMapSourcesOptions = {
  reason?: SearchMapSourcePublishReason;
};

const buildLodPinnedVisualKey = (
  meta: ReadonlyArray<{ markerKey: string; lodZ: number }>
): string => buildStableKeyFingerprint(meta.map(({ markerKey, lodZ }) => `${markerKey}:${lodZ}`));

const normalizeViewportProjectionSpan = (value: number): number =>
  Math.max(Math.abs(value), VIEWPORT_PROJECTION_MIN_SPAN);

const buildShortcutViewportProjectionToken = (bounds: MapBounds | null): string | null => {
  if (!bounds) {
    return null;
  }
  const latSpan = normalizeViewportProjectionSpan(bounds.northEast.lat - bounds.southWest.lat);
  const lngSpan = normalizeViewportProjectionSpan(bounds.northEast.lng - bounds.southWest.lng);
  const centerLat = (bounds.northEast.lat + bounds.southWest.lat) / 2;
  const centerLng = (bounds.northEast.lng + bounds.southWest.lng) / 2;
  const latCellSize = Math.max(
    latSpan / VIEWPORT_PROJECTION_CELL_DIVISOR,
    VIEWPORT_PROJECTION_MIN_CELL_SIZE
  );
  const lngCellSize = Math.max(
    lngSpan / VIEWPORT_PROJECTION_CELL_DIVISOR,
    VIEWPORT_PROJECTION_MIN_CELL_SIZE
  );
  const scaleBucket = Math.round(
    -Math.log2(Math.max(latSpan, lngSpan)) * VIEWPORT_PROJECTION_SCALE_BUCKET_GRANULARITY
  );
  const latCell = Math.round(centerLat / latCellSize);
  const lngCell = Math.round(centerLng / lngCellSize);

  return `${scaleBucket}:${latCell}:${lngCell}`;
};

const isMapMotionPressureMoving = (
  mapMotionPressureController: MapMotionPressureController
): boolean => {
  const phase = mapMotionPressureController.getState().phase;
  return phase === 'gesture' || phase === 'inertia';
};

type ShortcutCoverageRequestStatus =
  | 'idle'
  | 'loading'
  | 'completed'
  | 'empty'
  | 'failed'
  | 'aborted'
  | 'superseded';

type ShortcutCoverageRequestCounters = {
  started: number;
  superseded: number;
  aborted: number;
  completed: number;
};

type ShortcutCoverageRequestResource = {
  requestKey: string;
  searchRequestId: string;
  boundsKey: string;
  activeTab: string | null;
  marketKey: string;
  entitiesKey: string;
  readinessKey: string | null;
  fetchReason: 'initial' | 'resource_changed' | 'retry';
  status: ShortcutCoverageRequestStatus;
  seq: number;
  abortController: AbortController | null;
  returnedFeatureCount: number;
  acceptedFeatureCount: number;
  terminalReason: string | null;
};

type DirectMapPreparedSourceFrame = {
  fingerprint: string;
  snapshot: ReturnType<SearchMapSourceFramePort['getSnapshot']>;
};

const normalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return entries.reduce<Record<string, unknown>>((accumulator, [key, entryValue]) => {
      accumulator[key] = normalizeJsonValue(entryValue);
      return accumulator;
    }, {});
  }
  return value;
};

const buildShortcutCoverageEntitiesKey = (
  entities: StructuredSearchRequest['entities'] | undefined
): string => {
  const normalized = normalizeJsonValue(entities ?? {});
  const serialized = JSON.stringify(normalized);
  return `${serialized.length}:${hashStringFNV1a(serialized).toString(36)}`;
};

const bucketCoordinate = (value: number): string => {
  if (!Number.isFinite(value)) {
    return 'nan';
  }
  const bucketed =
    Math.round(value / SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES) *
    SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES;
  return bucketed.toFixed(2);
};

const buildShortcutCoverageBoundsKey = (bounds: MapBounds): string =>
  [
    bucketCoordinate(bounds.northEast.lat),
    bucketCoordinate(bounds.northEast.lng),
    bucketCoordinate(bounds.southWest.lat),
    bucketCoordinate(bounds.southWest.lng),
  ].join(',');

const buildShortcutCoverageRequestKey = ({
  entitiesKey,
  activeTab,
  marketKey,
  boundsKey,
}: {
  entitiesKey: string;
  activeTab: string | null;
  marketKey: string;
  boundsKey: string;
}): string =>
  `entities:${entitiesKey}|tab:${activeTab ?? 'none'}|market:${marketKey}|bounds:${boundsKey}`;

const buildSourceFrameDataReuseKey = ({
  activeTab,
  bounds,
  labelDerivedSourceIdentityKey,
  markersRenderKey,
  restaurantOnlyId,
  searchMode,
  selectedRestaurantId,
  submittedQuery,
}: {
  activeTab: string | null;
  bounds: MapBounds | null;
  labelDerivedSourceIdentityKey: string;
  markersRenderKey: string;
  restaurantOnlyId: string | null;
  searchMode: string | null;
  selectedRestaurantId: string | null;
  submittedQuery: string | null;
}): string =>
  [
    `mode:${searchMode ?? 'none'}`,
    `tab:${activeTab ?? 'none'}`,
    `query:${submittedQuery ?? 'none'}`,
    `bounds:${bounds == null ? 'none' : buildShortcutCoverageBoundsKey(bounds)}`,
    `restaurantOnly:${restaurantOnlyId ?? 'none'}`,
    `selected:${selectedRestaurantId ?? 'none'}`,
    `markers:${markersRenderKey}`,
    `labels:${labelDerivedSourceIdentityKey}`,
    `visualProjector:${SEARCH_MAP_VISUAL_PROJECTOR_VERSION}`,
  ].join('|');

const hasNonEmptySearchMapSourceFrame = (
  snapshot: Pick<
    SearchMapSourceFrameSnapshot,
    'pinSourceStore' | 'dotSourceStore' | 'labelSourceStore'
  >
): boolean =>
  snapshot.pinSourceStore.idsInOrder.length > 0 ||
  snapshot.dotSourceStore.idsInOrder.length > 0 ||
  snapshot.labelSourceStore.idsInOrder.length > 0;

const isAbortLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const errorRecord = error as { code?: unknown; name?: unknown; message?: unknown };
  return (
    errorRecord.code === 'ERR_CANCELED' ||
    errorRecord.name === 'AbortError' ||
    errorRecord.name === 'CanceledError' ||
    (typeof errorRecord.message === 'string' &&
      errorRecord.message.toLowerCase().includes('canceled'))
  );
};

const intersectStringSets = (left: ReadonlySet<string>, right: ReadonlySet<string>): string[] => {
  const overlap: string[] = [];
  left.forEach((value) => {
    if (right.has(value)) {
      overlap.push(value);
    }
  });
  return overlap.sort();
};

type SearchMapVisualSourceKind =
  | 'main_results'
  | 'shortcut_coverage'
  | 'viewport'
  | 'selected'
  | 'restaurant_only';

type SearchMapVisualCandidate = {
  feature: Feature<Point, RestaurantFeatureProperties>;
  markerKey: string;
  visualIdentityKey: SearchMapVisualIdentityKey;
  sourceKind: SearchMapVisualSourceKind;
  order: number;
};

type ProjectedSearchMapVisualFrame = {
  rankedCandidates: Array<Feature<Point, RestaurantFeatureProperties>>;
  selectedRestaurantCandidates: Array<Feature<Point, RestaurantFeatureProperties>>;
  dotCandidates: Array<Feature<Point, RestaurantFeatureProperties>>;
  candidateVisualIdentityKeys: Set<SearchMapVisualIdentityKey>;
};

type SearchMapVisualCandidateSource = {
  sourceKind: SearchMapVisualSourceKind;
  features: readonly Feature<Point, RestaurantFeatureProperties>[];
};

const VISUAL_SOURCE_PRIORITY: Record<SearchMapVisualSourceKind, number> = {
  restaurant_only: 500,
  selected: 400,
  shortcut_coverage: 300,
  viewport: 200,
  main_results: 100,
};

const resolveEffectiveVisualSourceKind = ({
  feature,
  requestedSourceKind,
  selectedRestaurantId,
  restaurantOnlyId,
}: {
  feature: Feature<Point, RestaurantFeatureProperties>;
  requestedSourceKind: SearchMapVisualSourceKind;
  selectedRestaurantId: string | null;
  restaurantOnlyId: string | null;
}): SearchMapVisualSourceKind => {
  if (restaurantOnlyId != null && feature.properties.restaurantId === restaurantOnlyId) {
    return 'restaurant_only';
  }
  if (selectedRestaurantId != null && feature.properties.restaurantId === selectedRestaurantId) {
    return 'selected';
  }
  return requestedSourceKind;
};

const shouldReplaceVisualCandidate = (
  previous: SearchMapVisualCandidate,
  next: SearchMapVisualCandidate
): boolean => {
  const priorityDiff =
    VISUAL_SOURCE_PRIORITY[next.sourceKind] - VISUAL_SOURCE_PRIORITY[previous.sourceKind];
  if (priorityDiff !== 0) {
    return priorityDiff > 0;
  }
  const rankDiff = next.feature.properties.rank - previous.feature.properties.rank;
  if (rankDiff !== 0) {
    return rankDiff < 0;
  }
  return next.markerKey.localeCompare(previous.markerKey) < 0;
};

const collectSearchMapVisualCandidates = ({
  sources,
  selectedRestaurantId,
  restaurantOnlyId,
  buildMarkerKey,
}: {
  sources: readonly SearchMapVisualCandidateSource[];
  selectedRestaurantId: string | null;
  restaurantOnlyId: string | null;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
}): SearchMapVisualCandidate[] => {
  const candidatesByVisualIdentity = new Map<
    SearchMapVisualIdentityKey,
    SearchMapVisualCandidate
  >();
  let order = 0;

  sources.forEach((source) => {
    source.features.forEach((feature) => {
      const visualIdentityKey = buildSearchMapVisualIdentityKey(feature);
      const visualFeature = normalizeSearchMapVisualFeatureIdentity(feature, visualIdentityKey);
      const markerKey = buildMarkerKey(visualFeature);
      const candidate = {
        feature: visualFeature,
        markerKey,
        visualIdentityKey,
        sourceKind: resolveEffectiveVisualSourceKind({
          feature: visualFeature,
          requestedSourceKind: source.sourceKind,
          selectedRestaurantId,
          restaurantOnlyId,
        }),
        order,
      } satisfies SearchMapVisualCandidate;
      order += 1;

      const previousCandidate = candidatesByVisualIdentity.get(visualIdentityKey);
      if (!previousCandidate || shouldReplaceVisualCandidate(previousCandidate, candidate)) {
        candidatesByVisualIdentity.set(visualIdentityKey, candidate);
      }
    });
  });

  return Array.from(candidatesByVisualIdentity.values()).sort((left, right) => {
    const sourcePriorityDiff =
      VISUAL_SOURCE_PRIORITY[right.sourceKind] - VISUAL_SOURCE_PRIORITY[left.sourceKind];
    if (sourcePriorityDiff !== 0) {
      return sourcePriorityDiff;
    }
    const rankDiff = left.feature.properties.rank - right.feature.properties.rank;
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.order - right.order || left.markerKey.localeCompare(right.markerKey);
  });
};

const projectSearchMapVisualFrame = ({
  rankedSources,
  dotSources,
  selectedRestaurantId,
  restaurantOnlyId,
  buildMarkerKey,
}: {
  rankedSources: readonly SearchMapVisualCandidateSource[];
  dotSources: readonly SearchMapVisualCandidateSource[];
  selectedRestaurantId: string | null;
  restaurantOnlyId: string | null;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
}): ProjectedSearchMapVisualFrame => {
  const rankedCandidates = collectSearchMapVisualCandidates({
    sources: rankedSources,
    selectedRestaurantId,
    restaurantOnlyId,
    buildMarkerKey,
  });
  const dotCandidates = collectSearchMapVisualCandidates({
    sources: dotSources,
    selectedRestaurantId,
    restaurantOnlyId,
    buildMarkerKey,
  });
  // No selection → NO selected candidates. The old fallback (all rankedCandidates)
  // poisoned the in/out-region classifier downstream: selectedMarkerKeys contained
  // every key, the "selected is always in-region" short-circuit classified the whole
  // candidate set in-region, and the out-region (crave-score badge) group was
  // structurally empty (measured: 531/531 short-circuited, 376 geometrically out).
  // collectSelectedEntries already returns [] for a null selectedRestaurantId, so
  // nothing else consumed the fallback.
  const selectedRestaurantCandidates =
    selectedRestaurantId != null
      ? collectSearchMapVisualCandidates({
          sources: [...rankedSources, ...dotSources],
          selectedRestaurantId,
          restaurantOnlyId,
          buildMarkerKey,
        })
          .filter((candidate) => candidate.feature.properties.restaurantId === selectedRestaurantId)
          .map((candidate) => candidate.feature)
      : [];
  const candidateVisualIdentityKeys = new Set<SearchMapVisualIdentityKey>();
  rankedCandidates.forEach((candidate) =>
    candidateVisualIdentityKeys.add(candidate.visualIdentityKey)
  );
  dotCandidates.forEach((candidate) =>
    candidateVisualIdentityKeys.add(candidate.visualIdentityKey)
  );

  return {
    rankedCandidates: rankedCandidates.map((candidate) => candidate.feature),
    selectedRestaurantCandidates,
    dotCandidates: dotCandidates.map((candidate) => candidate.feature),
    candidateVisualIdentityKeys,
  };
};

const collectSourceStoreVisualIdentityKeys = (sourceStore: SearchMapSourceStore): Set<string> => {
  const visualIdentityKeys = new Set<string>();
  sourceStore.idsInOrder.forEach((featureId) => {
    const feature = sourceStore.featureById.get(featureId);
    if (feature) {
      visualIdentityKeys.add(buildSearchMapVisualIdentityKey(feature));
    }
  });
  return visualIdentityKeys;
};

const summarizeMarkerRank = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string
): string => {
  const nativeLodZ = feature.properties.nativeLodZ;
  const lodZ = feature.properties.lodZ;
  const resolvedLodZ =
    typeof nativeLodZ === 'number' && Number.isFinite(nativeLodZ)
      ? nativeLodZ
      : typeof lodZ === 'number' && Number.isFinite(lodZ)
        ? lodZ
        : null;
  return `${buildMarkerKey(feature)}#r${feature.properties.rank}#z${resolvedLodZ ?? 'na'}`;
};

const summarizeSourceStoreRank = (
  sourceStore: SearchMapSourceStore,
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string,
  options?: { excludeRestaurantId?: string | null; limit?: number }
): string[] => {
  const limit = options?.limit ?? 40;
  const signature: string[] = [];
  for (const featureId of sourceStore.idsInOrder) {
    const feature = sourceStore.featureById.get(featureId);
    if (!feature) {
      continue;
    }
    if (
      options?.excludeRestaurantId != null &&
      feature.properties.restaurantId === options.excludeRestaurantId
    ) {
      continue;
    }
    signature.push(summarizeMarkerRank(feature, buildMarkerKey));
    if (signature.length >= limit) {
      break;
    }
  }
  return signature;
};

const countRestaurantVisualIdentityKeysInSourceStore = (
  sourceStore: SearchMapSourceStore,
  restaurantId: string | null
): number => {
  if (restaurantId == null) {
    return 0;
  }
  const visualIdentityKeys = new Set<string>();
  sourceStore.idsInOrder.forEach((featureId) => {
    const feature = sourceStore.featureById.get(featureId);
    if (feature?.properties.restaurantId === restaurantId) {
      visualIdentityKeys.add(buildSearchMapVisualIdentityKey(feature));
    }
  });
  return visualIdentityKeys.size;
};

type ResidentPinnedSourceStoreState = {
  pinnedMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  pinnedVisualKey: string;
};

const collectResidentPinnedSourceStoreState = (
  sourceStore: SearchMapSourceStore
): ResidentPinnedSourceStoreState => {
  const pinnedMarkers: Array<Feature<Point, RestaurantFeatureProperties>> = [];
  const meta: Array<{ markerKey: string; lodZ: number }> = [];
  sourceStore.idsInOrder.forEach((markerKey) => {
    const feature = sourceStore.featureById.get(markerKey);
    if (!feature) {
      return;
    }
    // RESIDENT LOD: the pin source now holds EVERY candidate (demoted ones resident at
    // opacity 0). Only PROMOTED pins (nativeLodOpacity > 0) count as "pinned" for the
    // next-frame stable-membership retention input — otherwise the selection thinks all
    // ~500 are pinned, breaks retention/contention, and the promoted set oscillates
    // (the aggressive-twist flash). Demoted resident pins are skipped here.
    const opacity = feature.properties.nativeLodOpacity;
    if (typeof opacity === 'number' && opacity <= 0.001) {
      return;
    }
    const nativeLodZ = feature?.properties.nativeLodZ;
    const lodZ = feature?.properties.lodZ;
    pinnedMarkers.push(feature);
    meta.push({
      markerKey,
      lodZ:
        typeof nativeLodZ === 'number' && Number.isFinite(nativeLodZ)
          ? nativeLodZ
          : typeof lodZ === 'number' && Number.isFinite(lodZ)
            ? lodZ
            : 0,
    });
  });
  return {
    pinnedMarkers,
    pinnedVisualKey: buildLodPinnedVisualKey(meta),
  };
};

const collectDuplicateSourceStoreVisualIdentityKeys = (
  sourceStore: SearchMapSourceStore
): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  sourceStore.idsInOrder.forEach((featureId) => {
    const feature = sourceStore.featureById.get(featureId);
    if (!feature) {
      return;
    }
    const visualIdentityKey = buildSearchMapVisualIdentityKey(feature);
    if (seen.has(visualIdentityKey)) {
      duplicates.add(visualIdentityKey);
      return;
    }
    seen.add(visualIdentityKey);
  });
  return Array.from(duplicates).sort();
};

const assertProjectedVisualFrameInvariants = ({
  pinSourceStore,
  dotSourceStore,
  labelSourceStore,
  labelCollisionSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
}) => {
  const duplicatePinVisualIdentityKeys =
    collectDuplicateSourceStoreVisualIdentityKeys(pinSourceStore);
  const pinVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(pinSourceStore);
  const dotVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(dotSourceStore);
  const pinDotVisualIdentityOverlap = intersectStringSets(
    pinVisualIdentityKeys,
    dotVisualIdentityKeys
  );
  const expectedLabelCount = pinSourceStore.idsInOrder.length * LABEL_CANDIDATES_IN_ORDER.length;
  const expectedCollisionCount = pinSourceStore.idsInOrder.length;

  if (
    duplicatePinVisualIdentityKeys.length === 0 &&
    labelSourceStore.idsInOrder.length === expectedLabelCount &&
    labelCollisionSourceStore.idsInOrder.length === expectedCollisionCount
  ) {
    return;
  }

  logger.error('[SearchMap] projected visual frame invariant failed', {
    duplicatePinVisualIdentityKeyCount: duplicatePinVisualIdentityKeys.length,
    duplicatePinVisualIdentityKeySamples: duplicatePinVisualIdentityKeys.slice(0, 8),
    residentDotPromotedVisualIdentityOverlapCount: pinDotVisualIdentityOverlap.length,
    residentDotPromotedVisualIdentityOverlapSamples: pinDotVisualIdentityOverlap.slice(0, 8),
    pinCount: pinSourceStore.idsInOrder.length,
    dotCount: dotSourceStore.idsInOrder.length,
    labelCount: labelSourceStore.idsInOrder.length,
    expectedLabelCount,
    labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
    expectedCollisionCount,
  });
};

const countMissingKeys = (
  candidateKeys: ReadonlySet<string>,
  classifiedKeys: ReadonlySet<string>
): number => {
  let missingCount = 0;
  candidateKeys.forEach((key) => {
    if (!classifiedKeys.has(key)) {
      missingCount += 1;
    }
  });
  return missingCount;
};

const resolveMapSurfaceResultsLabelSourcesReadyKey = (
  state: ReturnType<SearchRuntimeBus['getState']>,
  resultsPresentationAuthority: ResultsPresentationAuthority,
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority
): string | null => {
  const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
  return (
    resolvePreparedPresentationVisualCycleKey(
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority
    ) ??
    mountedResultsSnapshot.resultsHydrationKey ??
    resultsPresentationSurfaceAuthority.getSnapshot().resultsHydrationKey ??
    mountedResultsSnapshot.resultsRequestKey ??
    resultsPresentationSurfaceAuthority.getSnapshot().resultsRequestKey ??
    state.resultsRequestKey ??
    null
  );
};

const resolvePreparedPresentationVisualCycleKey = (
  resultsPresentationAuthority: ResultsPresentationAuthority,
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority
): string | null => {
  const surfaceRedrawTransaction = getSearchSurfaceRuntime().getSnapshot().redrawTransaction;
  if (surfaceRedrawTransaction != null) {
    return surfaceRedrawTransaction.id;
  }
  const surfaceSnapshot = resultsPresentationSurfaceAuthority.getSnapshot();
  if (surfaceSnapshot.searchSurfaceResultsTransactionKey != null) {
    return surfaceSnapshot.searchSurfaceResultsTransactionKey;
  }
  const { executionStage, snapshotKind, transactionId } =
    resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
  if (
    transactionId != null &&
    snapshotKind != null &&
    snapshotKind !== 'results_exit' &&
    executionStage !== 'settled'
  ) {
    return transactionId;
  }
  return null;
};

const resolveCommittedMapSourceFrameKey = (
  state: ReturnType<SearchRuntimeBus['getState']>
): string | null =>
  getSearchMountedResultsDataSnapshot().resultsRequestKey ?? state.resultsRequestKey ?? null;

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
  family: 'pinInteraction';
}): string =>
  `${family}|marker:${markerKey}|restaurant:${restaurantId ?? ''}|lng:${lng}|lat:${lat}`;

type DirectMapSourceControllerBaseArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  restaurantOnlyId: string | null;
  highlightedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  // Live user location — anchors the overlap region's radius for far-out shortcut runs.
  userLocation: Coordinate | null;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getCraveScoreColorFromScore: (score: number | null | undefined) => string;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  mapMotionPressureController: MapMotionPressureController;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  isMapMoving: boolean;
};

type ShortcutCoverageSnapshot = {
  searchRequestId: string;
  bounds: MapBounds | null;
  entities: StructuredSearchRequest['entities'];
};

type LastMarkerPressTarget = {
  restaurantId: string;
  coordinate: Coordinate | null;
};

type DirectMapSourceControllerArgs = DirectMapSourceControllerBaseArgs & {
  sourceFramePort: SearchMapSourceFramePort;
  profileCommandPort: {
    openProfileFromMarker: (payload: {
      restaurantId: string;
      restaurantName?: string;
      restaurant?: RestaurantResult;
      pressedCoordinate?: Coordinate | null;
    }) => void;
  };
};

type DirectMapSourceControllerResult = {
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  handleShortcutSearchCoverageSnapshot: (snapshot: ShortcutCoverageSnapshot) => void;
  resetShortcutCoverageState: () => void;
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
};

const LABEL_CANDIDATES_IN_ORDER: readonly LabelCandidate[] = ['bottom', 'right', 'top', 'left'];

const buildLabelSourceFeatureDiffKey = (
  feature: Feature<Point, RestaurantFeatureProperties>
): string => getSearchMapSourceTransportFeature(feature).diffKey;

const buildStableLabelBaseFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  markerKey: string
): Feature<Point, RestaurantFeatureProperties> => {
  const stableProperties = { ...feature.properties };
  delete stableProperties.nativeLodOpacity;
  delete stableProperties.nativeLodRankOpacity;
  delete stableProperties.nativeLabelOpacity;
  delete stableProperties.nativeDotOpacity;
  delete stableProperties.nativePresentationOpacity;
  delete stableProperties.labelOrder;
  return {
    type: 'Feature',
    id: markerKey,
    geometry: feature.geometry,
    properties: {
      ...stableProperties,
      markerKey,
    },
  } satisfies Feature<Point, RestaurantFeatureProperties>;
};

const buildStableCollisionFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  markerKey: string
): Feature<Point, RestaurantFeatureProperties> =>
  ({
    type: 'Feature',
    id: markerKey,
    geometry: feature.geometry,
    properties: {
      markerKey,
      restaurantId: feature.properties.restaurantId,
      nativeLodZ: feature.properties.nativeLodZ,
      lodZ: feature.properties.lodZ,
    } as RestaurantFeatureProperties,
  }) satisfies Feature<Point, RestaurantFeatureProperties>;

const buildDirectLabelStores = ({
  pinSourceStore,
  previousLabelSourceStore,
  previousLabelCollisionSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  previousLabelSourceStore: SearchMapSourceStore;
  previousLabelCollisionSourceStore: SearchMapSourceStore;
}): {
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
  labelDerivedSourceIdentityKey: string;
} => {
  const labelBuilder = createSearchMapSourceStoreBuilder(previousLabelSourceStore);
  const collisionBuilder = createSearchMapSourceStoreBuilder(previousLabelCollisionSourceStore);
  const labelIdentityParts: string[] = [];
  pinSourceStore.idsInOrder.forEach((markerKey) => {
    const feature = pinSourceStore.featureById.get(markerKey);
    if (!feature) {
      return;
    }
    const stableBaseFeature = buildStableLabelBaseFeature(feature, markerKey);
    labelIdentityParts.push(
      `${markerKey}:${getSearchMapSourceTransportFeature(stableBaseFeature).diffKey}`
    );
    LABEL_CANDIDATES_IN_ORDER.forEach((candidate) => {
      const featureId = buildLabelCandidateFeatureId(markerKey, candidate);
      const labelFeature = {
        ...stableBaseFeature,
        id: featureId,
        properties: {
          ...stableBaseFeature.properties,
          markerKey,
          labelCandidate: candidate,
          nativeLabelOpacity: 1,
          nativePresentationOpacity: 1,
        },
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      const semanticRevision = buildLabelSourceFeatureDiffKey(labelFeature);
      labelBuilder.appendFeature(labelFeature, {
        featureId,
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: labelFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    const collisionFeature = buildStableCollisionFeature(feature, markerKey);
    const collisionRevision = buildLabelSourceFeatureDiffKey(collisionFeature);
    collisionBuilder.appendFeature(collisionFeature, {
      featureId: markerKey,
      semanticRevision: collisionRevision,
      transportFeature: createSearchMapSourceTransportFeature({
        feature: collisionFeature,
        diffKey: collisionRevision,
      }),
    });
  });

  const labelSourceStore = labelBuilder.finish();
  const labelCollisionSourceStore = collisionBuilder.finish();
  return {
    labelSourceStore,
    labelCollisionSourceStore,
    labelDerivedSourceIdentityKey: buildStableKeyFingerprint(labelIdentityParts),
  };
};

export const useDirectSearchMapSourceController = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  sourceFramePort,
  restaurantOnlyId,
  highlightedRestaurantId,
  viewportBoundsService,
  userLocation,
  resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation,
  getCraveScoreColorFromScore,
  mapGestureActiveRef: _mapGestureActiveRef,
  mapMotionPressureController,
  shouldLogSearchComputes,
  getPerfNow,
  logSearchCompute,
  maxFullPins,
  isMapMoving,
  profileCommandPort,
}: DirectMapSourceControllerArgs): DirectMapSourceControllerResult => {
  // Live user location read by the per-frame pin builder (overlap-region radius
  // anchor). Held in a ref so location updates don't churn the builder's deps.
  const userLocationRef = React.useRef<Coordinate | null>(userLocation);
  userLocationRef.current = userLocation;
  // Auto-zoom is one-shot per search: track the last search key we focused so a far-out
  // shortcut zooms to the user's vicinity exactly once (not every frame).
  const lastAutoZoomedSearchKeyRef = React.useRef<string | null>(null);
  const latestArgsRef = React.useRef({
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    restaurantOnlyId,
    highlightedRestaurantId,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getCraveScoreColorFromScore,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    isMapMoving,
    profileCommandPort,
  });
  React.useEffect(() => {
    latestArgsRef.current = {
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      restaurantOnlyId,
      highlightedRestaurantId,
      resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation,
      getCraveScoreColorFromScore,
      mapMotionPressureController,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      maxFullPins,
      isMapMoving,
      profileCommandPort,
    };
  }, [
    getPerfNow,
    getCraveScoreColorFromScore,
    highlightedRestaurantId,
    mapMotionPressureController,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    isMapMoving,
    logSearchCompute,
    maxFullPins,
    pickPreferredRestaurantMapLocation,
    profileCommandPort,
    resolveRestaurantLocationSelectionAnchor,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    shouldLogSearchComputes,
  ]);

  const previousPinSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousDotSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const previousPinInteractionSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousLabelSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousLabelCollisionSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const lastMarkerPressTargetRef = React.useRef<LastMarkerPressTarget | null>(null);
  // Visibility hysteresis (fixes boundary promote/demote OSCILLATION = demotion
  // flash + broken crossfade). A marker that crosses the viewport edge flickers
  // in/out of the native screen-space visible set frame-to-frame; because in-view
  // markers take slot priority, that flicker repeatedly demotes then re-promotes
  // the marker, which retargets its pin/dot opacity transitions mid-fade (flash)
  // and desyncs the crossfade. We keep a marker "in view" for a short dwell after
  // it drops out of the native set, so transient edge flicker can no longer flip
  // its LOD role — the role only changes once the marker is sustainedly gone.
  const previousRawVisibleKeysRef = React.useRef<ReadonlySet<string> | null>(null);
  React.useEffect(() => {
    if (highlightedRestaurantId == null) {
      lastMarkerPressTargetRef.current = null;
    }
  }, [highlightedRestaurantId]);
  const markerCandidatesRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedMarkersRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedVisualKeyRef = React.useRef('');
  const lodPinnedResetKeyRef = React.useRef('');
  // Stage B (B1): last candidate-catalog fingerprint pushed to the source frame
  // port. Rebuilt + republished only when the full ranked candidate set changes
  // (results change), NOT on every viewport tick.
  const lastPublishedCandidateCatalogKeyRef = React.useRef<string | null>(null);
  const shortcutViewportLodCadenceRef = React.useRef<ShortcutViewportLodCadence>({
    tokenIdentity: null,
  });
  const shortcutCoverageSnapshotByRequestIdRef = React.useRef<
    Map<string, { bounds: MapBounds; entities: StructuredSearchRequest['entities'] }>
  >(new Map());
  const shortcutCoveragePendingSnapshotByRequestIdRef = React.useRef<
    Map<string, { entities: StructuredSearchRequest['entities'] }>
  >(new Map());
  const shortcutCoverageRankedRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >([]);
  const shortcutCoverageDotFeaturesRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);
  const shortcutCoverageResourceRef = React.useRef<ShortcutCoverageRequestResource | null>(null);
  const shortcutCoverageTerminalByRequestKeyRef = React.useRef<
    Map<string, ShortcutCoverageRequestResource>
  >(new Map());
  const shortcutCoverageCountersRef = React.useRef<ShortcutCoverageRequestCounters>({
    started: 0,
    superseded: 0,
    aborted: 0,
    completed: 0,
  });
  const preparedSourceFrameByFingerprintRef = React.useRef<
    Map<string, DirectMapPreparedSourceFrame>
  >(new Map());
  const shortcutCoverageFetchSeqRef = React.useRef(0);
  const shortcutCoverageLoadingRef = React.useRef(false);
  const restaurantsByIdRef = React.useRef<Map<string, RestaurantResult>>(new Map());
  const restaurantsRef = React.useRef<RestaurantResult[]>([]);
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

  const publishTelemetry = React.useCallback(
    (pinCount: number, dotCount: number) => {
      const coverageResource = shortcutCoverageResourceRef.current;
      sourceFramePort.publishVisualState({
        visibleSortedRestaurantMarkersCount: pinCount,
        visibleDotRestaurantFeaturesCount: dotCount,
        isShortcutCoverageLoading: shortcutCoverageLoadingRef.current,
        shortcutCoverageRequestKey: coverageResource?.requestKey ?? null,
        shortcutCoverageReadinessStatus: coverageResource?.status ?? 'idle',
        shortcutCoverageReadinessReason: coverageResource?.terminalReason ?? null,
      });
    },
    [sourceFramePort]
  );

  const adoptResidentSourceFrameSnapshot = React.useCallback(
    (snapshot: SearchMapSourceFrameSnapshot) => {
      previousPinSourceStoreRef.current = snapshot.pinSourceStore;
      previousDotSourceStoreRef.current = snapshot.dotSourceStore;
      previousPinInteractionSourceStoreRef.current = snapshot.pinInteractionSourceStore;
      previousLabelSourceStoreRef.current = snapshot.labelSourceStore;
      previousLabelCollisionSourceStoreRef.current = snapshot.labelCollisionSourceStore;

      const pinnedState = collectResidentPinnedSourceStoreState(snapshot.pinSourceStore);
      lodPinnedMarkersRef.current = pinnedState.pinnedMarkers;
      lodPinnedVisualKeyRef.current = pinnedState.pinnedVisualKey;
    },
    []
  );

  const commitResidentSourceFrameSnapshot = React.useCallback(
    (snapshot: SearchMapSourceFrameSnapshot) => {
      adoptResidentSourceFrameSnapshot(snapshot);
      const didPublishSourceFrame = sourceFramePort.publishSnapshot(snapshot);
      return didPublishSourceFrame;
    },
    [adoptResidentSourceFrameSnapshot, sourceFramePort]
  );

  const publishSourcesRef = React.useRef<(options?: PublishSearchMapSourcesOptions) => void>(
    () => {}
  );
  publishSourcesRef.current = (options = {}) => {
    const publishReason = options.reason ?? 'full';
    const isViewportLodPublish = publishReason === 'viewport_lod';
    const state = searchRuntimeBus.getState();
    const args = latestArgsRef.current;
    const projectionIsMapMoving =
      args.isMapMoving || isMapMotionPressureMoving(args.mapMotionPressureController);
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    const committedMapSourceFrameKey = resolveCommittedMapSourceFrameKey(state);
    const selectedRestaurantId = args.highlightedRestaurantId;
    const selectedPriorityCoordinate =
      selectedRestaurantId != null &&
      lastMarkerPressTargetRef.current?.restaurantId === selectedRestaurantId
        ? lastMarkerPressTargetRef.current.coordinate
        : null;
    const hasCommittedResultState =
      state.searchMode != null && mountedResultsSnapshot.resultsRequestKey != null;
    const shouldProjectResultSources =
      hasCommittedResultState || args.restaurantOnlyId != null || selectedRestaurantId != null;
    const mountedResults = mountedResultsSnapshot.results;
    const searchRequestId = shouldProjectResultSources
      ? (mountedResults?.metadata?.searchRequestId ?? null)
      : null;
    const restaurants = shouldProjectResultSources
      ? (mountedResults?.restaurants ?? EMPTY_RESTAURANTS)
      : EMPTY_RESTAURANTS;
    const dishes = shouldProjectResultSources
      ? (mountedResults?.dishes ?? EMPTY_DISHES)
      : EMPTY_DISHES;
    const hasOnlyRestaurantOnlyResults =
      args.restaurantOnlyId != null &&
      restaurants.length > 0 &&
      restaurants.every((restaurant) => restaurant.restaurantId === args.restaurantOnlyId) &&
      dishes.every((dish) => dish.restaurantId === args.restaurantOnlyId);
    const effectiveRestaurantOnlyId =
      args.restaurantOnlyId != null && (!hasCommittedResultState || hasOnlyRestaurantOnlyResults)
        ? args.restaurantOnlyId
        : null;
    const activeTab = state.activeTab;
    const searchMode = state.searchMode;
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    const resetKey = `${searchMode ?? 'none'}::${activeTab}`;
    if (lodPinnedResetKeyRef.current !== resetKey) {
      lodPinnedResetKeyRef.current = resetKey;
      lodPinnedVisualKeyRef.current = '';
      lodPinnedMarkersRef.current = [];
      shortcutViewportLodCadenceRef.current = {
        tokenIdentity: null,
      };
    }
    const currentBounds = viewportBoundsService.getBounds();
    const preparedVisualCycleKey = resolvePreparedPresentationVisualCycleKey(
      args.resultsPresentationAuthority,
      args.resultsPresentationSurfaceAuthority
    );
    const resultsPresentationSnapshot = args.resultsPresentationAuthority.getSnapshot();
    const resultsPresentationTransport = resultsPresentationSnapshot.resultsPresentationTransport;
    const isResultsExitActive = resultsPresentationTransport.snapshotKind === 'results_exit';
    const isPreparedResultsEnterActive =
      resultsPresentationTransport.snapshotKind != null &&
      resultsPresentationTransport.snapshotKind !== 'results_exit' &&
      resultsPresentationTransport.executionStage !== 'settled';
    const isSearchVisualProjectionLive =
      !isResultsExitActive &&
      (resultsPresentationSnapshot.resultsPresentation.contentVisibility === 'visible' ||
        preparedVisualCycleKey != null ||
        isPreparedResultsEnterActive ||
        effectiveRestaurantOnlyId != null ||
        selectedRestaurantId != null);
    if (!isSearchVisualProjectionLive) {
      markerCandidatesRef.current = [];
      shortcutViewportLodCadenceRef.current = {
        tokenIdentity: null,
      };
      // RESIDENT-DATA + DORMANT-LAYERS end state: keep the resident source frame across the
      // whole dismiss/idle window — never publish the empty snapshot here. The pins stay
      // resident in the JS frame AND the native Mapbox sources; native fades presentation
      // opacity to 0 and makes the collision-bearing label layers dormant (visibility:none) at
      // settle, then wakes them on re-reveal. This makes dismiss presentation-only (Gate B by
      // construction), re-reveal a no-rebuild crossfade, interruption trivial, and idle
      // frame-drop-free — while panning the empty map between searches the resident pins/dots
      // are ignorePlacement (no collision cost) and every decision lane is already gated off.
      // Genuine teardown (new market / unmount) clears via its own explicit path, not this gate.
      publishTelemetry(0, 0);
      return;
    }
    const readinessKey = resolveMapSurfaceResultsLabelSourcesReadyKey(
      state,
      args.resultsPresentationAuthority,
      args.resultsPresentationSurfaceAuthority
    );
    const previousSourceFrameSnapshot = sourceFramePort.getSnapshot();
    const coverageResource = shortcutCoverageResourceRef.current;
    const shortcutCoverageSnapshotForCurrentRequest =
      searchRequestId != null
        ? (shortcutCoverageSnapshotByRequestIdRef.current.get(searchRequestId) ?? null)
        : null;
    const shortcutCoveragePendingForCurrentRequest =
      searchRequestId != null
        ? (shortcutCoveragePendingSnapshotByRequestIdRef.current.get(searchRequestId) ?? null)
        : null;
    const shortcutCoverageBoundsForCurrentRequest =
      shortcutCoverageSnapshotForCurrentRequest?.bounds ??
      (shortcutCoveragePendingForCurrentRequest != null ? currentBounds : null);
    const shortcutCoverageEntitiesForCurrentRequest =
      shortcutCoverageSnapshotForCurrentRequest?.entities ??
      shortcutCoveragePendingForCurrentRequest?.entities ??
      null;
    const currentShortcutCoverageRequestKey =
      searchMode === 'shortcut' &&
      shortcutCoverageBoundsForCurrentRequest != null &&
      shortcutCoverageEntitiesForCurrentRequest != null
        ? buildShortcutCoverageRequestKey({
            activeTab,
            boundsKey: buildShortcutCoverageBoundsKey(shortcutCoverageBoundsForCurrentRequest),
            entitiesKey: buildShortcutCoverageEntitiesKey(
              shortcutCoverageEntitiesForCurrentRequest
            ),
            marketKey: mountedResults?.metadata?.marketKey ?? '',
          })
        : null;
    const hasShortcutCoverageInput =
      searchMode === 'shortcut' &&
      searchRequestId != null &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null &&
      (shortcutCoverageSnapshotByRequestIdRef.current.has(searchRequestId) ||
        shortcutCoveragePendingSnapshotByRequestIdRef.current.has(searchRequestId) ||
        (currentShortcutCoverageRequestKey != null &&
          coverageResource?.requestKey === currentShortcutCoverageRequestKey));
    const shortcutCoverageReadyForPreparedEnter =
      !hasShortcutCoverageInput ||
      (coverageResource != null &&
        (coverageResource.searchRequestId === searchRequestId ||
          coverageResource.requestKey === currentShortcutCoverageRequestKey) &&
        coverageResource.status !== 'idle' &&
        coverageResource.status !== 'loading');
    if (
      searchMode === 'shortcut' &&
      readinessKey != null &&
      preparedVisualCycleKey != null &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null &&
      searchRequestId == null
    ) {
      sourceFramePort.publishVisualState({
        visibleSortedRestaurantMarkersCount:
          previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        visibleDotRestaurantFeaturesCount:
          previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
        isShortcutCoverageLoading: shortcutCoverageLoadingRef.current,
        shortcutCoverageRequestKey:
          coverageResource?.requestKey ?? currentShortcutCoverageRequestKey,
        shortcutCoverageReadinessStatus: coverageResource?.status ?? 'loading',
        shortcutCoverageReadinessReason: coverageResource?.terminalReason ?? null,
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
      });
      return;
    }
    if (
      searchMode === 'shortcut' &&
      readinessKey != null &&
      preparedVisualCycleKey != null &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null &&
      hasShortcutCoverageInput &&
      !shortcutCoverageReadyForPreparedEnter
    ) {
      sourceFramePort.publishVisualState({
        visibleSortedRestaurantMarkersCount:
          previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        visibleDotRestaurantFeaturesCount:
          previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
        isShortcutCoverageLoading: shortcutCoverageLoadingRef.current,
        shortcutCoverageRequestKey:
          coverageResource?.requestKey ?? currentShortcutCoverageRequestKey,
        shortcutCoverageReadinessStatus: coverageResource?.status ?? 'loading',
        shortcutCoverageReadinessReason: coverageResource?.terminalReason ?? null,
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
      });
      return;
    }
    const canonicalRestaurantRankById =
      mountedResultsSnapshot.precomputedCanonicalRestaurantRankById &&
      mountedResultsSnapshot.precomputedMarkerResultsKey === searchRequestId
        ? mountedResultsSnapshot.precomputedCanonicalRestaurantRankById
        : new Map(
            restaurants
              .filter((restaurant) => typeof restaurant.rank === 'number')
              .map((restaurant) => [restaurant.restaurantId, restaurant.rank as number])
          );
    const restaurantsById =
      mountedResultsSnapshot.precomputedRestaurantsById &&
      mountedResultsSnapshot.precomputedMarkerResultsKey === searchRequestId
        ? mountedResultsSnapshot.precomputedRestaurantsById
        : new Map(restaurants.map((restaurant) => [restaurant.restaurantId, restaurant]));
    restaurantsByIdRef.current = restaurantsById;
    restaurantsRef.current = restaurants;
    const markerCatalogReadModel =
      mountedResultsSnapshot.precomputedMarkerCatalog &&
      mountedResultsSnapshot.precomputedMarkerResultsKey === searchRequestId &&
      mountedResultsSnapshot.precomputedMarkerActiveTab === activeTab &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null
        ? {
            catalog: mountedResultsSnapshot.precomputedMarkerCatalog,
            primaryCount: mountedResultsSnapshot.precomputedMarkerPrimaryCount,
          }
        : buildMarkerCatalogReadModel({
            activeTab,
            dishes,
            markerRestaurants: restaurants,
            restaurantOnlyId: effectiveRestaurantOnlyId,
            selectedRestaurantId,
            canonicalRestaurantRankById,
            locationSelectionAnchor: args.resolveRestaurantLocationSelectionAnchor(),
            resolveRestaurantMapLocations: args.resolveRestaurantMapLocations,
            pickPreferredRestaurantMapLocation: args.pickPreferredRestaurantMapLocation,
            getCraveScoreColorFromScore: args.getCraveScoreColorFromScore,
          });
    const markerCatalogEntries = markerCatalogReadModel.catalog;
    const preparedFrameFingerprint = buildSourceFrameDataReuseKey({
      activeTab,
      bounds: currentBounds,
      labelDerivedSourceIdentityKey: [
        markerCatalogReadModel.primaryCount.toString(36),
        coverageResource?.requestKey ?? 'coverage:none',
        coverageResource?.status ?? 'coverage:idle',
      ].join(':'),
      markersRenderKey: buildStableKeyFingerprint(
        markerCatalogEntries.map((entry) => buildMarkerKey(entry.feature))
      ),
      restaurantOnlyId: effectiveRestaurantOnlyId,
      searchMode,
      selectedRestaurantId,
      submittedQuery: state.submittedQuery ?? null,
    });
    const cachedPreparedFrame =
      preparedSourceFrameByFingerprintRef.current.get(preparedFrameFingerprint);
    if (
      cachedPreparedFrame != null &&
      readinessKey != null &&
      searchMode === 'shortcut' &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null &&
      !shortcutCoverageLoadingRef.current &&
      coverageResource != null &&
      coverageResource.status !== 'idle' &&
      coverageResource.status !== 'loading'
    ) {
      const pinInteractionSourcesComplete = arePinInteractionSourcesComplete(
        cachedPreparedFrame.snapshot
      );
      const nextCachedSnapshot = {
        ...cachedPreparedFrame.snapshot,
        visualCycleKey: preparedVisualCycleKey,
        isShortcutCoverageLoading: false,
        shortcutCoverageRequestKey:
          coverageResource?.requestKey ?? cachedPreparedFrame.snapshot.shortcutCoverageRequestKey,
        shortcutCoverageReadinessStatus:
          coverageResource?.status ?? cachedPreparedFrame.snapshot.shortcutCoverageReadinessStatus,
        shortcutCoverageReadinessReason:
          coverageResource?.terminalReason ??
          cachedPreparedFrame.snapshot.shortcutCoverageReadinessReason,
        mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
      };
      const didPublishSourceFrame = commitResidentSourceFrameSnapshot(nextCachedSnapshot);
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_source_frame_data_reuse_contract',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          sourceFrameDataReused: true,
          sourceFrameDataRecomputed: false,
          didPublishSourceFrame,
          cachedPreparedSourceFrameReplay: true,
          didPublishReadinessState: false,
          pinCount: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
          dotCount: nextCachedSnapshot.dotSourceStore.idsInOrder.length,
          labelCount: nextCachedSnapshot.labelSourceStore.idsInOrder.length,
          labelCollisionCount: nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length,
          hasLabelCollisionSource:
            nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length > 0,
          nativeMapLabelCollisionPreserved:
            nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length > 0,
          markersRenderKey: nextCachedSnapshot.markersRenderKey,
          source: 'prepared_map_frame_cache',
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_surface_results_source_frame_ready_contract',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          sourceFrameVisualCycleKey: nextCachedSnapshot.visualCycleKey,
          committedMapSourceFrameKey,
          didPublishSourceFrame,
          coalescedBeforeNativeEnter: preparedVisualCycleKey != null && !didPublishSourceFrame,
          hasVisualSources:
            nextCachedSnapshot.pinSourceStore.idsInOrder.length > 0 ||
            nextCachedSnapshot.dotSourceStore.idsInOrder.length > 0 ||
            nextCachedSnapshot.labelSourceStore.idsInOrder.length > 0,
          expectsPreparedVisualSources: true,
          mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
          pinCount: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
          dotCount: nextCachedSnapshot.dotSourceStore.idsInOrder.length,
          labelCount: nextCachedSnapshot.labelSourceStore.idsInOrder.length,
          labelCollisionCount: nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length,
          hasLabelCollisionSource:
            nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length > 0,
          nativeMapLabelCollisionPreserved:
            nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length > 0,
        });
      }
      publishTelemetry(
        nextCachedSnapshot.pinSourceStore.idsInOrder.length,
        nextCachedSnapshot.dotSourceStore.idsInOrder.length
      );
      return;
    }
    // v4 invariant 1 (RESIDENT sources): the natural-search candidate set is the
    // FULL result catalog, not a viewport query. Natural search returns a BOUNDED set
    // — the backend result limit caps it (SEARCH_MAX_RESULTS, default 100, hard max 500
    // in search.service.ts resolveResultLimit), paginated onto the map at the mobile
    // page size; panning does NOT re-fetch (new results only arrive on an explicit
    // "Search this area", which is a data event, not a camera event). So the set is
    // comparable to (and usually smaller than) the shortcut coverage snapshot, and
    // making it resident is safe — not a perf regression. Publishing the full catalog
    // here means source membership changes only on data changes (new search / new page),
    // never on camera, so markers crossfade in/out via LOD opacity instead of being
    // ejected from the source on pan. Promotion is still viewport-gated downstream:
    // buildMarkerRenderModel is called with requireVisibility:true and the native
    // screen-space visible set, so only on-screen markers ever promote to full pins.
    markerCandidatesRef.current = markerCatalogEntries.map((entry) => entry.feature);
    const shortcutResultFeatures =
      searchMode === 'shortcut' ? markerCatalogEntries.map((entry) => entry.feature) : [];
    const shortcutCoverageFeatures =
      searchMode === 'shortcut' ? shortcutCoverageRankedRef.current : [];
    const rankedCandidateSources: SearchMapVisualCandidateSource[] =
      searchMode === 'shortcut'
        ? [
            { sourceKind: 'shortcut_coverage', features: shortcutCoverageFeatures },
            { sourceKind: 'main_results', features: shortcutResultFeatures },
          ]
        : [{ sourceKind: 'viewport', features: markerCandidatesRef.current }];
    const dotCandidateSources: SearchMapVisualCandidateSource[] =
      searchMode === 'shortcut'
        ? [
            {
              sourceKind: 'shortcut_coverage',
              features: shortcutCoverageDotFeaturesRef.current?.features ?? [],
            },
            { sourceKind: 'main_results', features: shortcutResultFeatures },
          ]
        : [{ sourceKind: 'viewport', features: markerCandidatesRef.current }];
    const projectedInitialCandidates = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      restaurantOnlyId: effectiveRestaurantOnlyId,
      buildMarkerKey,
    });
    const rankedCandidates = projectedInitialCandidates.rankedCandidates;
    const selectedRestaurantCandidates = projectedInitialCandidates.selectedRestaurantCandidates;
    // Stage B (B1): publish the full ranked candidate catalog (every showable
    // marker, NOT viewport-filtered) to the source frame port so native can
    // project it to screen space each camera tick and decide on-screen membership.
    // rankedCandidates is already rank-ordered, so the array index IS the rank.
    {
      const candidateCatalogKey = buildStableKeyFingerprint(
        rankedCandidates.map((feature) => buildMarkerKey(feature))
      );
      if (candidateCatalogKey !== lastPublishedCandidateCatalogKeyRef.current) {
        const catalogEntries: SearchMapCandidateCatalogEntry[] = [];
        rankedCandidates.forEach((feature, index) => {
          const coordinates = feature.geometry?.coordinates;
          if (
            !Array.isArray(coordinates) ||
            typeof coordinates[0] !== 'number' ||
            typeof coordinates[1] !== 'number'
          ) {
            return;
          }
          catalogEntries.push({
            markerKey: buildMarkerKey(feature),
            lng: coordinates[0],
            lat: coordinates[1],
            rank: feature.properties.rank ?? index,
          });
        });
        sourceFramePort.publishCandidateCatalog({
          key: candidateCatalogKey,
          entries: catalogEntries,
        });
        lastPublishedCandidateCatalogKeyRef.current = candidateCatalogKey;
      }
    }
    // Stage B (B3): consume the native screen-space on-screen marker set as the
    // visibility test (accurate under twist/pitch). Null until the projector first
    // reports (initial frame), where buildMarkerRenderModel falls back to the
    // padded AABB. A momentarily stale set cannot collapse the promoted set —
    // stable-membership retains currently-pinned markers regardless.
    const nativeVisible = sourceFramePort.getNativeVisibleMarkerKeys();
    let nativeVisibleMarkerKeys: Set<string> | null = null;
    // RAW visible-set monotonicity probe (attribution): selection inputs other than
    // visibility are frozen during a gesture, so promoted-set flip-flops can only come
    // from the visible set oscillating. rawRemoved > 0 during a monotone zoom-out means
    // the native projection itself is ejecting on-screen markers (edge oscillation);
    // rawRemoved == 0 while flips still happen indicts the dwell/baseline layers instead.
    let rawVisibleAdded = 0;
    let rawVisibleRemoved = 0;
    let rawVisibleCount = -1;
    if (nativeVisible != null) {
      const rawKeys = new Set(nativeVisible.markerKeys);
      rawVisibleCount = rawKeys.size;
      const previousRaw = previousRawVisibleKeysRef.current;
      if (previousRaw != null) {
        for (const key of rawKeys) {
          if (!previousRaw.has(key)) {
            rawVisibleAdded += 1;
          }
        }
        for (const key of previousRaw) {
          if (!rawKeys.has(key)) {
            rawVisibleRemoved += 1;
          }
        }
      }
      previousRawVisibleKeysRef.current = rawKeys;
      if (rawVisibleRemoved > 0 && isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'raw_visible_set_shrink_contract',
          rawVisibleCount,
          rawVisibleAdded,
          rawVisibleRemoved,
          isMapMoving: isMapMotionPressureMoving(mapMotionPressureController) || args.isMapMoving,
        });
      }
      // The raw projection is the visibility truth, per-marker and immediate (v4:
      // promote/demote stair-step as markers enter/leave, no group behavior). Edge
      // anti-flicker is spatial hysteresis in the native projector (a marker enters
      // inside the tighter pad and exits past the looser one), NOT a time dwell —
      // the old 700ms dwell expired gesture-stamped markers in batches, producing
      // the synchronized after-gesture demote waves (measured: 20-21 markers per
      // batch with zero raw-set removals).
      nativeVisibleMarkerKeys = rawKeys;
    }
    // Resolve the frozen OVERLAP REGION (submitted viewport when small; metro radius
    // around the user for a far-out shortcut) — drives the dual LOD budget + the in/out
    // pin split + the badge (rank in-region / score out). Polygon = pitch/twist truth.
    const submittedSearchBounds = viewportBoundsService.getSearchBaselineBounds();
    const submittedSearchPolygon = viewportBoundsService.getSubmittedPolygon();
    // SHORTCUT searches show world-wide results, so a far-out shortcut resolves to a
    // metro radius around the user (+ auto-zoom). NATURAL searches are strictly bounded
    // to the submitted viewport (backend filters BETWEEN the bounds, no margin), so
    // their region is ALWAYS that viewport — never a radius, never an auto-zoom — even
    // when the user searched while zoomed out.
    const isShortcutSearch = searchMode === 'shortcut';
    const overlapRegion =
      viewportBoundsService.getOverlapRegion() ??
      (isShortcutSearch
        ? resolveOverlapRegion({
            submittedBounds: submittedSearchBounds,
            submittedPolygon: submittedSearchPolygon,
            userLocation: userLocationRef.current,
          })
        : submittedSearchBounds
          ? ({
              kind: 'viewport',
              bounds: submittedSearchBounds,
              polygon: submittedSearchPolygon,
            } as const)
          : null);

    // Far-out shortcut → auto-zoom onto the radius once per search (programmatic, so it
    // doesn't trip "map moved"; the region stays a radius off the frozen baseline).
    if (overlapRegion?.kind === 'radius' && submittedSearchBounds) {
      const autoZoomKey = `${submittedSearchBounds.northEast.lat.toFixed(4)}:${submittedSearchBounds.northEast.lng.toFixed(4)}:${submittedSearchBounds.southWest.lat.toFixed(4)}:${submittedSearchBounds.southWest.lng.toFixed(4)}`;
      if (lastAutoZoomedSearchKeyRef.current !== autoZoomKey) {
        lastAutoZoomedSearchKeyRef.current = autoZoomKey;
        requestOverlapAutoZoom({
          center: overlapRegion.center,
          radiusMiles: overlapRegion.radiusMiles,
        });
      }
    }

    // SINGLE LOD BUDGET — ONE viewport-gated, ranked group. Promotion is the top-`maxFullPins`
    // candidates BY RANK within the current screen (native screen-space set,
    // requireVisibility:true), promoting/demoting live as markers enter/leave the viewport via
    // the stable-membership machinery. As you pan, an outer higher-ranked marker naturally
    // displaces an inner lower-ranked one under the single budget. The in/out-overlap-region
    // split is now PRESENTATION ONLY (isInRegionFeature, used below for the badge): a promoted
    // pin shows the RANK badge inside the submitted region and the crave-SCORE badge outside —
    // it no longer splits promotion into two separate budgets. The selected (tapped) restaurant
    // is force-promoted via selectedRestaurantCandidates regardless of geography. Natural search
    // has no out-of-region candidates; shortcuts load the whole world and the viewport gate
    // selects the on-screen top-N.
    const selectedMarkerKeys = new Set(
      selectedRestaurantCandidates.map((feature) => buildMarkerKey(feature))
    );
    const isInRegionFeature = (feature: Feature<Point, RestaurantFeatureProperties>): boolean =>
      selectedMarkerKeys.has(buildMarkerKey(feature)) ||
      isWithinOverlapRegion(overlapRegion, feature.geometry.coordinates as [number, number]);
    const currentPinned = lodPinnedMarkersRef.current;
    const emptyModel = { nextPinnedMarkers: [], nextPinnedMeta: [] };
    const nextModel = currentBounds
      ? buildMarkerRenderModel({
          bounds: currentBounds,
          rankedCandidates,
          selectedRestaurantCandidates,
          currentPinnedMarkers: currentPinned,
          selectedRestaurantId,
          selectedPriorityCoordinate,
          buildMarkerKey,
          buildVisualIdentityKey: buildSearchMapVisualIdentityKey,
          maxPins: args.maxFullPins,
          nativeVisibleMarkerKeys,
          requireVisibility: true,
        })
      : emptyModel;
    const nextPinnedVisualKey = buildLodPinnedVisualKey(nextModel.nextPinnedMeta);
    if (
      isViewportLodPublish &&
      projectionIsMapMoving &&
      nextPinnedVisualKey === lodPinnedVisualKeyRef.current
    ) {
      return;
    }
    // LOD TARGET-CHANGE attribution contract. Past this point the promoted-set visual
    // key CHANGED vs the previous publish, so at least one marker flipped promote/demote
    // — i.e. its crossfade target reversed. The lodTransitionTrace proved these flips are
    // what restart the crossfade mid-fade (s≈c, alternating targets) = the flash. This
    // contract attributes WHY each flip happened, so we know which lever to pull:
    //   - lostVisibility: the marker left the native on-screen projection (visibility
    //     hysteresis insufficient) — would be visibility-edge churn.
    //   - visibleDisplaced(In/Out)Region: marker is STILL on-screen but dropped from the
    //     promoted set — pure rank/budget/region reshuffle (selection instability), split
    //     by region to test the in/out-region-boundary hypothesis.
    // In the ideal resident model a stably-visible marker should not flip target every
    // eval, so visibleDisplaced* counts > 0 during a smooth zoom localize the bug.
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      const prevPromotedKeys = new Set(currentPinned.map((feature) => buildMarkerKey(feature)));
      const nextPromotedKeys = new Set(
        nextModel.nextPinnedMarkers.map((feature) => buildMarkerKey(feature))
      );
      const isVisibleForChurn = (key: string): boolean =>
        nativeVisibleMarkerKeys == null ? true : nativeVisibleMarkerKeys.has(key);
      let demoteLostVisibility = 0;
      let demoteVisibleInRegion = 0;
      let demoteVisibleOutRegion = 0;
      for (const feature of currentPinned) {
        const key = buildMarkerKey(feature);
        if (nextPromotedKeys.has(key)) {
          continue;
        }
        if (!isVisibleForChurn(key)) {
          demoteLostVisibility += 1;
        } else if (isInRegionFeature(feature)) {
          demoteVisibleInRegion += 1;
        } else {
          demoteVisibleOutRegion += 1;
        }
      }
      let promoteFresh = 0;
      let promoteVisible = 0;
      for (const feature of nextModel.nextPinnedMarkers) {
        const key = buildMarkerKey(feature);
        if (prevPromotedKeys.has(key)) {
          continue;
        }
        promoteFresh += 1;
        if (isVisibleForChurn(key)) {
          promoteVisible += 1;
        }
      }
      const demoteTotal = demoteLostVisibility + demoteVisibleInRegion + demoteVisibleOutRegion;
      if (demoteTotal > 0 || promoteFresh > 0) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'lod_target_change_contract',
          publishReason,
          isMapMoving: projectionIsMapMoving,
          prevPromoted: prevPromotedKeys.size,
          nextPromoted: nextPromotedKeys.size,
          demoteTotal,
          demoteLostVisibility,
          demoteVisibleInRegion,
          demoteVisibleOutRegion,
          promoteFresh,
          promoteVisible,
          nativeVisibleCount: nativeVisibleMarkerKeys == null ? -1 : nativeVisibleMarkerKeys.size,
          rawVisibleCount,
          rawVisibleAdded,
          rawVisibleRemoved,
        });
      }
    }
    const visibleSortedRestaurantMarkers = nextModel.nextPinnedMarkers.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        nativeLodZ: nextModel.nextPinnedMeta[index]?.lodZ ?? feature.properties.nativeLodZ,
        lodZ: nextModel.nextPinnedMeta[index]?.lodZ ?? feature.properties.lodZ,
      },
    }));
    const projectedVisualFrame = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      restaurantOnlyId: effectiveRestaurantOnlyId,
      buildMarkerKey,
    });
    // Dots = every demoted marker. They render always-draw (allowOverlap:true), so no
    // JS cap is needed: Mapbox only draws the ones inside the current viewport (the
    // off-screen rest are tile-culled, not collision-culled), and on-screen dots all
    // paint with no per-frame flicker. The promoted top-N (both budgets) are carried
    // here too at opacity 0 (resident), flipped to visible only when promoted.
    const visibleDotRestaurantMarkerFeatures = projectedVisualFrame.dotCandidates;

    // RESIDENT LOD: build the union of promoted + rendered-dot candidates ONCE. Every
    // candidate is emitted into BOTH the pin and dot sources, resident at all times,
    // with role carried purely by opacity feature-state (promoted → pin 1 / dot 0;
    // demoted → pin 0 / dot 1). A promote/demote flips opacity only — no source
    // membership churn → no commit/await → crossfade is clean by construction.
    // Membership changes only when a marker enters/leaves the rendered set (pan/zoom).
    const renderedLodCandidates: Array<{
      feature: Feature<Point, RestaurantFeatureProperties>;
      isPromoted: boolean;
    }> = [];
    const seenRenderedLodKeys = new Set<string>();
    visibleSortedRestaurantMarkers.forEach((feature) => {
      const key = buildMarkerKey(feature);
      if (seenRenderedLodKeys.has(key)) {
        return;
      }
      seenRenderedLodKeys.add(key);
      renderedLodCandidates.push({ feature, isPromoted: true });
    });
    visibleDotRestaurantMarkerFeatures.forEach((feature) => {
      const key = buildMarkerKey(feature);
      if (seenRenderedLodKeys.has(key)) {
        return;
      }
      seenRenderedLodKeys.add(key);
      renderedLodCandidates.push({ feature, isPromoted: false });
    });

    // Pin badge keyed off the frozen overlap region (resolved above): in-region → RANK,
    // out-of-region → SCORE. Baked into the sprite so the number rides the pin z-order.
    const pinBuilder = createSearchMapSourceStoreBuilder(previousPinSourceStoreRef.current);
    renderedLodCandidates.forEach(({ feature, isPromoted }, index) => {
      const markerKey = buildMarkerKey(feature);
      const nativeLodZ =
        typeof feature.properties.nativeLodZ === 'number'
          ? feature.properties.nativeLodZ
          : feature.properties.lodZ;
      const craveScore =
        typeof feature.properties.craveScore === 'number' ? feature.properties.craveScore : null;
      const rank =
        typeof feature.properties.rank === 'number' ? feature.properties.rank : index + 1;
      const inOverlapRegion = isInRegionFeature(feature);
      const badgeImageId = inOverlapRegion
        ? rankBadgeImageId(craveScore, rank)
        : scoreBadgeImageId(craveScore);
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
          labelOrder: index + 1,
          badgeImageId,
          inOverlapRegion,
          nativeLodZ,
          // RESIDENT role: promoted pin visible (1), demoted pin resident-invisible (0).
          // STALE-BAKED-ROLE SAFETY: this baked property is the layer expression's
          // `['get', 'nativeLodOpacity']` fallback (search-map.tsx), used ONLY when no
          // feature-state is present (i.e. first paint of a brand-new marker). It is NOT a
          // loaded gun for role flips: nativeLodOpacity is a TRANSIENT_VISUAL_PROPERTY_KEY, so it
          // is excluded from the diffKey (no source republish on flip — v4 invariant 2) but still
          // flips the transport-feature revision (diffKey|featureStateRevision) and the native
          // markerRoleRowSignature. A promote↔demote therefore always produces a non-null
          // markerRoleFrame, and the native owner re-bakes this same source property to the
          // settled role (SearchMapRenderController prepareScopedPinAndLabelOutput /
          // reconcileLiveMarkerRoleOutputs) and/or writes the stepper feature-state — without any
          // JS-originated source write. The coalesce default can never go stale relative to role.
          nativeLodOpacity: isPromoted ? 1 : 0,
          nativeLodRankOpacity: 1,
          nativePresentationOpacity: 1,
        },
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      pinBuilder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    const pinSourceStore = pinBuilder.finish();

    // Resident dot for EVERY candidate (same union as pins): promoted → dot hidden (0),
    // demoted → dot visible (1). Role flip = opacity only, no membership churn.
    const dotBuilder = createSearchMapSourceStoreBuilder(
      previousDotSourceStoreRef.current ?? EMPTY_SEARCH_MAP_SOURCE_STORE
    );
    renderedLodCandidates.forEach(({ feature, isPromoted }) => {
      const markerKey = buildMarkerKey(feature);
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
          // STALE-BAKED-ROLE SAFETY: mirror of the nativeLodOpacity bake above. This is the
          // `['get', 'nativeDotOpacity']` coalesce fallback (first-paint default only). On a role
          // flip the native owner re-bakes the dot source property and/or writes the dot stepper
          // feature-state via the markerRoleFrame (no source republish), so the demoted-dot role
          // can never render from a stale baked value. See the source-store diffKey-exclusion
          // comment (TRANSIENT_VISUAL_PROPERTY_KEYS) for the full invariant-2 trace.
          nativeDotOpacity: isPromoted ? 0 : 1,
          nativePresentationOpacity: 1,
        },
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      dotBuilder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    const dotSourceStore = dotBuilder.finish();
    // LOD MEMBERSHIP CHURN contract. Fires on every actual publish (NOT gated by
    // the measured-loop quiet flag, unlike lod_classification) right where the new
    // pin/dot source stores are finalized vs the previous publish. This is the
    // instrument that exposes "markers disappear at low zoom without collisions":
    // a marker removed from BOTH stores (pinRemoved ∩ dotRemoved, no collision
    // involved) vanished because JS dropped it from the source (removeIds), not a
    // crossfade. churnReason carries publish reason + whether the camera was moving,
    // so we can see whether membership is churning mid-gesture (the flash) vs only
    // on settle. In an ideal resident model, viewport pan/zoom should produce ZERO
    // removals (markers stay resident, tile-culled by Mapbox / faded by opacity).
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      const prevPinIds = new Set(previousPinSourceStoreRef.current?.idsInOrder ?? []);
      const prevDotIds = new Set(previousDotSourceStoreRef.current?.idsInOrder ?? []);
      const nextPinIds = pinSourceStore.idsInOrder;
      const nextDotIds = dotSourceStore.idsInOrder;
      const nextPinIdSet = new Set(nextPinIds);
      const nextDotIdSet = new Set(nextDotIds);
      const pinAdded = nextPinIds.filter((id) => !prevPinIds.has(id));
      const pinRemoved = [...prevPinIds].filter((id) => !nextPinIdSet.has(id));
      const dotAdded = nextDotIds.filter((id) => !prevDotIds.has(id));
      const dotRemoved = [...prevDotIds].filter((id) => !nextDotIdSet.has(id));
      // A marker gone from BOTH families = a true vanish (no pin, no dot) — the
      // disappearance the user sees. A marker only in dotRemoved but still a pin
      // (or vice-versa) is an in-place role flip, not a vanish.
      const vanished = pinRemoved.filter(
        (id) => !nextDotIdSet.has(id) && !nextPinIdSet.has(id)
      ).length;
      if (
        pinAdded.length > 0 ||
        pinRemoved.length > 0 ||
        dotAdded.length > 0 ||
        dotRemoved.length > 0
      ) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'lod_membership_churn_contract',
          churnReason: publishReason,
          isMapMoving: projectionIsMapMoving,
          pinCount: nextPinIds.length,
          dotCount: nextDotIds.length,
          pinAdded: pinAdded.length,
          pinRemoved: pinRemoved.length,
          dotAdded: dotAdded.length,
          dotRemoved: dotRemoved.length,
          vanishedFromBothFamilies: vanished,
        });
      }
      // PIN PUBLISH STABILITY contract. The pin is a single pre-baked sprite (number
      // baked in) anchored at its coordinate, so the only publish-side inputs that can
      // MOVE a rendered pin are (a) its badgeImageId swapping to a different-sized
      // sprite or (b) its coordinate changing (a multi-location re-pick: same
      // restaurantId reappears under a new lng:lat markerKey). Both must stay 0 during
      // camera motion — nonzero indicts the publish path for the pin jitter. The
      // in/out-region promotion split + the out-region visibility funnel keep the
      // out-region (crave-score) group honest: promotedOutRegion==0 with
      // outRegionVisible>0 is a render-model starve; with outRegionVisible==0 the
      // projection/region classification is starving it upstream.
      const previousPinStore = previousPinSourceStoreRef.current;
      let badgeChangedCount = 0;
      let coordinateSwapCount = 0;
      let promotedInRegionCount = 0;
      let promotedOutRegionCount = 0;
      const prevKeyByRestaurantId = new Map<string, string>();
      if (previousPinStore) {
        for (const prevKey of previousPinStore.idsInOrder) {
          const restaurantId = previousPinStore.featureById.get(prevKey)?.properties.restaurantId;
          if (typeof restaurantId === 'string') {
            prevKeyByRestaurantId.set(restaurantId, prevKey);
          }
        }
      }
      for (const markerKey of pinSourceStore.idsInOrder) {
        const feature = pinSourceStore.featureById.get(markerKey);
        if (!feature) {
          continue;
        }
        if (feature.properties.nativeLodOpacity === 1) {
          if (feature.properties.inOverlapRegion === true) {
            promotedInRegionCount += 1;
          } else {
            promotedOutRegionCount += 1;
          }
        }
        const prevFeature = previousPinStore?.featureById.get(markerKey);
        if (prevFeature) {
          if (prevFeature.properties.badgeImageId !== feature.properties.badgeImageId) {
            badgeChangedCount += 1;
          }
        } else {
          const restaurantId = feature.properties.restaurantId;
          const prevKeyForRestaurant =
            typeof restaurantId === 'string' ? prevKeyByRestaurantId.get(restaurantId) : undefined;
          if (prevKeyForRestaurant != null && prevKeyForRestaurant !== markerKey) {
            coordinateSwapCount += 1;
          }
        }
      }
      let outRegionCandidateCount = 0;
      let outRegionVisibleCount = 0;
      for (const candidate of rankedCandidates) {
        if (isInRegionFeature(candidate)) {
          continue;
        }
        outRegionCandidateCount += 1;
        if (
          nativeVisibleMarkerKeys == null ||
          nativeVisibleMarkerKeys.has(buildMarkerKey(candidate))
        ) {
          outRegionVisibleCount += 1;
        }
      }
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'pin_publish_stability_contract',
        publishReason,
        isMapMoving: projectionIsMapMoving,
        badgeChangedCount,
        coordinateSwapCount,
        promotedInRegionCount,
        promotedOutRegionCount,
        outRegionCandidateCount,
        outRegionVisibleCount,
        rankedCandidateCount: rankedCandidates.length,
      });
    }
    const pinInteractionBuilder = createSearchMapSourceStoreBuilder(
      previousPinInteractionSourceStoreRef.current
    );
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
          rank: feature.properties.rank,
          lodZ: feature.properties.lodZ,
          nativeLodZ: feature.properties.nativeLodZ,
        } as RestaurantFeatureProperties,
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      const semanticRevision = buildInteractionSemanticRevision({
        family: 'pinInteraction',
        markerKey,
        restaurantId: feature.properties.restaurantId,
        lng,
        lat,
      });
      pinInteractionBuilder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    const pinInteractionSourceStore = pinInteractionBuilder.finish();

    const { labelSourceStore, labelCollisionSourceStore, labelDerivedSourceIdentityKey } =
      buildDirectLabelStores({
        pinSourceStore,
        previousLabelSourceStore: previousLabelSourceStoreRef.current,
        previousLabelCollisionSourceStore: previousLabelCollisionSourceStoreRef.current,
      });
    assertProjectedVisualFrameInvariants({
      pinSourceStore,
      dotSourceStore,
      labelSourceStore,
      labelCollisionSourceStore,
    });
    const pinsRenderKey = buildStableKeyFingerprint(pinSourceStore.idsInOrder);
    const dotsRenderKey = buildStableKeyFingerprint(dotSourceStore.idsInOrder);
    const publishStartMs = args.getPerfNow();
    const isPreparedEnterVisualCycle =
      preparedVisualCycleKey != null && readinessKey === preparedVisualCycleKey;
    const hasCommittedDataForPreparedEnter =
      !isPreparedEnterVisualCycle ||
      (hasCommittedResultState && committedMapSourceFrameKey != null);
    const hasVisualSources =
      pinSourceStore.idsInOrder.length > 0 ||
      dotSourceStore.idsInOrder.length > 0 ||
      labelSourceStore.idsInOrder.length > 0;
    const expectsPreparedVisualSources =
      readinessKey != null &&
      hasCommittedDataForPreparedEnter &&
      shouldProjectResultSources &&
      (restaurants.length > 0 || markerCatalogEntries.length > 0);
    const pinInteractionSourcesComplete = arePinInteractionSourcesComplete({
      pinSourceStore,
      pinInteractionSourceStore,
    });
    const mapSearchSurfaceResultsSourcesReady =
      readinessKey != null &&
      hasCommittedDataForPreparedEnter &&
      shortcutCoverageReadyForPreparedEnter &&
      pinInteractionSourcesComplete &&
      (!expectsPreparedVisualSources || hasVisualSources);
    const coverageCounters = shortcutCoverageCountersRef.current;
    const shortcutCoverageInFlightCount = coverageResource?.status === 'loading' ? 1 : 0;
    const shortcutCoverageTerminal =
      coverageResource != null &&
      coverageResource.status !== 'idle' &&
      coverageResource.status !== 'loading';
    const sourceFrameSnapshot = {
      visualCycleKey: preparedVisualCycleKey,
      selectedRestaurantId,
      pinSourceStore,
      dotSourceStore,
      pinInteractionSourceStore,
      labelSourceStore,
      labelCollisionSourceStore,
      labelDerivedSourceIdentityKey,
      markersRenderKey: `pins:${pinsRenderKey}:dots:${dotsRenderKey}`,
      visibleSortedRestaurantMarkersCount: pinSourceStore.idsInOrder.length,
      visibleDotRestaurantFeaturesCount: dotSourceStore.idsInOrder.length,
      isShortcutCoverageLoading: shortcutCoverageLoadingRef.current,
      shortcutCoverageRequestKey: coverageResource?.requestKey ?? null,
      shortcutCoverageReadinessStatus: coverageResource?.status ?? 'idle',
      shortcutCoverageReadinessReason: coverageResource?.terminalReason ?? null,
      mapSearchSurfaceResultsSourcesReady,
      mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
    };
    const activePresentationTransport =
      args.resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
    const shouldPreserveResidentEnterSourceFrame =
      preparedVisualCycleKey != null &&
      previousSourceFrameSnapshot.visualCycleKey === preparedVisualCycleKey &&
      hasNonEmptySearchMapSourceFrame(previousSourceFrameSnapshot) &&
      !hasNonEmptySearchMapSourceFrame(sourceFrameSnapshot);
    if (shouldPreserveResidentEnterSourceFrame) {
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_source_frame_empty_enter_frame_suppressed',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          transportExecutionStage: activePresentationTransport.executionStage,
          retainedPinCount: previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
          retainedDotCount: previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
          retainedLabelCount: previousSourceFrameSnapshot.labelSourceStore.idsInOrder.length,
          nextMarkersRenderKey: sourceFrameSnapshot.markersRenderKey,
        });
      }
      return;
    }
    preparedSourceFrameByFingerprintRef.current.set(preparedFrameFingerprint, {
      fingerprint: preparedFrameFingerprint,
      snapshot: sourceFrameSnapshot,
    });
    if (preparedSourceFrameByFingerprintRef.current.size > 4) {
      const [oldestKey] = preparedSourceFrameByFingerprintRef.current.keys();
      if (oldestKey != null) {
        preparedSourceFrameByFingerprintRef.current.delete(oldestKey);
      }
    }
    const didPublishSourceFrame = commitResidentSourceFrameSnapshot(sourceFrameSnapshot);
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      const quietMeasuredLoopActive = isPerfScenarioQuietMeasuredLoopActive(scenarioConfig);
      const shouldEmitSourceFrameDiagnostics = !quietMeasuredLoopActive || didPublishSourceFrame;
      if (shouldEmitSourceFrameDiagnostics) {
        // Visual-identity set construction below is purely diagnostic: it is only
        // consumed by the attribution log events in this gated block. Keep it inside
        // the gate so no set-building runs when perf attribution is off (the default).
        const pinVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(pinSourceStore);
        const dotVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(dotSourceStore);
        const visibleDemotedDotVisualIdentityKeys = new Set<SearchMapVisualIdentityKey>();
        dotSourceStore.idsInOrder.forEach((markerKey) => {
          const feature = dotSourceStore.featureById.get(markerKey);
          if (!feature || feature.properties.nativeDotOpacity === 0) {
            return;
          }
          visibleDemotedDotVisualIdentityKeys.add(buildSearchMapVisualIdentityKey(feature));
        });
        const selectedPinVisualIdentityCount = countRestaurantVisualIdentityKeysInSourceStore(
          pinSourceStore,
          selectedRestaurantId
        );
        const normalPinVisualIdentityCount = Math.max(
          0,
          pinVisualIdentityKeys.size - selectedPinVisualIdentityCount
        );
        const lodOverlapMarkerKeys = intersectStringSets(
          new Set(pinSourceStore.idsInOrder),
          new Set(dotSourceStore.idsInOrder)
        );
        const lodOverlapVisualIdentityKeys = intersectStringSets(
          pinVisualIdentityKeys,
          dotVisualIdentityKeys
        );
        const lodClassifiedVisualIdentityKeys = new Set([
          ...pinVisualIdentityKeys,
          ...dotVisualIdentityKeys,
        ]);
        const unclassifiedCandidateVisualIdentityCount = countMissingKeys(
          projectedVisualFrame.candidateVisualIdentityKeys,
          lodClassifiedVisualIdentityKeys
        );
        const compactCoverageProof = quietMeasuredLoopActive
          ? {
              shortcutCoverageInFlightCount,
              shortcutCoverageCompletedCount: coverageCounters.completed,
              shortcutCoverageReturnedFeatureCount: coverageResource?.returnedFeatureCount ?? 0,
              shortcutCoverageAcceptedFeatureCount: coverageResource?.acceptedFeatureCount ?? 0,
              shortcutCoverageStatus: coverageResource?.status ?? 'idle',
              shortcutCoverageTerminalReason: coverageResource?.terminalReason ?? null,
            }
          : {
              shortcutCoverageRequestKey: coverageResource?.requestKey ?? null,
              shortcutCoverageSearchRequestId: coverageResource?.searchRequestId ?? searchRequestId,
              shortcutCoverageBoundsKey: coverageResource?.boundsKey ?? null,
              shortcutCoverageActiveTab: coverageResource?.activeTab ?? activeTab,
              shortcutCoverageMarketKey: coverageResource?.marketKey ?? null,
              shortcutCoverageFetchReason: coverageResource?.fetchReason ?? null,
              shortcutCoverageInFlightCount,
              shortcutCoverageSupersededCount: coverageCounters.superseded,
              shortcutCoverageAbortedCount: coverageCounters.aborted,
              shortcutCoverageCompletedCount: coverageCounters.completed,
              shortcutCoverageReturnedFeatureCount: coverageResource?.returnedFeatureCount ?? 0,
              shortcutCoverageAcceptedFeatureCount: coverageResource?.acceptedFeatureCount ?? 0,
              shortcutCoverageStatus: coverageResource?.status ?? 'idle',
              shortcutCoverageTerminalReason: coverageResource?.terminalReason ?? null,
            };
        const lodProof = quietMeasuredLoopActive
          ? {
              lodOverlapMarkerKeyCount: lodOverlapMarkerKeys.length,
              lodOverlapVisualIdentityCount: lodOverlapVisualIdentityKeys.length,
            }
          : {
              lodOverlapMarkerKeyCount: lodOverlapMarkerKeys.length,
              lodOverlapVisualIdentityCount: lodOverlapVisualIdentityKeys.length,
              lodOverlapMarkerKeySamples: lodOverlapMarkerKeys.slice(0, 8),
              lodOverlapVisualIdentitySamples: lodOverlapVisualIdentityKeys.slice(0, 8),
            };
        logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
          event: 'scenario_work_span',
          owner: 'map_source_frame_publish',
          path: didPublishSourceFrame ? 'notified' : 'coalesced',
          durationMs: Number((args.getPerfNow() - publishStartMs).toFixed(3)),
          handoffPhase: state.searchSurfaceRedrawPhase,
          searchMode,
          activeTab,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          labelCount: labelSourceStore.idsInOrder.length,
          collisionCount: labelCollisionSourceStore.idsInOrder.length,
          ...compactCoverageProof,
          hasVisualSources,
          expectsPreparedVisualSources,
          mapSearchSurfaceResultsSourcesReady,
          readinessKey,
          preparedVisualCycleKey,
          committedMapSourceFrameKey,
          ...lodProof,
          sourceFrameDataReused: false,
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_source_frame_data_reuse_contract',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          sourceFrameDataReused: false,
          sourceFrameDataRecomputed: true,
          didPublishSourceFrame,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          labelCount: labelSourceStore.idsInOrder.length,
          labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
          hasLabelCollisionSource: labelCollisionSourceStore.idsInOrder.length > 0,
          nativeMapLabelCollisionPreserved: labelCollisionSourceStore.idsInOrder.length > 0,
          markersRenderKey: sourceFrameSnapshot.markersRenderKey,
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_surface_results_source_frame_ready_contract',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          sourceFrameVisualCycleKey: sourceFrameSnapshot.visualCycleKey,
          committedMapSourceFrameKey,
          didPublishSourceFrame,
          coalescedBeforeNativeEnter: preparedVisualCycleKey != null && !didPublishSourceFrame,
          hasVisualSources,
          expectsPreparedVisualSources,
          mapSearchSurfaceResultsSourcesReady,
          ...compactCoverageProof,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          labelCount: labelSourceStore.idsInOrder.length,
          labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
          hasLabelCollisionSource: labelCollisionSourceStore.idsInOrder.length > 0,
          nativeMapLabelCollisionPreserved: labelCollisionSourceStore.idsInOrder.length > 0,
        });
        if (
          searchMode === 'shortcut' &&
          coverageResource != null &&
          shortcutCoverageTerminal &&
          restaurants.length > 0 &&
          pinSourceStore.idsInOrder.length + dotSourceStore.idsInOrder.length === 0
        ) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'shortcut_coverage_terminal_empty_visual_contract',
            transactionId: preparedVisualCycleKey,
            readinessKey,
            requestKey: coverageResource.requestKey,
            searchRequestId: coverageResource.searchRequestId,
            boundsKey: coverageResource.boundsKey,
            activeTab: coverageResource.activeTab,
            marketKey: coverageResource.marketKey,
            fetchReason: coverageResource.fetchReason,
            inFlightCount: shortcutCoverageInFlightCount,
            supersededCount: coverageCounters.superseded,
            abortedCount: coverageCounters.aborted,
            completedCount: coverageCounters.completed,
            returnedFeatureCount: coverageResource.returnedFeatureCount,
            acceptedFeatureCount: coverageResource.acceptedFeatureCount,
            pinCount: pinSourceStore.idsInOrder.length,
            dotCount: dotSourceStore.idsInOrder.length,
            labelCount: labelSourceStore.idsInOrder.length,
            mapSearchSurfaceResultsSourcesReady,
            terminalReason: coverageResource.terminalReason,
            resultRestaurantCount: restaurants.length,
          });
        }
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'lod_source_overlap_contract',
          searchMode,
          activeTab,
          readinessKey,
          preparedVisualCycleKey,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          markerKeyOverlapCount: lodOverlapMarkerKeys.length,
          visualIdentityOverlapCount: lodOverlapVisualIdentityKeys.length,
          ...(quietMeasuredLoopActive
            ? {}
            : {
                markerKeyOverlapSamples: lodOverlapMarkerKeys.slice(0, 8),
                visualIdentityOverlapSamples: lodOverlapVisualIdentityKeys.slice(0, 8),
              }),
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'lod_classification_contract',
          searchMode,
          activeTab,
          readinessKey,
          isViewportLodPublish,
          isMapMoving: projectionIsMapMoving,
          candidateVisualIdentityCount: projectedVisualFrame.candidateVisualIdentityKeys.size,
          classifiedVisualIdentityCount: lodClassifiedVisualIdentityKeys.size,
          dotVisualIdentityCount: visibleDemotedDotVisualIdentityKeys.size,
          residentDotVisualIdentityCount: dotVisualIdentityKeys.size,
          fullPinBudget: args.maxFullPins,
          pinVisualIdentityCount: pinVisualIdentityKeys.size,
          normalPinVisualIdentityCount,
          selectedPinVisualIdentityCount,
          selectedRestaurantId,
          promotedRestaurantsRenderAsPins:
            visibleSortedRestaurantMarkers.length === pinSourceStore.idsInOrder.length,
          nonPromotedRestaurantsRenderAsDots:
            visibleDotRestaurantMarkerFeatures.length === dotSourceStore.idsInOrder.length,
          allEligibleVisualIdentitiesClassified:
            lodClassifiedVisualIdentityKeys.size ===
            projectedVisualFrame.candidateVisualIdentityKeys.size,
          unclassifiedCandidateVisualIdentityCount,
        });
        const promotedRoleFamiliesAreComplete =
          pinInteractionSourceStore.idsInOrder.length === pinSourceStore.idsInOrder.length &&
          labelSourceStore.idsInOrder.length ===
            pinSourceStore.idsInOrder.length * LABEL_CANDIDATES_IN_ORDER.length &&
          labelCollisionSourceStore.idsInOrder.length === pinSourceStore.idsInOrder.length;
        const promotedDotFeaturesAreResident = pinSourceStore.idsInOrder.every((markerKey) =>
          dotSourceStore.featureById.has(markerKey)
        );
        const promotedResidentDotsStartHidden = pinSourceStore.idsInOrder.every((markerKey) => {
          const dotFeature = dotSourceStore.featureById.get(markerKey);
          return dotFeature?.properties?.nativeDotOpacity === 0;
        });
        const demotedRoleFamiliesAreDotOnly = dotSourceStore.idsInOrder.every((markerKey) => {
          const isPromoted = pinSourceStore.featureById.has(markerKey);
          const dotFeature = dotSourceStore.featureById.get(markerKey);
          return isPromoted || dotFeature?.properties.nativeDotOpacity !== 0;
        });
        const eligibleCoverageFeatureCount =
          searchMode === 'shortcut' && coverageResource?.status === 'completed'
            ? coverageResource.acceptedFeatureCount
            : null;
        const projectedVisualFeatureCount = new Set([
          ...Array.from(pinVisualIdentityKeys),
          ...Array.from(dotVisualIdentityKeys),
        ]).size;
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_marker_visual_sources_contract',
          searchMode,
          activeTab,
          readinessKey,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          visibleDemotedDotCount: visibleDemotedDotVisualIdentityKeys.size,
          normalPinCount: normalPinVisualIdentityCount,
          selectedPinCount: selectedPinVisualIdentityCount,
          selectedRestaurantId,
          pinInteractionCount: pinInteractionSourceStore.idsInOrder.length,
          labelCount: labelSourceStore.idsInOrder.length,
          labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
          pinSourceMarkerKeyFingerprint: buildStableKeyFingerprint(pinSourceStore.idsInOrder),
          dotSourceMarkerKeyFingerprint: buildStableKeyFingerprint(dotSourceStore.idsInOrder),
          pinRankSignature: summarizeSourceStoreRank(pinSourceStore, buildMarkerKey),
          dotRankSignature: summarizeSourceStoreRank(dotSourceStore, buildMarkerKey),
          projectedVisualFeatureCount,
          eligibleCoverageFeatureCount,
          projectedVisualFeatureCountMatchesCoverage:
            eligibleCoverageFeatureCount == null ||
            eligibleCoverageFeatureCount === projectedVisualFeatureCount,
          pinDotMarkerKeyOverlapCount: lodOverlapMarkerKeys.length,
          pinDotVisualIdentityOverlapCount: lodOverlapVisualIdentityKeys.length,
          promotedDotFeaturesAreResident,
          promotedResidentDotsStartHidden,
          promotedRoleFamiliesAreComplete,
          demotedRoleFamiliesAreDotOnly,
          promotedPinInteractionCountMatchesPinCount:
            pinInteractionSourceStore.idsInOrder.length === pinSourceStore.idsInOrder.length,
          labelPerPinCandidateCount:
            pinSourceStore.idsInOrder.length > 0
              ? labelSourceStore.idsInOrder.length / pinSourceStore.idsInOrder.length
              : 0,
          hasPins: pinSourceStore.idsInOrder.length > 0,
          hasDots: dotSourceStore.idsInOrder.length > 0,
          hasPinLabels: labelSourceStore.idsInOrder.length >= pinSourceStore.idsInOrder.length,
          hasLabelCollisionSource:
            pinSourceStore.idsInOrder.length === 0 ||
            labelCollisionSourceStore.idsInOrder.length >= pinSourceStore.idsInOrder.length,
          nativeMapLabelCollisionPreserved:
            restaurantLabelStyle.textAllowOverlap === false &&
            restaurantLabelStyle.textIgnorePlacement === false &&
            restaurantLabelStyle.textOptional === false,
        });
      }
    }
    publishTelemetry(pinSourceStore.idsInOrder.length, dotSourceStore.idsInOrder.length);
  };

  const resetShortcutCoverageState = React.useCallback(() => {
    const activeResource = shortcutCoverageResourceRef.current;
    if (activeResource?.status === 'loading') {
      activeResource.abortController?.abort();
      shortcutCoverageCountersRef.current.aborted += 1;
    }
    shortcutCoverageSnapshotByRequestIdRef.current.clear();
    shortcutCoveragePendingSnapshotByRequestIdRef.current.clear();
    shortcutCoverageRankedRef.current = [];
    shortcutCoverageDotFeaturesRef.current = null;
    shortcutCoverageResourceRef.current = null;
    shortcutCoverageTerminalByRequestKeyRef.current.clear();
    shortcutCoverageFetchSeqRef.current += 1;
    shortcutCoverageLoadingRef.current = false;
    publishSourcesRef.current();
  }, []);

  const handleShortcutSearchCoverageSnapshot = React.useCallback(
    (snapshot: ShortcutCoverageSnapshot) => {
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
      publishSourcesRef.current();
    },
    []
  );

  const maybeFetchShortcutCoverage = React.useCallback(() => {
    const state = searchRuntimeBus.getState();
    const mountedResults = getSearchMountedResultsDataSnapshot().results;
    if (state.searchMode !== 'shortcut' || !mountedResults?.metadata?.searchRequestId) {
      return;
    }
    const searchRequestId = mountedResults.metadata.searchRequestId;
    let snapshot = shortcutCoverageSnapshotByRequestIdRef.current.get(searchRequestId) ?? null;
    if (!snapshot) {
      const pending = shortcutCoveragePendingSnapshotByRequestIdRef.current.get(searchRequestId);
      const bounds = viewportBoundsService.getBounds();
      if (pending && !bounds) {
        const activeTab = state.activeTab ?? null;
        const boundsKey = 'unavailable';
        const marketKey = mountedResults.metadata.marketKey ?? '';
        const entitiesKey = buildShortcutCoverageEntitiesKey(pending.entities);
        const requestKey = buildShortcutCoverageRequestKey({
          entitiesKey,
          activeTab,
          marketKey,
          boundsKey,
        });
        const activeResource = shortcutCoverageResourceRef.current;
        if (activeResource?.requestKey === requestKey && activeResource.status !== 'loading') {
          return;
        }
        const cachedTerminalResource =
          shortcutCoverageTerminalByRequestKeyRef.current.get(requestKey);
        if (cachedTerminalResource) {
          shortcutCoverageResourceRef.current = cachedTerminalResource;
          shortcutCoverageLoadingRef.current = false;
          publishSourcesRef.current();
          return;
        }
        if (activeResource?.status === 'loading') {
          activeResource.status = 'superseded';
          activeResource.terminalReason = 'resource_key_superseded';
          activeResource.abortController?.abort();
          shortcutCoverageCountersRef.current.superseded += 1;
          shortcutCoverageCountersRef.current.aborted += 1;
        }
        const terminalResource: ShortcutCoverageRequestResource = {
          requestKey,
          searchRequestId,
          boundsKey,
          activeTab,
          marketKey,
          entitiesKey,
          readinessKey: resolveMapSurfaceResultsLabelSourcesReadyKey(
            state,
            latestArgsRef.current.resultsPresentationAuthority,
            latestArgsRef.current.resultsPresentationSurfaceAuthority
          ),
          fetchReason: activeResource == null ? 'initial' : 'resource_changed',
          status: 'failed',
          seq: ++shortcutCoverageFetchSeqRef.current,
          abortController: null,
          returnedFeatureCount: 0,
          acceptedFeatureCount: 0,
          terminalReason: 'viewport_bounds_unavailable',
        };
        shortcutCoverageResourceRef.current = terminalResource;
        shortcutCoverageTerminalByRequestKeyRef.current.set(requestKey, terminalResource);
        shortcutCoverageLoadingRef.current = false;
        shortcutCoverageDotFeaturesRef.current = null;
        shortcutCoverageRankedRef.current = [];
        shortcutCoverageCountersRef.current.completed += 1;
        publishSourcesRef.current();

        const latestSourceFrame = sourceFramePort.getSnapshot();
        const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(scenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'shortcut_coverage_request_lifecycle',
            stage: terminalResource.status,
            requestKey,
            searchRequestId,
            boundsKey,
            activeTab,
            marketKey,
            fetchReason: terminalResource.fetchReason,
            inFlightCount: 0,
            supersededCount: shortcutCoverageCountersRef.current.superseded,
            abortedCount: shortcutCoverageCountersRef.current.aborted,
            completedCount: shortcutCoverageCountersRef.current.completed,
            returnedFeatureCount: 0,
            acceptedFeatureCount: 0,
            pinCount: latestSourceFrame.pinSourceStore.idsInOrder.length,
            dotCount: latestSourceFrame.dotSourceStore.idsInOrder.length,
            labelCount: latestSourceFrame.labelSourceStore.idsInOrder.length,
            mapSearchSurfaceResultsSourcesReady:
              latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
            readinessKey: terminalResource.readinessKey,
            preparedTransactionId:
              latestArgsRef.current.resultsPresentationAuthority.getSnapshot()
                .resultsPresentationTransport.transactionId ?? null,
            terminalReason: terminalResource.terminalReason,
          });
        }
        return;
      }
      if (pending && bounds) {
        snapshot = { bounds, entities: pending.entities };
        shortcutCoverageSnapshotByRequestIdRef.current.set(searchRequestId, snapshot);
        shortcutCoveragePendingSnapshotByRequestIdRef.current.delete(searchRequestId);
      }
    }
    if (!snapshot) {
      return;
    }
    const includeTopDish = state.activeTab === 'dishes';
    const boundsKey = buildShortcutCoverageBoundsKey(snapshot.bounds);
    const marketKey = mountedResults.metadata.marketKey ?? '';
    const activeTab = state.activeTab ?? null;
    const entitiesKey = buildShortcutCoverageEntitiesKey(snapshot.entities);
    const requestKey = buildShortcutCoverageRequestKey({
      entitiesKey,
      activeTab,
      marketKey,
      boundsKey,
    });
    const activeResource = shortcutCoverageResourceRef.current;
    if (activeResource?.requestKey === requestKey && activeResource.status === 'loading') {
      return;
    }
    if (
      activeResource?.requestKey === requestKey &&
      activeResource.status !== 'idle' &&
      activeResource.status !== 'loading'
    ) {
      return;
    }
    const cachedTerminalResource = shortcutCoverageTerminalByRequestKeyRef.current.get(requestKey);
    if (cachedTerminalResource) {
      shortcutCoverageResourceRef.current = cachedTerminalResource;
      shortcutCoverageLoadingRef.current = false;
      publishTelemetry(
        sourceFramePort.getSnapshot().pinSourceStore.idsInOrder.length,
        sourceFramePort.getSnapshot().dotSourceStore.idsInOrder.length
      );
      return;
    }
    if (activeResource?.status === 'loading') {
      activeResource.status = 'superseded';
      activeResource.terminalReason = 'resource_key_superseded';
      activeResource.abortController?.abort();
      shortcutCoverageCountersRef.current.superseded += 1;
      shortcutCoverageCountersRef.current.aborted += 1;
    }
    const fetchSeq = ++shortcutCoverageFetchSeqRef.current;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const nextResource: ShortcutCoverageRequestResource = {
      requestKey,
      searchRequestId,
      boundsKey,
      activeTab,
      marketKey,
      entitiesKey,
      readinessKey: resolveMapSurfaceResultsLabelSourcesReadyKey(
        state,
        latestArgsRef.current.resultsPresentationAuthority,
        latestArgsRef.current.resultsPresentationSurfaceAuthority
      ),
      fetchReason: activeResource == null ? 'initial' : 'resource_changed',
      status: 'loading',
      seq: fetchSeq,
      abortController,
      returnedFeatureCount: 0,
      acceptedFeatureCount: 0,
      terminalReason: null,
    };
    shortcutCoverageResourceRef.current = nextResource;
    shortcutCoverageCountersRef.current.started += 1;
    shortcutCoverageLoadingRef.current = true;
    publishTelemetry(
      sourceFramePort.getSnapshot().pinSourceStore.idsInOrder.length,
      sourceFramePort.getSnapshot().dotSourceStore.idsInOrder.length
    );
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'shortcut_coverage_request_lifecycle',
        stage: 'started',
        requestKey,
        searchRequestId,
        boundsKey,
        activeTab,
        marketKey,
        fetchReason: nextResource.fetchReason,
        inFlightCount: 1,
        supersededCount: shortcutCoverageCountersRef.current.superseded,
        abortedCount: shortcutCoverageCountersRef.current.aborted,
        completedCount: shortcutCoverageCountersRef.current.completed,
        returnedFeatureCount: 0,
        acceptedFeatureCount: 0,
        pinCount: sourceFramePort.getSnapshot().pinSourceStore.idsInOrder.length,
        dotCount: sourceFramePort.getSnapshot().dotSourceStore.idsInOrder.length,
        labelCount: sourceFramePort.getSnapshot().labelSourceStore.idsInOrder.length,
        mapSearchSurfaceResultsSourcesReady:
          sourceFramePort.getSnapshot().mapSearchSurfaceResultsSourcesReady,
        readinessKey: nextResource.readinessKey,
        preparedTransactionId:
          latestArgsRef.current.resultsPresentationAuthority.getSnapshot()
            .resultsPresentationTransport.transactionId ?? null,
      });
    }
    void searchService
      .shortcutCoverage(
        {
          entities: snapshot.entities,
          bounds: snapshot.bounds,
          includeTopDish,
          marketKey: mountedResults.metadata.marketKey,
        },
        {
          signal: abortController?.signal,
        }
      )
      .then((collection) => {
        if (
          fetchSeq !== shortcutCoverageFetchSeqRef.current ||
          shortcutCoverageResourceRef.current?.requestKey !== requestKey
        ) {
          return;
        }
        shortcutCoverageLoadingRef.current = false;
        const returnedFeatureCount = collection?.features?.length ?? 0;
        const features = (collection?.features ?? [])
          .map((feature) => {
            const properties =
              feature?.properties && typeof feature.properties === 'object'
                ? (feature.properties as Record<string, unknown>)
                : {};
            const restaurantId = (properties.restaurantId as string) ?? '';
            const restaurantName = (properties.restaurantName as string) ?? '';
            const rank = properties.rank;
            if (!restaurantId || !restaurantName || typeof rank !== 'number') {
              return null;
            }
            const craveScore =
              typeof properties.craveScore === 'number' && Number.isFinite(properties.craveScore)
                ? (properties.craveScore as number)
                : null;
            if (craveScore === null) {
              return null;
            }
            const restaurantCraveScore =
              typeof properties.restaurantCraveScore === 'number' &&
              Number.isFinite(properties.restaurantCraveScore)
                ? (properties.restaurantCraveScore as number)
                : null;
            const topDishCraveScore =
              includeTopDish &&
              typeof properties.topDishCraveScore === 'number' &&
              Number.isFinite(properties.topDishCraveScore)
                ? (properties.topDishCraveScore as number)
                : null;
            const connectionId =
              typeof properties.connectionId === 'string'
                ? (properties.connectionId as string)
                : null;
            if (includeTopDish && (topDishCraveScore === null || !connectionId)) {
              return null;
            }
            const featureResult = {
              ...feature,
              id: feature.id ?? restaurantId,
              properties: {
                restaurantId,
                restaurantName,
                craveScore,
                scoreDelta7d:
                  typeof properties.scoreDelta7d === 'number'
                    ? (properties.scoreDelta7d as number)
                    : null,
                rank,
                restaurantCraveScore,
                pinColor: latestArgsRef.current.getCraveScoreColorFromScore(
                  includeTopDish ? topDishCraveScore : craveScore
                ),
                ...(includeTopDish
                  ? {
                      isDishPin: true,
                      dishName:
                        typeof properties.dishName === 'string'
                          ? (properties.dishName as string)
                          : undefined,
                      connectionId,
                      topDishCraveScore,
                    }
                  : null),
              },
            } as Feature<Point, RestaurantFeatureProperties>;
            return featureResult;
          })
          .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;
        const acceptedFeatureCount = features.length;
        const terminalReason =
          acceptedFeatureCount > 0
            ? 'accepted_features'
            : returnedFeatureCount > 0
              ? 'validated_empty_after_rejecting_invalid_features'
              : 'validated_empty_coverage';
        const terminalResource: ShortcutCoverageRequestResource = {
          ...nextResource,
          status: acceptedFeatureCount > 0 ? 'completed' : 'empty',
          abortController: null,
          returnedFeatureCount,
          acceptedFeatureCount,
          terminalReason,
        };
        shortcutCoverageResourceRef.current = terminalResource;
        shortcutCoverageTerminalByRequestKeyRef.current.set(requestKey, terminalResource);
        shortcutCoverageCountersRef.current.completed += 1;
        shortcutCoverageDotFeaturesRef.current = {
          type: 'FeatureCollection',
          features,
        };
        const anchored = buildAnchoredShortcutCoverage({
          collection: shortcutCoverageDotFeaturesRef.current,
          restaurantsById: restaurantsByIdRef.current,
          anchor: latestArgsRef.current.resolveRestaurantLocationSelectionAnchor(),
          pickPreferredRestaurantMapLocation:
            latestArgsRef.current.pickPreferredRestaurantMapLocation,
        });
        shortcutCoverageRankedRef.current = buildRankedShortcutCoverageFeatures(anchored);
        publishSourcesRef.current();
        const latestSourceFrame = sourceFramePort.getSnapshot();
        const latestScenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(latestScenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', latestScenarioConfig, {
            event: 'shortcut_coverage_request_lifecycle',
            stage: terminalResource.status,
            requestKey,
            searchRequestId,
            boundsKey,
            activeTab,
            marketKey,
            fetchReason: terminalResource.fetchReason,
            inFlightCount: 0,
            supersededCount: shortcutCoverageCountersRef.current.superseded,
            abortedCount: shortcutCoverageCountersRef.current.aborted,
            completedCount: shortcutCoverageCountersRef.current.completed,
            returnedFeatureCount,
            acceptedFeatureCount,
            pinCount: latestSourceFrame.pinSourceStore.idsInOrder.length,
            dotCount: latestSourceFrame.dotSourceStore.idsInOrder.length,
            labelCount: latestSourceFrame.labelSourceStore.idsInOrder.length,
            mapSearchSurfaceResultsSourcesReady:
              latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
            readinessKey: terminalResource.readinessKey,
            preparedTransactionId:
              latestArgsRef.current.resultsPresentationAuthority.getSnapshot()
                .resultsPresentationTransport.transactionId ?? null,
            terminalReason,
          });
        }
      })
      .catch((error) => {
        if (
          fetchSeq !== shortcutCoverageFetchSeqRef.current ||
          shortcutCoverageResourceRef.current?.requestKey !== requestKey
        ) {
          return;
        }
        const aborted = isAbortLikeError(error) || abortController?.signal.aborted === true;
        shortcutCoverageLoadingRef.current = false;
        shortcutCoverageDotFeaturesRef.current = null;
        shortcutCoverageRankedRef.current = [];
        const terminalResource: ShortcutCoverageRequestResource = {
          ...nextResource,
          status: aborted ? 'aborted' : 'failed',
          abortController: null,
          returnedFeatureCount: 0,
          acceptedFeatureCount: 0,
          terminalReason: aborted ? 'request_aborted' : 'request_failed',
        };
        shortcutCoverageResourceRef.current = terminalResource;
        shortcutCoverageTerminalByRequestKeyRef.current.set(requestKey, terminalResource);
        if (aborted) {
          shortcutCoverageCountersRef.current.aborted += 1;
        } else {
          shortcutCoverageCountersRef.current.completed += 1;
          logger.warn('Shortcut coverage dot fetch failed', {
            message: error instanceof Error ? error.message : 'unknown error',
            requestId: searchRequestId,
          });
        }
        publishSourcesRef.current();
        const latestSourceFrame = sourceFramePort.getSnapshot();
        const latestScenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(latestScenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', latestScenarioConfig, {
            event: 'shortcut_coverage_request_lifecycle',
            stage: terminalResource.status,
            requestKey,
            searchRequestId,
            boundsKey,
            activeTab,
            marketKey,
            fetchReason: terminalResource.fetchReason,
            inFlightCount: 0,
            supersededCount: shortcutCoverageCountersRef.current.superseded,
            abortedCount: shortcutCoverageCountersRef.current.aborted,
            completedCount: shortcutCoverageCountersRef.current.completed,
            returnedFeatureCount: 0,
            acceptedFeatureCount: 0,
            pinCount: latestSourceFrame.pinSourceStore.idsInOrder.length,
            dotCount: latestSourceFrame.dotSourceStore.idsInOrder.length,
            labelCount: latestSourceFrame.labelSourceStore.idsInOrder.length,
            mapSearchSurfaceResultsSourcesReady:
              latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
            readinessKey: terminalResource.readinessKey,
            preparedTransactionId:
              latestArgsRef.current.resultsPresentationAuthority.getSnapshot()
                .resultsPresentationTransport.transactionId ?? null,
            terminalReason: terminalResource.terminalReason,
          });
        }
      });
  }, [publishTelemetry, searchRuntimeBus, sourceFramePort, viewportBoundsService]);

  React.useEffect(() => {
    const publishAndFetch = () => {
      publishSourcesRef.current();
      maybeFetchShortcutCoverage();
    };
    publishAndFetch();
    const unsubscribeBus = searchRuntimeBus.subscribe(
      publishAndFetch,
      ['searchMode', 'activeTab', 'submittedQuery'] as const,
      'map_source_controller_direct_state'
    );
    const unsubscribeMountedResults = subscribeSearchMountedResultsDataSnapshot(publishAndFetch, {
      notifyMode: 'deferred',
    });
    const unsubscribeSurfaceTransaction = resultsPresentationSurfaceAuthority.subscribe(
      publishAndFetch,
      ['searchSurfaceResultsTransactionKey', 'resultsHydrationKey', 'resultsRequestKey'] as const,
      'map_source_controller_surface_transaction'
    );
    const unsubscribeRedrawTransaction = getSearchSurfaceRuntime().subscribeSelector(
      (snapshot) => snapshot.redrawTransaction?.id ?? null,
      publishAndFetch
    );
    // GRANULAR LOD (native-owned, Phase 2): the native projector now applies the promotion
    // decision per camera frame and crossfades the pins that changed role directly (no JS
    // round-trip, no whole-frame republish). So JS no longer re-publishes on camera ticks for
    // LOD — that path is gone. JS publishes the resident sources only on DATA changes; native
    // owns promote/demote during pan/zoom.
    const unsubscribeViewport = viewportBoundsService.subscribe(() => {
      // LOD promote/demote is native-owned now (driveNativeLod) — JS does NOT publish sources
      // on camera ticks. The viewport tick only drives shortcut-coverage fetching (a data
      // concern, not LOD). (The motion-pressure admission / projection-token machinery that
      // used to gate the LOD publish is now dead and removed in Phase 3.)
      maybeFetchShortcutCoverage();
    });
    return () => {
      unsubscribeBus();
      unsubscribeMountedResults();
      unsubscribeSurfaceTransaction();
      unsubscribeRedrawTransaction();
      unsubscribeViewport();
    };
  }, [
    maybeFetchShortcutCoverage,
    resultsPresentationSurfaceAuthority,
    searchRuntimeBus,
    sourceFramePort,
    viewportBoundsService,
  ]);

  React.useEffect(() => {
    publishSourcesRef.current();
  }, [isMapMoving, highlightedRestaurantId, restaurantOnlyId]);

  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const secondaryTextSize = LABEL_TEXT_SIZE * 0.85;
    const nativeHighlightedExpression = [
      '==',
      ['coalesce', ['feature-state', 'nativeHighlighted'], ['get', 'nativeHighlighted'], 0],
      1,
    ] as const;
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
      textColor: ['case', nativeHighlightedExpression, ACTIVE_TAB_COLOR_DARK, '#374151'],
      textHaloColor: 'rgba(255, 255, 255, 0.9)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
      symbolZOrder: 'viewport-y',
    };
  }, []);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      lastMarkerPressTargetRef.current = {
        restaurantId,
        coordinate: pressedCoordinate ?? null,
      };
      latestArgsRef.current.profileCommandPort.openProfileFromMarker({
        restaurantId,
        restaurantName: shortcutCoverageDotFeaturesRef.current?.features.find(
          (feature) => feature.properties.restaurantId === restaurantId
        )?.properties.restaurantName,
        restaurant: restaurantsByIdRef.current.get(restaurantId),
        pressedCoordinate,
      });
    },
    []
  );

  return {
    restaurantLabelStyle,
    buildMarkerKey,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    handleMarkerPress,
  };
};
