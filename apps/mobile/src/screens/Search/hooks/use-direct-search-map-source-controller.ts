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
import {
  buildSearchMapVisualIdentityKey,
  normalizeSearchMapVisualFeatureIdentity,
  type SearchMapVisualIdentityKey,
} from '../utils/search-map-visual-identity';
import { buildMarkerCatalogReadModel } from '../runtime/map/map-read-model-builder';
import {
  resolveCoverageCacheDecision,
  type CoverageRequestStatus,
} from '../runtime/map/coverage-cache-policy';
import { type MapMotionPressureController } from '../runtime/map/map-motion-pressure';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { resolveOverlapRegion } from '../utils/overlap-region';
import { requestOverlapAutoZoom } from '../runtime/map/overlap-auto-zoom-bridge';
import {
  activeRankBadgeImageId,
  dotBucketImageId,
  rankBadgeImageId,
} from '../../../utils/quality-color';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ResultsPresentationAuthority } from '../runtime/shared/results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import { getSearchSurfaceRuntime } from '../runtime/surface/search-surface-runtime';
import {
  getSearchMountedResultsDataSnapshot,
  getSeededMarkerRestaurants,
  subscribeSearchMountedResultsDataSnapshot,
} from '../runtime/shared/search-mounted-results-data-store';
import { reportSearchFlowContractViolation } from '../runtime/shared/search-flow-contracts';
import type { ResolvedRestaurantMapLocation } from '../runtime/map/restaurant-location-selection';
import {
  type SearchMapCandidateCatalog,
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

const buildLodPinnedVisualKey = (
  meta: ReadonlyArray<{ markerKey: string; lodZ: number }>
): string => buildStableKeyFingerprint(meta.map(({ markerKey, lodZ }) => `${markerKey}:${lodZ}`));

const isMapMotionPressureMoving = (
  mapMotionPressureController: MapMotionPressureController
): boolean => {
  const phase = mapMotionPressureController.getState().phase;
  return phase === 'gesture' || phase === 'inertia';
};

// Owned by the coverage-cache policy module (the pure decision core the cache-hit paths in
// maybeFetchShortcutCoverage route through) — one source of truth for the status vocabulary.
type ShortcutCoverageRequestStatus = CoverageRequestStatus;

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

// Shared coverage-feature mapping — the ONE place that turns a raw shortcut-coverage FeatureCollection into
// the validated dot features. Used by BOTH the active-tab fetch and the sibling-tab prefetch, so the two tabs'
// coverage is built identically (zero-network toggle relies on the prefetched sibling being byte-identical to
// what a live fetch would have produced).
const mapShortcutCoverageFeatures = (
  collection: FeatureCollection<Point> | null | undefined,
  includeTopDish: boolean,
  getPinColor: (score: number | null | undefined) => string
): Array<Feature<Point, RestaurantFeatureProperties>> =>
  (collection?.features ?? [])
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
      // High-precision percentile_rank from the coverage API — MUST be carried through (the candidate dedup
      // keeps the higher-priority coverage feature over main_results, so without this a restaurant in both
      // ends up with craveScoreExact undefined and sorts last instead of by its true score).
      const craveScoreExact =
        typeof properties.craveScoreExact === 'number' &&
        Number.isFinite(properties.craveScoreExact)
          ? (properties.craveScoreExact as number)
          : null;
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
        typeof properties.connectionId === 'string' ? (properties.connectionId as string) : null;
      if (includeTopDish && (topDishCraveScore === null || !connectionId)) {
        return null;
      }
      return {
        ...feature,
        id: feature.id ?? restaurantId,
        properties: {
          restaurantId,
          restaurantName,
          craveScore,
          craveScoreExact,
          rising: typeof properties.rising === 'number' ? (properties.rising as number) : null,
          rank,
          restaurantCraveScore,
          pinColor: getPinColor(includeTopDish ? topDishCraveScore : craveScore),
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
    })
    .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;

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
    // RANK by the HIGH-PRECISION craveScoreExact (percentile_rank) DESC — NOT VISUAL_SOURCE_PRIORITY (that is
    // DEDUP-only; see shouldReplaceVisualCandidate) and NOT the rounded display craveScore. This makes the pin
    // badge == the results-list position (the list follows the API's percentile_rank order = the same key) and
    // stops a tapped ('selected') marker from renumbering to rank 1. Missing exact sorts last. Tie-breaks:
    // display craveScore DESC, then a stable restaurantId, then markerKey — so map + list never disagree.
    const leftExact =
      typeof left.feature.properties.craveScoreExact === 'number'
        ? left.feature.properties.craveScoreExact
        : -Infinity;
    const rightExact =
      typeof right.feature.properties.craveScoreExact === 'number'
        ? right.feature.properties.craveScoreExact
        : -Infinity;
    if (leftExact !== rightExact) {
      return rightExact - leftExact;
    }
    const leftDisplay =
      typeof left.feature.properties.craveScore === 'number'
        ? left.feature.properties.craveScore
        : -Infinity;
    const rightDisplay =
      typeof right.feature.properties.craveScore === 'number'
        ? right.feature.properties.craveScore
        : -Infinity;
    if (leftDisplay !== rightDisplay) {
      return rightDisplay - leftDisplay;
    }
    return (
      left.feature.properties.restaurantId.localeCompare(right.feature.properties.restaurantId) ||
      left.markerKey.localeCompare(right.markerKey)
    );
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
  // Labels + collision are ON-SCREEN-GATED (native owns promotion; JS builds labels only for the
  // markers native reports on-screen). The structural invariant is per-marker: every labeled marker
  // emits exactly LABEL_CANDIDATES_IN_ORDER.length name-labels plus 1 collision obstacle. Assert
  // that relationship directly — keyed off the actual labeled-marker (collision) count — instead of
  // the JS promoted-pin count, which is always 0 under the one-decider (native owns promotion), so
  // the old `nativeLodOpacity > 0` count expected zero labels and tripped on every on-screen frame.
  const labeledMarkerCount = labelCollisionSourceStore.idsInOrder.length;
  const expectedLabelCount = labeledMarkerCount * LABEL_CANDIDATES_IN_ORDER.length;
  const expectedCollisionCount = labeledMarkerCount;

  if (
    duplicatePinVisualIdentityKeys.length === 0 &&
    labelSourceStore.idsInOrder.length === expectedLabelCount
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
    mountedResultsSnapshot.resultsIdentityKey ??
    resultsPresentationSurfaceAuthority.getSnapshot().resultsIdentityKey ??
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
  badgeImageId,
}: {
  baseDiffKey: string;
  markerKey: string;
  nativeLodZ: number | null | undefined;
  // The baked badge sprite (encodes the unified rank). MUST be in the diffKey so a rank/badge change
  // republishes the resident pin feature — otherwise the incremental builder (keyed on baseDiffKey +
  // markerKey + lodZ) skips it and the OLD badge number persists on screen (the stale-badge divergence
  // the harness caught as badgeNeqCat>0). Badge is stable per marker within a search, so this adds no
  // per-frame churn — it only republishes when the number genuinely changes.
  badgeImageId: string | null | undefined;
}): string =>
  `${baseDiffKey}|pin|marker:${markerKey}|lodZ:${
    typeof nativeLodZ === 'number' && Number.isFinite(nativeLodZ) ? nativeLodZ : ''
  }|badge:${badgeImageId ?? ''}`;

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
  markerKey: string,
  // The promotion seed (1 = promoted pin → obstacle, 0 = demoted dot → no obstacle) that the obstacle
  // layer filters on. Passed in from the LIVE native promoted set so a pin promoted mid-zoom gets its
  // obstacle (labels yield) instead of the stale publish-time seed (#16). Falls back to the feature's
  // baked value when native hasn't reported a promoted set yet.
  promotedNativeLodOpacity: number
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
      nativeLodOpacity: promotedNativeLodOpacity,
    } as RestaurantFeatureProperties,
  }) satisfies Feature<Point, RestaurantFeatureProperties>;

