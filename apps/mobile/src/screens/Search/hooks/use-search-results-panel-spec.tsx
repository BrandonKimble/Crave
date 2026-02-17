import React from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../overlays/overlaySheetStyles';
import { useSearchPanelSpec } from '../../../overlays/panels/SearchPanel';
import type { OverlaySheetSnap } from '../../../overlays/types';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../../types';
import SearchFilters, { type SearchFiltersLayoutCache } from '../components/SearchFilters';
import {
  ACTIVE_TAB_COLOR,
  CONTENT_HORIZONTAL_PADDING,
  RESULTS_BOTTOM_PADDING,
  SCREEN_HEIGHT,
} from '../constants/search';
import {
  useSearchResultsReadModelSelectors,
  type ResultsListItem,
} from '../runtime/read-models/read-model-selectors';
import { useSearchFilterChipReadModel } from '../runtime/read-models/chip-read-model-builder';
import { buildResultsSurfaceVisibility } from '../runtime/read-models/header-read-model-builder';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import type { PhaseBMaterializer } from '../runtime/scheduler/phase-b-materializer';
import styles from '../styles';

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsListScrolling: boolean;
};

type RuntimeMechanismEmitter = (
  event: 'runtime_write_span',
  payload?: Record<string, unknown>
) => void;

const RESULTS_LOADING_SPINNER_OFFSET = 96;

type SearchResultsPanelSpecArgs = {
  results: SearchResponse | null;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  activeTab: 'dishes' | 'restaurants';
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
  handleTabChange: (next: 'dishes' | 'restaurants') => void;
  toggleRankSelector: () => void;
  toggleOpenNow: () => void;
  toggleVotesFilter: () => void;
  togglePriceSelector: () => void;
  shouldDisableSearchBlur: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (next: SearchFiltersLayoutCache) => void;
  didSearchSessionJustActivate: boolean;
  isInitialResultsLoadPending: boolean;
  isSearchLoading: boolean;
  isFilterTogglePending: boolean;
  shouldDisableFiltersHeader: boolean;
  shouldDisableResultsHeader: boolean;
  resultsSheetHeaderHeight: number;
  filtersHeaderHeight: number;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  resultsSheetHeaderHeightRef: React.MutableRefObject<number>;
  filtersHeaderHeightRef: React.MutableRefObject<number>;
  measureResultsHeaderNow: (event: LayoutChangeEvent) => void;
  onResultsHeaderLayout: (event: LayoutChangeEvent) => void;
  measureFiltersHeaderNow: (event: LayoutChangeEvent) => void;
  onFiltersHeaderLayout: (event: LayoutChangeEvent) => void;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
  shouldUsePlaceholderRows: boolean;
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  shouldHydrateResultsForRender: boolean;
  isVisualSyncPending: boolean;
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  isRunOneChromeDeferred: boolean;
  mapQueryBudget: MapQueryBudget;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onDemandNotice: React.ReactNode;
  snapPointsMiddle: number;
  submittedQuery: string;
  handleCloseResults: () => void;
  overlayHeaderActionProgress: SharedValue<number>;
  headerDividerAnimatedStyle: StyleProp<ViewStyle>;
  shouldLogResultsViewability: boolean;
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement;
  renderRestaurantCard: (item: RestaurantResult, index: number) => React.ReactElement | null;
  activeOverlay: string;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
  resultsWashAnimatedStyle: StyleProp<ViewStyle>;
  resultsContainerAnimatedStyle: StyleProp<ViewStyle>;
  resultsSheetVisibilityAnimatedStyle: StyleProp<ViewStyle>;
  shouldRenderResultsSheet: boolean;
  shouldDisableResultsSheetInteraction: boolean;
  snapPoints: SnapPoints;
  sheetState: OverlaySheetSnap;
  resultsSheetSnapTo: OverlaySheetSnap | null;
  handleResultsSheetSnapStart: (
    snap: OverlaySheetSnap,
    meta?: { source?: 'gesture' | 'programmatic' | 'restore' }
  ) => void;
  handleResultsListScrollBegin: () => void;
  handleResultsListScrollEnd: () => void;
  handleResultsListMomentumBegin: () => void;
  handleResultsListMomentumEnd: () => void;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
  handleResultsEndReached: FlashListProps<ResultsListItem>['onEndReached'];
  handleResultsSheetSnapChange: (snap: OverlaySheetSnap) => void;
  resetSheetToHidden: () => void;
  resultsScrollRef: React.RefObject<FlashListRef<ResultsListItem>>;
};

