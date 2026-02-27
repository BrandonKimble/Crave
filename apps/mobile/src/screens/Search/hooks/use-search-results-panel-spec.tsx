import React from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
import SquircleSpinner from '../../../components/SquircleSpinner';
import { Text } from '../../../components';
import EmptyState from '../components/empty-state';
import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../overlays/overlaySheetStyles';
import { useSearchPanelSpec } from '../../../overlays/panels/SearchPanel';
import type { OverlaySheetSnap } from '../../../overlays/types';
import type { SearchScoreMode } from '../../../store/searchStore';
import type { FoodResult, RestaurantResult } from '../../../types';
import { useSearchResultsReadModel } from './use-search-results-read-model';
import { useDebouncedLayoutMeasurement } from '../../../hooks/useDebouncedLayoutMeasurement';
import DishResultCard from '../components/dish-result-card';
import RestaurantResultCard from '../components/restaurant-result-card';
import SearchFilters, { type SearchFiltersLayoutCache } from '../components/SearchFilters';
import {
  ACTIVE_TAB_COLOR,
  CONTENT_HORIZONTAL_PADDING,
  RESULTS_BOTTOM_PADDING,
} from '../constants/search';
import {
  useSearchResultsReadModelSelectors,
  type ResultsListItem,
} from '../runtime/read-models/read-model-selectors';
import { useSearchFilterChipReadModel } from '../runtime/read-models/chip-read-model-builder';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import type { PhaseBMaterializer } from '../runtime/scheduler/phase-b-materializer';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from '../utils/marker-lod';
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
const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const HIDDEN_SCROLL_HEADER_STYLE: ViewStyle = { opacity: 0 };

type SearchResultsPanelSpecArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  activeOverlayKey: string;
  scheduleTabToggleCommit: (next: 'dishes' | 'restaurants') => void;
  toggleRankSelector: () => void;
  toggleOpenNow: () => void;
  toggleVotesFilter: () => void;
  togglePriceSelector: () => void;
  shouldDisableSearchBlur: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (next: SearchFiltersLayoutCache) => void;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  mapQueryBudget: MapQueryBudget;
  handleCloseResults: () => void;
  overlayHeaderActionProgress: SharedValue<number>;
  headerDividerAnimatedStyle: StyleProp<ViewStyle>;
  shouldLogResultsViewability: boolean;
  scoreMode: SearchScoreMode;
  getDishSaveHandler: (connectionId: string) => () => void;
  getRestaurantSaveHandler: (restaurantId: string) => () => void;
  stableOpenRestaurantProfileFromResults: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  openScoreInfo: (payload: {
    type: 'dish' | 'restaurant';
    title: string;
    score: number | null | undefined;
    votes: number | null | undefined;
    polls: number | null | undefined;
  }) => void;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
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
  resultsScrollRef: React.RefObject<FlashListRef<ResultsListItem> | null>;
};

