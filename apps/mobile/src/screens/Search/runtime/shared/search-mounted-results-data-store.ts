import React from 'react';
import type { SearchQueryIdentity } from './search-desired-state-contract';
import type { Feature, Point } from 'geojson';
import { reportSearchFlowContractViolation } from './search-flow-contracts';

import type { RestaurantResult, SearchResponse } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { MarkerCatalogEntry } from '../map/map-viewport-query';
import {
  isPerfScenarioAttributionActive,
  isPerfScenarioQuietMeasuredLoopActive,
  logPerfScenarioAttributionEvent,
  logPerfScenarioStackAttribution,
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  buildRestaurantResultCardDescriptor,
  type RestaurantResultCardDescriptor,
} from '../../components/restaurant-result-card-descriptor';
import { getMarkerColorForRestaurant } from '../../utils/marker-lod';
import type {
  ResultsListItem,
  ResultsMountedRestaurantCardRow,
} from '../read-models/list-read-model-builder';
import { buildSearchResultsSectionedProjection } from '../read-models/results-read-model-sectioned-projection';
import {
  createSearchResultsExactMatchOwnerController,
  toSearchResultsExactMatchProjection,
} from '../read-models/results-read-model-exact-match-state';
import type {
  SearchResultsBodyAdmissionActiveList,
  SearchResultsBodyAdmissionSnapshot,
} from './search-results-body-admission-controller';
import {
  resolveSearchResultsBodyAdmission,
  resolveSearchResultsBodyAdmissionPreparationRows,
} from './search-results-body-admission-controller';
import type { SearchSurfaceRedrawPhase } from '../controller/search-surface-redraw-phase';
import { RESULTS_BOTTOM_PADDING } from '../../constants/search';
import { getResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRuntimeInteractionState } from './use-search-root-session-runtime-contract';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

// S1 (plans/search-desired-state-architecture.md §7): coverage is a FIELD of the world
// value, not a separately-keyed resource. The frame builder reads coverage from HERE —
// results and coverage arrive in one snapshot, so a "coverage not ready for this key"
// limbo (the covNotReady ladder) is unrepresentable. `features` is null only while
// resolving/failed; an EMPTY array is a valid ready world (zero dots is a real variant).
export type SearchMountedResultsCoverageEntry = {
  status: 'resolving' | 'ready' | 'failed';
  requestKey: string;
  features: Array<Feature<Point, RestaurantFeatureProperties>> | null;
  reason: string | null;
  resolvedAt: number | null;
};

export type SearchMountedResultsCoverage = {
  // The world identity this coverage belongs to. Commits for a different world are
  // dropped by IDENTITY at the results commit (carry-forward rule), never by a guard.
  searchRequestId: string;
  byTab: {
    dishes: SearchMountedResultsCoverageEntry | null;
    restaurants: SearchMountedResultsCoverageEntry | null;
  };
};

export type SearchMountedResultsDataSnapshot = {
  activeTab: 'dishes' | 'restaurants' | null;
  // R1a-2: marker projections precomputed at response commit for BOTH tabs (the dual_list
  // response carries dishes[] AND restaurants[]), so a tab toggle finds its target-tab
  // catalog ready and the controller's fallback full-catalog rebuild never fires. A tab's
  // entry is null when the committed response genuinely lacks that axis — the controller's
  // fallback then legitimately computes it without tripping the R1a contract.
  precomputedMarkerProjectionByTab: SearchMountedResultsMarkerProjectionByTab | null;
  coverage: SearchMountedResultsCoverage | null;
  resultsDataIdentityKey: string | null;
  results: SearchResponse | null;
  resultsIdentityKey: string | null;
  /** The mounted world's STRUCTURED identity (presenter dissolution) — same vocabulary
   *  as entry.desire. World-backed consumers match on this, never by key-string parse. */
  resultsQueryIdentity: SearchQueryIdentity | null;
  resultsRequestKey: string | null;
  version: number;
};

export type SearchMountedResultsMarkerProjection = {
  activeTab: 'dishes' | 'restaurants';
  catalog: MarkerCatalogEntry[];
  canonicalRestaurantRankById: Map<string, number>;
  primaryCount: number;
  restaurantsById: Map<string, RestaurantResult>;
  resultsKey: string;
};

export type SearchMountedResultsMarkerProjectionByTab = {
  dishes: SearchMountedResultsMarkerProjection | null;
  restaurants: SearchMountedResultsMarkerProjection | null;
};

export type SearchMountedResultsRowsViewKeyArgs = {
  activeTab: 'dishes' | 'restaurants';
  headerHeight: number;
  resultsIdentityKey: string | null;
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  targetSnapPointMiddle: number | null;
  viewportHeight: number;
};

export type SearchMountedResultsRowsPreparationKeyArgs = SearchMountedResultsRowsViewKeyArgs & {
  exactDishesOnPage: number | null;
  exactRestaurantsOnPage: number | null;
  resultsDataIdentityKey: string | null;
  resultsDataVersion: number;
  resultsRequestKey: string | null;
  showAllExactDishes: boolean;
  showAllExactRestaurants: boolean;
};

export type PrepareSearchMountedResultsRowsSnapshotArgs = SearchMountedResultsRowsViewKeyArgs & {
  resultsDataSnapshot?: SearchMountedResultsDataSnapshot;
  targetSnapPoints: { middle: number } | null;
};

export type SearchMountedResultsBodyRuntimeSnapshot = {
  activeTab: 'dishes' | 'restaurants';
  hydratedResultsKey: string | null;
  isResultsHydrationSettled: boolean;
  searchSurfaceResultsTransactionKey: string | null;
  resultsIdentityKey: string | null;
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  shouldHydrateResultsForRender: boolean;
};

export type SearchMountedResultsBodyLayoutSnapshot = {
  headerHeight: number;
  targetSnapPointMiddle: number | null;
  targetSnapPoints: { middle: number } | null;
  viewportHeight: number;
};

export type SearchMountedResultsRowsSnapshot = {
  admission: SearchResultsBodyAdmissionSnapshot;
  activeTab: 'dishes' | 'restaurants';
  contentContainerStyle: {
    paddingBottom: number;
    paddingTop: number;
  };
  handleShowMoreExactDishes: () => void;
  handleShowMoreExactRestaurants: () => void;
  headerHeight: number;
  preparationKey: string | null;
  restaurantCardDescriptorsById: Map<string, RestaurantResultCardDescriptor>;
  resultsIdentityKey: string | null;
  resultsRequestKey: string | null;
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
  version: number;
  viewKey: string | null;
};

export type SearchMountedResultsListFooterComponent =
  | React.ComponentType<unknown>
  | React.ReactElement
  | null;
export type SearchMountedResultsListHeaderComponent =
  | React.ComponentType<unknown>
  | React.ReactElement
  | null;

export type SearchMountedResultsListDataSnapshot = {
  activeList: 'primary' | 'secondary';
  contentContainerStyle: {
    paddingBottom: number;
    paddingTop: number;
  };
  debugAdmissionMode: string | null;
  debugPreparationKey: string | null;
  debugPrimaryRowCount: number;
  debugRenderRowCount: number;
  debugRowsSnapshotVersion: number;
  debugSecondaryRowCount: number;
  preparedRowsActiveRowCount: number;
  preparedRowsIdentityKey: string | null;
  primaryListHeaderComponent?: SearchMountedResultsListHeaderComponent;
  primaryListFooterComponent?: SearchMountedResultsListFooterComponent;
  primaryData: ReadonlyArray<ResultsListItem>;
  primaryExtraData: unknown;
  scrollIndicatorInsets: {
    top: number;
    bottom: number;
  };
  secondaryData: ReadonlyArray<ResultsListItem>;
  secondaryExtraData: unknown;
};