export const useSearchResultsPanelSpec = ({
  results,
  resultsHydrationKey,
  hydratedResultsKey,
  activeTab,
  rankButtonLabelText,
  rankButtonIsActive,
  priceButtonLabelText,
  priceButtonIsActive,
  openNow,
  votesFilterActive,
  isRankSelectorVisible,
  isPriceSelectorVisible,
  handleTabChange,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  shouldDisableSearchBlur,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  didSearchSessionJustActivate,
  isInitialResultsLoadPending,
  isSearchLoading,
  isFilterTogglePending,
  shouldDisableFiltersHeader,
  shouldDisableResultsHeader,
  resultsSheetHeaderHeight,
  filtersHeaderHeight,
  searchInteractionRef,
  resultsSheetHeaderHeightRef,
  filtersHeaderHeightRef,
  measureResultsHeaderNow,
  onResultsHeaderLayout,
  measureFiltersHeaderNow,
  onFiltersHeaderLayout,
  shouldRetrySearchOnReconnect,
  hasSystemStatusBanner,
  shouldUsePlaceholderRows,
  dishes,
  restaurants,
  shouldHydrateResultsForRender,
  isVisualSyncPending,
  runOneCommitSpanPressureActive,
  hydrationOperationId,
  allowHydrationFinalizeCommit,
  isRunOneChromeDeferred,
  mapQueryBudget,
  canLoadMore,
  isLoadingMore,
  onDemandNotice,
  snapPointsMiddle,
  submittedQuery,
  handleCloseResults,
  overlayHeaderActionProgress,
  headerDividerAnimatedStyle,
  shouldLogResultsViewability,
  renderDishCard,
  renderRestaurantCard,
  activeOverlay,
  onRuntimeMechanismEvent,
  setHydratedResultsKeySync,
  phaseBMaterializerRef,
  resultsWashAnimatedStyle,
  resultsContainerAnimatedStyle,
  resultsSheetVisibilityAnimatedStyle,
  shouldRenderResultsSheet,
  shouldDisableResultsSheetInteraction,
  snapPoints,
  sheetState,
  resultsSheetSnapTo,
  handleResultsSheetSnapStart,
  handleResultsListScrollBegin,
  handleResultsListScrollEnd,
  handleResultsListMomentumBegin,
  handleResultsListMomentumEnd,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  handleResultsEndReached,
  handleResultsSheetSnapChange,
  resetSheetToHidden,
  resultsScrollRef,
}: SearchResultsPanelSpecArgs) => {
  const searchResultsRequestVersionKey = `${results?.metadata?.searchRequestId ?? 'no-request'}::${
    resultsHydrationKey ?? 'no-hydration'
  }`;

  const filterChipReadModel = useSearchFilterChipReadModel({
    requestVersionKey: searchResultsRequestVersionKey,
    activeTab,
    rankButtonLabel: rankButtonLabelText,
    rankButtonActive: rankButtonIsActive,
    priceButtonLabel: priceButtonLabelText,
    priceButtonActive: priceButtonIsActive,
    openNow,
    votesFilterActive,
    isRankSelectorVisible,
    isPriceSelectorVisible,
  });

  const filtersHeader = React.useMemo(
    () => (
      <SearchFilters
        activeTab={filterChipReadModel.activeTab}
        onTabChange={handleTabChange}
        rankButtonLabel={filterChipReadModel.rankButtonLabel}
        rankButtonActive={filterChipReadModel.rankButtonActive}
        onToggleRankSelector={toggleRankSelector}
        isRankSelectorVisible={filterChipReadModel.isRankSelectorVisible}
        openNow={filterChipReadModel.openNow}
        onToggleOpenNow={toggleOpenNow}
        votesFilterActive={filterChipReadModel.votesFilterActive}
        onToggleVotesFilter={toggleVotesFilter}
        priceButtonLabel={filterChipReadModel.priceButtonLabel}
        priceButtonActive={filterChipReadModel.priceButtonActive}
        onTogglePriceSelector={togglePriceSelector}
        isPriceSelectorVisible={filterChipReadModel.isPriceSelectorVisible}
        contentHorizontalPadding={CONTENT_HORIZONTAL_PADDING}
        accentColor={ACTIVE_TAB_COLOR}
        disableBlur={shouldDisableSearchBlur}
        initialLayoutCache={searchFiltersLayoutCacheRef.current}
        onLayoutCacheChange={handleSearchFiltersLayoutCache}
      />
    ),
    [
      filterChipReadModel.activeTab,
      filterChipReadModel.isPriceSelectorVisible,
      filterChipReadModel.isRankSelectorVisible,
      filterChipReadModel.openNow,
      filterChipReadModel.priceButtonActive,
      filterChipReadModel.priceButtonLabel,
      filterChipReadModel.rankButtonActive,
      filterChipReadModel.rankButtonLabel,
      filterChipReadModel.votesFilterActive,
      handleSearchFiltersLayoutCache,
      handleTabChange,
      searchFiltersLayoutCacheRef,
      shouldDisableSearchBlur,
      toggleOpenNow,
      togglePriceSelector,
      toggleRankSelector,
      toggleVotesFilter,
    ]
  );

  const resultsKeyExtractor = React.useCallback((item: ResultsListItem, index: number) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      return item.key || `row-${index}`;
    }
    if (item && 'foodId' in item) {
      if (item.connectionId) {
        return item.connectionId;
      }
      if (item.foodId && item.restaurantId) {
        return `${item.foodId}-${item.restaurantId}`;
      }
      return `dish-${index}`;
    }
    if (item && 'restaurantId' in item) {
      return item.restaurantId || `restaurant-${index}`;
    }
    return `result-${index}`;
  }, []);

  const isDishesTab = activeTab === 'dishes';
  const estimatedDishItemSize = 240;
  const estimatedRestaurantItemSize = 270;
  const estimatedItemSize = isDishesTab ? estimatedDishItemSize : estimatedRestaurantItemSize;

  const placeholderItemStyle = React.useMemo(
    () => ({ minHeight: estimatedItemSize }),
    [estimatedItemSize]
  );

  const renderPlaceholderItem = React.useCallback(
    (index: number) => (
      <View
        style={[styles.resultItem, index === 0 && styles.firstResultItem, placeholderItemStyle]}
      />
    ),
    [placeholderItemStyle]
  );

  const getResultItemType = React.useCallback<FlashListProps<ResultsListItem>['getItemType']>(
    (item) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        return item.kind;
      }
      return 'foodId' in item ? 'dish' : 'restaurant';
    },
    []
  );

  const renderPlaceholderFlashListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(({ index }) => renderPlaceholderItem(index), [renderPlaceholderItem]);

  const hasResolvedResults = results != null;
  const shouldShowInitialResultsLoadingPhase =
    (didSearchSessionJustActivate || isInitialResultsLoadPending) &&
    isSearchLoading &&
    !isFilterTogglePending &&
    !hasResolvedResults;
  const shouldHideFiltersHeaderDuringInitialLoad =
    !shouldDisableFiltersHeader && shouldShowInitialResultsLoadingPhase;

  const effectiveFiltersHeaderHeight =
    shouldDisableFiltersHeader || shouldHideFiltersHeaderDuringInitialLoad
      ? 0
      : filtersHeaderHeight;
  const effectiveResultsHeaderHeight = shouldDisableResultsHeader ? 0 : resultsSheetHeaderHeight;

  const handleResultsHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableResultsHeader) {
        return;
      }
      const isInteracting = searchInteractionRef.current.isInteracting;
      if (isInteracting) {
        if (resultsSheetHeaderHeightRef.current === 0) {
          measureResultsHeaderNow(event);
        }
        return;
      }
      onResultsHeaderLayout(event);
    },
    [
      measureResultsHeaderNow,
      onResultsHeaderLayout,
      resultsSheetHeaderHeightRef,
      searchInteractionRef,
      shouldDisableResultsHeader,
    ]
  );

  const handleFiltersHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableFiltersHeader) {
        return;
      }
      if (searchInteractionRef.current.isInteracting) {
        if (filtersHeaderHeightRef.current === 0) {
          measureFiltersHeaderNow(event);
        }
        return;
      }
      onFiltersHeaderLayout(event);
    },
    [
      filtersHeaderHeightRef,
      measureFiltersHeaderNow,
      onFiltersHeaderLayout,
      searchInteractionRef,
      shouldDisableFiltersHeader,
    ]
  );

  const shouldUseResultsHeaderBlur = !shouldDisableSearchBlur;
  const listHeader = React.useMemo(() => {
    if (shouldDisableFiltersHeader) {
      return null;
    }
    return (
      <View
        style={[
          styles.resultsListHeader,
          shouldHideFiltersHeaderDuringInitialLoad ? styles.resultsListHeaderHidden : null,
        ]}
        onLayout={handleFiltersHeaderLayout}
      >
        {filtersHeader}
        <View style={styles.resultsListHeaderBottomStrip} />
      </View>
    );
  }, [
    filtersHeader,
    handleFiltersHeaderLayout,
    shouldDisableFiltersHeader,
    shouldHideFiltersHeaderDuringInitialLoad,
  ]);

  const shouldShowResultsLoadingStateBase =
    (isSearchLoading ||
      hasSystemStatusBanner ||
      shouldRetrySearchOnReconnect ||
      isFilterTogglePending) &&
    !hasResolvedResults;
  const shouldFreezeResultsChrome = isRunOneChromeDeferred && !hasResolvedResults;
  const frozenResultsChromeSnapshotRef = React.useRef<{
    listHeader: React.ReactNode;
    submittedQuery: string;
    shouldShowResultsLoadingState: boolean;
    effectiveFiltersHeaderHeight: number;
    effectiveResultsHeaderHeight: number;
    shouldUseResultsHeaderBlur: boolean;
  } | null>(null);

  if (!shouldFreezeResultsChrome || !frozenResultsChromeSnapshotRef.current) {
    frozenResultsChromeSnapshotRef.current = {
      listHeader,
      submittedQuery,
      shouldShowResultsLoadingState: shouldShowResultsLoadingStateBase,
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
      shouldUseResultsHeaderBlur,
    };
  }

  const frozenResultsChromeSnapshot = frozenResultsChromeSnapshotRef.current;
  const listHeaderForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.listHeader ?? listHeader
    : listHeader;
  const submittedQueryForReadModel = submittedQuery;
  const shouldShowResultsLoadingStateForReadModel = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.shouldShowResultsLoadingState ?? shouldShowResultsLoadingStateBase
    : shouldShowResultsLoadingStateBase;
  const effectiveFiltersHeaderHeightForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveFiltersHeaderHeight ?? effectiveFiltersHeaderHeight
    : effectiveFiltersHeaderHeight;
  const effectiveResultsHeaderHeightForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveResultsHeaderHeight ?? effectiveResultsHeaderHeight
    : effectiveResultsHeaderHeight;
  const shouldUseResultsHeaderBlurForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.shouldUseResultsHeaderBlur ?? shouldUseResultsHeaderBlur
    : shouldUseResultsHeaderBlur;

  const resultsReadModelSelectors = useSearchResultsReadModelSelectors({
    activeTab,
    dishes,
    restaurants,
    results,
    isFilterTogglePending,
    shouldHydrateResultsForRender,
    isVisualSyncPending,
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    mapQueryBudget,
    canLoadMore,
    isLoadingMore,
    shouldShowResultsLoadingState: shouldShowResultsLoadingStateForReadModel,
    onDemandNotice,
    screenHeight: SCREEN_HEIGHT,
    middleSnapPoint: snapPointsMiddle,
    effectiveResultsHeaderHeight: effectiveResultsHeaderHeightForRender,
    effectiveFiltersHeaderHeight: effectiveFiltersHeaderHeightForRender,
    activeTabColor: ACTIVE_TAB_COLOR,
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlur: shouldUseResultsHeaderBlurForRender,
    submittedQuery: submittedQueryForReadModel,
    handleCloseResults,
    handleResultsHeaderLayout,
    overlayHeaderActionProgress,
    headerDividerAnimatedStyle,
    shouldLogResultsViewability,
    searchInteractionRef,
    renderDishCard,
    renderRestaurantCard,
    resultsHydrationKey,
    hydratedResultsKey,
    activeOverlayKey: activeOverlay,
    onRuntimeMechanismEvent,
    setHydratedResultsKeySync,
    phaseBMaterializerRef,
    resultsLoadingSpinnerOffset: RESULTS_LOADING_SPINNER_OFFSET,
    contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
  });

  const resultsSurfaceVisibility = buildResultsSurfaceVisibility({
    isSearchLoading,
    hasSystemStatusBanner,
    shouldRetrySearchOnReconnect,
    isFilterTogglePending,
    hasResults: hasResolvedResults,
    safeResultsCount: resultsReadModelSelectors.safeResultsCount,
  });
  const shouldShowResultsLoadingState = resultsSurfaceVisibility.shouldShowResultsLoadingState;
  const shouldShowResultsSurface =
    resultsSurfaceVisibility.shouldShowResultsSurface || shouldUsePlaceholderRows;

  const resultsRenderItem = shouldUsePlaceholderRows
    ? renderPlaceholderFlashListItem
    : resultsReadModelSelectors.renderListItem;
  const resultsListKey = 'results';
  const resultsWashTopOffset = Math.max(
    0,
    effectiveResultsHeaderHeightForRender + effectiveFiltersHeaderHeightForRender
  );
  const initialResultsLoadingFillTopOffset = Math.max(
    resultsWashTopOffset,
    shouldDisableResultsHeader ? 0 : OVERLAY_TAB_HEADER_HEIGHT + effectiveFiltersHeaderHeightForRender
  );
  const shouldRenderInitialResultsLoadingFill =
    shouldShowInitialResultsLoadingPhase && shouldShowResultsLoadingState;

  const resultsListBackground = React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return null;
    }
    if (shouldDisableSearchBlur) {
      return <View style={[styles.resultsListBackground, { top: 0 }]} />;
    }
    return (
      <>
        <FrostedGlassBackground />
        {shouldRenderInitialResultsLoadingFill ? (
          <View
            style={[
              styles.resultsListBackground,
              styles.resultsListBackgroundLoading,
              { top: initialResultsLoadingFillTopOffset },
            ]}
          />
        ) : null}
      </>
    );
  }, [
    initialResultsLoadingFillTopOffset,
    shouldDisableSearchBlur,
    shouldRenderInitialResultsLoadingFill,
    shouldShowResultsSurface,
  ]);

  const resultsOverlayComponent = React.useMemo(
    () => (
      <Reanimated.View
        pointerEvents="none"
        style={[styles.resultsWashOverlay, { top: resultsWashTopOffset }, resultsWashAnimatedStyle]}
      />
    ),
    [resultsWashAnimatedStyle, resultsWashTopOffset]
  );

  const ResultItemSeparator = React.useCallback(
    () => <View style={styles.resultItemSeparator} />,
    []
  );
  const resultsContentContainerStyle = React.useMemo(
    () => ({
      paddingBottom: resultsReadModelSelectors.rowsForRender.length > 0 ? RESULTS_BOTTOM_PADDING : 0,
    }),
    [resultsReadModelSelectors.rowsForRender.length]
  );
  const resultsSheetContainerStyle = React.useMemo(
    () => [styles.resultsSheetContainer, resultsSheetVisibilityAnimatedStyle],
    [resultsSheetVisibilityAnimatedStyle]
  );
  const resultsSheetContainerAnimatedStyle = React.useMemo(
    () => [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle],
    [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle]
  );

  return useSearchPanelSpec<ResultsListItem>({
    visible: shouldRenderResultsSheet,
    listScrollEnabled: !isFilterTogglePending && !shouldDisableResultsSheetInteraction,
    snapPoints,
    initialSnapPoint: sheetState === 'hidden' ? 'middle' : sheetState,
    snapTo: resultsSheetSnapTo,
    onSnapStart: handleResultsSheetSnapStart,
    onScrollBeginDrag: handleResultsListScrollBegin,
    onScrollEndDrag: handleResultsListScrollEnd,
    onMomentumBeginJS: handleResultsListMomentumBegin,
    onMomentumEndJS: handleResultsListMomentumEnd,
    onDragStateChange: handleResultsSheetDragStateChange,
    onSettleStateChange: handleResultsSheetSettlingChange,
    interactionEnabled: !shouldDisableResultsSheetInteraction,
    onEndReached: handleResultsEndReached,
    scrollIndicatorInsets: {
      top: effectiveResultsHeaderHeightForRender,
      bottom: RESULTS_BOTTOM_PADDING,
    },
    data: resultsReadModelSelectors.rowsForRender,
    renderItem: resultsRenderItem,
    keyExtractor: resultsKeyExtractor,
    estimatedItemSize,
    getItemType: getResultItemType,
    listKey: resultsListKey,
    contentContainerStyle: resultsContentContainerStyle,
    ListHeaderComponent: listHeaderForRender,
    ListFooterComponent: resultsReadModelSelectors.listFooterComponent,
    ListEmptyComponent: resultsReadModelSelectors.listEmptyComponent,
    ItemSeparatorComponent: ResultItemSeparator,
    headerComponent: resultsReadModelSelectors.listHeaderComponent,
    backgroundComponent: resultsListBackground,
    overlayComponent: resultsOverlayComponent,
    listRef: resultsScrollRef,
    resultsContainerAnimatedStyle: resultsSheetContainerAnimatedStyle,
    flashListProps: resultsReadModelSelectors.flashListRuntimeProps,
    onHidden: resetSheetToHidden,
    onSnapChange: handleResultsSheetSnapChange,
    style: resultsSheetContainerStyle,
  });
};
