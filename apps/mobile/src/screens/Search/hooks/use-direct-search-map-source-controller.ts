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
import { createMapQueryBudget, type MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  buildAnchoredShortcutCoverage,
  buildMarkerCatalogReadModel,
  buildRankedShortcutCoverageFeatures,
} from '../runtime/map/map-read-model-builder';
import { type MapMotionPressureController } from '../runtime/map/map-motion-pressure';
import { createMapViewportQueryService } from '../runtime/map/map-viewport-query';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
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
  EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT,
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

const logPinInteractionSourceMismatch = ({
  source,
  preparedVisualCycleKey,
  readinessKey,
  markersRenderKey,
  pinSourceStore,
  pinInteractionSourceStore,
}: Pick<SearchMapSourceFrameSnapshot, 'pinSourceStore' | 'pinInteractionSourceStore'> & {
  source: 'recomputed' | 'prepared_frame_cache';
  preparedVisualCycleKey: string | null;
  readinessKey: string | null;
  markersRenderKey: string | null;
}): void => {
  if (arePinInteractionSourcesComplete({ pinSourceStore, pinInteractionSourceStore })) {
    return;
  }
  logger.warn('[PIN-STACK-DIAG] pin_interaction_source_mismatch', {
    source,
    preparedVisualCycleKey,
    readinessKey,
    markersRenderKey,
    pinCount: pinSourceStore.idsInOrder.length,
    pinInteractionCount: pinInteractionSourceStore.idsInOrder.length,
    missingInteractionMarkerKeys: pinSourceStore.idsInOrder
      .filter((markerKey) => !pinInteractionSourceStore.featureById.has(markerKey))
      .slice(0, 8),
  });
};

const SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES = 0.01;
const SEARCH_MAP_VISUAL_PROJECTOR_VERSION = 'single-writer-restaurant-location-v3';

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

type SearchMapVisualIdentityKey = string;

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

