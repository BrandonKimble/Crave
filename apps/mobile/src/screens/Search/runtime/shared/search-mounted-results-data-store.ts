import React from 'react';
import { reportSearchFlowContractViolation } from './search-flow-contracts';

import type { RestaurantResult, SearchResponse } from '../../../../types';
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

export type SearchMountedResultsDataSnapshot = {
  activeTab: 'dishes' | 'restaurants' | null;
  // R1a-2: marker projections precomputed at response commit for BOTH tabs (the dual_list
  // response carries dishes[] AND restaurants[]), so a tab toggle finds its target-tab
  // catalog ready and the controller's fallback full-catalog rebuild never fires. A tab's
  // entry is null when the committed response genuinely lacks that axis — the controller's
  // fallback then legitimately computes it without tripping the R1a contract.
  precomputedMarkerProjectionByTab: SearchMountedResultsMarkerProjectionByTab | null;
  resultsDataIdentityKey: string | null;
  results: SearchResponse | null;
  resultsHydrationKey: string | null;
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
  resultsHydrationKey: string | null;
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
  resultsHydrationKey: string | null;
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
  resultsHydrationKey: string | null;
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
  preparedRowsReadinessKey: string | null;
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
  resultsDataIdentityKey: null,
  results: null,
  resultsHydrationKey: null,
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
  preparedRowsReadinessKey: null,
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
  resultsHydrationKey: null,
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
  left.resultsHydrationKey === right.resultsHydrationKey &&
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
  resultsHydrationKey: null,
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
  resultsHydrationKey,
  resultsRequestKey,
  rowsByTab,
}: {
  admission: SearchResultsBodyAdmissionSnapshot;
  resultsHydrationKey: string | null;
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
    resultsHydrationKey: quietMeasuredLoopActive ? null : resultsHydrationKey,
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
  left.resultsHydrationKey === right.resultsHydrationKey &&
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
  resultsHydrationKey,
  searchSurfaceRedrawPhase,
  targetSnapPointMiddle,
  viewportHeight,
}: SearchMountedResultsRowsViewKeyArgs): string =>
  [
    `hydration:${resultsHydrationKey ?? 'null'}`,
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
  preparedRowsReadinessKey: rowsSnapshot.resultsHydrationKey ?? rowsSnapshot.resultsRequestKey,
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

const publishSearchMountedResultsListDataSnapshotIfChanged = (): void => {
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
  readinessKey,
  source,
}: {
  activeRowCount: number;
  ready: boolean;
  readinessKey: string | null;
  source: string;
}): void => {
  const authority = getResultsPresentationSurfaceAuthority();
  if (readinessKey == null || activeRowCount <= 0) {
    authority.publish(
      {
        listPreparedRowsReady: false,
        preparedRows: {
          targetReadinessKey: null,
          readyReadinessKey: null,
          activeRowCount: 0,
        },
      },
      'mounted_results_prepared_rows_cleared'
    );
    return;
  }
  const currentSnapshot = authority.getSnapshot().preparedRows;
  const readyReadinessKey = ready ? readinessKey : null;
  const listPreparedRowsReady =
    ready && authority.getSnapshot().resultsPreparedRowsKey === readinessKey;
  if (
    currentSnapshot.targetReadinessKey === readinessKey &&
    currentSnapshot.readyReadinessKey === readyReadinessKey &&
    currentSnapshot.activeRowCount === activeRowCount &&
    authority.getSnapshot().listPreparedRowsReady === listPreparedRowsReady
  ) {
    return;
  }
  authority.publish(
    {
      listPreparedRowsReady,
      preparedRows: {
        targetReadinessKey: readinessKey,
        readyReadinessKey,
        activeRowCount,
      },
    },
    source
  );
};

const stageSearchMountedResultsPreparedRowsTarget = ({
  activeRowCount,
  readinessKey,
}: {
  activeRowCount: number;
  readinessKey: string | null;
}): void => {
  publishSearchMountedResultsPreparedRowsSnapshot({
    activeRowCount,
    ready: false,
    readinessKey,
    source: 'mounted_results_prepared_rows_staged',
  });
};

export const markSearchMountedResultsPreparedRowsCommitted = ({
  activeRowCount,
  readinessKey,
}: {
  activeRowCount: number;
  readinessKey: string | null;
}): void => {
  publishSearchMountedResultsPreparedRowsSnapshot({
    activeRowCount,
    ready: true,
    readinessKey,
    source: 'mounted_results_prepared_rows_committed',
  });
};