const NOOP_SHOW_MORE_EXACT = (): void => {};

const EMPTY_SEARCH_MOUNTED_RESULTS_DATA_SNAPSHOT: SearchMountedResultsDataSnapshot = {
  activeTab: null,
  precomputedMarkerProjectionByTab: null,
  coverage: null,
  resultsDataIdentityKey: null,
  results: null,
  resultsIdentityKey: null,
  resultsQueryIdentity: null,
  resultsRequestKey: null,
  version: 0,
};

const EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA: ResultsListItem[] = [];
const EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA_SNAPSHOT: SearchMountedResultsListDataSnapshot = {
  activeList: 'primary',
  contentContainerStyle: {
    paddingBottom: 0,
    paddingTop: 0,
  },
  debugAdmissionMode: null,
  debugPreparationKey: null,
  debugPrimaryRowCount: 0,
  debugRenderRowCount: 0,
  debugRowsSnapshotVersion: 0,
  debugSecondaryRowCount: 0,
  preparedRowsActiveRowCount: 0,
  preparedRowsIdentityKey: null,
  primaryData: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA,
  primaryExtraData: 0,
  scrollIndicatorInsets: {
    top: 0,
    bottom: RESULTS_BOTTOM_PADDING,
  },
  secondaryData: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA,
  secondaryExtraData: 0,
};

const listeners = new Set<() => void>();
let snapshot = EMPTY_SEARCH_MOUNTED_RESULTS_DATA_SNAPSHOT;
const exactMatchController = createSearchResultsExactMatchOwnerController();

// Seeded marker source: a single restaurant whose geometry should populate the map markers
// independently of any committed results (e.g. a profile opened from an autocomplete suggestion
// tap, where there is no committed search response). Kept separate from `snapshot.results` so the
// results/rows pipeline is never polluted; the map source controller reads it via
// `getSeededMarkerRestaurants()` and uses it only when there are no committed restaurants.
let seededMarkerRestaurants: RestaurantResult[] | null = null;

export const getSeededMarkerRestaurants = (): RestaurantResult[] | null => seededMarkerRestaurants;

export const publishMapMarkerSource = (restaurants: RestaurantResult[] | null): void => {
  const nextSeededMarkerRestaurants =
    restaurants != null && restaurants.length > 0 ? restaurants : null;
  if (seededMarkerRestaurants === nextSeededMarkerRestaurants) {
    return;
  }
  if (
    seededMarkerRestaurants != null &&
    nextSeededMarkerRestaurants != null &&
    seededMarkerRestaurants.length === nextSeededMarkerRestaurants.length &&
    seededMarkerRestaurants.every(
      (restaurant, index) => restaurant === nextSeededMarkerRestaurants[index]
    )
  ) {
    return;
  }
  seededMarkerRestaurants = nextSeededMarkerRestaurants;
  listeners.forEach((listener) => {
    listener();
  });
};

const EMPTY_SEARCH_MOUNTED_RESULTS_ROWS: {
  dishes: ResultsListItem[];
  restaurants: ResultsListItem[];
} = {
  dishes: [],
  restaurants: [],
};
const EMPTY_RESTAURANT_CARD_DESCRIPTORS = new Map<string, RestaurantResultCardDescriptor>();
const mountedRowsProjectionByResults = new WeakMap<
  SearchResponse,
  Map<
    string,
    {
      dishes: ResultsListItem[];
      restaurants: ResultsListItem[];
    }
  >
>();

export const createEmptySearchMountedResultsRowsAdmission = (
  activeTab: 'dishes' | 'restaurants' = 'restaurants'
): SearchResultsBodyAdmissionSnapshot => ({
  activeList: (activeTab === 'restaurants'
    ? 'primary'
    : 'secondary') as SearchResultsBodyAdmissionActiveList,
  mode: 'shell',
  primaryRows: [],
  renderRowCount: 0,
  secondaryRows: [],
});

const EMPTY_SEARCH_MOUNTED_RESULTS_ROWS_SNAPSHOT: SearchMountedResultsRowsSnapshot = {
  admission: createEmptySearchMountedResultsRowsAdmission(),
  activeTab: 'restaurants',
  contentContainerStyle: {
    paddingBottom: 0,
    paddingTop: 0,
  },
  handleShowMoreExactDishes: NOOP_SHOW_MORE_EXACT,
  handleShowMoreExactRestaurants: NOOP_SHOW_MORE_EXACT,
  headerHeight: 0,
  preparationKey: null,
  restaurantCardDescriptorsById: EMPTY_RESTAURANT_CARD_DESCRIPTORS,
  resultsIdentityKey: null,
  resultsRequestKey: null,
  rowsByTab: EMPTY_SEARCH_MOUNTED_RESULTS_ROWS,
  version: 0,
  viewKey: null,
};

const areSearchMountedResultsContentContainerStylesEqual = (
  left: SearchMountedResultsRowsSnapshot['contentContainerStyle'],
  right: SearchMountedResultsRowsSnapshot['contentContainerStyle']
): boolean =>
  left === right ||
  (left.paddingBottom === right.paddingBottom && left.paddingTop === right.paddingTop);

const areSearchMountedResultsRowsAdmissionsStructurallyEqual = (
  left: SearchResultsBodyAdmissionSnapshot,
  right: SearchResultsBodyAdmissionSnapshot
): boolean =>
  left === right ||
  (left.activeList === right.activeList &&
    left.mode === right.mode &&
    left.primaryRows === right.primaryRows &&
    left.renderRowCount === right.renderRowCount &&
    left.secondaryRows === right.secondaryRows);

const areSearchMountedResultsRowsSnapshotsStructurallyEqual = (
  left: SearchMountedResultsRowsSnapshot,
  right: Omit<SearchMountedResultsRowsSnapshot, 'version'>
): boolean =>
  left.activeTab === right.activeTab &&
  areSearchMountedResultsRowsAdmissionsStructurallyEqual(left.admission, right.admission) &&
  areSearchMountedResultsContentContainerStylesEqual(
    left.contentContainerStyle,
    right.contentContainerStyle
  ) &&
  left.handleShowMoreExactDishes === right.handleShowMoreExactDishes &&
  left.handleShowMoreExactRestaurants === right.handleShowMoreExactRestaurants &&
  left.headerHeight === right.headerHeight &&
  left.resultsIdentityKey === right.resultsIdentityKey &&
  left.resultsRequestKey === right.resultsRequestKey &&
  left.rowsByTab === right.rowsByTab;

const rowListeners = new Set<() => void>();
const listDataListeners = new Set<() => void>();
let rowsSnapshot = EMPTY_SEARCH_MOUNTED_RESULTS_ROWS_SNAPSHOT;
let lastRowsPreparationInput: PrepareSearchMountedResultsRowsSnapshotArgs | null = null;
let mountedResultsListDataSnapshot = EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA_SNAPSHOT;
let mountedResultsListDecorationsSnapshot: {
  primaryListHeaderComponent?: SearchMountedResultsListHeaderComponent;
  primaryListFooterComponent?: SearchMountedResultsListFooterComponent;
} = {};
let mountedResultsMotionInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState> | null =
  null;