export const useSearchResultsPanelSpec = ({
  searchRuntimeBus,
  activeOverlayKey,
  scheduleTabToggleCommit,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  shouldDisableSearchBlur,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  searchInteractionRef,
  mapQueryBudget,
  handleCloseResults,
  overlayHeaderActionProgress,
  headerDividerAnimatedStyle,
  shouldLogResultsViewability,
  scoreMode,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
  onRuntimeMechanismEvent,
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
  const resultsRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      results: state.results,
      activeTab: state.activeTab,
      pendingTabSwitchTab: state.pendingTabSwitchTab,
      canLoadMore: state.canLoadMore,
      isSearchLoading: state.isSearchLoading,
      isLoadingMore: state.isLoadingMore,
      submittedQuery: state.submittedQuery,
    }),
    (left, right) =>
      left.results === right.results &&
      left.activeTab === right.activeTab &&
      left.pendingTabSwitchTab === right.pendingTabSwitchTab &&
      left.canLoadMore === right.canLoadMore &&
      left.isSearchLoading === right.isSearchLoading &&
      left.isLoadingMore === right.isLoadingMore &&
      left.submittedQuery === right.submittedQuery,
    [
      'results',
      'activeTab',
      'pendingTabSwitchTab',
      'canLoadMore',
      'isSearchLoading',
      'isLoadingMore',
      'submittedQuery',
    ] as const
  );
  const filterRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      rankButtonLabelText: state.rankButtonLabelText,
      rankButtonIsActive: state.rankButtonIsActive,
      priceButtonLabelText: state.priceButtonLabelText,
      priceButtonIsActive: state.priceButtonIsActive,
      openNow: state.openNow,
      votesFilterActive: state.votesFilterActive,
      isRankSelectorVisible: state.isRankSelectorVisible,
      isPriceSelectorVisible: state.isPriceSelectorVisible,
    }),
    (left, right) =>
      left.rankButtonLabelText === right.rankButtonLabelText &&
      left.rankButtonIsActive === right.rankButtonIsActive &&
      left.priceButtonLabelText === right.priceButtonLabelText &&
      left.priceButtonIsActive === right.priceButtonIsActive &&
      left.openNow === right.openNow &&
      left.votesFilterActive === right.votesFilterActive &&
      left.isRankSelectorVisible === right.isRankSelectorVisible &&
      left.isPriceSelectorVisible === right.isPriceSelectorVisible,
    [
      'rankButtonLabelText',
      'rankButtonIsActive',
      'priceButtonLabelText',
      'priceButtonIsActive',
      'openNow',
      'votesFilterActive',
      'isRankSelectorVisible',
      'isPriceSelectorVisible',
    ] as const
  );
  const hydrationRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
      hydrationOperationId: state.hydrationOperationId,
      allowHydrationFinalizeCommit: state.allowHydrationFinalizeCommit,
      runtimeHydratedResultsKey: state.hydratedResultsKey,
      isRunOneChromeFreezeActive: state.isRunOneChromeFreezeActive,
      isChromeDeferred: state.isChromeDeferred,
    }),
    (left, right) =>
      left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive &&
      left.hydrationOperationId === right.hydrationOperationId &&
      left.allowHydrationFinalizeCommit === right.allowHydrationFinalizeCommit &&
      left.runtimeHydratedResultsKey === right.runtimeHydratedResultsKey &&
      left.isRunOneChromeFreezeActive === right.isRunOneChromeFreezeActive &&
      left.isChromeDeferred === right.isChromeDeferred,
    [
      'runOneCommitSpanPressureActive',
      'hydrationOperationId',
      'allowHydrationFinalizeCommit',
      'hydratedResultsKey',
      'isRunOneChromeFreezeActive',
      'isChromeDeferred',
    ] as const
  );
  const presentationTransitionRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      presentationTransitionLoadingMode: state.presentationTransitionLoadingMode,
      presentationTransitionKind: state.presentationTransitionKind,
    }),
    (left, right) =>
      left.presentationTransitionLoadingMode === right.presentationTransitionLoadingMode &&
      left.presentationTransitionKind === right.presentationTransitionKind,
    ['presentationTransitionLoadingMode', 'presentationTransitionKind'] as const
  );
  const {
    results,
    activeTab,
    pendingTabSwitchTab,
    canLoadMore,
    isSearchLoading,
    isLoadingMore,
    submittedQuery,
  } = resultsRuntimeState;
  const {
    rankButtonLabelText,
    rankButtonIsActive,
    priceButtonLabelText,
    priceButtonIsActive,
    openNow,
    votesFilterActive,
    isRankSelectorVisible,
    isPriceSelectorVisible,
  } = filterRuntimeState;
  const {
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    runtimeHydratedResultsKey,
    isRunOneChromeFreezeActive,
    isChromeDeferred,
  } = hydrationRuntimeState;
  const { presentationTransitionLoadingMode, presentationTransitionKind } =
    presentationTransitionRuntimeState;
  const isRunOneChromeDeferred =
    isRunOneChromeFreezeActive || runOneCommitSpanPressureActive || isChromeDeferred;
  const shouldShowInteractionLoadingState =
    presentationTransitionLoadingMode === 'interaction_frost';
  const shouldGateCardsForPresentationLoading = shouldShowInteractionLoadingState;

  const handleInteractionTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      scheduleTabToggleCommit(next);
    },
    [scheduleTabToggleCommit]
  );

  const shouldDisableFiltersHeader = false;
  const shouldDisableResultsHeader = false;
  const shouldUsePlaceholderRows = false;
  const cardsResults = shouldGateCardsForPresentationLoading ? null : results;
  const dishes = cardsResults?.dishes ?? EMPTY_DISHES;
  const restaurants = cardsResults?.restaurants ?? EMPTY_RESTAURANTS;
  const searchRequestId = cardsResults?.metadata?.searchRequestId ?? null;
  const filtersActiveTab = pendingTabSwitchTab ?? activeTab;

  const noopLogCompute = React.useCallback((_label: string, _duration: number) => {}, []);
  const { canonicalRestaurantRankById, restaurantsById } = useSearchResultsReadModel({
    restaurants,
    dishes,
    searchRequestId,
    shouldLogSearchComputes: false,
    getPerfNow: Date.now,
    logSearchCompute: noopLogCompute,
  });

  const primaryCoverageKey = results?.metadata?.coverageKey ?? null;
  const hasCrossCoverage = React.useMemo(() => {
    const coverageKeys = new Set<string>();
    dishes.forEach((dish) => {
      if (dish.coverageKey) {
        coverageKeys.add(dish.coverageKey);
      }
    });
    restaurants.forEach((restaurant) => {
      if (restaurant.coverageKey) {
        coverageKeys.add(restaurant.coverageKey);
      }
    });
    return coverageKeys.size > 1;
  }, [dishes, restaurants]);

  const primaryFoodTerm = React.useMemo(() => {
    const term = results?.metadata?.primaryFoodTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    return null;
  }, [results?.metadata?.primaryFoodTerm]);

  const restaurantQualityColorByIdRef = React.useRef<Map<string, string>>(new Map());
  const dishQualityColorByConnectionIdRef = React.useRef<Map<string, string>>(new Map());
  const restaurantQualityColorById = React.useMemo(() => {
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.restaurantId, getMarkerColorForRestaurant(restaurant, scoreMode));
    });
    return map;
  }, [restaurants, scoreMode]);
  const dishQualityColorByConnectionId = React.useMemo(() => {
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getMarkerColorForDish(dish, scoreMode));
    });
    return map;
  }, [dishes, scoreMode]);
  restaurantQualityColorByIdRef.current = restaurantQualityColorById;
  dishQualityColorByConnectionIdRef.current = dishQualityColorByConnectionId;

  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish = restaurantsById.get(item.restaurantId);
      const isLiked = false;
      const qualityColor =
        dishQualityColorByConnectionIdRef.current.get(item.connectionId) ??
        getMarkerColorForDish(item, scoreMode);
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={isLiked}
          scoreMode={scoreMode}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          restaurantForDish={restaurantForDish}
          onSavePress={getDishSaveHandler(item.connectionId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
        />
      );
    },
    [
      getDishSaveHandler,
      hasCrossCoverage,
      scoreMode,
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryCoverageKey,
      restaurantsById,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const isLiked = false;
      const rank = canonicalRestaurantRankById.get(restaurant.restaurantId);
      if (typeof rank !== 'number') {
        return null;
      }
      const qualityColor =
        restaurantQualityColorByIdRef.current.get(restaurant.restaurantId) ??
        getMarkerColorForRestaurant(restaurant, scoreMode);
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          rank={rank}
          qualityColor={qualityColor}
          isLiked={isLiked}
          scoreMode={scoreMode}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          onSavePress={getRestaurantSaveHandler(restaurant.restaurantId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={primaryFoodTerm}
        />
      );
    },
    [
      getRestaurantSaveHandler,
      hasCrossCoverage,
      scoreMode,
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryFoodTerm,
      primaryCoverageKey,
      canonicalRestaurantRankById,
    ]
  );

  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const hydratedResultsKeyRef = React.useRef<string | null>(hydratedResultsKey);
  hydratedResultsKeyRef.current = hydratedResultsKey;
  const setHydratedResultsKeySync = React.useCallback(
    (nextHydrationKey: string | null) => {
      hydratedResultsKeyRef.current = nextHydrationKey;
      if (typeof React.startTransition === 'function') {
        React.startTransition(() => {
          setHydratedResultsKey(nextHydrationKey);
        });
      } else {
        setHydratedResultsKey(nextHydrationKey);
      }
      searchRuntimeBus.publish({
        hydratedResultsKey: nextHydrationKey,
      });
    },
    [searchRuntimeBus]
  );
  const resultsPage = results?.metadata?.page ?? 1;
  const resultsHydrationCandidate = React.useMemo(() => {
    if (!results) {
      return null;
    }
    const requestKey = results?.metadata?.searchRequestId ?? 'no-request';
    const totalFoodResults =
      typeof results.metadata?.totalFoodResults === 'number'
        ? results.metadata.totalFoodResults
        : 'na';
    const totalRestaurantResults =
      typeof results.metadata?.totalRestaurantResults === 'number'
        ? results.metadata.totalRestaurantResults
        : 'na';
    return `${requestKey}:page:${resultsPage}:dishes:${dishes.length}:restaurants:${restaurants.length}:totalFood:${totalFoodResults}:totalRestaurants:${totalRestaurantResults}`;
  }, [
    dishes.length,
    restaurants.length,
    results,
    results?.metadata?.searchRequestId,
    results?.metadata?.totalFoodResults,
    results?.metadata?.totalRestaurantResults,
    resultsPage,
  ]);
  const resultsHydrationKey =
    results == null ? null : resultsPage === 1 ? resultsHydrationCandidate : hydratedResultsKey;
  const isHydrationPendingForRuntime =
    resultsHydrationKey != null &&
    resultsHydrationKey !== (hydratedResultsKeyRef.current ?? hydratedResultsKey);
  const shouldHydrateResultsForRender =
    isHydrationPendingForRuntime && activeOverlayKey === 'search';
  React.useEffect(() => {
    if (
      runtimeHydratedResultsKey != null &&
      runtimeHydratedResultsKey !== hydratedResultsKeyRef.current
    ) {
      hydratedResultsKeyRef.current = runtimeHydratedResultsKey;
      setHydratedResultsKey(runtimeHydratedResultsKey);
    }
  }, [runtimeHydratedResultsKey]);
  React.useEffect(() => {
    if (!results) {
      setHydratedResultsKeySync(null);
    }
  }, [results, setHydratedResultsKeySync]);
  const onDemandNotice = React.useMemo(() => {
    if (!results?.metadata?.onDemandQueued) {
      return null;
    }
    const term = submittedQuery.trim() || results?.metadata?.sourceQuery?.trim() || '';
    const etaMs = results?.metadata?.onDemandEtaMs;
    let etaText: string | null = null;
    if (etaMs && Number.isFinite(etaMs) && etaMs > 0) {
      const totalMinutes = Math.round(etaMs / 60000);
      if (totalMinutes < 60) {
        etaText = `${totalMinutes} min`;
      } else {
        const hours = Math.ceil(totalMinutes / 60);
        etaText = hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
      }
    }
    const prefix = term ? `We're expanding results for ${term}.` : `We're expanding results.`;
    const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
    return (
      <View style={styles.onDemandNotice}>
        <Text variant="body" style={styles.onDemandNoticeText}>
          {`${prefix}${suffix}`}
        </Text>
      </View>
    );
  }, [results, submittedQuery]);
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
        activeTab={filtersActiveTab}
        onTabChange={handleInteractionTabChange}
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
        initialLayoutCache={searchFiltersLayoutCacheRef.current}
        onLayoutCacheChange={handleSearchFiltersLayoutCache}
      />
    ),
    [
      filterChipReadModel.isPriceSelectorVisible,
      filterChipReadModel.isRankSelectorVisible,
      filterChipReadModel.openNow,
      filterChipReadModel.priceButtonActive,
      filterChipReadModel.priceButtonLabel,
      filterChipReadModel.rankButtonActive,
      filterChipReadModel.rankButtonLabel,
      filterChipReadModel.votesFilterActive,
      filtersActiveTab,
      handleInteractionTabChange,
      handleSearchFiltersLayoutCache,
      searchFiltersLayoutCacheRef,
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

  const getResultItemType = React.useCallback((item: ResultsListItem) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      return item.kind;
    }
    return 'foodId' in item ? 'dish' : 'restaurant';
  }, []);

  const overrideItemLayout = React.useCallback(
    (layout: { size?: number; span?: number }, item: ResultsListItem) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        layout.size = item.kind === 'section' ? 44 : 88;
        return;
      }
      layout.size = 'foodId' in item ? 240 : 270;
    },
    []
  );

  const renderPlaceholderFlashListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(({ index }) => renderPlaceholderItem(index), [renderPlaceholderItem]);
  const [resultsSheetHeaderHeight, setResultsSheetHeaderHeight] = React.useState(0);
  const [filtersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);
  const {
    layout: resultsHeaderLayout,
    onLayout: onResultsHeaderLayout,
    measureNow: measureResultsHeaderNow,
  } = useDebouncedLayoutMeasurement({
    debounceMs: 50,
    deferInitial: true,
  });
  const {
    layout: filtersHeaderLayout,
    onLayout: onFiltersHeaderLayout,
    measureNow: measureFiltersHeaderNow,
  } = useDebouncedLayoutMeasurement({
    debounceMs: 50,
    deferInitial: true,
  });
  React.useEffect(() => {
    if (!resultsHeaderLayout) {
      return;
    }
    const nextHeight = resultsHeaderLayout.height;
    setResultsSheetHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, [resultsHeaderLayout]);
  React.useEffect(() => {
    if (!filtersHeaderLayout) {
      return;
    }
    const nextHeight = filtersHeaderLayout.height;
    setFiltersHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, [filtersHeaderLayout]);
  const resultsSheetHeaderHeightRef = React.useRef(resultsSheetHeaderHeight);
  resultsSheetHeaderHeightRef.current = resultsSheetHeaderHeight;
  const filtersHeaderHeightRef = React.useRef(filtersHeaderHeight);
  filtersHeaderHeightRef.current = filtersHeaderHeight;

  const hasResolvedResults = results != null;

  const effectiveFiltersHeaderHeight = shouldDisableFiltersHeader ? 0 : filtersHeaderHeight;
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
      <View style={styles.resultsListHeader} onLayout={handleFiltersHeaderLayout}>
        {filtersHeader}
        <View style={styles.resultsListHeaderBottomStrip} />
      </View>
    );
  }, [filtersHeader, handleFiltersHeaderLayout, shouldDisableFiltersHeader]);

  const isInitialPresentationKind =
    presentationTransitionKind === 'initial_search' ||
    presentationTransitionKind === 'shortcut_rerun';
  const shouldShowInitialLoadingState =
    presentationTransitionLoadingMode === 'initial_cover' && isInitialPresentationKind;
  const shouldShowResultsLoadingStateBase =
    shouldShowInteractionLoadingState || shouldShowInitialLoadingState;
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
  const submittedQueryForReadModel = submittedQuery;
  const shouldShowResultsLoadingStateForReadModel = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.shouldShowResultsLoadingState ??
      shouldShowResultsLoadingStateBase
    : shouldShowResultsLoadingStateBase;
  const effectiveFiltersHeaderHeightBase = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveFiltersHeaderHeight ?? effectiveFiltersHeaderHeight
    : effectiveFiltersHeaderHeight;
  const effectiveResultsHeaderHeightForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveResultsHeaderHeight ?? effectiveResultsHeaderHeight
    : effectiveResultsHeaderHeight;
  const shouldUseResultsHeaderBlurForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.shouldUseResultsHeaderBlur ?? shouldUseResultsHeaderBlur
    : shouldUseResultsHeaderBlur;

  const resultsReadModelSelectors = useSearchResultsReadModelSelectors({
    // Keep selector internals on committed tab to avoid hot-path churn on rapid taps.
    activeTab,
    dishes,
    restaurants,
    results: cardsResults,
    isFilterTogglePending: shouldShowInteractionLoadingState,
    shouldHydrateResultsForRender,
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    mapQueryBudget,
    canLoadMore,
    isLoadingMore,
    onDemandNotice,
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
    activeOverlayKey,
    onRuntimeMechanismEvent,
    setHydratedResultsKeySync,
    phaseBMaterializerRef,
    contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
  });
  React.useEffect(() => {
    searchRuntimeBus.publish({
      resultsHydrationKey,
      hydratedResultsKey,
      shouldHydrateResultsForRender,
      isResultsHydrationSettled: resultsReadModelSelectors.isResultsHydrationSettled,
    });
  }, [
    hydratedResultsKey,
    resultsHydrationKey,
    resultsReadModelSelectors.isResultsHydrationSettled,
    searchRuntimeBus,
    shouldHydrateResultsForRender,
  ]);

  // --- Toggle strip gating: only render when cards are present ---
  const hasRenderableRows = resultsReadModelSelectors.rowsByTab[activeTab].length > 0;

  const shouldForceListHeaderForInteraction = shouldShowInteractionLoadingState;
  const listHeaderForRender =
    hasRenderableRows || shouldForceListHeaderForInteraction
      ? shouldFreezeResultsChrome
        ? frozenResultsChromeSnapshot?.listHeader ?? listHeader
        : listHeader
      : null;

  const effectiveFiltersHeaderHeightForRender =
    hasRenderableRows || shouldForceListHeaderForInteraction ? effectiveFiltersHeaderHeightBase : 0;

  // --- Surface content: spinner, empty state, or blank ---
  const isSurfaceShowingEmptyState =
    !shouldShowResultsLoadingStateForReadModel &&
    !hasRenderableRows &&
    hasResolvedResults &&
    !isSearchLoading;

  type ResultsSurfaceMode = 'none' | 'initial_loading' | 'interaction_loading' | 'empty';
  const surfaceMode: ResultsSurfaceMode = shouldShowInitialLoadingState
    ? 'initial_loading'
    : shouldShowInteractionLoadingState
    ? 'interaction_loading'
    : isSurfaceShowingEmptyState
    ? 'empty'
    : 'none';
  const shouldShowResultsSurface = surfaceMode !== 'none' || hasRenderableRows || shouldUsePlaceholderRows;
  const surfaceActive = surfaceMode !== 'none';
  const shouldUseInteractionSurface = surfaceMode === 'interaction_loading';
  const shouldHideScrollHeaderForSurface = surfaceMode === 'initial_loading';
  const scrollHeaderForRender = React.useMemo(() => {
    if (!listHeaderForRender) {
      return null;
    }
    if (!shouldHideScrollHeaderForSurface) {
      return listHeaderForRender;
    }
    return (
      <View pointerEvents="none" style={HIDDEN_SCROLL_HEADER_STYLE}>
        {listHeaderForRender}
      </View>
    );
  }, [listHeaderForRender, shouldHideScrollHeaderForSurface]);

  const surfaceContent = React.useMemo(() => {
    if (surfaceMode === 'none') {
      return null;
    }
    if (surfaceMode === 'empty') {
      const emptyTitle = activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.';
      const emptySubtitle =
        results?.metadata?.emptyQueryMessage ?? 'Try moving the map or adjusting your search.';
      return (
        <View style={styles.emptyState}>
          {onDemandNotice}
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
        </View>
      );
    }

    // Show spinner for both initial and interaction loading lifetimes.
    return (
      <View style={{ paddingTop: RESULTS_LOADING_SPINNER_OFFSET }}>
        <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
      </View>
    );
  }, [surfaceMode, activeTab, results?.metadata?.emptyQueryMessage, onDemandNotice]);

  const resultsRenderItem = shouldUsePlaceholderRows
    ? renderPlaceholderFlashListItem
    : resultsReadModelSelectors.renderListItem;
  const resultsWashTopOffset = Math.max(
    0,
    effectiveResultsHeaderHeightForRender + effectiveFiltersHeaderHeightForRender
  );

  const preMeasureOverlay = resultsReadModelSelectors.preMeasureOverlay;
  const resultsListBackground = React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return preMeasureOverlay;
    }
    if (surfaceMode === 'initial_loading' || shouldDisableSearchBlur) {
      return (
        <>
          <View style={[styles.resultsListBackground, { top: 0 }]} />
          {preMeasureOverlay}
        </>
      );
    }
    return (
      <>
        <FrostedGlassBackground />
        {preMeasureOverlay}
      </>
    );
  }, [preMeasureOverlay, shouldDisableSearchBlur, shouldShowResultsSurface, surfaceMode]);

  const surfaceTopOffset = effectiveResultsHeaderHeightForRender || OVERLAY_TAB_HEADER_HEIGHT;

  const resultsOverlayComponent = React.useMemo(() => {
    const shouldRenderWhiteWash = surfaceMode === 'initial_loading';
    const overlayTopOffset = shouldUseInteractionSurface ? resultsWashTopOffset : surfaceTopOffset;
    const surfaceStyle = shouldUseInteractionSurface
      ? styles.resultsSurfaceInteraction
      : styles.resultsSurface;
    return (
      <>
        {shouldRenderWhiteWash ? (
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.resultsWashOverlay,
              { top: resultsWashTopOffset },
              resultsWashAnimatedStyle,
            ]}
          />
        ) : null}
        {surfaceActive ? (
          <View style={[surfaceStyle, { top: overlayTopOffset }]}>{surfaceContent}</View>
        ) : null}
      </>
    );
  }, [
    surfaceMode,
    shouldUseInteractionSurface,
    surfaceActive,
    surfaceContent,
    surfaceTopOffset,
    resultsWashAnimatedStyle,
    resultsWashTopOffset,
  ]);

  const ResultItemSeparator = React.useCallback(
    () => <View style={styles.resultItemSeparator} />,
    []
  );
  const resultsContentContainerStyle = React.useMemo(
    () => ({
      paddingBottom:
        resultsReadModelSelectors.rowsByTab[activeTab].length > 0 ? RESULTS_BOTTOM_PADDING : 0,
    }),
    [activeTab, resultsReadModelSelectors.rowsByTab]
  );
  const resultsSheetContainerStyle = React.useMemo(
    () => [styles.resultsSheetContainer, resultsSheetVisibilityAnimatedStyle],
    [resultsSheetVisibilityAnimatedStyle]
  );
  const resultsSheetContainerAnimatedStyle = React.useMemo(
    () => [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle],
    [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle]
  );

  const primaryTab: 'restaurants' | 'dishes' = 'restaurants';
  const secondaryTab: 'restaurants' | 'dishes' = 'dishes';
  const activeList = activeTab === primaryTab ? 'primary' : 'secondary';
  return useSearchPanelSpec<ResultsListItem>({
    visible: shouldRenderResultsSheet,
    listScrollEnabled: !shouldShowInteractionLoadingState && !shouldDisableResultsSheetInteraction,
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
    data: resultsReadModelSelectors.rowsByTab[primaryTab],
    secondaryList: {
      data: resultsReadModelSelectors.rowsByTab[secondaryTab],
      listKey: 'results-dishes',
      testID: 'search-results-flatlist-secondary',
    },
    activeList,
    renderItem: resultsRenderItem,
    keyExtractor: resultsKeyExtractor,
    estimatedItemSize,
    getItemType: getResultItemType,
    overrideItemLayout,
    listKey: 'results-restaurants',
    contentContainerStyle: resultsContentContainerStyle,
    ListHeaderComponent: null,
    ListFooterComponent: resultsReadModelSelectors.listFooterComponent as React.ReactElement | null,
    ListEmptyComponent: null,
    ItemSeparatorComponent: ResultItemSeparator,
    headerComponent: resultsReadModelSelectors.listHeaderComponent,
    scrollHeaderComponent: scrollHeaderForRender as React.ReactElement | null,
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
