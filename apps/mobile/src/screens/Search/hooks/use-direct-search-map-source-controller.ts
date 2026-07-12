import React from 'react';
import {
  selectSearchMode,
  selectSubmittedQuery,
} from '../runtime/shared/search-desired-tuple-selectors';
import { InteractionManager } from 'react-native';
import type { Feature, Point } from 'geojson';
import MapboxGL from '@rnmapbox/maps';

import { logger } from '../../../utils';
import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../types';
import { type RestaurantFeatureProperties } from '../components/search-map';
import { ACTIVE_TAB_COLOR_DARK } from '../constants/search';
import {
  buildSearchMapVisualIdentityKey,
  normalizeSearchMapVisualFeatureIdentity,
  type SearchMapVisualIdentityKey,
} from '../utils/search-map-visual-identity';
import { buildMarkerCatalogReadModel } from '../runtime/map/map-read-model-builder';
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
  clearSearchMountedResultsCoverage,
  getSearchMountedResultsDataSnapshot,
  getSeededMarkerRestaurants,
  subscribeSearchMountedResultsDataSnapshot,
  type SearchMountedResultsCoverageEntry,
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

type DirectMapPreparedSourceFrame = {
  fingerprint: string;
  snapshot: ReturnType<SearchMapSourceFramePort['getSnapshot']>;
  // True when this entry was built by the idle sibling-tab PREWARM (R2-C2) rather than a live
  // publish. Drives the 'toggle_frame_rebuilt_despite_prewarm' dev contract: a toggle publish
  // that rebuilds while a prewarmed entry exists for the SAME fingerprint means the cache-hit
  // gate rejected a frame the prewarm believed valid — a silent double-compute regression.
  prewarmed: boolean;
};

// R2-C2 sibling-tab frame PREWARM (plans/search-flow-plan.md §D6a): after a reveal/toggle
// settles, publishSourcesInner re-runs in this mode on the IDLE queue to build the OTHER
// tab's source frame into the prepared-frame cache. Prewarm mode is build-only: it must
// never publish to the source frame port, never mutate the controller's shared refs
// (resident stores / catalog memo / LOD reset keys / diagnostics), and must read the
// SIBLING tab's coverage from the by-requestKey caches (the live refs hold the ACTIVE
// tab's coverage). Staleness is handled purely by key identity: the prewarmed entry is
// stored under the same buildSourceFrameDataReuseKey fingerprint the toggle publish
// computes, so any input drift (camera bounds, catalog, coverage, selection, query) is a
// key mismatch and the toggle rebuilds as before. (The native promoted set is NOT an
// input — the collision bake is promotion-independent per the D6e surgery.)
type DirectMapFramePrewarmRequest = {
  prewarmTab: 'dishes' | 'restaurants';
};

// S1: every coverage completion path commits into the WORLD store. The resource lanes
// carry activeTab as a plain string; a coverage fetch without a real tab is a broken
// input — loud, never silently narrowed.
const readWorldCoverageEntry = (
  searchRequestId: string | null,
  tab: 'dishes' | 'restaurants' | null
): SearchMountedResultsCoverageEntry | null => {
  if (searchRequestId == null || (tab !== 'dishes' && tab !== 'restaurants')) {
    return null;
  }
  const coverage = getSearchMountedResultsDataSnapshot().coverage;
  return coverage?.searchRequestId === searchRequestId ? (coverage.byTab[tab] ?? null) : null;
};

// Port-compatible readiness mapping (the frame port keeps its enum; the values are now a
// PROJECTION of the world entry — key and features can never come from different worlds).
const toCoverageReadinessStatus = (
  entry: SearchMountedResultsCoverageEntry | null
): 'idle' | 'loading' | 'completed' | 'empty' | 'failed' =>
  entry == null
    ? 'idle'
    : entry.status === 'resolving'
      ? 'loading'
      : entry.status === 'failed'
        ? 'failed'
        : (entry.features?.length ?? 0) > 0
          ? 'completed'
          : 'empty';

// TR5-N (map follows the active variant): the coverage request carries the ACTIVE filter
// state (open-now / price / rising) so the dots+pins reflect the same variant as the cards.
// The filters fold into the coverage request key — a filter flip is a DIFFERENT coverage
// variant (cache miss + refetch), and the frame fingerprint inherits it via the coverage
// requestKey it already embeds.

// Shared coverage-feature mapping — the ONE place that turns a raw shortcut-coverage FeatureCollection into
// the validated dot features. Used by BOTH the active-tab fetch and the sibling-tab prefetch, so the two tabs'
// coverage is built identically (zero-network toggle relies on the prefetched sibling being byte-identical to
// what a live fetch would have produced).

const buildSourceFrameDataReuseKey = ({
  activeTab,
  bounds,
  catalogCoverageIdentityKey,
  markersRenderKey,
  searchMode,
  selectedRestaurantId,
  submittedQuery,
}: {
  activeTab: string | null;
  bounds: MapBounds | null;
  catalogCoverageIdentityKey: string;
  markersRenderKey: string;
  searchMode: string | null;
  selectedRestaurantId: string | null;
  submittedQuery: string | null;
}): string =>
  [
    `mode:${searchMode ?? 'none'}`,
    `tab:${activeTab ?? 'none'}`,
    `query:${submittedQuery ?? 'none'}`,
    `bounds:${bounds == null ? 'none' : buildShortcutCoverageBoundsKey(bounds)}`,
    `selected:${selectedRestaurantId ?? 'none'}`,
    `markers:${markersRenderKey}`,
    `catalog:${catalogCoverageIdentityKey}`,
    `visualProjector:${SEARCH_MAP_VISUAL_PROJECTOR_VERSION}`,
  ].join('|');

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

const hasNonEmptySearchMapSourceFrame = (
  snapshot: Pick<SearchMapSourceFrameSnapshot, 'pinSourceStore' | 'dotSourceStore'>
): boolean =>
  snapshot.pinSourceStore.idsInOrder.length > 0 || snapshot.dotSourceStore.idsInOrder.length > 0;

const intersectStringSets = (left: ReadonlySet<string>, right: ReadonlySet<string>): string[] => {
  const overlap: string[] = [];
  left.forEach((value) => {
    if (right.has(value)) {
      overlap.push(value);
    }
  });
  return overlap.sort();
};

type SearchMapVisualSourceKind = 'main_results' | 'shortcut_coverage' | 'viewport' | 'selected';

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
  selected: 400,
  shortcut_coverage: 300,
  viewport: 200,
  main_results: 100,
};

