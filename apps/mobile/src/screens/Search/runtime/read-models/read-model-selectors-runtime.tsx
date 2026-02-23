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
import TopFoodPreMeasure from '../../components/TopFoodPreMeasure';
import styles from '../../styles';
import { TOP_FOOD_RENDER_LIMIT } from '../../constants/search';
import { computeTopFoodPreMeasureKeys } from '../../hooks/use-top-food-measurement';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { buildResultsHeaderTitle } from './header-read-model-builder';
import {
  buildSafeResultsData,
  buildSectionedResultsData,
  type ResultsListItem,
} from './list-read-model-builder';
import type { MapQueryBudget } from '../map/map-query-budget';

const EMPTY_RESULTS: ResultsListItem[] = [];
const EXACT_VISIBLE_LIMIT = 5;
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
  runOneCommitSpanPressureActive: boolean;
  allowHydrationFinalizeCommit: boolean;
  mapQueryBudget: MapQueryBudget;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onDemandNotice: React.ReactNode;
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
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement | null;
  renderRestaurantCard: (item: RestaurantResult, index: number) => React.ReactElement | null;
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
  contentHorizontalPadding: number;
};

type ListProjection = {
  safeResultsData: Array<FoodResult | RestaurantResult>;
  sectionedRows: ResultsListItem[];
};

type HeaderProjection = {
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
  isResultsHydrationSettled: boolean;
  rowsForRender: ResultsListItem[];
  renderListItem: NonNullable<FlashListProps<ResultsListItem>['renderItem']>;
  listFooterComponent: React.ReactNode;
  listHeaderComponent: React.ReactNode;
  preMeasureOverlay: React.ReactNode;
  flashListRuntimeProps: ResultsFlashListRuntimeProps;
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
    runOneCommitSpanPressureActive,
    allowHydrationFinalizeCommit,
    mapQueryBudget,
    canLoadMore,
    isLoadingMore,
    onDemandNotice,
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
  const searchRequestIdentity = results?.metadata?.searchRequestId ?? null;
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
  const isResultsHydrationSettled =
    !isHydrationPending &&
    hydrationFinalizeRowsReleaseCompletedToken === hydrationRowsReleaseVersionToken;

  React.useEffect(() => {
    setHydrationFinalizeRowsReleaseCompletedToken(null);
  }, [resultsHydrationKey]);

  React.useEffect(() => {
    if (!resultsHydrationKey) {
      setHydrationFinalizeRowsReleaseCompletedToken(null);
      return;
    }

    if (!isHydrationPending) {
      return;
    }

    if (activeOverlayKey !== 'search') {
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
    }
  }, [activeOverlayKey, isHydrationPending, resultsHydrationKey, hydrationRowsReleaseVersionToken]);

  // When hydration completes (key committed), mark rows release as done immediately.
  React.useEffect(() => {
    if (!resultsHydrationKey || isHydrationPending) {
      return;
    }
    setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
  }, [hydrationRowsReleaseVersionToken, isHydrationPending, resultsHydrationKey]);

  const preMeasureKeys = React.useMemo(() => {
    if (activeTab !== 'restaurants' || restaurants.length === 0) {
      return null;
    }
    const keys = computeTopFoodPreMeasureKeys(restaurants, TOP_FOOD_RENDER_LIMIT);
    if (keys.items.length === 0 && keys.moreCounts.length === 0) {
      return null;
    }
    return keys;
  }, [activeTab, restaurants]);

  const rowsForRender = React.useMemo(() => {
    if (isFilterTogglePending) {
      return EMPTY_RESULTS;
    }
    return listProjection.sectionedRows;
  }, [isFilterTogglePending, listProjection.sectionedRows]);

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

  const headerProjection = React.useMemo(
    (): HeaderProjection => ({
      headerTitle: buildResultsHeaderTitle(submittedQuery),
    }),
    [submittedQuery]
  );

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

  // Use a ref for hydrationOperationId to avoid cancelling in-flight hydration
  // commits when the operationId transitions (e.g. shortcut:N → request UUID
  // as the handoff coordinator settles). The operationId is a telemetry label,
  // not a functional input to the commit decision.
  const hydrationOperationIdRef = React.useRef(hydrationOperationId);
  hydrationOperationIdRef.current = hydrationOperationId;
  const searchRequestIdentityRef = React.useRef(searchRequestIdentity);
  searchRequestIdentityRef.current = searchRequestIdentity;
  React.useEffect(() => {
    const resolveOpId = () =>
      hydrationOperationIdRef.current ??
      searchRequestIdentityRef.current ??
      'hydration-sync-no-request';
    if (activeOverlayKey === 'search' && !allowHydrationFinalizeCommit) {
      // Do not finalize hydration while marker reveal lanes are active. This keeps
      // list hydration from co-committing with map reveal work in the same window.
      phaseBMaterializerRef.current.resetHydrationCommit();
      return () => {
        phaseBMaterializerRef.current.resetHydrationCommit();
      };
    }
    return phaseBMaterializerRef.current.syncHydrationCommit({
      operationId: resolveOpId(),
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
          operationId: resolveOpId(),
          activeOverlayKey,
          searchRequestId,
          resultsHydrationKey: nextHydrationKey,
          durationMs,
        });
      },
      onFinalizeRowsReleaseReady: (operationId) => {
        const releaseStartedAtMs = getNowMs();
        setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
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
    mapQueryBudget,
    phaseBMaterializerRef,
    resultsHydrationKey,
    setHydratedResultsKeySync,
  ]);

  const lastResultsViewabilityLogRef = React.useRef(0);
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
      drawDistance: 260,
      overrideProps: {
        initialDrawBatchSize: 5,
      },
      ...(shouldLogResultsViewability
        ? {
            viewabilityConfig: resultsViewabilityConfig,
            onViewableItemsChanged: handleResultsViewableItemsChanged,
          }
        : null),
    }),
    [handleResultsViewableItemsChanged, resultsViewabilityConfig, shouldLogResultsViewability]
  );

  const preMeasureOverlay = React.useMemo(() => {
    if (!preMeasureKeys) return null;
    return (
      <TopFoodPreMeasure
        items={preMeasureKeys.items}
        moreCounts={preMeasureKeys.moreCounts}
      />
    );
  }, [preMeasureKeys]);

  return {
    safeResultsCount: listProjection.safeResultsData.length,
    isResultsHydrationSettled,
    rowsForRender,
    renderListItem,
    listFooterComponent,
    listHeaderComponent,
    preMeasureOverlay,
    flashListRuntimeProps,
  };
};

export type { ResultsListItem } from './list-read-model-builder';