const EMPTY_SEARCH_MOUNTED_RESULTS_BODY_RUNTIME: SearchMountedResultsBodyRuntimeSnapshot = {
  activeTab: 'restaurants',
  hydratedResultsKey: null,
  isResultsHydrationSettled: true,
  searchSurfaceResultsTransactionKey: null,
  resultsIdentityKey: null,
  searchSurfaceRedrawPhase: 'idle',
  shouldHydrateResultsForRender: false,
};

const EMPTY_SEARCH_MOUNTED_RESULTS_BODY_LAYOUT: SearchMountedResultsBodyLayoutSnapshot = {
  headerHeight: 0,
  targetSnapPointMiddle: null,
  targetSnapPoints: null,
  viewportHeight: 0,
};

let bodyRuntimeSnapshot = EMPTY_SEARCH_MOUNTED_RESULTS_BODY_RUNTIME;
let bodyLayoutSnapshot = EMPTY_SEARCH_MOUNTED_RESULTS_BODY_LAYOUT;

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const markSearchMountedResultsRowsPreparationWorkSpan = ({
  activeTab,
  durationMs,
  preparationKey,
  primaryRowCount,
  renderRowCount,
  secondaryRowCount,
}: {
  activeTab: 'dishes' | 'restaurants';
  durationMs: number;
  preparationKey: string;
  primaryRowCount: number;
  renderRowCount: number;
  secondaryRowCount: number;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig, SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO)) {
    return;
  }
  const quietMeasuredLoopActive = isPerfScenarioQuietMeasuredLoopActive(scenarioConfig);

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner: 'search_mounted_results_rows_prepare_before_body_sync',
    path: quietMeasuredLoopActive ? 'quiet_rows_prepare' : preparationKey,
    durationMs: Number(durationMs.toFixed(3)),
    activeTab,
    primaryRowCount,
    renderRowCount,
    secondaryRowCount,
  });
};

const markSearchMountedRestaurantCardDescriptorsPreparationWorkSpan = ({
  durationMs,
  preparationKey,
  restaurantDescriptorCount,
}: {
  durationMs: number;
  preparationKey: string;
  restaurantDescriptorCount: number;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig, SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO)) {
    return;
  }
  const quietMeasuredLoopActive = isPerfScenarioQuietMeasuredLoopActive(scenarioConfig);

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner: 'search_mounted_restaurant_card_descriptors_prepare',
    path: quietMeasuredLoopActive ? 'quiet_restaurant_card_descriptors_prepare' : preparationKey,
    durationMs: Number(durationMs.toFixed(3)),
    restaurantDescriptorCount,
  });
};

const countRestaurantRows = (rows: ResultsListItem[]): number =>
  rows.reduce(
    (count, row) => count + (isRestaurantResultRow(row) || isMountedRestaurantCardRow(row) ? 1 : 0),
    0
  );

const isMountedRestaurantCardRow = (row: ResultsListItem): row is ResultsMountedRestaurantCardRow =>
  row != null && typeof row === 'object' && 'kind' in row && row.kind === 'mounted_restaurant_card';

const markSearchMountedResultsCountContract = ({
  admission,
  resultsIdentityKey,
  resultsRequestKey,
  rowsByTab,
}: {
  admission: SearchResultsBodyAdmissionSnapshot;
  resultsIdentityKey: string | null;
  resultsRequestKey: string | null;
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  const mountedResults = snapshot.results;
  if (mountedResults == null) {
    return;
  }
  const metadata = (mountedResults.metadata ?? {}) as unknown as Record<string, unknown>;
  const totalRestaurants =
    typeof metadata.totalRestaurants === 'number' ? metadata.totalRestaurants : null;
  const totalFood = typeof metadata.totalFood === 'number' ? metadata.totalFood : null;
  const quietMeasuredLoopActive = isPerfScenarioQuietMeasuredLoopActive(scenarioConfig);
  logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
    event: 'mounted_results_count_contract',
    activeList: admission.activeList,
    activeTab: snapshot.activeTab ?? null,
    admittedDishRowCount: admission.secondaryRows.length,
    admittedRestaurantCardRowCount: countRestaurantRows(admission.primaryRows),
    admittedRestaurantRowCount: admission.primaryRows.length,
    backendDishCountOnPage: mountedResults.dishes?.length ?? 0,
    backendRestaurantCountOnPage: mountedResults.restaurants?.length ?? 0,
    mode: admission.mode,
    renderRowCount: admission.renderRowCount,
    resultsIdentityKey: quietMeasuredLoopActive ? null : resultsIdentityKey,
    resultsRequestKey: quietMeasuredLoopActive ? null : resultsRequestKey,
    rowsByTabDishRowCount: rowsByTab.dishes.length,
    rowsByTabRestaurantCardRowCount: countRestaurantRows(rowsByTab.restaurants),
    rowsByTabRestaurantRowCount: rowsByTab.restaurants.length,
    totalFood,
    totalRestaurants,
  });
};

const normalizeKeyNumber = (value: number | null): string =>
  value == null || !Number.isFinite(value) ? 'null' : `${Math.round(value * 100) / 100}`;

const MOUNTED_ROWS_ADMISSION_PHASE: SearchSurfaceRedrawPhase = 'redraw_committed';

const normalizeFiniteNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const areSearchMountedResultsBodyRuntimeSnapshotsEqual = (
  left: SearchMountedResultsBodyRuntimeSnapshot,
  right: SearchMountedResultsBodyRuntimeSnapshot
): boolean =>
  left.activeTab === right.activeTab &&
  left.hydratedResultsKey === right.hydratedResultsKey &&
  left.isResultsHydrationSettled === right.isResultsHydrationSettled &&
  left.searchSurfaceResultsTransactionKey === right.searchSurfaceResultsTransactionKey &&
  left.resultsIdentityKey === right.resultsIdentityKey &&
  left.searchSurfaceRedrawPhase === right.searchSurfaceRedrawPhase &&
  left.shouldHydrateResultsForRender === right.shouldHydrateResultsForRender;

const areSearchMountedResultsBodyLayoutSnapshotsEqual = (
  left: SearchMountedResultsBodyLayoutSnapshot,
  right: SearchMountedResultsBodyLayoutSnapshot
): boolean =>
  left.headerHeight === right.headerHeight &&
  left.targetSnapPointMiddle === right.targetSnapPointMiddle &&
  left.targetSnapPoints === right.targetSnapPoints &&
  left.viewportHeight === right.viewportHeight;

const createMountedRowsProjectionCacheKey = ({
  exactDishesOnPage,
  exactRestaurantsOnPage,
  showAllExactDishes,
  showAllExactRestaurants,
}: {
  exactDishesOnPage: number | null;
  exactRestaurantsOnPage: number | null;
  showAllExactDishes: boolean;
  showAllExactRestaurants: boolean;
}): string =>
  [
    `exactD:${exactDishesOnPage ?? 'null'}`,
    `exactR:${exactRestaurantsOnPage ?? 'null'}`,
    `showD:${showAllExactDishes ? '1' : '0'}`,
    `showR:${showAllExactRestaurants ? '1' : '0'}`,
  ].join('|');

