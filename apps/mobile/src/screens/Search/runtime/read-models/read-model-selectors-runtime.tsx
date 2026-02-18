import React from 'react';
import { Pressable, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { Text } from '../../../../components';
import SquircleSpinner from '../../../../components/SquircleSpinner';
import { colors as themeColors } from '../../../../constants/theme';
import OverlayHeaderActionButton from '../../../../overlays/OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../../../../overlays/OverlaySheetHeaderChrome';
import { overlaySheetStyles } from '../../../../overlays/overlaySheetStyles';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import { logger } from '../../../../utils';
import EmptyState from '../../components/empty-state';
import styles from '../../styles';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import {
  buildResultsEmptyAreaReadModel,
  buildResultsHeaderTitle,
} from './header-read-model-builder';
import {
  buildHydratedResultsData,
  buildSafeResultsData,
  buildSectionedResultsData,
  type ResultsListItem,
} from './list-read-model-builder';
import type { MapQueryBudget } from '../map/map-query-budget';

const EMPTY_RESULTS: ResultsListItem[] = [];
const EXACT_VISIBLE_LIMIT = 5;
const HYDRATION_RAMP_STEP_ROWS = 4;
const HYDRATION_PENDING_INITIAL_ROWS = 4;
const HYDRATION_RAMP_FRAME_BUDGET_MS = 4;
const VIEWABILITY_LOG_INTERVAL_MS = 250;
const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

type UseSearchResultsReadModelSelectorsArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  results: SearchResponse | null;
  isFilterTogglePending: boolean;
  shouldHydrateResultsForRender: boolean;
  isVisualSyncPending: boolean;
  runOneCommitSpanPressureActive: boolean;
  allowHydrationFinalizeCommit: boolean;
  mapQueryBudget: MapQueryBudget;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  shouldShowResultsLoadingState: boolean;
  onDemandNotice: React.ReactNode;
  screenHeight: number;
  middleSnapPoint: number;
  effectiveResultsHeaderHeight: number;
  effectiveFiltersHeaderHeight: number;
  activeTabColor: string;
  shouldDisableResultsHeader: boolean;
  shouldUseResultsHeaderBlur: boolean;
  submittedQuery: string;
  handleCloseResults: () => void;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
  overlayHeaderActionProgress: SharedValue<number>;
  headerDividerAnimatedStyle: StyleProp<ViewStyle>;
  shouldLogResultsViewability: boolean;
  searchInteractionRef: React.MutableRefObject<{ isResultsListScrolling: boolean }>;
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement;
  renderRestaurantCard: (item: RestaurantResult, index: number) => React.ReactElement;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  hydrationOperationId: string | null;
  activeOverlayKey: string;
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
  resultsLoadingSpinnerOffset: number;
  contentHorizontalPadding: number;
};

type ListProjection = {
  safeResultsData: Array<FoodResult | RestaurantResult>;
  sectionedRows: ResultsListItem[];
};

type HeaderProjection = {
  emptyAreaMinHeight: number;
  emptyYOffset: number;
  emptySubtitle: string;
  headerTitle: string;
};

type ResultsFlashListRuntimeProps = {
  drawDistance: number;
  overrideProps: {
    initialDrawBatchSize: number;
  };
  viewabilityConfig?: FlashListProps<ResultsListItem>['viewabilityConfig'];
  onViewableItemsChanged?: FlashListProps<ResultsListItem>['onViewableItemsChanged'];
};

type SearchResultsReadModelSelectors = {
  safeResultsCount: number;
  isResultsFinalizeLaneActive: boolean;
  rowsForRender: ResultsListItem[];
  renderListItem: NonNullable<FlashListProps<ResultsListItem>['renderItem']>;
  listFooterComponent: React.ReactNode;
  listEmptyComponent: React.ReactNode;
  listHeaderComponent: React.ReactNode;
  flashListRuntimeProps: ResultsFlashListRuntimeProps;
};