export const commitSearchMountedResultsPreparedRowsTarget = ({
  readinessKey,
}: {
  readinessKey: string | null;
}): void => {
  if (readinessKey == null) {
    return;
  }
  const preparedRows = getResultsPresentationSurfaceAuthority().getSnapshot().preparedRows;
  if (preparedRows.targetReadinessKey !== readinessKey || preparedRows.activeRowCount <= 0) {
    // R0 loud-contracts (§D6): a commit attempt against a DIFFERENT staged target (or a
    // zero-row staging) can strand cardsReady=false forever — the audit's "stuck staging"
    // silent zone. Same-key-but-empty and stale-key cases are both suspicious here.
    reportSearchFlowContractViolation('prepared_rows_commit_target_mismatch', {
      readinessKey,
      targetReadinessKey: preparedRows.targetReadinessKey,
      activeRowCount: preparedRows.activeRowCount,
    });
    return;
  }
  markSearchMountedResultsPreparedRowsCommitted({
    activeRowCount: preparedRows.activeRowCount,
    readinessKey,
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
    resultsHydrationKey?: string | null;
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
  const nextResultsHydrationKey = options?.resultsHydrationKey ?? null;
  const nextActiveTab = options?.activeTab ?? null;
  const nextMarkerProjectionByTab = options?.markerProjectionByTab ?? null;
  const nextResultsDataIdentityKey = createSearchMountedResultsDataIdentityKey(results);
  const activeRedrawTransactionId =
    getSearchSurfaceRuntime().getActiveOrPendingRedrawTransactionId();
  if (
    snapshot.results === results &&
    snapshot.resultsRequestKey === nextResultsRequestKey &&
    snapshot.resultsHydrationKey === nextResultsHydrationKey &&
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
    path: `${snapshot.resultsHydrationKey ?? snapshot.resultsRequestKey ?? 'null'}->${
      nextResultsHydrationKey ?? nextResultsRequestKey ?? 'null'
    }`,
    details: {
      activeTab: nextActiveTab,
      dishCount: results?.dishes?.length ?? 0,
      hydrationKey: nextResultsHydrationKey,
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
    resultsDataIdentityKey: nextResultsDataIdentityKey,
    results,
    resultsHydrationKey: nextResultsHydrationKey,
    resultsRequestKey: nextResultsRequestKey,
    version: snapshot.version + 1,
  };
  listeners.forEach((listener) => {
    listener();
  });
  prepareSearchMountedResultsRowsSnapshotFromAuthority();
  return true;
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

  logPerfScenarioStackAttribution({
    owner: 'search_mounted_results_rows_snapshot_writer',
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
    ...nextSnapshot,
    version: rowsSnapshot.version + 1,
  };
  stageSearchMountedResultsPreparedRowsTarget({
    activeRowCount: nextSnapshot.admission.renderRowCount,
    readinessKey: nextSnapshot.resultsHydrationKey ?? nextSnapshot.resultsRequestKey,
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
      : (resultsDataSnapshot.resultsHydrationKey ??
        bodyRuntimeSnapshot.resultsHydrationKey ??
        bodyRuntimeSnapshot.hydratedResultsKey ??
        resultsDataSnapshot.resultsRequestKey);
  return {
    activeTab: bodyRuntimeSnapshot.activeTab ?? resultsDataSnapshot.activeTab ?? 'restaurants',
    headerHeight: bodyLayoutSnapshot.headerHeight,
    resultsDataSnapshot,
    resultsHydrationKey: activeRowsHydrationKey,
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
  resultsHydrationKey,
  shouldHydrateResultsForRender,
}: {
  activeTab: 'dishes' | 'restaurants';
  hydratedResultsKey: string | null;
  isResultsHydrationSettled: boolean;
  resultsHydrationKey: string | null;
  shouldHydrateResultsForRender: boolean;
}): boolean =>
  publishSearchMountedResultsBodyRuntimeSnapshot({
    activeTab,
    hydratedResultsKey,
    isResultsHydrationSettled,
    searchSurfaceResultsTransactionKey: bodyRuntimeSnapshot.searchSurfaceResultsTransactionKey,
    resultsHydrationKey,
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

export const prepareSearchMountedResultsRowsSnapshot = ({
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
    resultsHydrationKey: viewArgs.resultsHydrationKey,
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
    resultsHydrationKey: viewArgs.resultsHydrationKey,
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
    resultsHydrationKey: viewArgs.resultsHydrationKey,
    resultsRequestKey: resultsDataSnapshot.resultsRequestKey,
    rowsByTab,
    viewKey,
  });
  markSearchMountedResultsCountContract({
    admission,
    resultsHydrationKey: viewArgs.resultsHydrationKey,
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
        resultsHydrationKey?: string | null;
        shouldHydrateResultsForRender?: boolean;
      };
      publishSearchMountedResultsBodyRuntimeSnapshot({
        activeTab: runtimeState.activeTab ?? 'restaurants',
        hydratedResultsKey: runtimeState.hydratedResultsKey ?? null,
        isResultsHydrationSettled: true,
        searchSurfaceResultsTransactionKey: bodyRuntimeSnapshot.searchSurfaceResultsTransactionKey,
        resultsHydrationKey: runtimeState.resultsHydrationKey ?? null,
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