const buildVisualIdentityKey = (
  feature: Feature<Point, RestaurantFeatureProperties>
): SearchMapVisualIdentityKey => {
  const [lng, lat] = feature.geometry.coordinates;
  return [
    feature.properties.restaurantId,
    Number.isFinite(lng) ? lng.toFixed(6) : String(lng),
    Number.isFinite(lat) ? lat.toFixed(6) : String(lat),
  ].join(':');
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
  const candidatesByVisualIdentity = new Map<SearchMapVisualIdentityKey, SearchMapVisualCandidate>();
  let order = 0;

  sources.forEach((source) => {
    source.features.forEach((feature) => {
      const markerKey = buildMarkerKey(feature);
      const visualIdentityKey = buildVisualIdentityKey(feature);
      const candidate = {
        feature,
        markerKey,
        visualIdentityKey,
        sourceKind: resolveEffectiveVisualSourceKind({
          feature,
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
  pinnedFeatures,
  buildMarkerKey,
}: {
  rankedSources: readonly SearchMapVisualCandidateSource[];
  dotSources: readonly SearchMapVisualCandidateSource[];
  selectedRestaurantId: string | null;
  restaurantOnlyId: string | null;
  pinnedFeatures: readonly Feature<Point, RestaurantFeatureProperties>[];
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
}): ProjectedSearchMapVisualFrame => {
  const rankedCandidates = collectSearchMapVisualCandidates({
    sources: rankedSources,
    selectedRestaurantId,
    restaurantOnlyId,
    buildMarkerKey,
  });
  const pinnedVisualIdentityKeys = new Set(
    pinnedFeatures.map((feature) => buildVisualIdentityKey(feature))
  );
  const dotCandidates = collectSearchMapVisualCandidates({
    sources: dotSources,
    selectedRestaurantId,
    restaurantOnlyId,
    buildMarkerKey,
  }).filter((candidate) => !pinnedVisualIdentityKeys.has(candidate.visualIdentityKey));
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
      : rankedCandidates.map((candidate) => candidate.feature);
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
      visualIdentityKeys.add(buildVisualIdentityKey(feature));
    }
  });
  return visualIdentityKeys;
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
    const visualIdentityKey = buildVisualIdentityKey(feature);
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
    pinDotVisualIdentityOverlap.length === 0 &&
    labelSourceStore.idsInOrder.length === expectedLabelCount &&
    labelCollisionSourceStore.idsInOrder.length === expectedCollisionCount
  ) {
    return;
  }

  logger.error('[PIN-STACK-DIAG] projected visual frame invariant failed', {
    duplicatePinVisualIdentityKeyCount: duplicatePinVisualIdentityKeys.length,
    duplicatePinVisualIdentityKeySamples: duplicatePinVisualIdentityKeys.slice(0, 8),
    pinDotVisualIdentityOverlapCount: pinDotVisualIdentityOverlap.length,
    pinDotVisualIdentityOverlapSamples: pinDotVisualIdentityOverlap.slice(0, 8),
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

type PinStackDiagnosticGroup = {
  key: string;
  count: number;
  featureIds: string[];
  restaurantIds: string[];
  ranks: number[];
  nativeLodZ: Array<number | null>;
};

const summarizeDuplicatePinGroups = (
  groups: Map<string, PinStackDiagnosticGroup>,
  sampleLimit = 8
): {
  duplicateGroupCount: number;
  duplicateFeatureCount: number;
  samples: PinStackDiagnosticGroup[];
} => {
  const duplicateGroups = Array.from(groups.values())
    .filter((group) => group.count > 1)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  return {
    duplicateGroupCount: duplicateGroups.length,
    duplicateFeatureCount: duplicateGroups.reduce((total, group) => total + group.count, 0),
    samples: duplicateGroups.slice(0, sampleLimit),
  };
};

const addPinStackDiagnosticFeature = (
  groups: Map<string, PinStackDiagnosticGroup>,
  key: string,
  featureId: string,
  feature: Feature<Point, RestaurantFeatureProperties>
) => {
  const group =
    groups.get(key) ??
    ({
      key,
      count: 0,
      featureIds: [],
      restaurantIds: [],
      ranks: [],
      nativeLodZ: [],
    } satisfies PinStackDiagnosticGroup);

  group.count += 1;
  group.featureIds.push(featureId);
  group.restaurantIds.push(feature.properties.restaurantId);
  group.ranks.push(feature.properties.rank);
  group.nativeLodZ.push(
    typeof feature.properties.nativeLodZ === 'number' ? feature.properties.nativeLodZ : null
  );
  groups.set(key, group);
};

const buildPinStackDiagnostics = (pinSourceStore: SearchMapSourceStore) => {
  const exactCoordinateGroups = new Map<string, PinStackDiagnosticGroup>();
  const roundedCoordinateGroups = new Map<string, PinStackDiagnosticGroup>();
  const restaurantGroups = new Map<string, PinStackDiagnosticGroup>();

  pinSourceStore.idsInOrder.forEach((featureId) => {
    const feature = pinSourceStore.featureById.get(featureId);
    if (!feature) {
      return;
    }
    const [lng, lat] = feature.geometry.coordinates;
    addPinStackDiagnosticFeature(
      exactCoordinateGroups,
      `${String(lng)},${String(lat)}`,
      featureId,
      feature
    );
    addPinStackDiagnosticFeature(
      roundedCoordinateGroups,
      `${lng.toFixed(6)},${lat.toFixed(6)}`,
      featureId,
      feature
    );
    addPinStackDiagnosticFeature(
      restaurantGroups,
      feature.properties.restaurantId,
      featureId,
      feature
    );
  });

  const exactCoordinateDuplicates = summarizeDuplicatePinGroups(exactCoordinateGroups);
  const roundedCoordinateDuplicates = summarizeDuplicatePinGroups(roundedCoordinateGroups);
  const restaurantDuplicates = summarizeDuplicatePinGroups(restaurantGroups);

  return {
    pinCount: pinSourceStore.idsInOrder.length,
    exactCoordinateDuplicateGroupCount: exactCoordinateDuplicates.duplicateGroupCount,
    exactCoordinateDuplicateFeatureCount: exactCoordinateDuplicates.duplicateFeatureCount,
    exactCoordinateDuplicateSamples: exactCoordinateDuplicates.samples,
    roundedCoordinateDuplicateGroupCount: roundedCoordinateDuplicates.duplicateGroupCount,
    roundedCoordinateDuplicateFeatureCount: roundedCoordinateDuplicates.duplicateFeatureCount,
    roundedCoordinateDuplicateSamples: roundedCoordinateDuplicates.samples,
    restaurantDuplicateGroupCount: restaurantDuplicates.duplicateGroupCount,
    restaurantDuplicateFeatureCount: restaurantDuplicates.duplicateFeatureCount,
    restaurantDuplicateSamples: restaurantDuplicates.samples,
    hasStackingSignal:
      exactCoordinateDuplicates.duplicateGroupCount > 0 ||
      roundedCoordinateDuplicates.duplicateGroupCount > 0,
  };
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
  family: 'pinInteraction' | 'dotInteraction';
}): string =>
  `${family}|marker:${markerKey}|restaurant:${restaurantId ?? ''}|lng:${lng}|lat:${lat}`;

type DirectMapSourceControllerBaseArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  restaurantOnlyId: string | null;
  highlightedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
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
  feature: Feature<Point, RestaurantFeatureProperties>,
  extraKey: string
): string => `${extraKey}:${getSearchMapSourceTransportFeature(feature).diffKey}`;

const buildStableLabelBaseFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  markerKey: string
): Feature<Point, RestaurantFeatureProperties> => {
  const stableProperties = { ...feature.properties };
  delete stableProperties.nativeLodZ;
  delete stableProperties.nativeLodOpacity;
  delete stableProperties.nativeLodRankOpacity;
  delete stableProperties.nativeLabelOpacity;
  delete stableProperties.nativeDotOpacity;
  delete stableProperties.nativePresentationOpacity;
  delete stableProperties.labelOrder;
  delete stableProperties.lodZ;
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
    } as RestaurantFeatureProperties,
  } satisfies Feature<Point, RestaurantFeatureProperties>);

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
  if (pinSourceStore.idsInOrder.length === 0) {
    return {
      labelSourceStore:
        previousLabelSourceStore.idsInOrder.length > 0
          ? createSearchMapSourceStoreBuilder(previousLabelSourceStore).finish()
          : previousLabelSourceStore,
      labelCollisionSourceStore:
        previousLabelCollisionSourceStore.idsInOrder.length > 0
          ? createSearchMapSourceStoreBuilder(previousLabelCollisionSourceStore).finish()
          : previousLabelCollisionSourceStore,
      labelDerivedSourceIdentityKey: '',
    };
  }

  const labelBuilder = createSearchMapSourceStoreBuilder(previousLabelSourceStore);
  const collisionBuilder = createSearchMapSourceStoreBuilder(previousLabelCollisionSourceStore);
  pinSourceStore.idsInOrder.forEach((markerKey) => {
    const feature = pinSourceStore.featureById.get(markerKey);
    if (!feature) {
      return;
    }
    const stableBaseFeature = buildStableLabelBaseFeature(feature, markerKey);
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
      const semanticRevision = buildLabelSourceFeatureDiffKey(
        stableBaseFeature,
        `${pinSourceStore.sourceRevision}:candidate:${candidate}`
      );
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
    const collisionRevision = buildLabelSourceFeatureDiffKey(
      collisionFeature,
      `${pinSourceStore.sourceRevision}:collision`
    );
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
    labelDerivedSourceIdentityKey: pinSourceStore.sourceRevision,
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
  resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation,
  getCraveScoreColorFromScore,
  mapGestureActiveRef: _mapGestureActiveRef,
  mapMotionPressureController: _mapMotionPressureController,
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
  externalMapQueryBudget,
  profileCommandPort,
}: DirectMapSourceControllerArgs): DirectMapSourceControllerResult => {
  const latestArgsRef = React.useRef({
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    restaurantOnlyId,
    highlightedRestaurantId,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getCraveScoreColorFromScore,
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
      profileCommandPort,
    };
  }, [
    getPerfNow,
    getCraveScoreColorFromScore,
    highlightedRestaurantId,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    isMapMoving,
    lodPinDemoteStableMsMoving,
    lodPinOffscreenToggleStableMsMoving,
    lodPinPromoteStableMsMoving,
    lodPinToggleStableMsIdle,
    lodVisibleCandidateBuffer,
    logSearchCompute,
    maxFullPins,
    pickPreferredRestaurantMapLocation,
    profileCommandPort,
    resolveRestaurantLocationSelectionAnchor,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    shouldLogSearchComputes,
  ]);

  const mapViewportQueryServiceRef = React.useRef(createMapViewportQueryService());
  const mapQueryBudgetRef = React.useRef<MapQueryBudget | null>(externalMapQueryBudget ?? null);
  React.useEffect(() => {
    mapQueryBudgetRef.current =
      externalMapQueryBudget ?? mapQueryBudgetRef.current ?? createMapQueryBudget();
  }, [externalMapQueryBudget]);
  if (mapQueryBudgetRef.current == null) {
    mapQueryBudgetRef.current = externalMapQueryBudget ?? createMapQueryBudget();
  }
  const previousPinSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousDotSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const previousPinInteractionSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousDotInteractionSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousLabelSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousLabelCollisionSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const markerCandidatesRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedMarkersRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedKeyRef = React.useRef('');
  const lodPinProposedPromoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinProposedDemoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinnedResetKeyRef = React.useRef('');
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

  const publishSourcesRef = React.useRef<() => void>(() => {});
  publishSourcesRef.current = () => {
    const state = searchRuntimeBus.getState();
    const args = latestArgsRef.current;
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    const committedMapSourceFrameKey = resolveCommittedMapSourceFrameKey(state);
    const selectedRestaurantId = args.highlightedRestaurantId;
    const hasCommittedResultState =
      state.searchMode != null && mountedResultsSnapshot.resultsRequestKey != null;
    const shouldProjectResultSources =
      hasCommittedResultState || args.restaurantOnlyId != null || selectedRestaurantId != null;
    const mountedResults = mountedResultsSnapshot.results;
    const searchRequestId = shouldProjectResultSources
      ? mountedResults?.metadata?.searchRequestId ?? null
      : null;
    const restaurants = shouldProjectResultSources
      ? mountedResults?.restaurants ?? EMPTY_RESTAURANTS
      : EMPTY_RESTAURANTS;
    const dishes = shouldProjectResultSources
      ? mountedResults?.dishes ?? EMPTY_DISHES
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
      lodPinnedKeyRef.current = '';
      lodPinnedMarkersRef.current = [];
      lodPinProposedPromoteSinceByMarkerKeyRef.current.clear();
      lodPinProposedDemoteSinceByMarkerKeyRef.current.clear();
    }
    const currentBounds = viewportBoundsService.getBounds();
    const preparedVisualCycleKey = resolvePreparedPresentationVisualCycleKey(
      args.resultsPresentationAuthority,
      args.resultsPresentationSurfaceAuthority
    );
    const resultsPresentationSnapshot = args.resultsPresentationAuthority.getSnapshot();
    const resultsPresentationTransport =
      resultsPresentationSnapshot.resultsPresentationTransport;
    const isResultsExitActive =
      resultsPresentationTransport.snapshotKind === 'results_exit';
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
      previousPinSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      previousDotSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      previousPinInteractionSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      previousDotInteractionSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      previousLabelSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      previousLabelCollisionSourceStoreRef.current = EMPTY_SEARCH_MAP_SOURCE_STORE;
      markerCandidatesRef.current = [];
      lodPinnedMarkersRef.current = [];
      lodPinnedKeyRef.current = '';
      lodPinProposedPromoteSinceByMarkerKeyRef.current.clear();
      lodPinProposedDemoteSinceByMarkerKeyRef.current.clear();
      sourceFramePort.publishSnapshot(EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT);
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
        ? shortcutCoverageSnapshotByRequestIdRef.current.get(searchRequestId) ?? null
        : null;
    const shortcutCoveragePendingForCurrentRequest =
      searchRequestId != null
        ? shortcutCoveragePendingSnapshotByRequestIdRef.current.get(searchRequestId) ?? null
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
            entitiesKey: buildShortcutCoverageEntitiesKey(shortcutCoverageEntitiesForCurrentRequest),
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
      logger.warn('[REVEAL-LIFECYCLE] source_waiting_missing_search_request', {
        preparedVisualCycleKey,
        readinessKey,
        searchMode,
        activeTab,
        submittedQuery: state.submittedQuery ?? null,
        resultsRequestKey: mountedResultsSnapshot.resultsRequestKey,
        resultsHydrationKey: mountedResultsSnapshot.resultsHydrationKey,
        hasCommittedResultState,
        previousVisualCycleKey: previousSourceFrameSnapshot.visualCycleKey,
        previousPinCount: previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        previousDotCount: previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
        previousLabelCount: previousSourceFrameSnapshot.labelSourceStore.idsInOrder.length,
      });
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
      logger.warn('[REVEAL-LIFECYCLE] source_waiting_shortcut_coverage', {
        preparedVisualCycleKey,
        readinessKey,
        searchRequestId,
        currentShortcutCoverageRequestKey,
        coverageRequestKey: coverageResource?.requestKey ?? null,
        coverageSearchRequestId: coverageResource?.searchRequestId ?? null,
        coverageStatus: coverageResource?.status ?? 'idle',
        coverageReason: coverageResource?.terminalReason ?? null,
        shortcutCoverageLoading: shortcutCoverageLoadingRef.current,
        pendingCoverageForRequest: shortcutCoveragePendingForCurrentRequest != null,
        completedCoverageForRequest: shortcutCoverageSnapshotForCurrentRequest != null,
      });
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
    const cachedPreparedFrame = preparedSourceFrameByFingerprintRef.current.get(
      preparedFrameFingerprint
    );
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
          coverageResource?.status ??
          cachedPreparedFrame.snapshot.shortcutCoverageReadinessStatus,
        shortcutCoverageReadinessReason:
          coverageResource?.terminalReason ??
          cachedPreparedFrame.snapshot.shortcutCoverageReadinessReason,
        mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
		      };
		      const didPublishSourceFrame = sourceFramePort.publishSnapshot(nextCachedSnapshot);
      logPinInteractionSourceMismatch({
        source: 'prepared_frame_cache',
        preparedVisualCycleKey,
        readinessKey,
        markersRenderKey: nextCachedSnapshot.markersRenderKey,
        pinSourceStore: nextCachedSnapshot.pinSourceStore,
        pinInteractionSourceStore: nextCachedSnapshot.pinInteractionSourceStore,
      });
		      const pinStackDiagnostics = buildPinStackDiagnostics(nextCachedSnapshot.pinSourceStore);
	      logger[pinStackDiagnostics.hasStackingSignal ? 'warn' : 'debug'](
	        '[PIN-STACK-DIAG] source_pin_stack_probe',
	        {
	          source: 'prepared_frame_cache',
	          preparedVisualCycleKey,
	          readinessKey,
	          didPublishSourceFrame,
	          markersRenderKey: nextCachedSnapshot.markersRenderKey,
	          ...pinStackDiagnostics,
	        }
	      );
	      logger.debug('[REVEAL-LIFECYCLE] full_source_snapshot_published', {
	        source: 'prepared_frame_cache',
	        preparedVisualCycleKey,
	        readinessKey,
        didPublishSourceFrame,
	        markersRenderKey: nextCachedSnapshot.markersRenderKey,
	        pinCount: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
	        pinInteractionCount: nextCachedSnapshot.pinInteractionSourceStore.idsInOrder.length,
	        dotCount: nextCachedSnapshot.dotSourceStore.idsInOrder.length,
	        dotInteractionCount: nextCachedSnapshot.dotInteractionSourceStore.idsInOrder.length,
	        labelCount: nextCachedSnapshot.labelSourceStore.idsInOrder.length,
	        labelCollisionCount: nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length,
        coverageRequestKey: nextCachedSnapshot.shortcutCoverageRequestKey,
        coverageStatus: nextCachedSnapshot.shortcutCoverageReadinessStatus,
	        nextExpectedEvent: pinInteractionSourcesComplete
	          ? 'native_mounted_hidden_ack'
	          : 'pin_interactions_ready',
	      });
      if (nextCachedSnapshot.labelSourceStore.idsInOrder.length > 0) {
        logger.debug('[LABEL-PLACEMENT-DIAG] source_frame_label_candidates_published', {
          source: 'prepared_frame_cache',
          preparedVisualCycleKey,
          readinessKey,
          didPublishSourceFrame,
          pinCount: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
          labelCandidateCount: nextCachedSnapshot.labelSourceStore.idsInOrder.length,
          labelCollisionCount: nextCachedSnapshot.labelCollisionSourceStore.idsInOrder.length,
          labelCandidatesPerPin:
            nextCachedSnapshot.pinSourceStore.idsInOrder.length > 0
              ? nextCachedSnapshot.labelSourceStore.idsInOrder.length /
                nextCachedSnapshot.pinSourceStore.idsInOrder.length
              : null,
          mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
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
    const shouldTrackViewportCandidates =
      searchMode !== 'shortcut' || selectedRestaurantId !== null;
    if (shouldTrackViewportCandidates) {
      mapViewportQueryServiceRef.current.setCatalogEntries(markerCatalogEntries);
    }
    const visibleCandidates = shouldTrackViewportCandidates
      ? mapViewportQueryServiceRef.current.queryVisibleCandidates(
          {
            bounds: currentBounds,
            selectedRestaurantId,
          },
          mapQueryBudgetRef.current
        )
      : [];
    markerCandidatesRef.current = visibleCandidates.map((entry) => entry.feature);
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
      pinnedFeatures: [],
      buildMarkerKey,
    });
    const rankedCandidates = projectedInitialCandidates.rankedCandidates;
    const selectedRestaurantCandidates = projectedInitialCandidates.selectedRestaurantCandidates;
    const canUseRankedShortcutFrame =
      searchMode === 'shortcut' &&
      selectedRestaurantId == null &&
      effectiveRestaurantOnlyId == null;
    const shouldSeedInitialRankedShortcutFrame =
      canUseRankedShortcutFrame && lodPinnedMarkersRef.current.length === 0;
    const nextModel = shouldSeedInitialRankedShortcutFrame
      ? {
          nextPinnedKey: buildStableKeyFingerprint(
            rankedCandidates.slice(0, args.maxFullPins).map((feature) => buildMarkerKey(feature))
          ),
          nextPinnedMarkers: rankedCandidates.slice(0, args.maxFullPins),
          nextPinnedMeta: rankedCandidates.slice(0, args.maxFullPins).map((feature, index) => ({
            markerKey: buildMarkerKey(feature),
            lodZ: Math.max(0, args.maxFullPins - 1 - index),
          })),
          nextProposedPromoteSinceByMarkerKey: lodPinProposedPromoteSinceByMarkerKeyRef.current,
          nextProposedDemoteSinceByMarkerKey: lodPinProposedDemoteSinceByMarkerKeyRef.current,
        }
      : currentBounds
      ? buildMarkerRenderModel({
          bounds: currentBounds,
          rankedCandidates,
          selectedRestaurantCandidates,
          currentPinnedMarkers: lodPinnedMarkersRef.current,
          selectedRestaurantId,
          buildMarkerKey,
          maxPins: args.maxFullPins,
          visibleCandidateBuffer: args.lodVisibleCandidateBuffer,
          promoteStableMs: args.isMapMoving
            ? args.lodPinPromoteStableMsMoving
            : args.lodPinToggleStableMsIdle,
          demoteStableMs: args.isMapMoving
            ? args.lodPinDemoteStableMsMoving
            : args.lodPinToggleStableMsIdle,
          offscreenDemoteStableMs: args.isMapMoving ? args.lodPinOffscreenToggleStableMsMoving : 0,
          nowMs: Date.now(),
          proposedPromoteSinceByMarkerKey: lodPinProposedPromoteSinceByMarkerKeyRef.current,
          proposedDemoteSinceByMarkerKey: lodPinProposedDemoteSinceByMarkerKeyRef.current,
        })
      : {
          nextPinnedKey: '',
          nextPinnedMarkers: [],
          nextPinnedMeta: [],
          nextProposedPromoteSinceByMarkerKey: new Map<string, number>(),
          nextProposedDemoteSinceByMarkerKey: new Map<string, number>(),
        };
    lodPinnedKeyRef.current = nextModel.nextPinnedKey;
    lodPinnedMarkersRef.current = nextModel.nextPinnedMarkers;
    lodPinProposedPromoteSinceByMarkerKeyRef.current =
      nextModel.nextProposedPromoteSinceByMarkerKey;
    lodPinProposedDemoteSinceByMarkerKeyRef.current = nextModel.nextProposedDemoteSinceByMarkerKey;
    const visibleSortedRestaurantMarkers =
      nextModel.nextPinnedMarkers.length > 0
        ? nextModel.nextPinnedMarkers.map((feature, index) => ({
            ...feature,
            properties: {
              ...feature.properties,
              nativeLodZ: nextModel.nextPinnedMeta[index]?.lodZ ?? feature.properties.nativeLodZ,
              lodZ: nextModel.nextPinnedMeta[index]?.lodZ ?? feature.properties.lodZ,
            },
          }))
        : shouldSeedInitialRankedShortcutFrame
        ? rankedCandidates.slice(0, args.maxFullPins).map((feature, index) => ({
            ...feature,
            properties: {
              ...feature.properties,
              lodZ: Math.max(0, args.maxFullPins - 1 - index),
              nativeLodZ: Math.max(0, args.maxFullPins - 1 - index),
            },
          }))
        : [];
    const projectedVisualFrame = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      restaurantOnlyId: effectiveRestaurantOnlyId,
      pinnedFeatures: visibleSortedRestaurantMarkers,
      buildMarkerKey,
    });
    const visibleDotRestaurantMarkerFeatures = projectedVisualFrame.dotCandidates;

    const pinBuilder = createSearchMapSourceStoreBuilder(previousPinSourceStoreRef.current);
    visibleSortedRestaurantMarkers.forEach((feature, index) => {
      const markerKey = buildMarkerKey(feature);
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
          labelOrder: index + 1,
          nativeLodZ,
          nativeLodOpacity: 1,
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
    previousPinSourceStoreRef.current = pinSourceStore;

    const dotBuilder = createSearchMapSourceStoreBuilder(
      previousDotSourceStoreRef.current ?? EMPTY_SEARCH_MAP_SOURCE_STORE
    );
    visibleDotRestaurantMarkerFeatures.forEach((feature) => {
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
          nativeDotOpacity: 1,
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
    previousDotSourceStoreRef.current = dotSourceStore;
    const pinVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(pinSourceStore);
    const dotVisualIdentityKeys = collectSourceStoreVisualIdentityKeys(dotSourceStore);
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
    previousPinInteractionSourceStoreRef.current = pinInteractionSourceStore;

    const dotInteractionBuilder = createSearchMapSourceStoreBuilder(
      previousDotInteractionSourceStoreRef.current
    );
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
      dotInteractionBuilder.appendFeature(nextFeature, {
        semanticRevision,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        }),
      });
    });
    const dotInteractionSourceStore = dotInteractionBuilder.finish();
    previousDotInteractionSourceStoreRef.current = dotInteractionSourceStore;

    const { labelSourceStore, labelCollisionSourceStore, labelDerivedSourceIdentityKey } =
      buildDirectLabelStores({
        pinSourceStore,
        previousLabelSourceStore: previousLabelSourceStoreRef.current,
        previousLabelCollisionSourceStore: previousLabelCollisionSourceStoreRef.current,
      });
    previousLabelSourceStoreRef.current = labelSourceStore;
    previousLabelCollisionSourceStoreRef.current = labelCollisionSourceStore;
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
      dotInteractionSourceStore,
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
    const isResultsEnterInFlight =
      activePresentationTransport.transactionId != null &&
      activePresentationTransport.snapshotKind != null &&
      activePresentationTransport.snapshotKind !== 'results_exit' &&
      activePresentationTransport.executionStage !== 'settled';
	    const shouldPreserveResidentEnterSourceFrame =
	      preparedVisualCycleKey != null &&
	      previousSourceFrameSnapshot.visualCycleKey === preparedVisualCycleKey &&
	      hasNonEmptySearchMapSourceFrame(previousSourceFrameSnapshot) &&
	      !hasNonEmptySearchMapSourceFrame(sourceFrameSnapshot);
    if (isResultsEnterInFlight && !hasNonEmptySearchMapSourceFrame(sourceFrameSnapshot)) {
      logger.warn('[REVEAL-LIFECYCLE] source_empty_frame_during_enter', {
        transactionId: activePresentationTransport.transactionId,
        preparedVisualCycleKey,
        readinessKey,
        transportExecutionStage: activePresentationTransport.executionStage,
        shouldPreserveResidentEnterSourceFrame,
        previousVisualCycleKey: previousSourceFrameSnapshot.visualCycleKey,
        previousMarkersRenderKey: previousSourceFrameSnapshot.markersRenderKey,
        previousPinCount: previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        previousDotCount: previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
        previousLabelCount: previousSourceFrameSnapshot.labelSourceStore.idsInOrder.length,
        nextMarkersRenderKey: sourceFrameSnapshot.markersRenderKey,
        hasCommittedResultState,
        shouldProjectResultSources,
        restaurantCount: restaurants.length,
        dishCount: dishes.length,
        markerCatalogCount: markerCatalogEntries.length,
        shortcutCoverageReadyForPreparedEnter,
        mapSearchSurfaceResultsSourcesReady,
      });
    }
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
	    const didPublishSourceFrame = sourceFramePort.publishSnapshot(sourceFrameSnapshot);
	    logPinInteractionSourceMismatch({
	      source: 'recomputed',
	      preparedVisualCycleKey,
	      readinessKey,
	      markersRenderKey: sourceFrameSnapshot.markersRenderKey,
	      pinSourceStore: sourceFrameSnapshot.pinSourceStore,
	      pinInteractionSourceStore: sourceFrameSnapshot.pinInteractionSourceStore,
	    });
	    const pinStackDiagnostics = buildPinStackDiagnostics(sourceFrameSnapshot.pinSourceStore);
	    logger[pinStackDiagnostics.hasStackingSignal ? 'warn' : 'debug'](
	      '[PIN-STACK-DIAG] source_pin_stack_probe',
	      {
	        source: 'recomputed',
	        preparedVisualCycleKey,
	        readinessKey,
	        didPublishSourceFrame,
	        markersRenderKey: sourceFrameSnapshot.markersRenderKey,
	        ...pinStackDiagnostics,
	      }
	    );
	    logger.debug('[REVEAL-LIFECYCLE] full_source_snapshot_published', {
	      source: 'recomputed',
	      preparedVisualCycleKey,
      readinessKey,
      didPublishSourceFrame,
	      mapSearchSurfaceResultsSourcesReady,
	      markersRenderKey: sourceFrameSnapshot.markersRenderKey,
	      pinCount: sourceFrameSnapshot.pinSourceStore.idsInOrder.length,
	      pinInteractionCount: sourceFrameSnapshot.pinInteractionSourceStore.idsInOrder.length,
	      dotCount: sourceFrameSnapshot.dotSourceStore.idsInOrder.length,
	      dotInteractionCount: sourceFrameSnapshot.dotInteractionSourceStore.idsInOrder.length,
	      labelCount: sourceFrameSnapshot.labelSourceStore.idsInOrder.length,
      labelCollisionCount: sourceFrameSnapshot.labelCollisionSourceStore.idsInOrder.length,
      shortcutCoverageRequestKey: sourceFrameSnapshot.shortcutCoverageRequestKey,
      shortcutCoverageStatus: sourceFrameSnapshot.shortcutCoverageReadinessStatus,
      shortcutCoverageReason: sourceFrameSnapshot.shortcutCoverageReadinessReason,
      nextExpectedEvent: mapSearchSurfaceResultsSourcesReady
        ? 'native_mounted_hidden_ack'
        : 'source_readiness_true',
    });
    if (sourceFrameSnapshot.labelSourceStore.idsInOrder.length > 0) {
      logger.debug('[LABEL-PLACEMENT-DIAG] source_frame_label_candidates_published', {
        source: 'recomputed',
        preparedVisualCycleKey,
        readinessKey,
        didPublishSourceFrame,
        pinCount: sourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        labelCandidateCount: sourceFrameSnapshot.labelSourceStore.idsInOrder.length,
        labelCollisionCount: sourceFrameSnapshot.labelCollisionSourceStore.idsInOrder.length,
        labelCandidatesPerPin:
          sourceFrameSnapshot.pinSourceStore.idsInOrder.length > 0
            ? sourceFrameSnapshot.labelSourceStore.idsInOrder.length /
              sourceFrameSnapshot.pinSourceStore.idsInOrder.length
            : null,
        mapSearchSurfaceResultsSourcesReady,
      });
    }
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      const quietMeasuredLoopActive = isPerfScenarioQuietMeasuredLoopActive(scenarioConfig);
      const shouldEmitSourceFrameDiagnostics = !quietMeasuredLoopActive || didPublishSourceFrame;
      if (shouldEmitSourceFrameDiagnostics) {
        const compactCoverageProof = quietMeasuredLoopActive
          ? {
              shortcutCoverageInFlightCount,
              shortcutCoverageCompletedCount: coverageCounters.completed,
              shortcutCoverageReturnedFeatureCount:
                coverageResource?.returnedFeatureCount ?? 0,
              shortcutCoverageAcceptedFeatureCount:
                coverageResource?.acceptedFeatureCount ?? 0,
              shortcutCoverageStatus: coverageResource?.status ?? 'idle',
              shortcutCoverageTerminalReason: coverageResource?.terminalReason ?? null,
            }
          : {
              shortcutCoverageRequestKey: coverageResource?.requestKey ?? null,
              shortcutCoverageSearchRequestId:
                coverageResource?.searchRequestId ?? searchRequestId,
              shortcutCoverageBoundsKey: coverageResource?.boundsKey ?? null,
              shortcutCoverageActiveTab: coverageResource?.activeTab ?? activeTab,
              shortcutCoverageMarketKey: coverageResource?.marketKey ?? null,
              shortcutCoverageFetchReason: coverageResource?.fetchReason ?? null,
              shortcutCoverageInFlightCount,
              shortcutCoverageSupersededCount: coverageCounters.superseded,
              shortcutCoverageAbortedCount: coverageCounters.aborted,
              shortcutCoverageCompletedCount: coverageCounters.completed,
              shortcutCoverageReturnedFeatureCount:
                coverageResource?.returnedFeatureCount ?? 0,
              shortcutCoverageAcceptedFeatureCount:
                coverageResource?.acceptedFeatureCount ?? 0,
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
          event: 'lod_source_overlap_probe',
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
          candidateVisualIdentityCount: projectedVisualFrame.candidateVisualIdentityKeys.size,
          classifiedVisualIdentityCount: lodClassifiedVisualIdentityKeys.size,
          dotVisualIdentityCount: dotVisualIdentityKeys.size,
          fullPinBudget: args.maxFullPins,
          pinVisualIdentityCount: pinVisualIdentityKeys.size,
          promotedRestaurantsRenderAsPins:
            visibleSortedRestaurantMarkers.length === pinSourceStore.idsInOrder.length,
          nonPromotedRestaurantsRenderAsDots:
            visibleDotRestaurantMarkerFeatures.length === dotSourceStore.idsInOrder.length,
          unclassifiedCandidateVisualIdentityCount,
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_marker_visual_sources_contract',
          searchMode,
          activeTab,
          readinessKey,
          pinCount: pinSourceStore.idsInOrder.length,
          dotCount: dotSourceStore.idsInOrder.length,
          labelCount: labelSourceStore.idsInOrder.length,
          labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
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
            mapSearchSurfaceResultsSourcesReady: latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
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
    const abortController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
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
        mapSearchSurfaceResultsSourcesReady: sourceFramePort.getSnapshot().mapSearchSurfaceResultsSourcesReady,
        readinessKey: nextResource.readinessKey,
        preparedTransactionId:
          latestArgsRef.current.resultsPresentationAuthority.getSnapshot()
            .resultsPresentationTransport.transactionId ?? null,
      });
    }
    void searchService
      .shortcutCoverage({
        entities: snapshot.entities,
        bounds: snapshot.bounds,
        includeTopDish,
        marketKey: mountedResults.metadata.marketKey,
      }, {
        signal: abortController?.signal,
      })
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
            mapSearchSurfaceResultsSourcesReady: latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
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
            mapSearchSurfaceResultsSourcesReady: latestSourceFrame.mapSearchSurfaceResultsSourcesReady,
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
    const unsubscribeViewport = viewportBoundsService.subscribe(() => {
      const state = searchRuntimeBus.getState();
      const args = latestArgsRef.current;
      const canSkipSourceRebuildForShortcutViewport =
        state.searchMode === 'shortcut' &&
        args.restaurantOnlyId == null &&
        args.highlightedRestaurantId == null;
      if (!canSkipSourceRebuildForShortcutViewport) {
        publishSourcesRef.current();
      }
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
      textColor: [
        'case',
        nativeHighlightedExpression,
        ACTIVE_TAB_COLOR_DARK,
        '#374151',
      ],
      textHaloColor: 'rgba(255, 255, 255, 0.9)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
      symbolZOrder: 'viewport-y',
    };
  }, []);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
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