const buildDirectLabelStores = ({
  pinSourceStore,
  previousLabelSourceStore,
  previousLabelCollisionSourceStore,
  onScreenMarkerKeys,
  promotedMarkerKeys,
}: {
  pinSourceStore: SearchMapSourceStore;
  previousLabelSourceStore: SearchMapSourceStore;
  previousLabelCollisionSourceStore: SearchMapSourceStore;
  // Native's on-screen marker set (getNativeVisibleMarkerKeys), or null when native has not
  // reported yet. Labels are built only for these keys (the set native promotes its top-N from).
  onScreenMarkerKeys: ReadonlySet<string> | null;
  // Native's LIVE promoted set — the collision obstacle is baked from THIS (not the publish-time pin
  // seed) so a pin promoted mid-zoom gets its label-yielding obstacle (#16). Null pre-projection → fall
  // back to each feature's baked seed.
  promotedMarkerKeys: ReadonlySet<string> | null;
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
    // Labels are ON-SCREEN-GATED. Under the one-decider model JS bakes EVERY pin demoted
    // (nativeLodOpacity 0) and native owns promotion, so the old `pinOpacity <= 0.001` gate skipped
    // EVERY marker → zero labels ever (the no-labels bug). Native owns the on-screen set, so JS
    // builds name-labels only for the markers native reports on-screen — the exact set its promoted
    // top-N is drawn from. Native's collision + the pin transition then show the promoted pins'
    // labels (label opacity rides the pin's crossfade) and fade/cull the rest. Bounded by the
    // viewport, NOT 4×all-candidates. When native has not reported a visible set yet (null,
    // pre-projection at first reveal) we build all: non-promoted labels fade to 0 with their demoted
    // pin so nothing extra shows, and the next publish (post auto-zoom projection) trims to on-screen.
    if (onScreenMarkerKeys != null && !onScreenMarkerKeys.has(markerKey)) {
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
    // COLLISION obstacle: ON-SCREEN-GATED, same set as the labels above (keeps the structural invariant
    // labelCount == labelCollisionCount × LABEL_CANDIDATES). The v5 obstacle for markers promoted at
    // zoomed/panned viewports is reseeded NATIVELY from the catalog coordinate (applyV5ObstacleReseed), so JS
    // collision residency does NOT need to cover off-screen candidates — building it for all of them only
    // broke this invariant (labelCount 1868 vs expected 1888) without helping FM#3.
    const promotedNativeLodOpacity =
      promotedMarkerKeys != null
        ? promotedMarkerKeys.has(markerKey)
          ? 1
          : 0
        : (feature.properties.nativeLodOpacity ?? 0);
    const collisionFeature = buildStableCollisionFeature(
      feature,
      markerKey,
      promotedNativeLodOpacity
    );
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
  // Memoizes the built candidate catalog by key so an unchanged catalog keeps a STABLE object reference
  // across projections (no rebuild, no reference churn) — the catalog now rides the source-frame snapshot
  // and is deduped there on `.key`, so this is a pure build cache, not a publish gate.
  const lastCandidateCatalogRef = React.useRef<SearchMapCandidateCatalog | null>(null);
  const shortcutCoverageSnapshotByRequestIdRef = React.useRef<
    Map<string, { bounds: MapBounds; entities: StructuredSearchRequest['entities'] }>
  >(new Map());
  const shortcutCoveragePendingSnapshotByRequestIdRef = React.useRef<
    Map<string, { entities: StructuredSearchRequest['entities'] }>
  >(new Map());
  const shortcutCoverageDotFeaturesRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);
  const shortcutCoverageResourceRef = React.useRef<ShortcutCoverageRequestResource | null>(null);
  const shortcutCoverageTerminalByRequestKeyRef = React.useRef<
    Map<string, ShortcutCoverageRequestResource>
  >(new Map());
  // Coverage FEATURES cache — the sibling of shortcutCoverageTerminalByRequestKeyRef, keyed identically by
  // requestKey (which includes activeTab). The terminal cache stored ONLY resource metadata (counts/status);
  // the actual dot FeatureCollection lived solely in shortcutCoverageDotFeaturesRef, written only on a fresh
  // network fetch. So a cache-hit toggle-back restored the resource but left the features ref on the PRIOR
  // tab's coverage — the confirmed stale-236-on-restaurants (and null → promoted=0 pin-disappear) root.
  // Caching the features here lets a cache-hit fully restore the coverage in-memory: instant, correct toggle-back.
  const shortcutCoverageFeaturesByRequestKeyRef = React.useRef<
    Map<string, FeatureCollection<Point, RestaurantFeatureProperties>>
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
  // Zero-network toggle: the sibling tab's coverage is prefetched at search commit and cached by requestKey.
  // This set holds sibling requestKeys currently in-flight so we never double-fire the prefetch.
  const siblingCoveragePrefetchInFlightRef = React.useRef<Set<string>>(new Set());
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

  const publishSourcesRef = React.useRef<() => void>(() => {});
  publishSourcesRef.current = () => {
    const __t1dbgProjStart = performance.now();
    if (__DEV__) console.log(`[T1DBG] projection:start t=${__t1dbgProjStart.toFixed(1)}`);
    try {
      publishSourcesInnerRef.current();
    } finally {
      if (__DEV__) {
        const dur = performance.now() - __t1dbgProjStart;
        if (dur > 8) console.log(`[T1DBG] projection:end dur=${dur.toFixed(1)}`);
      }
    }
  };
  const publishSourcesInnerRef = React.useRef<() => void>(() => {});
  publishSourcesInnerRef.current = () => {
    const state = searchRuntimeBus.getState();
    const args = latestArgsRef.current;
    const projectionIsMapMoving =
      args.isMapMoving || isMapMotionPressureMoving(args.mapMotionPressureController);
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    const committedMapSourceFrameKey = resolveCommittedMapSourceFrameKey(state);
    const selectedRestaurantId = args.highlightedRestaurantId;
    const hasCommittedResultState =
      state.searchMode != null && mountedResultsSnapshot.resultsRequestKey != null;
    // Seeded marker source: when a profile opens without committed results (e.g. an autocomplete
    // suggestion tap), the hydrated restaurant publishes itself here so the map can place its pin.
    // It is only consulted when there are no committed restaurants — committed results always win.
    const seededMarkerRestaurants = getSeededMarkerRestaurants();
    const shouldProjectResultSources =
      hasCommittedResultState ||
      args.restaurantOnlyId != null ||
      selectedRestaurantId != null ||
      seededMarkerRestaurants != null;
    const mountedResults = mountedResultsSnapshot.results;
    // Pure-seed case has no committed metadata, so `searchRequestId` resolves to null and the
    // precomputed-catalog branch stays skipped — `buildMarkerCatalogReadModel` runs on the seed.
    const searchRequestId = shouldProjectResultSources
      ? (mountedResults?.metadata?.searchRequestId ?? null)
      : null;
    const committedRestaurants = shouldProjectResultSources
      ? (mountedResults?.restaurants ?? EMPTY_RESTAURANTS)
      : EMPTY_RESTAURANTS;
    // A pure seed (a profile opened with no committed results) is always a single RESTAURANT pin —
    // project it on the restaurant axis regardless of the stale results tab (which defaults to dishes
    // and would otherwise route the catalog down the empty-dishes branch, yielding zero pins).
    const isSeededRestaurantProjection =
      committedRestaurants.length === 0 && seededMarkerRestaurants != null;
    const restaurants = isSeededRestaurantProjection
      ? seededMarkerRestaurants
      : committedRestaurants;
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
    if (preparedVisualCycleKey != null && String(preparedVisualCycleKey).includes('toggle')) {
      logger.info('[SRCPROJ] entry', {
        pvck: preparedVisualCycleKey,
        contentVis: resultsPresentationSnapshot.resultsPresentation.contentVisibility,
        exit: isResultsExitActive,
        enter: isPreparedResultsEnterActive,
        live: isSearchVisualProjectionLive,
        mode: searchMode,
        proj: shouldProjectResultSources,
        sri: searchRequestId,
      });
    }
    if (!isSearchVisualProjectionLive) {
      markerCandidatesRef.current = [];
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
    // Coverage is the in-viewport DOTS source (restored), so the reveal waits for it again (normal
    // gate). Earlier this was force-true while coverage was being dropped; forcing it true skipped the
    // coverage-ready handshake and left the visual-source lifecycle from reaching .visible → native
    // promotion never ran (all dots, no pins at reveal). With coverage back + viewport-bounded, the
    // standard "coverage resolved" gate restores the normal reveal → promotion flow.
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
      if (String(readinessKey).includes('toggle')) {
        logger.info('[SRCPROJ] early=shortcut-noSri', {
          rk: readinessKey,
          pvck: preparedVisualCycleKey,
          // [SRINULL] attribution: which link is null? (metadata vs committed-state vs mode)
          mode: state.searchMode,
          rrk: mountedResultsSnapshot.resultsRequestKey,
          committed: hasCommittedResultState,
          restCount: mountedResults?.restaurants?.length ?? -1,
          metaSri: mountedResults?.metadata?.searchRequestId ?? 'nil',
          shouldProject: shouldProjectResultSources,
        });
      }
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
      if (String(readinessKey).includes('toggle')) {
        logger.info('[SRCPROJ] early=shortcut-covNotReady', {
          rk: readinessKey,
          cov: coverageResource?.status ?? 'loading',
        });
      }
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
    // R1a-2: marker projections are precomputed PER-TAB at response commit. Resolve the
    // CURRENT tab's entry (results-key-guarded). The rank/restaurantsById lookups are
    // tab-independent (both derive from restaurants[]), so any matching entry serves them
    // even when the current tab's entry is null (axis genuinely absent from the response).
    const resolvePrecomputedMarkerProjectionForTab = (tab: 'dishes' | 'restaurants') => {
      const entry = mountedResultsSnapshot.precomputedMarkerProjectionByTab?.[tab] ?? null;
      return entry != null && entry.resultsKey === searchRequestId ? entry : null;
    };
    const activeTabPrecomputedMarkerProjection =
      resolvePrecomputedMarkerProjectionForTab(activeTab);
    const anyPrecomputedMarkerProjectionForResults =
      activeTabPrecomputedMarkerProjection ??
      resolvePrecomputedMarkerProjectionForTab(activeTab === 'dishes' ? 'restaurants' : 'dishes');
    const canonicalRestaurantRankById =
      anyPrecomputedMarkerProjectionForResults != null
        ? anyPrecomputedMarkerProjectionForResults.canonicalRestaurantRankById
        : new Map(
            restaurants
              .filter((restaurant) => typeof restaurant.rank === 'number')
              .map((restaurant) => [restaurant.restaurantId, restaurant.rank as number])
          );
    const restaurantsById =
      anyPrecomputedMarkerProjectionForResults != null
        ? anyPrecomputedMarkerProjectionForResults.restaurantsById
        : new Map(restaurants.map((restaurant) => [restaurant.restaurantId, restaurant]));
    restaurantsByIdRef.current = restaurantsById;
    restaurantsRef.current = restaurants;
    // R1a SINGLE-AUTHORITY RULE (plans/search-flow-plan.md §D6): for committed results, the
    // store's precomputed marker catalog (buildMarkerCatalogReadModel run ONCE at response
    // commit, same computation the cards' rank order derives from) is THE marker-catalog
    // authority. The in-controller buildMarkerCatalogReadModel below is a FALLBACK only for
    // inputs the store cannot precompute: no committed results (seeded single-restaurant
    // profile pin), restaurantOnly / selected-pin forced inclusion (selection changes the
    // catalog itself — all-locations render + rankless-reveal rank-1), a transient
    // results-key mismatch while a new commit is in flight, or a null tab entry (the response
    // genuinely lacks that axis — silent legitimate fallback). Any OTHER fallback firing while
    // the CURRENT tab's precomputed projection exists for the current results identity is a
    // double-compute — reported as a dev contract violation below, not silent. R1a-2
    // precomputes BOTH tabs at response commit, so a plain tab toggle must never fire it.
    // NOTE: the downstream collectSearchMapVisualCandidates pass is NOT a second catalog
    // authority — it is the coverage merge (shortcut_coverage + main_results cross-source
    // dedup + unified re-rank) and consumes this catalog's features as its main_results input.
    const hasPrecomputedMarkerCatalogForResults = activeTabPrecomputedMarkerProjection != null;
    const canUsePrecomputedMarkerCatalog =
      hasPrecomputedMarkerCatalogForResults &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null;
    if (
      !canUsePrecomputedMarkerCatalog &&
      hasPrecomputedMarkerCatalogForResults &&
      effectiveRestaurantOnlyId == null &&
      selectedRestaurantId == null &&
      !isSeededRestaurantProjection
    ) {
      // The CURRENT tab's precomputed projection exists for THIS results identity, yet we are
      // about to re-rank fresh. Post-R1a-2 (both tabs precomputed at response commit) this is
      // structurally unreachable on the happy path and on tab toggles — any firing is a new
      // double-compute regression.
      reportSearchFlowContractViolation('marker_catalog_recomputed_with_precomputed_present', {
        searchRequestId,
        activeTab,
        precomputedMarkerActiveTab: activeTabPrecomputedMarkerProjection?.activeTab ?? null,
        precomputedMarkerResultsKey: activeTabPrecomputedMarkerProjection?.resultsKey ?? null,
        precomputedCatalogCount: activeTabPrecomputedMarkerProjection?.catalog.length ?? 0,
        searchMode,
      });
    }
    const markerCatalogReadModel =
      canUsePrecomputedMarkerCatalog && activeTabPrecomputedMarkerProjection != null
        ? {
            catalog: activeTabPrecomputedMarkerProjection.catalog,
            primaryCount: activeTabPrecomputedMarkerProjection.primaryCount,
          }
        : buildMarkerCatalogReadModel({
            activeTab: isSeededRestaurantProjection ? 'restaurants' : activeTab,
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
    // #16: include the LIVE native promoted set in the reuse key so a promotion change (native LOD during
    // a zoom) MISSES the prepared-frame cache on the next publish (the settle republish) and does a full
    // rebuild — which re-bakes the label-collision obstacle from the current promoted set so labels yield
    // to mid-zoom-promoted pins. Without this the cache replays the stale obstacle (settle covered spikes).
    const nativePromotedReuseKey = buildStableKeyFingerprint(
      [...(sourceFramePort.getNativeVisibleMarkerKeys()?.nativePromotedKeys ?? [])].sort()
    );
    const preparedFrameFingerprint = buildSourceFrameDataReuseKey({
      activeTab,
      bounds: currentBounds,
      labelDerivedSourceIdentityKey: [
        markerCatalogReadModel.primaryCount.toString(36),
        coverageResource?.requestKey ?? 'coverage:none',
        coverageResource?.status ?? 'coverage:idle',
        nativePromotedReuseKey,
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
      // REVEAL RE-KEY FIX (map-LOD-v6, "second settle hangs"): commitResidentSourceFrameSnapshot →
      // publishSnapshot DEDUPS on the source DATA (pins/dots/labels). A toggle reveal that lands on
      // UNCHANGED data — a net-zero rapid burst, or toggling back to an already-cached tab — is a
      // no-op for publishSnapshot, so the NEW transaction's readiness key never reaches the source
      // frame port. The reveal gate then blocks forever on `map_sources_not_ready` for a key that
      // was never published (reproduced: toggle-intent:10 stuck 80s+). publishVisualState is keyed on
      // the readiness fields, NOT the source data, so it always re-publishes ready:true for the
      // CURRENT readinessKey regardless of the data-level dedup — unblocking the reveal.
      sourceFramePort.publishVisualState({
        mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
      });
      if (String(readinessKey).includes('toggle')) {
        const portAfter = sourceFramePort.getSnapshot();
        logger.info('[SRCPROJ] cacheReveal', {
          rk: readinessKey,
          tab: activeTab,
          pins: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
          dots: nextCachedSnapshot.dotSourceStore.idsInOrder.length,
          didPublishFrame: didPublishSourceFrame,
          fp: preparedFrameFingerprint.slice(-24),
          pinInterComplete: pinInteractionSourcesComplete,
          portReady: portAfter.mapSearchSurfaceResultsSourcesReady,
        });
      }
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_source_frame_data_reuse_contract',
          transactionId: preparedVisualCycleKey,
          readinessKey,
          sourceFrameDataReused: true,
          sourceFrameDataRecomputed: false,
          didPublishSourceFrame,
          cachedPreparedSourceFrameReplay: true,
          didPublishReadinessState: true,
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
    // ejected from the source on pan. Promotion is viewport-gated downstream by NATIVE
    // (projectAndEmitOnScreenMarkers computes the on-screen top-N and — via the v5 engine decide it
    // runs — flips those to full pins), so only on-screen markers ever promote.
    markerCandidatesRef.current = markerCatalogEntries.map((entry) => entry.feature);
    // IDEAL SHAPE (viewport-bounded): the RANK pool and the DOT pool are the SAME set — every
    // in-view restaurant is both a dot (resident) and a promotion candidate, so any of them can
    // crossfade to a pin. The pool = shortcut_coverage (every in-viewport restaurant for this
    // shortcut, RANKED — the coverage features carry `rank`/`craveScore`) + main_results (the cards,
    // higher dedup precedence only for identity). This DECOUPLES pins from card pagination: the map
    // promotes the on-screen top-`maxFullPins`(30) by rank regardless of how many card pages are
    // loaded. (Sourcing the rank pool from main_results ONLY — one page = DEFAULT_PAGE_SIZE=20 —
    // hard-capped pins at 20; that was wrong.) The old off-view-rank bug (promoting off-view 44/52/65
    // over on-view 3/5/6) does NOT recur: coverage is VIEWPORT-BOUNDED (ST_Covers by the submitted
    // viewportPolygon, not market-wide) AND native owns promotion via on-screen gating
    // (projectAndEmitOnScreenMarkers promotes the top-N of the ON-SCREEN subset only, so an off-view
    // rank can never promote). shortcut_coverage has higher VISUAL_SOURCE_PRIORITY than main_results,
    // so the dedup keeps the coverage rank; the merged list is re-ranked 1..N by sorted position below.
    const shortcutResultFeatures = searchMode === 'shortcut' ? markerCandidatesRef.current : [];
    const shortcutCoverageCandidateSources: SearchMapVisualCandidateSource[] =
      searchMode === 'shortcut'
        ? [
            {
              sourceKind: 'shortcut_coverage',
              features: shortcutCoverageDotFeaturesRef.current?.features ?? [],
            },
            { sourceKind: 'main_results', features: shortcutResultFeatures },
          ]
        : [{ sourceKind: 'viewport', features: markerCandidatesRef.current }];
    const rankedCandidateSources: SearchMapVisualCandidateSource[] =
      shortcutCoverageCandidateSources;
    const dotCandidateSources: SearchMapVisualCandidateSource[] = shortcutCoverageCandidateSources;
    const projectedInitialCandidates = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      restaurantOnlyId: effectiveRestaurantOnlyId,
      buildMarkerKey,
    });
    // RANK DEDUP: a shortcut search merges TWO backends (shortcut_coverage + main_results) that each
    // rank their results from 1, so the raw feature.properties.rank collides across sources (the
    // "multiple rank 10s" bug). The merged list here is already deduped-by-restaurant and sorted
    // (source priority → rank → order), so the sorted POSITION is the single unified, unique,
    // stable-per-search rank. Re-assign it so the rank badge, the native promotion top-N, and the
    // native candidate catalog all read one consistent rank instead of two colliding rank spaces.
    const rankedCandidates = projectedInitialCandidates.rankedCandidates.map((feature, index) => ({
      ...feature,
      properties: { ...feature.properties, rank: index + 1 },
    }));
    // The full ranked candidate catalog (every showable marker, NOT viewport-filtered) that native projects
    // to screen space to decide on-screen LOD membership. It rides the source-frame snapshot assembled below
    // (attached at `candidateCatalog:`), so the pins it drives are committed ATOMICALLY with the dots/labels
    // and can never desync — including on a cached-frame replay. rankedCandidates is rank-ordered (index=rank).
    // Memoized by key: rebuild only when the marker set changes; the snapshot dedups on `.key`.
    const candidateCatalogKey = buildStableKeyFingerprint(
      rankedCandidates.map((feature) => buildMarkerKey(feature))
    );
    let candidateCatalog = lastCandidateCatalogRef.current;
    if (candidateCatalog?.key !== candidateCatalogKey) {
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
        const catalogRank = feature.properties.rank ?? index;
        const catalogCraveScore =
          typeof feature.properties.craveScore === 'number' ? feature.properties.craveScore : null;
        catalogEntries.push({
          markerKey: buildMarkerKey(feature),
          lng: coordinates[0],
          lat: coordinates[1],
          rank: catalogRank,
          // Pin OVERLAY substrate: carry the resolved sprite ids so native renders the exact GL sprite,
          // and the restaurant id so the overlay's tap hit-test emits the same press target.
          badgeImageId: rankBadgeImageId(catalogCraveScore, catalogRank),
          activeBadgeImageId: activeRankBadgeImageId(catalogRank),
          restaurantId: feature.properties.restaurantId,
          // Label VA substrate: carry the name so native renders the label text (atomic with the coord).
          restaurantName: feature.properties.restaurantName,
        });
      });
      candidateCatalog = { key: candidateCatalogKey, entries: catalogEntries };
      lastCandidateCatalogRef.current = candidateCatalog;
    }
    // Stage B (B3): consume the native screen-space on-screen marker set purely for the
    // attribution probe below. JS no longer uses it to gate promotion (native is the sole LOD
    // decider now); this raw-set monotonicity probe stays as a gesture-stability diagnostic.
    const nativeVisible = sourceFramePort.getNativeVisibleMarkerKeys();
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
    // candidates BY RANK within the current screen (native screen-space set, requireVisibility:true),
    // promoting/demoting live as markers enter/leave the viewport. As you pan, an outer higher-ranked
    // marker naturally displaces an inner lower-ranked one under the single budget. VIEWPORT-BOUNDED
    // SHORTCUT (migration): the catalog is now ONLY the in-viewport /search/run results, so every pin
    // is in-region → every badge is a RANK badge (the old in/out-region SCORE-badge split + the
    // city-wide coverage source it served are gone). The selected (tapped) restaurant is force-
    // promoted natively via highlightedMarkerKeys regardless of geography.
    // NATIVE-OWNED LOD with a STATIC INITIAL SEED. JS publishes the FULL resident catalog and SEEDS
    // the initial promotion — the top-N-by-rank ranked results baked as pins (see the IDEAL-REVEAL
    // SEED below) — so the reveal is a single synchronized fade. Native
    // (projectAndEmitOnScreenMarkers, running the v5 engine decide) remains the SOLE LOD decider for all
    // pan/zoom: it recomputes the promoted top-N per camera frame and flips roles via feature-state. The seed
    // and native's computation agree at reveal (viewport-bounded catalog → all ranked on-screen →
    // same top-N), so native's first tick no-ops rather than re-deciding. The old JS
    // buildMarkerRenderModel (viewport-gated top-N + stable-membership retention) and its
    // lod_target_change attribution are deleted. The selected (tapped) restaurant is force-promoted
    // natively (the v5 engine's forcedPromote off highlightedMarkerKeys).
    const projectedVisualFrame = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      restaurantOnlyId: effectiveRestaurantOnlyId,
      buildMarkerKey,
    });
    // ONE-RANK UNIFICATION (2026-06-23): the SAME sorted-position re-rank applied to the catalog above
    // (projectedInitialCandidates → rank=index+1) MUST also drive the pin BADGE sprite and the JS reveal
    // seed — otherwise the badge shows the raw, COLLIDING per-source rank (the "multiple rank-10s" merge
    // bug) while native promotes by the clean position rank, so badge ≠ promotion. The harness proved this:
    // badgeNeqCat≈328 and, during pan/zoom, inv up to 28 + badgeMax 100 (rank-100 pins promoted while
    // lower-rank markers stay dots). projectedVisualFrame is the SAME projection as projectedInitialCandidates
    // (identical args → identical order), so re-ranking it by index+1 here yields the IDENTICAL rank the
    // catalog/engine uses → badge number == promotion rank everywhere. (Whether that position == Crave-score
    // order is governed by projectSearchMapVisualFrame's sort, separate from this badge/promotion agreement.)
    const rerankedVisualCandidates = projectedVisualFrame.rankedCandidates.map(
      (feature, index) => ({
        ...feature,
        properties: { ...feature.properties, rank: index + 1 },
      })
    );
    // markerKey → unified position rank. renderedLodCandidates is built mostly from the DOT pass (which
    // carries every candidate but NOT this re-rank), so the badge build below must look the unified rank up
    // by key rather than trust the feature's own (possibly raw, colliding) rank.
    const unifiedRankByKey = new Map<string, number>(
      rerankedVisualCandidates.map((feature) => [
        buildMarkerKey(feature),
        feature.properties.rank as number,
      ])
    );
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
    // IDEAL-REVEAL SEED (single synchronized fade). JS bakes the top-N-by-rank ranked results as
    // PROMOTED pins in the published frame, instead of the all-demoted "one decider" bake. This
    // restores the old one-group model's clean reveal: pins+dots+labels fade in TOGETHER with correct
    // roles + placed labels from the FIRST painted frame, eliminating the 3-phase stagger (dots fade
    // in alone → top-N crossfade into pins at camera-idle → labels pop in last) that all-demoted
    // produced. It does NOT reintroduce two-decider oscillation: top-N-by-rank among the on-screen set
    // == native's projected top-N (same maxFullPins), so native's first projectAndEmitOnScreenMarkers tick
    // finds `affected` empty and no-ops — native STILL solely owns LOD on pan/zoom; JS only seeds the static
    // frame. The seed is applied in BOTH passes below: a ranked key is usually first seen (and deduped)
    // in the dot pass, since dots carry every candidate resident at opacity 0.
    //
    // CONTRACT GATE: a promoted marker MUST carry a full pin+interaction+label+collision bundle, and
    // labels are on-screen-gated (built for the native-visible set, or ALL when null pre-projection —
    // see buildDirectLabelStores). So we may ONLY seed-promote markers that also get a label this
    // frame; promoting an off-screen ranked marker post-projection would leave it label-less and the
    // native frame-sync rejects it ("Promoted marker … missing … role payload"). Promote the top-N by
    // rank AMONG that same label-built set (== native's on-screen top-N), so every seeded pin has a
    // label. nativeVisibleSeed mirrors onScreenMarkerKeysForLabels (the getter is stable this frame).
    const nativeVisibleSeed = sourceFramePort.getNativeVisibleMarkerKeys();
    const nativeVisibleSeedSet =
      nativeVisibleSeed != null ? new Set(nativeVisibleSeed.markerKeys) : null;
    const promotedSeedKeys = new Set<string>(
      [...rerankedVisualCandidates]
        .filter(
          (feature) =>
            nativeVisibleSeedSet == null || nativeVisibleSeedSet.has(buildMarkerKey(feature))
        )
        .sort(
          (a, b) =>
            (typeof a.properties.rank === 'number' ? a.properties.rank : Number.POSITIVE_INFINITY) -
            (typeof b.properties.rank === 'number' ? b.properties.rank : Number.POSITIVE_INFINITY)
        )
        // The engine owns reveal + EVERY promotion ("reveal = first decide; no special reveal seed"). Empty
        // seed → every brand-new marker bakes as a plain dot (pin 0 / dot 1) and the engine's first decide
        // fades the top-N in from 0 per-pin, in lockstep with their dots. This closes the residual group-snap:
        // an empty seed makes isPromoted false everywhere → both the pin bake (0) and the dot bake correct.
        .slice(0, 0)
        .map((feature) => buildMarkerKey(feature))
    );
    visibleDotRestaurantMarkerFeatures.forEach((feature) => {
      const key = buildMarkerKey(feature);
      if (seenRenderedLodKeys.has(key)) {
        return;
      }
      seenRenderedLodKeys.add(key);
      renderedLodCandidates.push({ feature, isPromoted: promotedSeedKeys.has(key) });
    });
    // FULL RESIDENCY (#2 pan-to-new-areas + finish the wiggle kill): emit EVERY catalog candidate
    // into the pin+dot sources, resident at opacity 0 when demoted. The full-replace then pre-seeds
    // the bundle with ALL candidates, so a promote during a gesture is opacity-only even for markers
    // panned-to outside the initial viewport slice (no source add → no wiggle), and native has pin
    // data to promote-render any candidate. Off-screen resident pins are tile-culled (~free) +
    // ignorePlacement (no collision cost). Name-labels stay promote-gated (built below).
    rerankedVisualCandidates.forEach((feature) => {
      const key = buildMarkerKey(feature);
      if (seenRenderedLodKeys.has(key)) {
        return;
      }
      seenRenderedLodKeys.add(key);
      renderedLodCandidates.push({ feature, isPromoted: promotedSeedKeys.has(key) });
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
      // ONE-RANK: the unified position rank (== the catalog/engine rank), looked up by key so the badge
      // matches native promotion no matter which pass first added this feature. Falls back to the raw rank
      // only if the key is somehow absent from the reranked set.
      const rank =
        unifiedRankByKey.get(markerKey) ??
        (typeof feature.properties.rank === 'number' ? feature.properties.rank : index + 1);
      // VIEWPORT-BOUNDED SHORTCUT (migration): the catalog is now ONLY in-viewport results (ranked
      // 1..N), so every pin is in-region → every badge is a RANK badge. The out-of-region SCORE badge
      // existed only for the city-wide coverage pins, which are gone. inOverlapRegion is pinned true.
      const inOverlapRegion = true;
      const badgeImageId = rankBadgeImageId(craveScore, rank);
      // Active-color variant (same rank number) — the pin layer swaps to this on nativeHighlighted so a
      // tapped pin recolors to the active color while keeping its rank (B / press-up active color).
      const activeBadgeImageId = activeRankBadgeImageId(rank);
      const semanticRevision = buildPinSemanticRevision({
        baseDiffKey: getSearchMapSourceTransportFeature(feature).diffKey,
        markerKey,
        nativeLodZ,
        badgeImageId,
      });
      const nextFeature = {
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          markerKey,
          // Stamp the unified rank onto the baked feature so feature.properties.rank (read natively for
          // z-order and the harness) agrees with the badge sprite and native promotion — one rank end to end.
          rank,
          labelOrder: index + 1,
          badgeImageId,
          activeBadgeImageId,
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
          // Bake 0 (a dot) for EVERY pin — the engine owns opacity via feature-state and fades the top-N in
          // from 0; a baked 1 would paint the reveal-seed pins FULL before the engine value applies (the
          // reveal twitch + the zoom-out group-snap-at-full).
          nativeLodOpacity: 0,
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
          // Pre-baked circle-dot sprite id for this marker's score bucket (matches its pin's color).
          dotImageId: dotBucketImageId(feature.properties.craveScore),
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
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'pin_publish_stability_contract',
        isMapMoving: projectionIsMapMoving,
        badgeChangedCount,
        coordinateSwapCount,
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

    // On-screen set for label gating: native owns promotion, so it owns "which markers are
    // on-screen." getNativeVisibleMarkerKeys returns that set (or null pre-projection).
    const nativeVisibleForLabels = sourceFramePort.getNativeVisibleMarkerKeys();
    const onScreenMarkerKeysForLabels =
      nativeVisibleForLabels != null ? new Set(nativeVisibleForLabels.markerKeys) : null;
    // The LIVE promoted set drives the collision obstacle baking (#16): on a settle-republish (this runs
    // when isMapMoving flips false) the obstacle re-bakes to match the pins native promoted during the
    // gesture, so labels yield to them instead of the stale publish-time set.
    const promotedMarkerKeysForLabels =
      nativeVisibleForLabels != null ? new Set(nativeVisibleForLabels.nativePromotedKeys) : null;
    const { labelSourceStore, labelCollisionSourceStore, labelDerivedSourceIdentityKey } =
      buildDirectLabelStores({
        pinSourceStore,
        previousLabelSourceStore: previousLabelSourceStoreRef.current,
        previousLabelCollisionSourceStore: previousLabelCollisionSourceStoreRef.current,
        onScreenMarkerKeys: onScreenMarkerKeysForLabels,
        promotedMarkerKeys: promotedMarkerKeysForLabels,
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
    if (readinessKey != null && String(readinessKey).includes('toggle')) {
      logger.info('[TGLDBG-v2] srcGate', {
        activeTab,
        rk: readinessKey,
        sri: searchRequestId,
        rest: restaurants.length,
        dish: dishes.length,
        cat: markerCatalogEntries.length,
        pins: pinSourceStore.idsInOrder.length,
        dots: dotSourceStore.idsInOrder.length,
        labels: labelSourceStore.idsInOrder.length,
        committedData: hasCommittedDataForPreparedEnter,
        cov: shortcutCoverageReadyForPreparedEnter,
        pinInter: pinInteractionSourcesComplete,
        shouldProj: shouldProjectResultSources,
        expectsVis: expectsPreparedVisualSources,
        hasVis: hasVisualSources,
        ready: mapSearchSurfaceResultsSourcesReady,
      });
    }
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
      // Pins ride the SAME snapshot as dots/labels: one commit, one dedup, atomic delivery to native — and
      // the cached-frame replay (which spreads this snapshot) carries the catalog with it, so a toggle-back
      // never publishes dots/labels without their pins.
      candidateCatalog,
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
          // ONE DECIDER: JS publishes every candidate as a resident (demoted) pin; native owns
          // which ones render as pins. So the pin source == the full classified candidate set.
          residentRestaurantsRenderAsPins:
            pinSourceStore.idsInOrder.length === renderedLodCandidates.length,
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
    shortcutCoverageDotFeaturesRef.current = null;
    shortcutCoverageResourceRef.current = null;
    shortcutCoverageTerminalByRequestKeyRef.current.clear();
    shortcutCoverageFeaturesByRequestKeyRef.current.clear();
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

  // Zero-network toggle: prefetch the OTHER tab's coverage at search-commit time so a toggle is a guaranteed
  // cache hit (no covNotReady blank). Populates ONLY the by-requestKey caches (terminal + features) that
  // maybeFetchShortcutCoverage's restoreFromCache path reads — never the active resource/features refs, which
  // stay owned by the active tab. Best-effort + idempotent (guarded by the in-flight set + a cache check).
  const prefetchSiblingTabCoverage = React.useCallback(
    (params: {
      snapshot: { bounds: MapBounds; entities: StructuredSearchRequest['entities'] };
      searchRequestId: string;
      marketKey: string;
      entitiesKey: string;
      boundsKey: string;
      currentActiveTab: string | null;
      viewportPolygon: Array<[number, number]> | undefined;
    }) => {
      const siblingTab = params.currentActiveTab === 'dishes' ? 'restaurants' : 'dishes';
      const includeTopDish = siblingTab === 'dishes';
      const requestKey = buildShortcutCoverageRequestKey({
        entitiesKey: params.entitiesKey,
        activeTab: siblingTab,
        marketKey: params.marketKey,
        boundsKey: params.boundsKey,
      });
      const cachedTerminal = shortcutCoverageTerminalByRequestKeyRef.current.get(requestKey);
      if (
        (cachedTerminal &&
          (cachedTerminal.status === 'completed' || cachedTerminal.status === 'empty')) ||
        siblingCoveragePrefetchInFlightRef.current.has(requestKey)
      ) {
        return;
      }
      siblingCoveragePrefetchInFlightRef.current.add(requestKey);
      void searchService
        .shortcutCoverage(
          {
            entities: params.snapshot.entities,
            bounds: params.snapshot.bounds,
            viewportPolygon: params.viewportPolygon,
            includeTopDish,
            marketKey: params.marketKey,
          },
          {}
        )
        .then((collection) => {
          const features = mapShortcutCoverageFeatures(
            collection,
            includeTopDish,
            latestArgsRef.current.getCraveScoreColorFromScore
          );
          const acceptedFeatureCount = features.length;
          shortcutCoverageTerminalByRequestKeyRef.current.set(requestKey, {
            requestKey,
            searchRequestId: params.searchRequestId,
            boundsKey: params.boundsKey,
            activeTab: siblingTab,
            marketKey: params.marketKey,
            entitiesKey: params.entitiesKey,
            readinessKey: null,
            fetchReason: 'initial',
            status: acceptedFeatureCount > 0 ? 'completed' : 'empty',
            seq: 0,
            abortController: null,
            returnedFeatureCount: collection?.features?.length ?? 0,
            acceptedFeatureCount,
            terminalReason:
              acceptedFeatureCount > 0 ? 'accepted_features' : 'validated_empty_coverage',
          });
          shortcutCoverageFeaturesByRequestKeyRef.current.set(requestKey, {
            type: 'FeatureCollection',
            features,
          });
        })
        .catch(() => {
          // Best-effort: on failure leave the caches empty so a real toggle does a normal fetch.
        })
        .finally(() => {
          siblingCoveragePrefetchInFlightRef.current.delete(requestKey);
        });
    },
    [searchRuntimeBus]
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
        const cachedTerminalResource =
          shortcutCoverageTerminalByRequestKeyRef.current.get(requestKey);
        // canRefetch: false — no bounds means no query, so 'refetch' here means "fall through to
        // the synthetic no-bounds 'failed' terminal below" (this branch's stand-in for a fetch).
        const cacheDecision = resolveCoverageCacheDecision({
          requestKeyMatchesActive: activeResource?.requestKey === requestKey,
          activeStatus: activeResource?.status ?? null,
          cachedTerminalStatus: cachedTerminalResource?.status ?? null,
          canRefetch: false,
        });
        if (cacheDecision.action === 'alreadySettled') {
          return;
        }
        if (cacheDecision.action === 'restoreFromCache' && cachedTerminalResource) {
          shortcutCoverageResourceRef.current = cachedTerminalResource;
          shortcutCoverageLoadingRef.current = false;
          // [tclur FIX / red-team M1] Restore features ONLY for a SUCCESS terminal — mirror the main
          // cache-hit path so the two read paths can never diverge (a non-success terminal never surfaces
          // stale features). An 'aborted'/'failed' terminal → null (clear coverage).
          shortcutCoverageDotFeaturesRef.current = cacheDecision.restoreFeatures
            ? (shortcutCoverageFeaturesByRequestKeyRef.current.get(requestKey) ?? null)
            : null;
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
        // [tclur FIX / red-team M1] features cache in lockstep with this non-success ('failed') terminal.
        shortcutCoverageFeaturesByRequestKeyRef.current.delete(requestKey);
        shortcutCoverageLoadingRef.current = false;
        shortcutCoverageDotFeaturesRef.current = null;
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
    // Fire the sibling-tab coverage prefetch in parallel with the active-tab work, so the FIRST toggle to the
    // other tab is a zero-network cache hit (kills the ~12s covNotReady blank). Idempotent + best-effort.
    prefetchSiblingTabCoverage({
      snapshot,
      searchRequestId,
      marketKey,
      entitiesKey,
      boundsKey,
      currentActiveTab: activeTab,
      viewportPolygon:
        viewportBoundsService
          .getSubmittedPolygon()
          ?.map(([lng, lat]) => [lng, lat] as [number, number]) ?? undefined,
    });
    const activeResource = shortcutCoverageResourceRef.current;
    // [tclur FIX] Short-circuit ONLY on a SUCCESS terminal ('completed'/'empty') — a definitive coverage
    // result for this requestKey. A cancelled/errored terminal ('aborted'/'superseded'/'failed') is NOT a
    // result: rapid toggling supersedes in-flight coverage fetches (line ~2820 + the catch at ~3060 cache an
    // 'aborted' terminal), and the OLD code early-returned on ANY cached terminal → that tab could never
    // re-fetch and stayed empty (promoted=0, the "pins vanished and never came back"). We now fall through
    // to re-fetch those. The success terminal may come from the active resource or the per-key terminal cache.
    // The decision itself is PURE and spec-locked in coverage-cache-policy.ts.
    const cachedTerminalResource = shortcutCoverageTerminalByRequestKeyRef.current.get(requestKey);
    const cacheDecision = resolveCoverageCacheDecision({
      requestKeyMatchesActive: activeResource?.requestKey === requestKey,
      activeStatus: activeResource?.status ?? null,
      cachedTerminalStatus: cachedTerminalResource?.status ?? null,
      canRefetch: true,
    });
    if (cacheDecision.action === 'waitForInFlight') {
      // A fetch for THIS exact tab/bounds is already in flight — let it land.
      return;
    }
    if (cacheDecision.action === 'restoreFromCache') {
      const successTerminal =
        cacheDecision.restoreSource === 'activeResource' ? activeResource : cachedTerminalResource;
      if (successTerminal) {
        // The terminal-resource cache HITS and restores the RESOURCE + the features ref from the sibling
        // features cache (keyed identically), so the map switches to this tab's coverage immediately.
        shortcutCoverageResourceRef.current = successTerminal;
        shortcutCoverageLoadingRef.current = false;
        // Restore THIS tab's features from the features cache so the map switches immediately. An 'empty'
        // terminal legitimately cached no features → null clears the coverage.
        shortcutCoverageDotFeaturesRef.current = cacheDecision.restoreFeatures
          ? (shortcutCoverageFeaturesByRequestKeyRef.current.get(requestKey) ?? null)
          : null;
        publishSourcesRef.current();
      }
      return;
    }
    // No success terminal for this key (none, or a cancelled/errored one) → drop any stale non-success
    // terminal so it can't block, and fall through to a fresh fetch. The terminal AND features cache
    // entries are deleted in LOCKSTEP (the policy's deleteStaleCacheEntries contract).
    if (
      cacheDecision.action === 'refetch' &&
      cacheDecision.deleteStaleCacheEntries &&
      cachedTerminalResource
    ) {
      shortcutCoverageTerminalByRequestKeyRef.current.delete(requestKey);
      shortcutCoverageFeaturesByRequestKeyRef.current.delete(requestKey);
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
          // Screen-accurate viewport polygon (frozen at submit, same as snapshot.bounds) — the dots
          // query ST_Covers by it so the dots layer is exactly the visible viewport, not the AABB box.
          viewportPolygon:
            viewportBoundsService
              .getSubmittedPolygon()
              ?.map(([lng, lat]) => [lng, lat] as [number, number]) ?? undefined,
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
        const features = mapShortcutCoverageFeatures(
          collection,
          includeTopDish,
          latestArgsRef.current.getCraveScoreColorFromScore
        );
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
        // Coverage = the in-viewport DOTS source (one feature per restaurant, already DISTINCT ON
        // restaurant_id in the coverage query). The old ranked-coverage build
        // (buildAnchoredShortcutCoverage → buildRankedShortcutCoverageFeatures → shortcutCoverageRankedRef)
        // fed coverage into the RANK pool; that's gone (coverage no longer ranks), so it's removed.
        const coverageFeatureCollection: FeatureCollection<Point, RestaurantFeatureProperties> = {
          type: 'FeatureCollection',
          features,
        };
        shortcutCoverageDotFeaturesRef.current = coverageFeatureCollection;
        // [tclur FIX] Cache the features by requestKey so a later cache-hit (toggle-back to this tab) can
        // restore them without a re-fetch. Without this, the cache-hit path restored only the resource and
        // left the features ref on the other tab's coverage (stale-236 / promoted=0).
        shortcutCoverageFeaturesByRequestKeyRef.current.set(requestKey, coverageFeatureCollection);
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
        // [tclur FIX / red-team M1] Keep the features cache in LOCKSTEP with the terminal cache: this
        // requestKey now holds a non-success ('aborted'/'failed') terminal, so drop any features entry a
        // prior success left here. Otherwise a stale features entry could be paired with a non-success
        // terminal and surfaced (the exact "state-correct-but-screen-wrong" class this change set kills).
        shortcutCoverageFeaturesByRequestKeyRef.current.delete(requestKey);
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
  }, [
    prefetchSiblingTabCoverage,
    publishTelemetry,
    searchRuntimeBus,
    sourceFramePort,
    viewportBoundsService,
  ]);

  React.useEffect(() => {
    const publishAndFetch = () => {
      // [tclur FIX] Restore THIS tab's coverage (a cache-hit synchronously restores the features ref +
      // re-projects) BEFORE the trailing projection — so the projection reads the CURRENT tab's coverage,
      // not the prior tab's for one frame (the rapid-toggle 1-frame wrong-count flash, e.g. dishes showing
      // 647 for a frame). On a cache-MISS this only arms a fetch (no synchronous publish), and the trailing
      // publish still projects the loading state as before. Order swap is behavior-neutral on miss, and
      // eliminates the flash on hit.
      maybeFetchShortcutCoverage();
      publishSourcesRef.current();
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
      ['searchSurfaceResultsTransactionKey', 'resultsIdentityKey', 'resultsRequestKey'] as const,
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
      // LOD promote/demote is native-owned now (projectAndEmitOnScreenMarkers → v5 engine decide) — JS
      // does NOT publish sources on camera ticks. The viewport tick only drives shortcut-coverage fetching (a data
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

  // Re-publish sources when the highlight / restaurantOnly intent changes (or map-move state
  // flips) so the catalog rebuilds against the new selection.
  React.useEffect(() => {
    publishSourcesRef.current();
  }, [isMapMoving, highlightedRestaurantId, restaurantOnlyId]);

  // PIN-AT-REVEAL race fix. On a cold committed reveal (poll comment-span / restaurant deep
  // link) the highlight / restaurantOnly intent is set BEFORE the committed search results go
  // live, so the catalog rebuild that fires at highlight-set time runs against an EMPTY
  // projection → zero pins at the reveal frame (committedCount=0 at highlight-set → catalog
  // pins=0, then a later rebuild after committed-results-live yields pins=1). The
  // result-card path never hits this because its committed results are already mounted when the
  // highlight is set. The shared deferred mounted-results subscriber recovers eventually, but
  // its rAF-coalesced timing is fragile on the no-preview comment-span lane (the highlight can
  // be set in a later commit than the one the deferred publish already serviced, so the rebuild
  // that lands the pin never re-runs until an unrelated refresh). While a reveal intent is
  // active, subscribe SYNCHRONOUSLY to the mounted-results store and re-publish the moment the
  // committed projection changes — guaranteeing the highlighted-restaurant catalog rebuilds
  // against the now-live projection at the reveal frame. Gated to reveal intents, so it adds no
  // work and cannot regress the result-card / idle paths.
  React.useEffect(() => {
    if (highlightedRestaurantId == null && restaurantOnlyId == null) {
      return undefined;
    }
    return subscribeSearchMountedResultsDataSnapshot(() => {
      publishSourcesRef.current();
    });
  }, [highlightedRestaurantId, restaurantOnlyId]);

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