const resolveMountedRowsProjection = ({
  exactMatchProjection,
  mountedResults,
}: {
  exactMatchProjection: ReturnType<typeof toSearchResultsExactMatchProjection>;
  mountedResults: SearchResponse | null;
}): {
  dishes: ResultsListItem[];
  restaurants: ResultsListItem[];
} => {
  if (mountedResults == null) {
    return EMPTY_SEARCH_MOUNTED_RESULTS_ROWS;
  }
  const cacheKey = createMountedRowsProjectionCacheKey(exactMatchProjection);
  let rowsByCacheKey = mountedRowsProjectionByResults.get(mountedResults);
  if (rowsByCacheKey == null) {
    rowsByCacheKey = new Map();
    mountedRowsProjectionByResults.set(mountedResults, rowsByCacheKey);
  }
  const cachedRowsByTab = rowsByCacheKey.get(cacheKey);
  if (cachedRowsByTab != null) {
    return cachedRowsByTab;
  }
  const rowsByTab = buildSearchResultsSectionedProjection({
    dishes: mountedResults.dishes ?? [],
    restaurants: mountedResults.restaurants ?? [],
    exactMatchState: exactMatchProjection,
  }).sectionedRowsByTab as {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
  rowsByCacheKey.set(cacheKey, rowsByTab);
  return rowsByTab;
};

export const createSearchMountedResultsRowsViewKey = ({
  activeTab,
  headerHeight,
  resultsIdentityKey,
  searchSurfaceRedrawPhase,
  targetSnapPointMiddle,
  viewportHeight,
}: SearchMountedResultsRowsViewKeyArgs): string =>
  [
    `hydration:${resultsIdentityKey ?? 'null'}`,
    `tab:${activeTab}`,
    `header:${normalizeKeyNumber(headerHeight)}`,
    `phase:${searchSurfaceRedrawPhase}`,
    `middle:${normalizeKeyNumber(targetSnapPointMiddle)}`,
    `viewport:${normalizeKeyNumber(viewportHeight)}`,
  ].join('|');

export const createSearchMountedResultsRowsPreparationKey = ({
  exactDishesOnPage,
  exactRestaurantsOnPage,
  resultsDataVersion,
  resultsRequestKey,
  showAllExactDishes,
  showAllExactRestaurants,
  ...viewArgs
}: SearchMountedResultsRowsPreparationKeyArgs): string =>
  [
    createSearchMountedResultsRowsViewKey(viewArgs),
    `request:${resultsRequestKey ?? 'null'}`,
    `version:${resultsDataVersion}`,
    `exactD:${exactDishesOnPage ?? 'null'}`,
    `exactR:${exactRestaurantsOnPage ?? 'null'}`,
    `showD:${showAllExactDishes ? '1' : '0'}`,
    `showR:${showAllExactRestaurants ? '1' : '0'}`,
  ].join('|');

export const getSearchMountedResultsDataSnapshot = (): SearchMountedResultsDataSnapshot => snapshot;

export const subscribeSearchMountedResultsDataSnapshot = (
  listener: () => void,
  options?: { notifyMode?: 'sync' | 'deferred' }
): (() => void) => {
  let frameId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const wrappedListener =
    options?.notifyMode === 'deferred'
      ? () => {
          if (frameId != null || timeoutId != null) {
            return;
          }
          const flush = () => {
            frameId = null;
            timeoutId = null;
            listener();
          };
          if (typeof requestAnimationFrame === 'function') {
            frameId = requestAnimationFrame(flush);
            return;
          }
          timeoutId = setTimeout(flush, 16);
        }
      : listener;
  listeners.add(wrappedListener);
  return () => {
    if (frameId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
    }
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
    listeners.delete(wrappedListener);
  };
};

export const getSearchMountedResultsRowsSnapshot = (): SearchMountedResultsRowsSnapshot =>
  rowsSnapshot;

export const subscribeSearchMountedResultsRowsSnapshot = (listener: () => void): (() => void) => {
  rowListeners.add(listener);
  return () => {
    rowListeners.delete(listener);
  };
};

const resolveSearchMountedResultsListDataSnapshot = (): SearchMountedResultsListDataSnapshot => ({
  activeList: rowsSnapshot.admission.activeList,
  contentContainerStyle: rowsSnapshot.contentContainerStyle,
  debugAdmissionMode: rowsSnapshot.admission.mode,
  debugPreparationKey: rowsSnapshot.preparationKey,
  debugPrimaryRowCount: rowsSnapshot.admission.primaryRows.length,
  debugRenderRowCount: rowsSnapshot.admission.renderRowCount,
  debugRowsSnapshotVersion: rowsSnapshot.version,
  debugSecondaryRowCount: rowsSnapshot.admission.secondaryRows.length,
  preparedRowsActiveRowCount: rowsSnapshot.admission.renderRowCount,
  preparedRowsIdentityKey: rowsSnapshot.resultsIdentityKey ?? rowsSnapshot.resultsRequestKey,
  primaryData: rowsSnapshot.admission.primaryRows,
  primaryExtraData: rowsSnapshot.version,
  primaryListFooterComponent: mountedResultsListDecorationsSnapshot.primaryListFooterComponent,
  primaryListHeaderComponent: mountedResultsListDecorationsSnapshot.primaryListHeaderComponent,
  scrollIndicatorInsets: {
    top: 0,
    bottom: RESULTS_BOTTOM_PADDING,
  },
  secondaryData: rowsSnapshot.admission.secondaryRows,
  secondaryExtraData: rowsSnapshot.version,
});

const shouldNotifySearchMountedResultsListDecorations = (): boolean => {
  const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  const dismissTransaction = surfaceSnapshot.dismissTransaction;
  return (
    surfaceSnapshot.activeBundle.kind === 'results' ||
    (dismissTransaction != null && !dismissTransaction.bottomBoundaryReached)
  );
};

const __t1dbgMark = (name: string): void => {
  if (__DEV__) console.log(`[T1DBG] ${name} t=${performance.now().toFixed(1)}`);
};
const publishSearchMountedResultsListDataSnapshotIfChanged = (): void => {
  __t1dbgMark('listDataPublish');
  if (!shouldNotifySearchMountedResultsListDecorations()) {
    return;
  }
  const nextSnapshot = resolveSearchMountedResultsListDataSnapshot();
  if (
    mountedResultsListDataSnapshot.debugRowsSnapshotVersion ===
      nextSnapshot.debugRowsSnapshotVersion &&
    mountedResultsListDataSnapshot.primaryListHeaderComponent ===
      nextSnapshot.primaryListHeaderComponent &&
    mountedResultsListDataSnapshot.primaryListFooterComponent ===
      nextSnapshot.primaryListFooterComponent
  ) {
    return;
  }
  mountedResultsListDataSnapshot = nextSnapshot;
  listDataListeners.forEach((listener) => {
    listener();
  });
};

const publishSearchMountedResultsPreparedRowsSnapshot = ({
  activeRowCount,
  ready,
  resultsIdentityKey,
  source,
}: {
  activeRowCount: number;
  ready: boolean;
  resultsIdentityKey: string | null;
  source: string;
}): void => {
  const authority = getResultsPresentationSurfaceAuthority();
  // eslint-disable-next-line no-console
  if (__DEV__)
    console.log(
      `[REVEALSYNC] preparedRows src=${source} ready=${ready} count=${activeRowCount} jsNowMs=${(globalThis.performance?.now?.() ?? 0).toFixed(1)}`
    );
  // TR5-N empty-variant: activeRowCount === 0 WITH a results identity is a legitimate,
  // first-class variant (e.g. open-now filtered every row out) — it stages and commits like
  // any other page so the reveal joint can open on the empty state. Only a NULL identity
  // means "nothing prepared" (reset/clear).
  if (resultsIdentityKey == null) {
    authority.publish(
      {
        listPreparedRowsReady: false,
        preparedRows: {
          targetResultsIdentityKey: null,
          readyResultsIdentityKey: null,
          activeRowCount: 0,
        },
      },
      'mounted_results_prepared_rows_cleared'
    );
    return;
  }
  const currentSnapshot = authority.getSnapshot().preparedRows;
  const readyResultsIdentityKey = ready ? resultsIdentityKey : null;
  const listPreparedRowsReady =
    ready && authority.getSnapshot().resultsPreparedRowsKey === resultsIdentityKey;
  if (
    currentSnapshot.targetResultsIdentityKey === resultsIdentityKey &&
    currentSnapshot.readyResultsIdentityKey === readyResultsIdentityKey &&
    currentSnapshot.activeRowCount === activeRowCount &&
    authority.getSnapshot().listPreparedRowsReady === listPreparedRowsReady
  ) {
    return;
  }
  authority.publish(
    {
      listPreparedRowsReady,
      preparedRows: {
        targetResultsIdentityKey: resultsIdentityKey,
        readyResultsIdentityKey,
        activeRowCount,
      },
    },
    source
  );
};

const stageSearchMountedResultsPreparedRowsTarget = ({
  activeRowCount,
  resultsIdentityKey,
}: {
  activeRowCount: number;
  resultsIdentityKey: string | null;
}): void => {
  publishSearchMountedResultsPreparedRowsSnapshot({
    activeRowCount,
    ready: false,
    resultsIdentityKey,
    source: 'mounted_results_prepared_rows_staged',
  });
};

export const markSearchMountedResultsPreparedRowsCommitted = ({
  activeRowCount,
  resultsIdentityKey,
}: {
  activeRowCount: number;
  resultsIdentityKey: string | null;
}): void => {
  publishSearchMountedResultsPreparedRowsSnapshot({
    activeRowCount,
    ready: true,
    resultsIdentityKey,
    source: 'mounted_results_prepared_rows_committed',
  });
};

export const commitSearchMountedResultsPreparedRowsTarget = ({
  resultsIdentityKey,
}: {
  resultsIdentityKey: string | null;
}): void => {
  if (resultsIdentityKey == null) {
    return;
  }
  const preparedRows = getResultsPresentationSurfaceAuthority().getSnapshot().preparedRows;
  if (preparedRows.targetResultsIdentityKey !== resultsIdentityKey) {
    // R0 loud-contracts (§D6): a commit attempt against a DIFFERENT staged target can strand
    // cardsReady=false forever — the audit's "stuck staging" silent zone. A zero-row staging
    // with a MATCHING key is NOT suspicious: it's the first-class empty variant (TR5-N).
    reportSearchFlowContractViolation('prepared_rows_commit_target_mismatch', {
      resultsIdentityKey,
      targetResultsIdentityKey: preparedRows.targetResultsIdentityKey,
      activeRowCount: preparedRows.activeRowCount,
    });
    return;
  }
  markSearchMountedResultsPreparedRowsCommitted({
    activeRowCount: preparedRows.activeRowCount,
    resultsIdentityKey,
  });
};

export const getSearchMountedResultsListDataSnapshot = (): SearchMountedResultsListDataSnapshot =>
  mountedResultsListDataSnapshot;

export const subscribeSearchMountedResultsListDataSnapshot = (
  listener: () => void
): (() => void) => {
  listDataListeners.add(listener);
  publishSearchMountedResultsListDataSnapshotIfChanged();
  return () => {
    listDataListeners.delete(listener);
  };
};

export const syncSearchMountedResultsListDecorationsSnapshot = (nextSnapshot: {
  primaryListHeaderComponent?: SearchMountedResultsListHeaderComponent;
  primaryListFooterComponent?: SearchMountedResultsListFooterComponent;
}): void => {
  if (
    mountedResultsListDecorationsSnapshot.primaryListHeaderComponent ===
      nextSnapshot.primaryListHeaderComponent &&
    mountedResultsListDecorationsSnapshot.primaryListFooterComponent ===
      nextSnapshot.primaryListFooterComponent
  ) {
    return;
  }
  mountedResultsListDecorationsSnapshot = nextSnapshot;
  if (!shouldNotifySearchMountedResultsListDecorations()) {
    return;
  }
  publishSearchMountedResultsListDataSnapshotIfChanged();
};

const createSearchMountedResultsDataIdentityKey = (
  results: SearchResponse | null
): string | null => {
  if (results == null) {
    return null;
  }
  const metadata = results.metadata ?? {};
  return [
    `request:${metadata.searchRequestId ?? ''}`,
    `query:${metadata.sourceQuery ?? ''}`,
    `food:${metadata.primaryFoodTerm ?? ''}`,
    `market:${metadata.marketKey ?? ''}`,
    `page:${metadata.page ?? ''}`,
    `dishes:${results.dishes?.length ?? 0}`,
    `restaurants:${results.restaurants?.length ?? 0}`,
  ].join('|');
};

export const publishSearchMountedResultsDataSnapshot = (
  results: SearchResponse | null,
  options?: {
    activeTab?: 'dishes' | 'restaurants' | null;
    markerProjectionByTab?: SearchMountedResultsMarkerProjectionByTab | null;
    resultsIdentityKey?: string | null;
    resultsQueryIdentity?: SearchQueryIdentity | null;
  }
): boolean => {
  if (__DEV__ && results == null && snapshot.results != null) {
    // [SRINULL] attribution: WHO clears the mounted-results data store (the map projection's
    // source) while the results surface may still be live? Top stack frames name the caller.
    console.log(
      `[SRINULL] data-store CLEARED (had rrk=${snapshot.resultsRequestKey}) by:\n${new Error().stack?.split('\n').slice(1, 5).join('\n')}`
    );
  }
  const nextResultsRequestKey = results?.metadata?.searchRequestId ?? null;
  const nextResultsIdentityKey = options?.resultsIdentityKey ?? null;
  const nextActiveTab = options?.activeTab ?? null;
  const nextMarkerProjectionByTab = options?.markerProjectionByTab ?? null;
  const nextResultsDataIdentityKey = createSearchMountedResultsDataIdentityKey(results);
  const activeRedrawTransactionId =
    getSearchSurfaceRuntime().getActiveOrPendingRedrawTransactionId();
  if (
    snapshot.results === results &&
    snapshot.resultsRequestKey === nextResultsRequestKey &&
    snapshot.resultsIdentityKey === nextResultsIdentityKey &&
    snapshot.activeTab === nextActiveTab &&
    (snapshot.precomputedMarkerProjectionByTab?.dishes?.resultsKey ?? null) ===
      (nextMarkerProjectionByTab?.dishes?.resultsKey ?? null) &&
    (snapshot.precomputedMarkerProjectionByTab?.restaurants?.resultsKey ?? null) ===
      (nextMarkerProjectionByTab?.restaurants?.resultsKey ?? null)
  ) {
    return false;
  }

  logPerfScenarioStackAttribution({
    owner: 'search_mounted_results_data_writer',
    path: `${snapshot.resultsIdentityKey ?? snapshot.resultsRequestKey ?? 'null'}->${
      nextResultsIdentityKey ?? nextResultsRequestKey ?? 'null'
    }`,
    details: {
      activeTab: nextActiveTab,
      dishCount: results?.dishes?.length ?? 0,
      hydrationKey: nextResultsIdentityKey,
      restaurantCount: results?.restaurants?.length ?? 0,
      listenerCount: listeners.size,
    },
  });
  if (results == null && activeRedrawTransactionId != null) {
    bodyRuntimeSnapshot = {
      ...bodyRuntimeSnapshot,
      searchSurfaceResultsTransactionKey: activeRedrawTransactionId,
    };
  }
  snapshot = {
    activeTab: nextActiveTab,
    precomputedMarkerProjectionByTab: nextMarkerProjectionByTab,
    // S1 convergence rule: coverage survives the results commit iff it belongs to the NEW
    // world (identity match) — so coverage-before-results and results-before-coverage both
    // converge to the same snapshot structurally, in either commit order.
    coverage:
      snapshot.coverage?.searchRequestId === nextResultsRequestKey ? snapshot.coverage : null,
    resultsDataIdentityKey: nextResultsDataIdentityKey,
    results,
    resultsIdentityKey: nextResultsIdentityKey,
    resultsQueryIdentity: results == null ? null : (options?.resultsQueryIdentity ?? null),
    resultsRequestKey: nextResultsRequestKey,
    version: snapshot.version + 1,
  };
  listeners.forEach((listener) => {
    listener();
  });
  prepareSearchMountedResultsRowsSnapshotFromAuthority();
  return true;
};

// S1: coverage commits into the WORLD (never into a controller-local pointer). Committing
// under a searchRequestId that never becomes the world is inert — the next results commit
// drops it by identity. Coverage is a map-frame input, not a rows input: no rows prepare.
export const commitSearchMountedResultsCoverage = (args: {
  searchRequestId: string;
  tab: 'dishes' | 'restaurants';
  entry: SearchMountedResultsCoverageEntry;
}): void => {
  if (args.entry.status === 'ready' && args.entry.features == null) {
    // The old features/terminal lockstep bug class, made unconstructable-loud: a ready
    // coverage entry ALWAYS carries its features array (empty array = valid empty world).
    reportSearchFlowContractViolation('coverage_ready_without_features', {
      searchRequestId: args.searchRequestId,
      tab: args.tab,
      requestKey: args.entry.requestKey,
      reason: args.entry.reason,
    });
    return;
  }
  const current =
    snapshot.coverage?.searchRequestId === args.searchRequestId
      ? snapshot.coverage
      : { searchRequestId: args.searchRequestId, byTab: { dishes: null, restaurants: null } };
  snapshot = {
    ...snapshot,
    coverage: {
      searchRequestId: args.searchRequestId,
      byTab: { ...current.byTab, [args.tab]: args.entry },
    },
    version: snapshot.version + 1,
  };
  listeners.forEach((listener) => {
    listener();
  });
};

export const clearSearchMountedResultsCoverage = (): void => {
  if (snapshot.coverage == null) {
    return;
  }
  snapshot = { ...snapshot, coverage: null, version: snapshot.version + 1 };
  listeners.forEach((listener) => {
    listener();
  });
};

const logRowsAdmissionTransition = (
  previous: SearchMountedResultsRowsSnapshot,
  next: Omit<SearchMountedResultsRowsSnapshot, 'version'>
): void => {
  if (!__DEV__) {
    return;
  }
  if (
    previous.admission.mode !== next.admission.mode ||
    previous.admission.renderRowCount !== next.admission.renderRowCount
  ) {
    // eslint-disable-next-line no-console
    console.log(
      `[REVEALSYNC] rowsAdmission ${previous.admission.mode}:${previous.admission.renderRowCount} -> ${next.admission.mode}:${next.admission.renderRowCount} jsNowMs=${(globalThis.performance?.now?.() ?? Date.now()).toFixed(1)}`
    );
  }
};

export const publishSearchMountedResultsRowsSnapshot = (
  nextSnapshot: Omit<SearchMountedResultsRowsSnapshot, 'version'>
): boolean => {
  if (rowsSnapshot.preparationKey === nextSnapshot.preparationKey) {
    return false;
  }
  if (areSearchMountedResultsRowsSnapshotsStructurallyEqual(rowsSnapshot, nextSnapshot)) {
    logPerfScenarioStackAttribution({
      owner: 'search_mounted_results_rows_snapshot_coalesced',
      path: `${rowsSnapshot.preparationKey ?? 'null'}->${nextSnapshot.preparationKey ?? 'null'}`,
      details: {
        activeList: nextSnapshot.admission.activeList,
        mode: nextSnapshot.admission.mode,
        primaryRowCount: nextSnapshot.admission.primaryRows.length,
        renderRowCount: nextSnapshot.admission.renderRowCount,
        secondaryRowCount: nextSnapshot.admission.secondaryRows.length,
        listenerCount: rowListeners.size,
      },
    });
    rowsSnapshot = {
      ...rowsSnapshot,
      preparationKey: nextSnapshot.preparationKey,
      viewKey: nextSnapshot.viewKey,
    };
    return false;
  }

  const changedStructuralFields = [
    rowsSnapshot.activeTab !== nextSnapshot.activeTab ? 'activeTab' : null,
    !areSearchMountedResultsRowsAdmissionsStructurallyEqual(
      rowsSnapshot.admission,
      nextSnapshot.admission
    )
      ? 'admission'
      : null,
    !areSearchMountedResultsContentContainerStylesEqual(
      rowsSnapshot.contentContainerStyle,
      nextSnapshot.contentContainerStyle
    )
      ? 'contentContainerStyle'
      : null,
    rowsSnapshot.handleShowMoreExactDishes !== nextSnapshot.handleShowMoreExactDishes
      ? 'handleShowMoreExactDishes'
      : null,
    rowsSnapshot.handleShowMoreExactRestaurants !== nextSnapshot.handleShowMoreExactRestaurants
      ? 'handleShowMoreExactRestaurants'
      : null,
    rowsSnapshot.headerHeight !== nextSnapshot.headerHeight ? 'headerHeight' : null,
    rowsSnapshot.resultsIdentityKey !== nextSnapshot.resultsIdentityKey
      ? 'resultsIdentityKey'
      : null,
    rowsSnapshot.resultsRequestKey !== nextSnapshot.resultsRequestKey ? 'resultsRequestKey' : null,
    rowsSnapshot.rowsByTab !== nextSnapshot.rowsByTab ? 'rowsByTab' : null,
  ].filter((field): field is string => field != null);
  logPerfScenarioStackAttribution({
    owner: 'search_mounted_results_rows_snapshot_writer',
    path: `${rowsSnapshot.preparationKey ?? 'null'}->${nextSnapshot.preparationKey ?? 'null'}`,
    details: {
      changedStructuralFields,
      activeList: nextSnapshot.admission.activeList,
      mode: nextSnapshot.admission.mode,
      primaryRowCount: nextSnapshot.admission.primaryRows.length,
      renderRowCount: nextSnapshot.admission.renderRowCount,
      secondaryRowCount: nextSnapshot.admission.secondaryRows.length,
      listenerCount: rowListeners.size,
    },
  });
  logRowsAdmissionTransition(rowsSnapshot, nextSnapshot);
  rowsSnapshot = {
    ...nextSnapshot,
    version: rowsSnapshot.version + 1,
  };
  // S1 PAINT PRODUCER (reveal-pipeline unification §2): rows RESIDENCY for the mounted
  // identity — resident iff identity non-null (full OR legitimately empty with results
  // committed); the submit reset (shell/identity-null publish) marks non-resident. The
  // surface runtime scopes offers to the live episode and seeds cached re-presents
  // from this state.
  getSearchSurfaceRuntime().setWorldRowsResidency(
    nextSnapshot.resultsIdentityKey != null && snapshot.results != null
  );
  stageSearchMountedResultsPreparedRowsTarget({
    activeRowCount: nextSnapshot.admission.renderRowCount,
    resultsIdentityKey: nextSnapshot.resultsIdentityKey ?? nextSnapshot.resultsRequestKey,
  });
  rowListeners.forEach((listener) => {
    listener();
  });
  publishSearchMountedResultsListDataSnapshotIfChanged();
  return true;
};

const createMountedResultsBodyRowsInput = (): PrepareSearchMountedResultsRowsSnapshotArgs => {
  const resultsDataSnapshot = snapshot;
  const activeRowsHydrationKey =
    resultsDataSnapshot.results == null
      ? null
      : (resultsDataSnapshot.resultsIdentityKey ??
        bodyRuntimeSnapshot.resultsIdentityKey ??
        bodyRuntimeSnapshot.hydratedResultsKey ??
        resultsDataSnapshot.resultsRequestKey);
  return {
    activeTab: bodyRuntimeSnapshot.activeTab ?? resultsDataSnapshot.activeTab ?? 'restaurants',
    headerHeight: bodyLayoutSnapshot.headerHeight,
    resultsDataSnapshot,
    resultsIdentityKey: activeRowsHydrationKey,
    searchSurfaceRedrawPhase: MOUNTED_ROWS_ADMISSION_PHASE,
    targetSnapPointMiddle: bodyLayoutSnapshot.targetSnapPointMiddle,
    targetSnapPoints: bodyLayoutSnapshot.targetSnapPoints,
    viewportHeight: bodyLayoutSnapshot.viewportHeight,
  };
};

const prepareSearchMountedResultsRowsSnapshotFromAuthority = (): boolean =>
  prepareSearchMountedResultsRowsSnapshot(createMountedResultsBodyRowsInput());

export const publishSearchMountedResultsBodyRuntimeSnapshot = (
  nextSnapshot: SearchMountedResultsBodyRuntimeSnapshot
): boolean => {
  if (areSearchMountedResultsBodyRuntimeSnapshotsEqual(bodyRuntimeSnapshot, nextSnapshot)) {
    return false;
  }
  bodyRuntimeSnapshot = nextSnapshot;
  return prepareSearchMountedResultsRowsSnapshotFromAuthority();
};

export const getSearchMountedResultsBodyRuntimeSnapshot =
  (): SearchMountedResultsBodyRuntimeSnapshot => bodyRuntimeSnapshot;

export const commitSearchMountedResultsHydrationRuntimeSnapshot = ({
  activeTab,
  hydratedResultsKey,
  isResultsHydrationSettled,
  resultsIdentityKey,
  shouldHydrateResultsForRender,
}: {
  activeTab: 'dishes' | 'restaurants';
  hydratedResultsKey: string | null;
  isResultsHydrationSettled: boolean;
  resultsIdentityKey: string | null;
  shouldHydrateResultsForRender: boolean;
}): boolean =>
  publishSearchMountedResultsBodyRuntimeSnapshot({
    activeTab,
    hydratedResultsKey,
    isResultsHydrationSettled,
    searchSurfaceResultsTransactionKey: bodyRuntimeSnapshot.searchSurfaceResultsTransactionKey,
    resultsIdentityKey,
    searchSurfaceRedrawPhase: MOUNTED_ROWS_ADMISSION_PHASE,
    shouldHydrateResultsForRender,
  });

export const commitSearchMountedResultsSearchSurfaceResultsTransactionKey = (
  searchSurfaceResultsTransactionKey: string | null
): boolean => {
  if (
    bodyRuntimeSnapshot.searchSurfaceResultsTransactionKey === searchSurfaceResultsTransactionKey
  ) {
    return false;
  }
  bodyRuntimeSnapshot = {
    ...bodyRuntimeSnapshot,
    searchSurfaceResultsTransactionKey,
  };
  return prepareSearchMountedResultsRowsSnapshotFromAuthority();
};

export const registerSearchMountedResultsMotionInteractionRef = (
  interactionRef: React.MutableRefObject<SearchRuntimeInteractionState>
): (() => void) => {
  mountedResultsMotionInteractionRef = interactionRef;
  return () => {
    if (mountedResultsMotionInteractionRef === interactionRef) {
      mountedResultsMotionInteractionRef = null;
    }
  };
};

export const deferMountedResultsCleanupUntilAfterDismiss = (_reason: string): void => {
  const cleanupSnapshotVersion = snapshot.version;
  const cleanupIfStillDismissed = (): void => {
    const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
    const resultsSurfaceActive =
      surfaceSnapshot.activeBundle.kind === 'results' ||
      surfaceSnapshot.heldBundle != null ||
      surfaceSnapshot.redrawTransaction != null ||
      getSearchSurfaceRuntime().getActiveOrPendingRedrawTransactionId() != null;
    if (
      resultsSurfaceActive ||
      snapshot.version !== cleanupSnapshotVersion ||
      snapshot.results != null
    ) {
      return;
    }
    publishSearchMountedResultsDataSnapshot(null);
  };
  const interactionState = mountedResultsMotionInteractionRef?.current;
  if (
    interactionState?.isResultsSheetDragging === true ||
    interactionState?.isResultsSheetSettling === true
  ) {
    requestAnimationFrame(() => {
      cleanupIfStillDismissed();
    });
    return;
  }
  cleanupIfStillDismissed();
};

export const publishSearchMountedResultsBodyLayoutSnapshot = (
  nextSnapshot: SearchMountedResultsBodyLayoutSnapshot
): boolean => {
  const normalizedSnapshot = {
    ...nextSnapshot,
    headerHeight: normalizeFiniteNumber(nextSnapshot.headerHeight),
    targetSnapPointMiddle:
      nextSnapshot.targetSnapPointMiddle == null
        ? null
        : normalizeFiniteNumber(nextSnapshot.targetSnapPointMiddle),
    viewportHeight: normalizeFiniteNumber(nextSnapshot.viewportHeight),
  };
  if (areSearchMountedResultsBodyLayoutSnapshotsEqual(bodyLayoutSnapshot, normalizedSnapshot)) {
    return false;
  }
  bodyLayoutSnapshot = normalizedSnapshot;
  return prepareSearchMountedResultsRowsSnapshotFromAuthority();
};

const isRestaurantResultRow = (row: ResultsListItem): row is RestaurantResult =>
  row != null &&
  typeof row === 'object' &&
  !('kind' in row) &&
  'restaurantId' in row &&
  !('foodId' in row);

const prepareRestaurantCardDescriptorsById = ({
  preparationKey,
  restaurants,
  results,
}: {
  preparationKey: string;
  restaurants: ResultsListItem[];
  results: SearchResponse | null;
}): Map<string, RestaurantResultCardDescriptor> => {
  if (restaurants.length === 0) {
    return EMPTY_RESTAURANT_CARD_DESCRIPTORS;
  }

  const startedAtMs = nowMs();
  const descriptorsById = new Map<string, RestaurantResultCardDescriptor>();
  const primaryMarketKey =
    typeof results?.metadata?.marketKey === 'string' && results.metadata.marketKey.trim().length
      ? results.metadata.marketKey
      : null;
  const primaryFoodTerm = results?.metadata?.primaryFoodTerm ?? null;
  restaurants.forEach((row) => {
    if (!isRestaurantResultRow(row)) {
      return;
    }
    const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : null;
    if (rank == null) {
      return;
    }
    descriptorsById.set(
      row.restaurantId,
      buildRestaurantResultCardDescriptor({
        primaryFoodTerm,
        primaryMarketKey,
        qualityColor: getMarkerColorForRestaurant(row),
        rank,
        restaurant: row,
        showMarketLabel: false,
      })
    );
  });
  markSearchMountedRestaurantCardDescriptorsPreparationWorkSpan({
    durationMs: nowMs() - startedAtMs,
    preparationKey,
    restaurantDescriptorCount: descriptorsById.size,
  });
  return descriptorsById.size > 0 ? descriptorsById : EMPTY_RESTAURANT_CARD_DESCRIPTORS;
};

export const prepareSearchMountedResultsRowsSnapshot = (
  ...__t1dbgArgs: [PrepareSearchMountedResultsRowsSnapshotArgs]
) => {
  if (__DEV__) console.log(`[T1DBG] rowsPrepare:start t=${performance.now().toFixed(1)}`);
  const __t1dbgResult = prepareSearchMountedResultsRowsSnapshotInner(...__t1dbgArgs);
  if (__DEV__) console.log(`[T1DBG] rowsPrepare:end t=${performance.now().toFixed(1)}`);
  return __t1dbgResult;
};
const prepareSearchMountedResultsRowsSnapshotInner = ({
  resultsDataSnapshot = snapshot,
  ...viewArgs
}: PrepareSearchMountedResultsRowsSnapshotArgs): boolean => {
  lastRowsPreparationInput = {
    ...viewArgs,
    resultsDataSnapshot,
  };
  const startedAtMs = nowMs();
  const mountedResults = resultsDataSnapshot.results;
  const exactMatchProjection = toSearchResultsExactMatchProjection(
    exactMatchController.updateResults(mountedResults)
  );
  const viewKey = createSearchMountedResultsRowsViewKey(viewArgs);
  const preparationKey = createSearchMountedResultsRowsPreparationKey({
    ...viewArgs,
    exactDishesOnPage: exactMatchProjection.exactDishesOnPage,
    exactRestaurantsOnPage: exactMatchProjection.exactRestaurantsOnPage,
    resultsDataIdentityKey: resultsDataSnapshot.resultsDataIdentityKey,
    resultsDataVersion: resultsDataSnapshot.version,
    resultsRequestKey: resultsDataSnapshot.resultsRequestKey,
    showAllExactDishes: exactMatchProjection.showAllExactDishes,
    showAllExactRestaurants: exactMatchProjection.showAllExactRestaurants,
  });
  const fullRowsByTab = resolveMountedRowsProjection({
    exactMatchProjection,
    mountedResults,
  });
  const restaurantCardDescriptorsById = prepareRestaurantCardDescriptorsById({
    preparationKey,
    restaurants: fullRowsByTab.restaurants,
    results: mountedResults,
  });
  const preparationRowsByTab = resolveSearchResultsBodyAdmissionPreparationRows({
    activeTab: viewArgs.activeTab,
    resultsIdentityKey: viewArgs.resultsIdentityKey,
    rowsByTab: fullRowsByTab,
  });
  const rowsByTab = {
    dishes: preparationRowsByTab.dishes,
    restaurants: preparationRowsByTab.restaurants.map((row): ResultsListItem => {
      if (!isRestaurantResultRow(row)) {
        return row;
      }
      const preparedDescriptor = restaurantCardDescriptorsById.get(row.restaurantId);
      return preparedDescriptor == null
        ? row
        : {
            kind: 'mounted_restaurant_card',
            key: `mounted-restaurant-card:${row.restaurantId}`,
            preparedDescriptor,
            restaurant: row,
            restaurantId: row.restaurantId,
          };
    }),
  };
  const admission = resolveSearchResultsBodyAdmission({
    activeTab: viewArgs.activeTab,
    fullRowsByTab,
    resultsIdentityKey: viewArgs.resultsIdentityKey,
    rowsByTab,
  });
  const didPublish = publishSearchMountedResultsRowsSnapshot({
    admission,
    activeTab: viewArgs.activeTab,
    contentContainerStyle: {
      paddingBottom: admission.renderRowCount > 0 ? RESULTS_BOTTOM_PADDING : 0,
      paddingTop: 0,
    },
    handleShowMoreExactDishes: showMoreSearchMountedResultsExactDishes,
    handleShowMoreExactRestaurants: showMoreSearchMountedResultsExactRestaurants,
    headerHeight: viewArgs.headerHeight,
    preparationKey,
    restaurantCardDescriptorsById,
    resultsIdentityKey: viewArgs.resultsIdentityKey,
    resultsRequestKey: resultsDataSnapshot.resultsRequestKey,
    rowsByTab,
    viewKey,
  });
  markSearchMountedResultsCountContract({
    admission,
    resultsIdentityKey: viewArgs.resultsIdentityKey,
    resultsRequestKey: resultsDataSnapshot.resultsRequestKey,
    rowsByTab,
  });
  markSearchMountedResultsRowsPreparationWorkSpan({
    activeTab: viewArgs.activeTab,
    durationMs: nowMs() - startedAtMs,
    preparationKey,
    primaryRowCount: admission.primaryRows.length,
    renderRowCount: admission.renderRowCount,
    secondaryRowCount: admission.secondaryRows.length,
  });
  return didPublish;
};

export function showMoreSearchMountedResultsExactDishes(): void {
  exactMatchController.showMoreExactDishes();
  if (lastRowsPreparationInput != null) {
    prepareSearchMountedResultsRowsSnapshot(lastRowsPreparationInput);
  }
}

export function showMoreSearchMountedResultsExactRestaurants(): void {
  exactMatchController.showMoreExactRestaurants();
  if (lastRowsPreparationInput != null) {
    prepareSearchMountedResultsRowsSnapshot(lastRowsPreparationInput);
  }
}

export const useSearchMountedResultsBodyAuthorityOwner = ({
  searchRuntimeBus,
}: {
  searchRuntimeBus: SearchRuntimeBus;
}): void => {
  React.useEffect(() => {
    const publishRuntimeSnapshot = (): void => {
      const runtimeState = searchRuntimeBus.getState() as ReturnType<
        SearchRuntimeBus['getState']
      > & {
        hydratedResultsKey?: string | null;
        resultsIdentityKey?: string | null;
        shouldHydrateResultsForRender?: boolean;
      };
      publishSearchMountedResultsBodyRuntimeSnapshot({
        activeTab: runtimeState.activeTab ?? 'restaurants',
        hydratedResultsKey: runtimeState.hydratedResultsKey ?? null,
        isResultsHydrationSettled: true,
        searchSurfaceResultsTransactionKey: bodyRuntimeSnapshot.searchSurfaceResultsTransactionKey,
        resultsIdentityKey: runtimeState.resultsIdentityKey ?? null,
        searchSurfaceRedrawPhase: runtimeState.searchSurfaceRedrawPhase,
        shouldHydrateResultsForRender: runtimeState.shouldHydrateResultsForRender ?? false,
      });
    };

    publishRuntimeSnapshot();
    return searchRuntimeBus.subscribe(
      publishRuntimeSnapshot,
      ['activeTab', 'searchSurfaceRedrawPhase'] as const,
      'mounted_results_body_authority'
    );
  }, [searchRuntimeBus]);
};

export const useSearchMountedResultsDataSnapshot = (): SearchMountedResultsDataSnapshot =>
  React.useSyncExternalStore(
    subscribeSearchMountedResultsDataSnapshot,
    getSearchMountedResultsDataSnapshot,
    getSearchMountedResultsDataSnapshot
  );

export const useSearchMountedResultsRowsSnapshot = (): SearchMountedResultsRowsSnapshot =>
  React.useSyncExternalStore(
    subscribeSearchMountedResultsRowsSnapshot,
    getSearchMountedResultsRowsSnapshot,
    getSearchMountedResultsRowsSnapshot
  );