const resolveEffectiveVisualSourceKind = ({
  feature,
  requestedSourceKind,
  selectedRestaurantId,
}: {
  feature: Feature<Point, RestaurantFeatureProperties>;
  requestedSourceKind: SearchMapVisualSourceKind;
  selectedRestaurantId: string | null;
}): SearchMapVisualSourceKind => {
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

type SearchMapVisualRankOrder = 'crave' | 'rising';

const collectSearchMapVisualCandidates = ({
  sources,
  selectedRestaurantId,
  buildMarkerKey,
  rankOrder,
}: {
  sources: readonly SearchMapVisualCandidateSource[];
  selectedRestaurantId: string | null;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  rankOrder: SearchMapVisualRankOrder;
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
    // RANK by the ACTIVE VARIANT'S ranking key so the pin badge == the results-list position:
    // rising DESC (nulls last) when the rising toggle is on, else the HIGH-PRECISION
    // craveScoreExact (percentile_rank) DESC — NOT VISUAL_SOURCE_PRIORITY (that is DEDUP-only;
    // see shouldReplaceVisualCandidate) and NOT the rounded display craveScore. Hard-coding
    // craveScoreExact here was the "map ignores the rising toggle" bug: the list re-sorted by
    // rising while the pins kept crave order. Missing keys sort last. Tie-breaks: craveScoreExact
    // DESC, display craveScore DESC, then a stable restaurantId, then markerKey.
    if (rankOrder === 'rising') {
      const leftRising =
        typeof left.feature.properties.rising === 'number'
          ? left.feature.properties.rising
          : -Infinity;
      const rightRising =
        typeof right.feature.properties.rising === 'number'
          ? right.feature.properties.rising
          : -Infinity;
      if (leftRising !== rightRising) {
        return rightRising - leftRising;
      }
    }
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
    // RT-7: within a score-tied GROUP the representative sorts FIRST — the native group
    // budget promotes the group's first ranked member, and the slot belongs to the
    // representative (b441771c's contract; previously lost to coordinate-lexicographic
    // markerKey order).
    const representativeDiff =
      Number(right.feature.properties.isGroupRepresentative === true) -
      Number(left.feature.properties.isGroupRepresentative === true);
    return (
      left.feature.properties.restaurantId.localeCompare(right.feature.properties.restaurantId) ||
      representativeDiff ||
      left.markerKey.localeCompare(right.markerKey)
    );
  });
};

const projectSearchMapVisualFrame = ({
  rankedSources,
  dotSources,
  selectedRestaurantId,
  buildMarkerKey,
  rankOrder,
}: {
  rankedSources: readonly SearchMapVisualCandidateSource[];
  dotSources: readonly SearchMapVisualCandidateSource[];
  selectedRestaurantId: string | null;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  rankOrder: SearchMapVisualRankOrder;
}): ProjectedSearchMapVisualFrame => {
  const rankedCandidates = collectSearchMapVisualCandidates({
    sources: rankedSources,
    selectedRestaurantId,
    buildMarkerKey,
    rankOrder,
  });
  const dotCandidates = collectSearchMapVisualCandidates({
    sources: dotSources,
    selectedRestaurantId,
    buildMarkerKey,
    rankOrder,
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
          buildMarkerKey,
          rankOrder,
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
  labelCollisionSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore;
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
  // Label DATA family deleted (VA-cleanup): labels render as ViewAnnotations from the candidate
  // catalog. The remaining structural invariant is pin uniqueness; the collision store is
  // definitionally one obstacle per on-screen-gated marker (built in the same loop).
  if (duplicatePinVisualIdentityKeys.length === 0) {
    return;
  }

  logger.error('[SearchMap] projected visual frame invariant failed', {
    duplicatePinVisualIdentityKeyCount: duplicatePinVisualIdentityKeys.length,
    duplicatePinVisualIdentityKeySamples: duplicatePinVisualIdentityKeys.slice(0, 8),
    residentDotPromotedVisualIdentityOverlapCount: pinDotVisualIdentityOverlap.length,
    residentDotPromotedVisualIdentityOverlapSamples: pinDotVisualIdentityOverlap.slice(0, 8),
    pinCount: pinSourceStore.idsInOrder.length,
    dotCount: dotSourceStore.idsInOrder.length,
    labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
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

// L1/L4 GROUP-AWARE rank unification: the unified rank is the GROUP's dense position in the
// projected order — a multi-location restaurant's members (representative + in-bounds sibling
// dots + invisible residents) all carry their group's ONE rank and consume ONE position, so a
// 3-location #1 can never inflate the next restaurant's badge to 4. Dish pins are their own
// group (one location per dish by construction). Used by BOTH the candidate-catalog re-rank and
// the badge/reveal-seed re-rank — the two MUST stay identical (badge == promotion rank).
const assignUnifiedGroupRanks = (
  features: Array<Feature<Point, RestaurantFeatureProperties>>,
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string,
  // RT-12 (red-team 2026-07-10): groups that are ADDITIVE to the presented world (the
  // selection overlay's appended group) rank AFTER every world group — a profile
  // open/close must never renumber the world's badges. Empty set = pure world ranking.
  deferredGroupKeys: ReadonlySet<string> = EMPTY_DEFERRED_GROUP_KEYS
): Array<Feature<Point, RestaurantFeatureProperties>> => {
  const resolveGroupKey = (feature: Feature<Point, RestaurantFeatureProperties>): string =>
    feature.properties.isDishPin === true || !feature.properties.restaurantId
      ? String(feature.id ?? buildMarkerKey(feature))
      : feature.properties.restaurantId;
  const unifiedRankByGroup = new Map<string, number>();
  for (const feature of features) {
    const groupKey = resolveGroupKey(feature);
    if (deferredGroupKeys.has(groupKey) || unifiedRankByGroup.has(groupKey)) {
      continue;
    }
    unifiedRankByGroup.set(groupKey, unifiedRankByGroup.size + 1);
  }
  for (const feature of features) {
    const groupKey = resolveGroupKey(feature);
    if (!unifiedRankByGroup.has(groupKey)) {
      unifiedRankByGroup.set(groupKey, unifiedRankByGroup.size + 1);
    }
  }
  return features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      rank: unifiedRankByGroup.get(resolveGroupKey(feature)) as number,
    },
  }));
};

const EMPTY_DEFERRED_GROUP_KEYS: ReadonlySet<string> = new Set();

type DirectMapSourceControllerBaseArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
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
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  resetShortcutCoverageState: () => void;
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
};