const resolveCachedProjection = <T,>(
  cache: React.MutableRefObject<Map<string, T>>,
  projectionKey: string,
  buildProjection: () => T
): T => {
  const cached = cache.current.get(projectionKey);
  if (cached) {
    return cached;
  }
  const nextProjection = buildProjection();
  cache.current.clear();
  cache.current.set(projectionKey, nextProjection);
  return nextProjection;
};

export const useSearchResultsReadModelSelectors = (
  args: UseSearchResultsReadModelSelectorsArgs
): SearchResultsReadModelSelectors => {
  const {
    activeTab,
    dishes,
    restaurants,
    results,
    isFilterTogglePending,
    shouldHydrateResultsForRender,
    isVisualSyncPending,
    runOneCommitSpanPressureActive,
    allowHydrationFinalizeCommit,
    mapQueryBudget,
    canLoadMore,
    isLoadingMore,
    shouldShowResultsLoadingState,
    onDemandNotice,
    screenHeight,
    middleSnapPoint,
    effectiveResultsHeaderHeight,
    effectiveFiltersHeaderHeight,
    activeTabColor,
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlur,
    submittedQuery,
    handleCloseResults,
    handleResultsHeaderLayout,
    overlayHeaderActionProgress,
    headerDividerAnimatedStyle,
    shouldLogResultsViewability,
    searchInteractionRef,
    renderDishCard,
    renderRestaurantCard,
    onRuntimeMechanismEvent,
    resultsHydrationKey,
    hydratedResultsKey,
    hydrationOperationId,
    activeOverlayKey,
    setHydratedResultsKeySync,
    phaseBMaterializerRef,
    resultsLoadingSpinnerOffset,
    contentHorizontalPadding,
  } = args;

  const emitRuntimeWriteSpan = React.useCallback(
    (payload: Record<string, unknown>) => {
      onRuntimeMechanismEvent?.('runtime_write_span', {
        domain: 'results_read_model',
        ...payload,
      });
    },
    [onRuntimeMechanismEvent]
  );

  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const searchRequestIdentity =
    results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null;
  const [sectionedSearchRequestId, setSectionedSearchRequestId] = React.useState<string | null>(
    null
  );
  const [exactDishesOnPage, setExactDishesOnPage] = React.useState<number | null>(null);
  const [exactRestaurantsOnPage, setExactRestaurantsOnPage] = React.useState<number | null>(null);
  const [showAllExactDishes, setShowAllExactDishes] = React.useState(false);
  const [showAllExactRestaurants, setShowAllExactRestaurants] = React.useState(false);

  React.useEffect(() => {
    const nextExactDishes =
      typeof results?.metadata?.exactDishCountOnPage === 'number'
        ? results.metadata.exactDishCountOnPage
        : null;
    const nextExactRestaurants =
      typeof results?.metadata?.exactRestaurantCountOnPage === 'number'
        ? results.metadata.exactRestaurantCountOnPage
        : null;

    if (!searchRequestId) {
      setSectionedSearchRequestId(null);
      setExactDishesOnPage(null);
      setExactRestaurantsOnPage(null);
      setShowAllExactDishes(false);
      setShowAllExactRestaurants(false);
      return;
    }

    if (searchRequestId !== sectionedSearchRequestId) {
      setSectionedSearchRequestId(searchRequestId);
      setExactDishesOnPage(nextExactDishes);
      setExactRestaurantsOnPage(nextExactRestaurants);
      setShowAllExactDishes(false);
      setShowAllExactRestaurants(false);
      return;
    }

    if (nextExactDishes !== null && exactDishesOnPage === null) {
      setExactDishesOnPage(nextExactDishes);
    }
    if (nextExactRestaurants !== null && exactRestaurantsOnPage === null) {
      setExactRestaurantsOnPage(nextExactRestaurants);
    }
  }, [
    exactDishesOnPage,
    exactRestaurantsOnPage,
    results?.metadata?.exactDishCountOnPage,
    results?.metadata?.exactRestaurantCountOnPage,
    searchRequestId,
    sectionedSearchRequestId,
  ]);

  const listReadModelBuildDurationMsRef = React.useRef<number | null>(null);
  const listProjectionBuildStatsRef = React.useRef<{
    requestVersionKey: string;
    sectionedRowCount: number;
    safeResultsCount: number;
  } | null>(null);
  const responsePage = results?.metadata?.page ?? 1;
  const requestVersionKey = `${searchRequestId ?? 'no-request'}::${
    resultsHydrationKey ?? 'no-hydration'
  }::page:${responsePage}::dishes:${dishes.length}::restaurants:${
    restaurants.length
  }::${activeTab}`;
  const listProjection = React.useMemo(() => {
    const buildStartedAtMs = getNowMs();
    const safeResultsData = buildSafeResultsData({
      activeTab,
      dishes,
      restaurants,
    });
    const sectionedResultsData = buildSectionedResultsData({
      activeTab,
      safeResultsData,
      exactDishesOnPage,
      exactRestaurantsOnPage,
      showAllExactDishes,
      showAllExactRestaurants,
      exactVisibleLimit: EXACT_VISIBLE_LIMIT,
    });
    const projection: ListProjection = {
      safeResultsData,
      sectionedRows: sectionedResultsData,
    };
    const durationMs = getNowMs() - buildStartedAtMs;
    listReadModelBuildDurationMsRef.current = durationMs;
    listProjectionBuildStatsRef.current = {
      requestVersionKey,
      sectionedRowCount: projection.sectionedRows.length,
      safeResultsCount: projection.safeResultsData.length,
    };
    return projection;
  }, [
    activeTab,
    dishes,
    exactDishesOnPage,
    exactRestaurantsOnPage,
    requestVersionKey,
    responsePage,
    restaurants,
    showAllExactDishes,
    showAllExactRestaurants,
  ]);
  React.useEffect(() => {
    const durationMs = listReadModelBuildDurationMsRef.current;
    const stats = listProjectionBuildStatsRef.current;
    if (durationMs == null || stats == null) {
      return;
    }
    mapQueryBudget.recordRuntimeAttributionDurationMs('list_read_model_build', durationMs);
    emitRuntimeWriteSpan({
      label: 'list_read_model_build',
      requestVersionKey: stats.requestVersionKey,
      searchRequestId,
      resultsHydrationKey,
      activeTab,
      durationMs,
      sectionedRowCount: stats.sectionedRowCount,
      safeResultsCount: stats.safeResultsCount,
      shouldHydrateResultsForRender,
      runOneCommitSpanPressureActive,
    });
    listReadModelBuildDurationMsRef.current = null;
    listProjectionBuildStatsRef.current = null;
  }, [
    activeTab,
    emitRuntimeWriteSpan,
    listProjection,
    mapQueryBudget,
    resultsHydrationKey,
    runOneCommitSpanPressureActive,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);

  const [hydrationRowsLimitState, setHydrationRowsLimitState] = React.useState<{
    requestKey: string | null;
    limit: number | null;
  }>({
    requestKey: null,
    limit: null,
  });
  const hydrationRowsLimit =
    hydrationRowsLimitState.requestKey === resultsHydrationKey
      ? hydrationRowsLimitState.limit
      : null;
  const setHydrationRowsLimit = React.useCallback(
    (nextLimit: number | null, requestKey: string | null = resultsHydrationKey) => {
      setHydrationRowsLimitState((previous) => {
        if (previous.requestKey === requestKey && previous.limit === nextLimit) {
          return previous;
        }
        return {
          requestKey,
          limit: nextLimit,
        };
      });
    },
    [resultsHydrationKey]
  );
  const hydrationRowsLimitRef = React.useRef<number | null>(hydrationRowsLimit);
  hydrationRowsLimitRef.current = hydrationRowsLimit;
  const [hydrationFinalizeRowsReleaseKey, setHydrationFinalizeRowsReleaseKey] = React.useState<
    string | null
  >(null);
  const hydrationRowsReleaseVersionToken =
    resultsHydrationKey == null
      ? null
      : `${resultsHydrationKey}:${listProjection.safeResultsData.length}`;
  const [
    hydrationFinalizeRowsReleaseCompletedToken,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ] = React.useState<string | null>(null);

  const isHydrationPending =
    resultsHydrationKey != null && resultsHydrationKey !== hydratedResultsKey;
  const shouldHoldHydrationRows =
    resultsHydrationKey != null &&
    (isHydrationPending ||
      hydrationFinalizeRowsReleaseCompletedToken !== hydrationRowsReleaseVersionToken);
  const isResultsFinalizeLaneActive = activeOverlayKey === 'search' && shouldHoldHydrationRows;
  const pendingHydrationRowsLimit = React.useMemo(() => {
    if (!shouldHoldHydrationRows) {
      return null;
    }
    if (activeOverlayKey !== 'search') {
      return null;
    }
    const sectionedRowCount = Math.max(0, listProjection.sectionedRows.length);
    if (sectionedRowCount <= 0) {
      return null;
    }
    if (shouldHydrateResultsForRender && isVisualSyncPending) {
      return 0;
    }
    return Math.min(HYDRATION_PENDING_INITIAL_ROWS, sectionedRowCount);
  }, [
    activeOverlayKey,
    isVisualSyncPending,
    listProjection.sectionedRows.length,
    shouldHydrateResultsForRender,
    shouldHoldHydrationRows,
  ]);
  const effectiveHydrationRowsLimit = hydrationRowsLimit ?? pendingHydrationRowsLimit;
  const resultsFinalizeLaneStateRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (resultsFinalizeLaneStateRef.current === isResultsFinalizeLaneActive) {
      return;
    }
    resultsFinalizeLaneStateRef.current = isResultsFinalizeLaneActive;
    emitRuntimeWriteSpan({
      label: 'results_finalize_lane_state',
      operationId: hydrationOperationId ?? searchRequestIdentity ?? 'hydration-sync-no-request',
      activeOverlayKey,
      searchRequestId,
      resultsHydrationKey,
      isResultsFinalizeLaneActive,
      isHydrationPending,
      hydrationRowsReleasePending:
        hydrationFinalizeRowsReleaseCompletedToken !== hydrationRowsReleaseVersionToken,
      shouldHydrateResultsForRender,
    });
  }, [
    activeOverlayKey,
    emitRuntimeWriteSpan,
    hydrationFinalizeRowsReleaseCompletedToken,
    hydrationOperationId,
    hydrationRowsReleaseVersionToken,
    isHydrationPending,
    isResultsFinalizeLaneActive,
    resultsHydrationKey,
    searchRequestIdentity,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);

  React.useEffect(() => {
    setHydrationRowsLimit(null);
    setHydrationFinalizeRowsReleaseKey(null);
    setHydrationFinalizeRowsReleaseCompletedToken(null);
  }, [resultsHydrationKey]);

  React.useEffect(() => {
    if (!resultsHydrationKey) {
      setHydrationRowsLimit(null);
      setHydrationFinalizeRowsReleaseKey(null);
      setHydrationFinalizeRowsReleaseCompletedToken(null);
      phaseBMaterializerRef.current.resetHydrationRamp();
      return;
    }

    if (!isHydrationPending) {
      return;
    }

    phaseBMaterializerRef.current.resetHydrationRamp();

    if (activeOverlayKey !== 'search') {
      setHydrationRowsLimit(null);
      setHydrationFinalizeRowsReleaseKey(resultsHydrationKey);
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
      return;
    }
    setHydrationRowsLimit(null);
  }, [
    activeOverlayKey,
    isHydrationPending,
    phaseBMaterializerRef,
    resultsHydrationKey,
    setHydrationRowsLimit,
    hydrationRowsReleaseVersionToken,
  ]);

  React.useEffect(() => {
    if (!resultsHydrationKey || isHydrationPending) {
      return;
    }
    if (hydrationFinalizeRowsReleaseKey !== resultsHydrationKey) {
      return;
    }
    if (activeOverlayKey !== 'search') {
      setHydrationRowsLimit(null);
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
      return;
    }

    const sectionedRowCount = listProjection.sectionedRows.length;
    if (sectionedRowCount <= 0) {
      setHydrationRowsLimit(null);
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
      return;
    }
    const minimumStartRows = Math.min(
      sectionedRowCount,
      Math.max(0, pendingHydrationRowsLimit ?? HYDRATION_PENDING_INITIAL_ROWS)
    );
    const previousRowsLimit = Math.max(0, hydrationRowsLimitRef.current ?? 0);
    const startRows = Math.min(sectionedRowCount, Math.max(previousRowsLimit, minimumStartRows));
    const rampInitialRows =
      startRows > 0 ? startRows : Math.min(sectionedRowCount, HYDRATION_PENDING_INITIAL_ROWS);
    if (rampInitialRows >= sectionedRowCount) {
      setHydrationRowsLimit(sectionedRowCount);
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
      return;
    }
    setHydrationRowsLimit(rampInitialRows);
    return phaseBMaterializerRef.current.scheduleHydrationRamp({
      operationId: hydrationOperationId ?? resultsHydrationKey,
      initialRows: rampInitialRows,
      targetRows: sectionedRowCount,
      stepRows: HYDRATION_RAMP_STEP_ROWS,
      frameBudgetMs: HYDRATION_RAMP_FRAME_BUDGET_MS,
      resolveStepRows: ({ pressure, defaultStepRows }) => {
        if (isVisualSyncPending || runOneCommitSpanPressureActive) {
          return 1;
        }
        if (!shouldHydrateResultsForRender) {
          return defaultStepRows;
        }
        if (pressure === 'critical') {
          return 1;
        }
        if (pressure === 'pressured') {
          return Math.min(2, defaultStepRows);
        }
        return Math.min(2, defaultStepRows);
      },
      onStep: setHydrationRowsLimit,
      onComplete: () => {
        setHydrationRowsLimit(sectionedRowCount);
        setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
      },
    });
  }, [
    activeOverlayKey,
    hydrationFinalizeRowsReleaseKey,
    hydrationOperationId,
    hydrationRowsReleaseVersionToken,
    isHydrationPending,
    listProjection.sectionedRows.length,
    pendingHydrationRowsLimit,
    phaseBMaterializerRef,
    resultsHydrationKey,
    setHydrationRowsLimit,
    shouldHydrateResultsForRender,
    isVisualSyncPending,
    runOneCommitSpanPressureActive,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ]);

  const listRenderKeyFlipDurationMsRef = React.useRef<number | null>(null);
  const rowsForRenderBuildStatsRef = React.useRef<{
    rowsForRenderCount: number;
    effectiveHydrationRowsLimit: number | null;
    sectionedRowCount: number;
    isFilterTogglePending: boolean;
  } | null>(null);
  const rowsForRender = React.useMemo(() => {
    const buildStartedAtMs = getNowMs();
    if (isFilterTogglePending) {
      const durationMs = getNowMs() - buildStartedAtMs;
      listRenderKeyFlipDurationMsRef.current = durationMs;
      rowsForRenderBuildStatsRef.current = {
        rowsForRenderCount: 0,
        effectiveHydrationRowsLimit,
        sectionedRowCount: listProjection.sectionedRows.length,
        isFilterTogglePending: true,
      };
      return EMPTY_RESULTS;
    }
    const hydratedRows = buildHydratedResultsData({
      sectionedResultsData: listProjection.sectionedRows,
      maxHydratedRows: effectiveHydrationRowsLimit,
    });
    const durationMs = getNowMs() - buildStartedAtMs;
    listRenderKeyFlipDurationMsRef.current = durationMs;
    rowsForRenderBuildStatsRef.current = {
      rowsForRenderCount: hydratedRows.length,
      effectiveHydrationRowsLimit,
      sectionedRowCount: listProjection.sectionedRows.length,
      isFilterTogglePending: false,
    };
    return hydratedRows;
  }, [effectiveHydrationRowsLimit, isFilterTogglePending, listProjection.sectionedRows]);
  React.useEffect(() => {
    const durationMs = listRenderKeyFlipDurationMsRef.current;
    const stats = rowsForRenderBuildStatsRef.current;
    if (durationMs == null || stats == null) {
      return;
    }
    mapQueryBudget.recordRuntimeAttributionDurationMs('list_render_key_flip', durationMs);
    emitRuntimeWriteSpan({
      label: 'rows_for_render_build',
      searchRequestId,
      resultsHydrationKey,
      activeTab,
      durationMs,
      rowsForRenderCount: stats.rowsForRenderCount,
      effectiveHydrationRowsLimit: stats.effectiveHydrationRowsLimit,
      sectionedRowCount: stats.sectionedRowCount,
      isFilterTogglePending: stats.isFilterTogglePending,
      shouldHydrateResultsForRender,
      runOneCommitSpanPressureActive,
    });
    listRenderKeyFlipDurationMsRef.current = null;
    rowsForRenderBuildStatsRef.current = null;
  }, [
    activeTab,
    emitRuntimeWriteSpan,
    mapQueryBudget,
    resultsHydrationKey,
    rowsForRender,
    runOneCommitSpanPressureActive,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);

  const renderListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(
    ({ item, index }) => {
      if (item === undefined || item === null) {
        logger.error('FlashList renderItem received nullish item', { index });
        return null;
      }

      if (item && typeof item === 'object' && 'kind' in item) {
        if (item.kind === 'section') {
          return (
            <View style={[styles.resultItem, index === 0 && styles.firstResultItem]}>
              <Text style={[styles.resultMetaText, { color: themeColors.textMuted }]}>
                {item.label}
              </Text>
            </View>
          );
        }

        if (item.kind === 'show_more_exact') {
          const onPress =
            activeTab === 'dishes'
              ? () => setShowAllExactDishes(true)
              : () => setShowAllExactRestaurants(true);
          const label =
            item.hiddenCount === 1
              ? 'Show 1 more exact match'
              : `Show ${item.hiddenCount} more exact matches`;
          return (
            <Pressable
              onPress={onPress}
              style={[styles.resultItem, index === 0 && styles.firstResultItem]}
            >
              <Text style={[styles.resultMetaText, { color: themeColors.secondaryAccent }]}>
                {label}
              </Text>
            </Pressable>
          );
        }
      }

      return 'foodId' in item
        ? renderDishCard(item as FoodResult, index)
        : renderRestaurantCard(item as RestaurantResult, index);
    },
    [activeTab, renderDishCard, renderRestaurantCard]
  );

  const listFooterComponent = React.useMemo(() => {
    const shouldShowNotice = Boolean(
      onDemandNotice && listProjection.safeResultsData.length > 0 && !isFilterTogglePending
    );
    return (
      <View style={styles.loadMoreSpacer}>
        {shouldShowNotice ? onDemandNotice : null}
        {!isFilterTogglePending && isLoadingMore && canLoadMore ? (
          <View style={styles.loadMoreSpinner}>
            <SquircleSpinner size={18} color={activeTabColor} />
          </View>
        ) : null}
      </View>
    );
  }, [
    activeTabColor,
    canLoadMore,
    isFilterTogglePending,
    isLoadingMore,
    listProjection.safeResultsData.length,
    onDemandNotice,
  ]);

  const headerProjectionCacheRef = React.useRef<Map<string, HeaderProjection>>(new Map());
  const headerProjectionKey = `${requestVersionKey}::${screenHeight}::${middleSnapPoint}::${effectiveResultsHeaderHeight}::${effectiveFiltersHeaderHeight}::${submittedQuery}`;
  const headerProjection = React.useMemo(
    () =>
      resolveCachedProjection(headerProjectionCacheRef, headerProjectionKey, () => {
        const emptyArea = buildResultsEmptyAreaReadModel({
          screenHeight,
          middleSnapPoint,
          effectiveResultsHeaderHeight,
          effectiveFiltersHeaderHeight,
        });
        return {
          ...emptyArea,
          emptySubtitle:
            results?.metadata?.emptyQueryMessage ?? 'Try moving the map or adjusting your search.',
          headerTitle: buildResultsHeaderTitle(submittedQuery),
        };
      }),
    [
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
      headerProjectionKey,
      middleSnapPoint,
      results?.metadata?.emptyQueryMessage,
      screenHeight,
      submittedQuery,
    ]
  );

  const listEmptyComponent = React.useMemo(() => {
    const emptyAreaStyle = { minHeight: headerProjection.emptyAreaMinHeight };
    const emptyContentOffsetStyle = {
      transform: [{ translateY: headerProjection.emptyYOffset }],
    };

    if (shouldShowResultsLoadingState || isFilterTogglePending) {
      return (
        <View
          style={[
            styles.resultsEmptyArea,
            emptyAreaStyle,
            { justifyContent: 'flex-start', paddingTop: resultsLoadingSpinnerOffset },
          ]}
        >
          <SquircleSpinner size={22} color={activeTabColor} />
        </View>
      );
    }

    return (
      <View style={[styles.resultsEmptyArea, emptyAreaStyle]}>
        <View style={emptyContentOffsetStyle}>
          {onDemandNotice}
          <EmptyState
            title={activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.'}
            subtitle={headerProjection.emptySubtitle}
          />
        </View>
      </View>
    );
  }, [
    activeTab,
    activeTabColor,
    headerProjection.emptyAreaMinHeight,
    headerProjection.emptySubtitle,
    headerProjection.emptyYOffset,
    isFilterTogglePending,
    onDemandNotice,
    resultsLoadingSpinnerOffset,
    shouldShowResultsLoadingState,
  ]);

  const listHeaderComponent = React.useMemo(() => {
    if (shouldDisableResultsHeader) {
      return null;
    }
    return (
      <OverlaySheetHeaderChrome
        onLayout={handleResultsHeaderLayout}
        onGrabHandlePress={handleCloseResults}
        grabHandleAccessibilityLabel="Hide results"
        paddingHorizontal={contentHorizontalPadding}
        transparent={shouldUseResultsHeaderBlur}
        style={[
          styles.resultsHeaderSurface,
          shouldUseResultsHeaderBlur ? null : styles.resultsHeaderSurfaceSolid,
        ]}
        title={
          <Text
            variant="title"
            weight="semibold"
            style={styles.submittedQueryLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {headerProjection.headerTitle}
          </Text>
        }
        actionButton={
          <OverlayHeaderActionButton
            progress={overlayHeaderActionProgress}
            onPress={handleCloseResults}
            accessibilityLabel="Close results"
            accentColor={activeTabColor}
            closeColor="#000000"
          />
        }
        showDivider={false}
        afterRow={
          <Reanimated.View
            style={[
              overlaySheetStyles.headerDivider,
              styles.resultsHeaderBottomSeparator,
              headerDividerAnimatedStyle,
            ]}
          />
        }
      />
    );
  }, [
    activeTabColor,
    contentHorizontalPadding,
    handleCloseResults,
    handleResultsHeaderLayout,
    headerDividerAnimatedStyle,
    headerProjection.headerTitle,
    overlayHeaderActionProgress,
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlur,
  ]);

  React.useEffect(() => {
    if (activeOverlayKey === 'search' && !allowHydrationFinalizeCommit) {
      phaseBMaterializerRef.current.resetHydrationCommit();
      return () => {
        phaseBMaterializerRef.current.resetHydrationCommit();
      };
    }
    return phaseBMaterializerRef.current.syncHydrationCommit({
      operationId: hydrationOperationId ?? searchRequestIdentity ?? 'hydration-sync-no-request',
      pendingHydrationKey: resultsHydrationKey,
      hydratedHydrationKey: hydratedResultsKey,
      activeOverlayKey,
      commitHydrationKey: (nextHydrationKey) => {
        const commitStartedAtMs = getNowMs();
        setHydratedResultsKeySync(nextHydrationKey);
        const durationMs = getNowMs() - commitStartedAtMs;
        mapQueryBudget.recordRuntimeAttributionDurationMs('hydration_commit_apply', durationMs);
        mapQueryBudget.recordRuntimeAttributionDurationMs(
          'hydration_finalize_key_commit',
          durationMs
        );
        emitRuntimeWriteSpan({
          label: 'hydration_finalize_key_commit',
          operationId: hydrationOperationId ?? searchRequestIdentity ?? 'hydration-sync-no-request',
          activeOverlayKey,
          searchRequestId,
          resultsHydrationKey: nextHydrationKey,
          durationMs,
        });
      },
      onFinalizeRowsReleaseReady: (operationId) => {
        const releaseStartedAtMs = getNowMs();
        setHydrationFinalizeRowsReleaseKey((previous) =>
          previous === operationId ? previous : operationId
        );
        const durationMs = getNowMs() - releaseStartedAtMs;
        mapQueryBudget.recordRuntimeAttributionDurationMs(
          'hydration_finalize_rows_release',
          durationMs
        );
        emitRuntimeWriteSpan({
          label: 'hydration_finalize_rows_release',
          operationId,
          activeOverlayKey,
          searchRequestId,
          resultsHydrationKey,
          durationMs,
        });
      },
    });
  }, [
    activeOverlayKey,
    allowHydrationFinalizeCommit,
    emitRuntimeWriteSpan,
    hydratedResultsKey,
    hydrationOperationId,
    mapQueryBudget,
    phaseBMaterializerRef,
    resultsHydrationKey,
    searchRequestIdentity,
    setHydratedResultsKeySync,
  ]);

  const lastResultsViewabilityLogRef = React.useRef(0);
  const isHydrationRowsLimited =
    effectiveHydrationRowsLimit != null &&
    effectiveHydrationRowsLimit < listProjection.sectionedRows.length;
  const resultsViewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 1, minimumViewTime: 16 }),
    []
  );
  const handleResultsViewableItemsChanged = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['onViewableItemsChanged']>
  >(
    (info) => {
      if (!shouldLogResultsViewability || listProjection.safeResultsData.length === 0) {
        return;
      }
      const viewableCount = info.viewableItems.filter((token) => token.isViewable).length;
      if (viewableCount > 0 || !searchInteractionRef.current.isResultsListScrolling) {
        return;
      }
      const now = Date.now();
      if (now - lastResultsViewabilityLogRef.current < VIEWABILITY_LOG_INTERVAL_MS) {
        return;
      }
      lastResultsViewabilityLogRef.current = now;
    },
    [listProjection.safeResultsData.length, searchInteractionRef, shouldLogResultsViewability]
  );

  const flashListRuntimeProps = React.useMemo(
    () => ({
      drawDistance: isHydrationRowsLimited ? 220 : 420,
      overrideProps: {
        initialDrawBatchSize: isHydrationRowsLimited ? 2 : 4,
      },
      ...(shouldLogResultsViewability
        ? {
            viewabilityConfig: resultsViewabilityConfig,
            onViewableItemsChanged: handleResultsViewableItemsChanged,
          }
        : null),
    }),
    [
      handleResultsViewableItemsChanged,
      isHydrationRowsLimited,
      resultsViewabilityConfig,
      shouldLogResultsViewability,
    ]
  );

  return {
    safeResultsCount: listProjection.safeResultsData.length,
    isResultsFinalizeLaneActive,
    rowsForRender,
    renderListItem,
    listFooterComponent,
    listEmptyComponent,
    listHeaderComponent,
    flashListRuntimeProps,
  };
};

export type { ResultsListItem } from './list-read-model-builder';