const buildLabelSourceFeatureDiffKey = (
  feature: Feature<Point, RestaurantFeatureProperties>
): string => getSearchMapSourceTransportFeature(feature).diffKey;

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
      // PROMOTION-INDEPENDENT (D6e collision surgery): JS bakes every obstacle demoted (0), exactly
      // like the pin doctrine ("nativeLodOpacity=0 for ALL pins under v5 — the engine owns opacity").
      // NATIVE owns obstacle gating: applyV5ObstacleReseed flips promoted obstacles to 1 from the
      // engine's live promoted set (decide-delta drains + the post-JS-apply re-assert), covering #16
      // (mid-zoom promotion) natively. Baking the live promoted set here (the old #16 fix) made every
      // LOD promotion round-trip native→JS→rebuild→republish → collision-only frame generations →
      // native re-mounted identical sources (~106ms/toggle) + [R3RECON] duplicate-adds + idle churn.
      nativeLodOpacity: 0,
    } as RestaurantFeatureProperties,
  }) satisfies Feature<Point, RestaurantFeatureProperties>;

const buildDirectLabelStores = ({
  pinSourceStore,
  previousLabelCollisionSourceStore,
  onScreenMarkerKeys,
}: {
  pinSourceStore: SearchMapSourceStore;
  previousLabelCollisionSourceStore: SearchMapSourceStore;
  // Native's on-screen marker set (getNativeVisibleMarkerKeys), or null when native has not
  // reported yet. Obstacles are built only for these keys (the set native promotes its top-N from).
  onScreenMarkerKeys: ReadonlySet<string> | null;
}): {
  labelCollisionSourceStore: SearchMapSourceStore;
} => {
  const collisionBuilder = createSearchMapSourceStoreBuilder(previousLabelCollisionSourceStore);
  pinSourceStore.idsInOrder.forEach((markerKey) => {
    const feature = pinSourceStore.featureById.get(markerKey);
    if (!feature) {
      return;
    }
    // ON-SCREEN-GATED: native owns the on-screen set; JS builds obstacles only for the markers
    // native reports on-screen (the set its promoted top-N is drawn from). When native has not
    // reported a visible set yet (null, pre-projection at first reveal) we build all. (Label DATA
    // family deleted — name labels render as ViewAnnotations from the candidate catalog.)
    if (onScreenMarkerKeys != null && !onScreenMarkerKeys.has(markerKey)) {
      return;
    }
    // COLLISION obstacle: PROMOTION-INDEPENDENT: obstacle gating (0↔1 on the promoted set) is fully
    // NATIVE — applyV5ObstacleReseed reseeds from the catalog coordinate on decide deltas AND
    // re-asserts after every JS collision-source apply — so JS collision residency does NOT need to
    // cover off-screen candidates, and promotion changes never re-enter the JS build (the D6e
    // round-trip).
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

  return {
    labelCollisionSourceStore: collisionBuilder.finish(),
  };
};

export const useDirectSearchMapSourceController = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  sourceFramePort,
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
    shouldLogSearchComputes,
  ]);

  const previousPinSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const previousDotSourceStoreRef = React.useRef<SearchMapSourceStore | null>(null);
  const previousPinInteractionSourceStoreRef = React.useRef<SearchMapSourceStore>(
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
  const preparedSourceFrameByFingerprintRef = React.useRef<
    Map<string, DirectMapPreparedSourceFrame>
  >(new Map());
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
      const busState = searchRuntimeBus.getState();
      const worldEntry = readWorldCoverageEntry(
        getSearchMountedResultsDataSnapshot().results?.metadata?.searchRequestId ?? null,
        busState.activeTab === 'dishes' || busState.activeTab === 'restaurants'
          ? busState.activeTab
          : null
      );
      sourceFramePort.publishVisualState({
        visibleSortedRestaurantMarkersCount: pinCount,
        visibleDotRestaurantFeaturesCount: dotCount,
        isShortcutCoverageLoading: worldEntry?.status === 'resolving',
        shortcutCoverageRequestKey: worldEntry?.requestKey ?? null,
        shortcutCoverageReadinessStatus: toCoverageReadinessStatus(worldEntry),
        shortcutCoverageReadinessReason: worldEntry?.reason ?? null,
      });
    },
    [searchRuntimeBus, sourceFramePort]
  );

  const adoptResidentSourceFrameSnapshot = React.useCallback(
    (snapshot: SearchMapSourceFrameSnapshot) => {
      previousPinSourceStoreRef.current = snapshot.pinSourceStore;
      previousDotSourceStoreRef.current = snapshot.dotSourceStore;
      previousPinInteractionSourceStoreRef.current = snapshot.pinInteractionSourceStore;
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
  // R2-C2 fix (fp-diff attributed): the settle-triggered prewarm fired BEFORE the map finished
  // settling (post-reveal camera fit + LOD promotion still moving), so its fingerprint drifted
  // (bounds + promoted-hash segments) and the toggle lookup missed. Every LIVE publish already
  // re-runs on exactly the inputs that invalidate the fingerprint, so the sibling prewarm is
  // re-armed (debounced, idle-scheduled) after each live publish — it converges to the final
  // inputs automatically and bails cheaply when the fingerprint is already cached.
  const siblingPrewarmDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const armSiblingPrewarmAfterLivePublish = React.useCallback(() => {
    if (siblingPrewarmDebounceRef.current != null) {
      clearTimeout(siblingPrewarmDebounceRef.current);
    }
    siblingPrewarmDebounceRef.current = setTimeout(() => {
      siblingPrewarmDebounceRef.current = null;
      InteractionManager.runAfterInteractions(() => {
        prewarmSiblingTabSourceFrameRef.current();
      });
    }, 300);
  }, []);
  React.useEffect(
    () => () => {
      if (siblingPrewarmDebounceRef.current != null) {
        clearTimeout(siblingPrewarmDebounceRef.current);
      }
    },
    []
  );
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
      armSiblingPrewarmAfterLivePublish();
    }
  };
  // Prewarm mode (R2-C2): build-only re-entry for the SIBLING tab. Returns true when a
  // frame was built and stored into the prepared cache (drives the [T1DBG] prewarm log).
  const publishSourcesInnerRef = React.useRef<
    (prewarm?: DirectMapFramePrewarmRequest) => boolean | void
  >(() => {});
  publishSourcesInnerRef.current = (prewarm?: DirectMapFramePrewarmRequest) => {
    const isPrewarmBuild = prewarm != null;
    const state = searchRuntimeBus.getState();
    const args = latestArgsRef.current;
    const projectionIsMapMoving =
      args.isMapMoving || isMapMotionPressureMoving(args.mapMotionPressureController);
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    const committedMapSourceFrameKey = resolveCommittedMapSourceFrameKey(state);
    const selectedRestaurantId = args.highlightedRestaurantId;
    const hasCommittedResultState =
      selectSearchMode(state) != null && mountedResultsSnapshot.resultsRequestKey != null;
    // Seeded marker source: when a profile opens without committed results (e.g. an autocomplete
    // suggestion tap), the hydrated restaurant publishes itself here so the map can place its pin.
    // It is only consulted when there are no committed restaurants — committed results always win.
    const seededMarkerRestaurants = getSeededMarkerRestaurants();
    const shouldProjectResultSources =
      hasCommittedResultState || selectedRestaurantId != null || seededMarkerRestaurants != null;
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
    // L4 (§3.4 ADDITIVE selection): a profile opened for a restaurant OUTSIDE the presented
    // world (autocomplete suggestion mid-session) joins the catalog ADDITIVELY — the world's
    // pins stay, the selected group appends (rank-1 reveal fallback + all-locations spread +
    // forcedKeys promotion all key off selectedRestaurantId downstream). Gated to the ACTIVE
    // selection so a stale seed from a closed profile can never linger in later frames. The
    // pure-seed branch above is the degenerate case (union with an empty world).
    const additiveSeededRestaurants =
      !isSeededRestaurantProjection &&
      seededMarkerRestaurants != null &&
      selectedRestaurantId != null
        ? seededMarkerRestaurants.filter(
            (restaurant) =>
              restaurant.restaurantId === selectedRestaurantId &&
              !committedRestaurants.some(
                (committed) => committed.restaurantId === restaurant.restaurantId
              )
          )
        : [];
    const restaurants = isSeededRestaurantProjection
      ? seededMarkerRestaurants
      : additiveSeededRestaurants.length > 0
        ? [...committedRestaurants, ...additiveSeededRestaurants]
        : committedRestaurants;
    const dishes = shouldProjectResultSources
      ? (mountedResults?.dishes ?? EMPTY_DISHES)
      : EMPTY_DISHES;
    // Prewarm builds the SIBLING tab's frame: override the tab axis; everything downstream
    // (catalog resolution, coverage requestKey, fingerprint) derives from this one binding, so
    // the stored fingerprint is exactly what the toggle-time publish will compute.
    const activeTab = prewarm?.prewarmTab ?? state.activeTab;
    const searchMode = selectSearchMode(state);
    // Prewarm is only useful where the prepared-frame cache-hit replay applies (shortcut mode,
    // committed results, no selection intent — mirrored below once selection is resolved).
    if (isPrewarmBuild && (searchMode !== 'shortcut' || searchRequestId == null)) {
      return false;
    }
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    const resetKey = `${searchMode ?? 'none'}::${activeTab}`;
    if (!isPrewarmBuild && lodPinnedResetKeyRef.current !== resetKey) {
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
        selectedRestaurantId != null);
    if (
      !isPrewarmBuild &&
      preparedVisualCycleKey != null &&
      String(preparedVisualCycleKey).includes('toggle')
    ) {
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
    // Prewarm bail-outs: selection intents force-mutate the catalog (all-locations render /
    // rank-1 reveal) AND the cache-hit replay path never fires while a selection is active, so
    // a prewarmed selected-frame could never be consumed — skip instead of caching dead weight.
    if (isPrewarmBuild && selectedRestaurantId != null) {
      return false;
    }
    if (isPrewarmBuild && !isSearchVisualProjectionLive) {
      return false;
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
    // S1b: coverage is read EXCLUSIVELY from the world snapshot — results and coverage
    // arrive in one atomic snapshot, so the frame can never pair a key with another
    // world's features, and "coverage not ready for this key" limbo (the covNotReady
    // ladder) is unrepresentable. World readiness is ONE fact below.
    const isShortcutCoverageProjection = searchMode === 'shortcut' && selectedRestaurantId == null;
    const coverageEntry = isShortcutCoverageProjection
      ? readWorldCoverageEntry(searchRequestId, activeTab)
      : null;
    const isCoverageLoading = coverageEntry?.status === 'resolving';
    const coverageTerminal =
      coverageEntry?.status === 'ready' || coverageEntry?.status === 'failed';
    const coverageReadinessStatus = toCoverageReadinessStatus(coverageEntry);
    if (isPrewarmBuild && isShortcutCoverageProjection && coverageEntry?.status !== 'ready') {
      // Only a READY world entry is a buildable prewarm input (its features ride the
      // entry — a ready entry structurally has them). Anything else → the toggle
      // resolves first; building now would bake a frame the toggle can never match.
      return false;
    }
    if (
      !isPrewarmBuild &&
      isShortcutCoverageProjection &&
      readinessKey != null &&
      preparedVisualCycleKey != null &&
      (searchRequestId == null || !coverageTerminal)
    ) {
      if (searchRequestId == null && mountedResults != null) {
        // A shortcut world with COMMITTED results always has a searchRequestId; a null
        // here is a broken input. (Results not yet committed — submit in flight — is the
        // normal wait state and publishes not-ready below without noise.)
        reportSearchFlowContractViolation('shortcut_world_missing_search_request_id', {
          readinessKey,
          preparedVisualCycleKey,
          resultsRequestKey: mountedResultsSnapshot.resultsRequestKey ?? 'null',
        });
      }
      sourceFramePort.publishVisualState({
        visibleSortedRestaurantMarkersCount:
          previousSourceFrameSnapshot.pinSourceStore.idsInOrder.length,
        visibleDotRestaurantFeaturesCount:
          previousSourceFrameSnapshot.dotSourceStore.idsInOrder.length,
        isShortcutCoverageLoading: isCoverageLoading,
        shortcutCoverageRequestKey: coverageEntry?.requestKey ?? null,
        shortcutCoverageReadinessStatus:
          coverageEntry == null ? 'loading' : coverageReadinessStatus,
        shortcutCoverageReadinessReason: coverageEntry?.reason ?? null,
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: readinessKey,
      });
      return;
    }
    if (!isPrewarmBuild && coverageEntry?.status === 'failed') {
      // LOUD degraded frame: zero dots, pins from main_results still render. Never an
      // invisible early return.
      reportSearchFlowContractViolation('shortcut_coverage_failed_frame_built', {
        requestKey: coverageEntry.requestKey,
        reason: coverageEntry.reason ?? 'unknown',
        searchRequestId: searchRequestId ?? 'null',
        activeTab,
      });
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
    if (!isPrewarmBuild) {
      restaurantsByIdRef.current = restaurantsById;
      restaurantsRef.current = restaurants;
    }
    // R1a SINGLE-AUTHORITY RULE (plans/search-flow-plan.md §D6): for committed results, the
    // store's precomputed marker catalog (buildMarkerCatalogReadModel run ONCE at response
    // commit, same computation the cards' rank order derives from) is THE marker-catalog
    // authority. The in-controller buildMarkerCatalogReadModel below is a FALLBACK only for
    // inputs the store cannot precompute: no committed results (seeded single-restaurant
    // profile pin), selected-pin forced inclusion (selection changes the
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
      hasPrecomputedMarkerCatalogForResults && selectedRestaurantId == null;
    if (
      !isPrewarmBuild &&
      !canUsePrecomputedMarkerCatalog &&
      hasPrecomputedMarkerCatalogForResults &&
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
            selectedRestaurantId,
            canonicalRestaurantRankById,
            locationSelectionAnchor: args.resolveRestaurantLocationSelectionAnchor(),
            searchedBounds: viewportBoundsService.getSearchBaselineBounds() ?? null,
            resolveRestaurantMapLocations: args.resolveRestaurantMapLocations,
            pickPreferredRestaurantMapLocation: args.pickPreferredRestaurantMapLocation,
            getCraveScoreColorFromScore: args.getCraveScoreColorFromScore,
          });
    const markerCatalogEntries = markerCatalogReadModel.catalog;
    // D6e collision surgery: the LIVE native promoted set is NO LONGER a build input (the obstacle
    // bake is promotion-independent; native owns gating via applyV5ObstacleReseed), so it is gone
    // from the reuse key — promotion changes must NOT bust the prepared-frame cache (that was the
    // round-trip that minted collision-only frame generations).
    const preparedFrameFingerprint = buildSourceFrameDataReuseKey({
      activeTab,
      bounds: currentBounds,
      catalogCoverageIdentityKey: [
        markerCatalogReadModel.primaryCount.toString(36),
        coverageEntry?.requestKey ?? 'coverage:none',
        coverageReadinessStatus,
      ].join(':'),
      markersRenderKey: buildStableKeyFingerprint(
        markerCatalogEntries.map((entry) => buildMarkerKey(entry.feature))
      ),
      searchMode,
      selectedRestaurantId,
      submittedQuery: selectSubmittedQuery(state),
    });
    const cachedPreparedFrame =
      preparedSourceFrameByFingerprintRef.current.get(preparedFrameFingerprint);
    if (__DEV__) {
      console.log(
        `[T1DBG] frameCache:lookup hit=${cachedPreparedFrame != null} fp=${preparedFrameFingerprint}`
      );
    }
    if (isPrewarmBuild && cachedPreparedFrame != null) {
      // Already prepared under this exact fingerprint (a prior publish or prewarm) — nothing to do.
      return false;
    }
    if (
      !isPrewarmBuild &&
      cachedPreparedFrame != null &&
      readinessKey != null &&
      searchMode === 'shortcut' &&
      selectedRestaurantId == null &&
      coverageTerminal
    ) {
      const pinInteractionSourcesComplete = arePinInteractionSourcesComplete(
        cachedPreparedFrame.snapshot
      );
      const nextCachedSnapshot = {
        ...cachedPreparedFrame.snapshot,
        visualCycleKey: preparedVisualCycleKey,
        isShortcutCoverageLoading: false,
        shortcutCoverageRequestKey:
          coverageEntry?.requestKey ?? cachedPreparedFrame.snapshot.shortcutCoverageRequestKey,
        shortcutCoverageReadinessStatus:
          coverageEntry != null
            ? coverageReadinessStatus
            : cachedPreparedFrame.snapshot.shortcutCoverageReadinessStatus,
        shortcutCoverageReadinessReason:
          coverageEntry?.reason ?? cachedPreparedFrame.snapshot.shortcutCoverageReadinessReason,
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
            nextCachedSnapshot.dotSourceStore.idsInOrder.length > 0,
          expectsPreparedVisualSources: true,
          mapSearchSurfaceResultsSourcesReady: pinInteractionSourcesComplete,
          pinCount: nextCachedSnapshot.pinSourceStore.idsInOrder.length,
          dotCount: nextCachedSnapshot.dotSourceStore.idsInOrder.length,
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
    // R2-C2 guardrail: a TOGGLE publish is about to do the full frame rebuild even though a
    // PREWARMED entry exists for this exact fingerprint — the cache-hit gate above rejected it
    // (coverage resource / loading-flag / readiness state drifted from what the prewarm assumed).
    // Loud, not silent: this is the projection cost the prewarm exists to remove.
    if (
      !isPrewarmBuild &&
      cachedPreparedFrame != null &&
      cachedPreparedFrame.prewarmed &&
      readinessKey != null &&
      String(readinessKey).includes('toggle')
    ) {
      reportSearchFlowContractViolation('toggle_frame_rebuilt_despite_prewarm', {
        readinessKey,
        activeTab,
        searchMode,
        fingerprint: preparedFrameFingerprint.slice(-48),
        coverageStatus: coverageReadinessStatus,
        coverageRequestKey: coverageEntry?.requestKey ?? null,
        shortcutCoverageLoading: isCoverageLoading,
        selectedRestaurantId,
      });
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
    const markerCandidateFeatures = markerCatalogEntries.map((entry) => entry.feature);
    if (!isPrewarmBuild) {
      markerCandidatesRef.current = markerCandidateFeatures;
    }
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
    const shortcutResultFeatures = searchMode === 'shortcut' ? markerCandidateFeatures : [];
    const shortcutCoverageCandidateSources: SearchMapVisualCandidateSource[] =
      searchMode === 'shortcut'
        ? [
            {
              sourceKind: 'shortcut_coverage',
              features: coverageEntry?.status === 'ready' ? (coverageEntry.features ?? []) : [],
            },
            { sourceKind: 'main_results', features: shortcutResultFeatures },
          ]
        : [{ sourceKind: 'viewport', features: markerCandidateFeatures }];
    const rankedCandidateSources: SearchMapVisualCandidateSource[] =
      shortcutCoverageCandidateSources;
    const dotCandidateSources: SearchMapVisualCandidateSource[] = shortcutCoverageCandidateSources;
    // The pin badge follows the ACTIVE variant's ranking (rising vs crave) — read at frame
    // build from the same bus snapshot the coverage filters key uses, so badge order and the
    // coverage variant can never disagree.
    const visualRankOrder: SearchMapVisualRankOrder =
      state.desiredTuple.filterVariant.rising === true ? 'rising' : 'crave';
    const projectedInitialCandidates = projectSearchMapVisualFrame({
      rankedSources: rankedCandidateSources,
      dotSources: dotCandidateSources,
      selectedRestaurantId,
      buildMarkerKey,
      rankOrder: visualRankOrder,
    });
    // RANK DEDUP: a shortcut search merges TWO backends (shortcut_coverage + main_results) that each
    // rank their results from 1, so the raw feature.properties.rank collides across sources (the
    // "multiple rank 10s" bug). The merged list here is already deduped-by-restaurant and sorted
    // (source priority → rank → order), so the sorted POSITION is the single unified, unique,
    // stable-per-search rank. Re-assign it so the rank badge, the native promotion top-N, and the
    // native candidate catalog all read one consistent rank instead of two colliding rank spaces.
    // RT-12: the selection overlay's group ranks LAST — appended seeded groups always;
    // on the dish axis the selected restaurant's group too (its restaurant-axis entries
    // would otherwise interleave by score and renumber every dish badge below it).
    const additiveSelectionGroupKeys = new Set<string>(
      additiveSeededRestaurants.map((restaurant) => restaurant.restaurantId)
    );
    if (activeTab === 'dishes' && selectedRestaurantId != null && !isSeededRestaurantProjection) {
      additiveSelectionGroupKeys.add(selectedRestaurantId);
    }
    const rankedCandidates = assignUnifiedGroupRanks(
      projectedInitialCandidates.rankedCandidates,
      buildMarkerKey,
      additiveSelectionGroupKeys
    );
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
          ...(feature.properties.isInvisibleResident === true
            ? { isInvisibleResident: true }
            : null),
          ...(feature.properties.isGroupRepresentative === true
            ? { isGroupRepresentative: true }
            : null),
          // Label VA substrate: carry the name so native renders the label text (atomic with the coord).
          restaurantName: feature.properties.restaurantName,
          // Dish pins label as "dish name\nrestaurant name" (primary + smaller secondary line) —
          // the GL label twin's format expression, restored for the VA labels.
          ...(feature.properties.isDishPin === true &&
          typeof feature.properties.dishName === 'string' &&
          feature.properties.dishName.length > 0
            ? {
                labelText: feature.properties.dishName,
                labelSubtext: feature.properties.restaurantName,
              }
            : null),
        });
      });
      candidateCatalog = { key: candidateCatalogKey, entries: catalogEntries };
      // Prewarm must not evict the ACTIVE tab's catalog memo — the sibling catalog lives only
      // inside the prepared snapshot it rides.
      if (!isPrewarmBuild) {
        lastCandidateCatalogRef.current = candidateCatalog;
      }
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
    if (!isPrewarmBuild && nativeVisible != null) {
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
    if (!isPrewarmBuild && overlapRegion?.kind === 'radius' && submittedSearchBounds) {
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
      buildMarkerKey,
      rankOrder: visualRankOrder,
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
    const rerankedVisualCandidates = assignUnifiedGroupRanks(
      projectedVisualFrame.rankedCandidates,
      buildMarkerKey,
      additiveSelectionGroupKeys
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
    if (!isPrewarmBuild && isPerfScenarioAttributionActive(scenarioConfig)) {
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
    const { labelCollisionSourceStore } = buildDirectLabelStores({
      pinSourceStore,
      previousLabelCollisionSourceStore: previousLabelCollisionSourceStoreRef.current,
      onScreenMarkerKeys: onScreenMarkerKeysForLabels,
    });
    assertProjectedVisualFrameInvariants({
      pinSourceStore,
      dotSourceStore,
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
      pinSourceStore.idsInOrder.length > 0 || dotSourceStore.idsInOrder.length > 0;
    const expectsPreparedVisualSources =
      readinessKey != null &&
      hasCommittedDataForPreparedEnter &&
      shouldProjectResultSources &&
      (restaurants.length > 0 || markerCatalogEntries.length > 0);
    const pinInteractionSourcesComplete = arePinInteractionSourcesComplete({
      pinSourceStore,
      pinInteractionSourceStore,
    });
    const coverageReadyForPreparedEnter = !isShortcutCoverageProjection || coverageTerminal;
    const mapSearchSurfaceResultsSourcesReady =
      readinessKey != null &&
      hasCommittedDataForPreparedEnter &&
      coverageReadyForPreparedEnter &&
      pinInteractionSourcesComplete &&
      (!expectsPreparedVisualSources || hasVisualSources);
    if (!isPrewarmBuild && readinessKey != null && String(readinessKey).includes('toggle')) {
      logger.info('[TGLDBG-v2] srcGate', {
        activeTab,
        rk: readinessKey,
        sri: searchRequestId,
        rest: restaurants.length,
        dish: dishes.length,
        cat: markerCatalogEntries.length,
        pins: pinSourceStore.idsInOrder.length,
        dots: dotSourceStore.idsInOrder.length,
        committedData: hasCommittedDataForPreparedEnter,
        cov: coverageReadyForPreparedEnter,
        pinInter: pinInteractionSourcesComplete,
        shouldProj: shouldProjectResultSources,
        expectsVis: expectsPreparedVisualSources,
        hasVis: hasVisualSources,
        ready: mapSearchSurfaceResultsSourcesReady,
      });
    }
    const shortcutCoverageInFlightCount = isCoverageLoading ? 1 : 0;
    const shortcutCoverageTerminal = coverageTerminal;
    const sourceFrameSnapshot = {
      visualCycleKey: preparedVisualCycleKey,
      selectedRestaurantId,
      pinSourceStore,
      dotSourceStore,
      pinInteractionSourceStore,
      labelCollisionSourceStore,
      markersRenderKey: `pins:${pinsRenderKey}:dots:${dotsRenderKey}`,
      visibleSortedRestaurantMarkersCount: pinSourceStore.idsInOrder.length,
      visibleDotRestaurantFeaturesCount: dotSourceStore.idsInOrder.length,
      isShortcutCoverageLoading: isCoverageLoading,
      shortcutCoverageRequestKey: coverageEntry?.requestKey ?? null,
      shortcutCoverageReadinessStatus: coverageReadinessStatus,
      shortcutCoverageReadinessReason: coverageEntry?.reason ?? null,
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
      !isPrewarmBuild &&
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
          nextMarkersRenderKey: sourceFrameSnapshot.markersRenderKey,
        });
      }
      return;
    }
    if (__DEV__) {
      // [T1DBG] fingerprint diff probe: pair a prewarm store's fp with the toggle lookup's fp
      // to name the drifting key segment when a prewarm misses.
      console.log(
        `[T1DBG] frameCache:store prewarm=${isPrewarmBuild} fp=${preparedFrameFingerprint}`
      );
    }
    preparedSourceFrameByFingerprintRef.current.set(preparedFrameFingerprint, {
      fingerprint: preparedFrameFingerprint,
      snapshot: sourceFrameSnapshot,
      prewarmed: isPrewarmBuild,
    });
    if (preparedSourceFrameByFingerprintRef.current.size > 4) {
      const [oldestKey] = preparedSourceFrameByFingerprintRef.current.keys();
      if (oldestKey != null) {
        preparedSourceFrameByFingerprintRef.current.delete(oldestKey);
      }
    }
    if (isPrewarmBuild) {
      // Build-only mode ends here: the frame is cached for the toggle-time replay. NO port
      // publish, NO resident-ref adoption, NO telemetry — the on-screen frame is untouched.
      return true;
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
              shortcutCoverageCompletedCount: 0,
              shortcutCoverageReturnedFeatureCount: coverageEntry?.features?.length ?? 0,
              shortcutCoverageAcceptedFeatureCount: coverageEntry?.features?.length ?? 0,
              shortcutCoverageStatus: coverageReadinessStatus,
              shortcutCoverageTerminalReason: coverageEntry?.reason ?? null,
            }
          : {
              shortcutCoverageRequestKey: coverageEntry?.requestKey ?? null,
              shortcutCoverageSearchRequestId: searchRequestId,
              shortcutCoverageBoundsKey: null,
              shortcutCoverageActiveTab: activeTab,
              shortcutCoverageMarketKey: mountedResults?.metadata?.marketKey ?? null,
              shortcutCoverageFetchReason: null,
              shortcutCoverageInFlightCount,
              shortcutCoverageSupersededCount: 0,
              shortcutCoverageAbortedCount: 0,
              shortcutCoverageCompletedCount: 0,
              shortcutCoverageReturnedFeatureCount: coverageEntry?.features?.length ?? 0,
              shortcutCoverageAcceptedFeatureCount: coverageEntry?.features?.length ?? 0,
              shortcutCoverageStatus: coverageReadinessStatus,
              shortcutCoverageTerminalReason: coverageEntry?.reason ?? null,
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
          labelCollisionCount: labelCollisionSourceStore.idsInOrder.length,
          hasLabelCollisionSource: labelCollisionSourceStore.idsInOrder.length > 0,
          nativeMapLabelCollisionPreserved: labelCollisionSourceStore.idsInOrder.length > 0,
        });
        if (
          searchMode === 'shortcut' &&
          coverageEntry != null &&
          shortcutCoverageTerminal &&
          restaurants.length > 0 &&
          pinSourceStore.idsInOrder.length + dotSourceStore.idsInOrder.length === 0
        ) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'shortcut_coverage_terminal_empty_visual_contract',
            transactionId: preparedVisualCycleKey,
            readinessKey,
            requestKey: coverageEntry.requestKey,
            searchRequestId,
            activeTab,
            inFlightCount: shortcutCoverageInFlightCount,
            supersededCount: 0,
            abortedCount: 0,
            completedCount: 0,
            returnedFeatureCount: coverageEntry.features?.length ?? 0,
            acceptedFeatureCount: coverageEntry.features?.length ?? 0,
            pinCount: pinSourceStore.idsInOrder.length,
            dotCount: dotSourceStore.idsInOrder.length,
            mapSearchSurfaceResultsSourcesReady,
            terminalReason: coverageEntry.reason,
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
          searchMode === 'shortcut' &&
          coverageEntry?.status === 'ready' &&
          (coverageEntry.features?.length ?? 0) > 0
            ? (coverageEntry.features?.length ?? 0)
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
          hasPins: pinSourceStore.idsInOrder.length > 0,
          hasDots: dotSourceStore.idsInOrder.length > 0,
          hasLabelCollisionSource:
            pinSourceStore.idsInOrder.length === 0 ||
            labelCollisionSourceStore.idsInOrder.length >= pinSourceStore.idsInOrder.length,
        });
      }
    }
    publishTelemetry(pinSourceStore.idsInOrder.length, dotSourceStore.idsInOrder.length);
  };

  const resetShortcutCoverageState = React.useCallback(() => {
    // S3d: the controller's private coverage caches are gone (coverage rides the world;
    // the resolver's world cache survives dismiss — idle is resident-dormant). Dismiss
    // clears only the MOUNTED coverage projection.
    clearSearchMountedResultsCoverage();
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[PUBTRIG] coverage_reset');
    publishSourcesRef.current();
  }, []);

  React.useEffect(() => {
    const publishAndFetch = (trigger: string) => () => {
      // eslint-disable-next-line no-console
      if (__DEV__) console.log(`[PUBTRIG] ${trigger}`);
      // S3d: coverage rides the WORLD (fetched by the resolver in parallel with the
      // cards, committed atomically with the results) — the controller only PROJECTS it.
      publishSourcesRef.current();
    };
    publishAndFetch('mount')();
    // S4e red-team fix: `desiredTuple` publishes on EVERY tuple write (bounds commits,
    // chip taps, tab press-ups), but this controller's frame build consumes only the
    // identity projections (searchMode, submittedQuery). Value-guard on the derived
    // projection — the exact notification rate the deleted legacy keys provided — so a
    // chip/bounds write can't burn a ~125ms source-frame rebuild mid-choreography.
    let lastIdentityProjection = (() => {
      const state = searchRuntimeBus.getState();
      return `${selectSearchMode(state) ?? ''}|${selectSubmittedQuery(state)}|${state.activeTab}`;
    })();
    const publishOnIdentityProjectionChange = () => {
      const state = searchRuntimeBus.getState();
      const nextProjection = `${selectSearchMode(state) ?? ''}|${selectSubmittedQuery(state)}|${state.activeTab}`;
      if (nextProjection === lastIdentityProjection) {
        return;
      }
      lastIdentityProjection = nextProjection;
      publishAndFetch('bus')();
    };
    const unsubscribeBus = searchRuntimeBus.subscribe(
      publishOnIdentityProjectionChange,
      ['desiredTuple', 'activeTab'] as const,
      'map_source_controller_direct_state'
    );
    const unsubscribeMountedResults = subscribeSearchMountedResultsDataSnapshot(
      publishAndFetch('mounted'),
      {
        notifyMode: 'deferred',
      }
    );
    const unsubscribeSurfaceTransaction = resultsPresentationSurfaceAuthority.subscribe(
      publishAndFetch('surface'),
      ['searchSurfaceResultsTransactionKey', 'resultsIdentityKey', 'resultsRequestKey'] as const,
      'map_source_controller_surface_transaction'
    );
    const unsubscribeRedrawTransaction = getSearchSurfaceRuntime().subscribeSelector(
      (snapshot) => snapshot.redrawTransaction?.id ?? null,
      publishAndFetch('redraw')
    );
    // GRANULAR LOD (native-owned, Phase 2): the native projector now applies the promotion
    // decision per camera frame and crossfades the pins that changed role directly (no JS
    // round-trip, no whole-frame republish). So JS no longer re-publishes on camera ticks for
    // LOD — that path is gone. JS publishes the resident sources only on DATA changes; native
    // owns promote/demote during pan/zoom.
    return () => {
      unsubscribeBus();
      unsubscribeMountedResults();
      unsubscribeSurfaceTransaction();
      unsubscribeRedrawTransaction();
    };
  }, [resultsPresentationSurfaceAuthority, searchRuntimeBus, sourceFramePort]);

  // R2-C2 (plans/search-flow-plan.md §D6a): SIBLING-TAB FRAME PREWARM. The toggle commit's
  // remaining ~125ms burner is the synchronous source-frame build for the incoming tab
  // (publishSourcesInner: coverage merge + re-rank + pin/dot/pinInteraction/label store builds).
  // The marker CATALOGS are already precomputed per-tab at response commit (R1a-2), but the
  // FRAME depends on late-settling inputs (camera bounds, coverage), so it
  // cannot be built at response commit — instead we build it on the IDLE queue after each
  // reveal/toggle settles, into the existing prepared-frame cache under the exact fingerprint
  // the toggle-time publish will compute. Toggle → fingerprint match → cached replay (the
  // pre-existing cacheReveal path), no rebuild. Any input drift (camera move,
  // new search, coverage change, selection) changes the fingerprint → normal rebuild + a fresh
  // prewarm after the next settle. Stale frames can therefore never publish: the ONLY consumer
  // is the fingerprint-keyed lookup.
  const prewarmSiblingTabSourceFrameRef = React.useRef<() => void>(() => {});
  prewarmSiblingTabSourceFrameRef.current = () => {
    const state = searchRuntimeBus.getState();
    if (selectSearchMode(state) !== 'shortcut') {
      return;
    }
    const siblingTab = state.activeTab === 'dishes' ? 'restaurants' : 'dishes';
    const prewarmStartMs = performance.now();
    let built: boolean | void = false;
    try {
      built = publishSourcesInnerRef.current({ prewarmTab: siblingTab });
    } catch (error) {
      // Best-effort by design: a failed prewarm must never break the live pipeline — the
      // toggle simply rebuilds as before.
      logger.warn('Sibling-tab source-frame prewarm failed', {
        message: error instanceof Error ? error.message : 'unknown error',
        siblingTab,
      });
      return;
    }
    if (__DEV__ && built === true) {
      // eslint-disable-next-line no-console
      console.log(
        `[T1DBG] prewarm:built tab=${siblingTab} dur=${(performance.now() - prewarmStartMs).toFixed(1)}`
      );
    }
  };

  React.useEffect(() => {
    let disposed = false;
    let pendingIdleTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    let lastExecutionStage =
      resultsPresentationAuthority.getSnapshot().resultsPresentationTransport.executionStage;
    const unsubscribe = resultsPresentationAuthority.subscribe(
      () => {
        const transport = resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
        const previousStage = lastExecutionStage;
        lastExecutionStage = transport.executionStage;
        // Fire once per enter-settle edge (reveal or toggle fade-in completed). Exits don't
        // prewarm — a dismissed surface has no imminent toggle.
        if (
          transport.executionStage !== 'settled' ||
          previousStage === 'settled' ||
          transport.snapshotKind === 'results_exit'
        ) {
          return;
        }
        pendingIdleTask?.cancel();
        // Off the interaction window: runAfterInteractions defers past the settle animations /
        // active gestures; a superseding settle (rapid toggling) cancels and reschedules, and
        // key-identity makes any late run stale-safe regardless.
        pendingIdleTask = InteractionManager.runAfterInteractions(() => {
          pendingIdleTask = null;
          if (disposed) {
            return;
          }
          prewarmSiblingTabSourceFrameRef.current();
        });
      },
      ['resultsPresentationTransport'] as const,
      'map_source_controller_sibling_frame_prewarm'
    );
    return () => {
      disposed = true;
      pendingIdleTask?.cancel();
      unsubscribe();
    };
  }, [resultsPresentationAuthority, searchRuntimeBus]);

  // Re-publish sources when the highlight intent changes (or map-move state flips) so the
  // catalog rebuilds against the new selection.
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[PUBTRIG] effect_moving_highlight');
    publishSourcesRef.current();
  }, [isMapMoving, highlightedRestaurantId]);

  // PIN-AT-REVEAL race fix. On a cold committed reveal (poll comment-span / restaurant deep
  // link) the highlight intent is set BEFORE the committed search results go
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
    if (highlightedRestaurantId == null) {
      return undefined;
    }
    return subscribeSearchMountedResultsDataSnapshot(() => {
      publishSourcesRef.current();
    });
  }, [highlightedRestaurantId]);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      lastMarkerPressTargetRef.current = {
        restaurantId,
        coordinate: pressedCoordinate ?? null,
      };
      const worldSnapshot = getSearchMountedResultsDataSnapshot();
      const worldCoverageFeatures =
        worldSnapshot.coverage != null
          ? (Object.values(worldSnapshot.coverage.byTab)
              .flatMap((entry) => entry?.features ?? [])
              .find((feature) => feature.properties.restaurantId === restaurantId) ?? null)
          : null;
      latestArgsRef.current.profileCommandPort.openProfileFromMarker({
        restaurantId,
        restaurantName: worldCoverageFeatures?.properties.restaurantName,
        restaurant: restaurantsByIdRef.current.get(restaurantId),
        pressedCoordinate,
      });
    },
    []
  );

  return {
    buildMarkerKey,
    resetShortcutCoverageState,
    handleMarkerPress,
  };
};
