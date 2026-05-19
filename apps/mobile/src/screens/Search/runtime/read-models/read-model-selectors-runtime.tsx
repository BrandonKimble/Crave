import React from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';
import {
  isSearchSurfaceRedrawVisibleAdmissionPhase,
  type SearchSurfaceRedrawPhase,
} from '../controller/search-surface-redraw-phase';
import type {
  SearchRouteResultsPolicyExactMatchWriterFacet,
  SearchRouteResultsPolicyReadModelProjectionFacet,
} from '../shared/search-route-results-policy-domain-contract';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { commitSearchMountedResultsPreparedRowsTarget } from '../shared/search-mounted-results-data-store';
import type { ResultsListItem } from './list-read-model-builder';
import type { MapQueryBudget } from '../map/map-query-budget';
import { useSearchResultsExactMatchStateRuntime } from './use-search-results-exact-match-state-runtime';
import { useSearchResultsFlashListPolicyRuntime } from './use-search-results-flash-list-policy-runtime';
import { useSearchResultsFlashListViewabilityRuntime } from './use-search-results-flash-list-viewability-runtime';
import { useSearchResultsHydrationCommitPolicyRuntime } from './use-search-results-hydration-commit-policy-runtime';
import { useSearchResultsHydrationKeyApplyRuntime } from './use-search-results-hydration-key-apply-runtime';
import { useSearchResultsHydrationKeyCommitEmissionRuntime } from './use-search-results-hydration-key-commit-emission-runtime';
import { useSearchResultsHydrationOperationIdRuntime } from './use-search-results-hydration-operation-id-runtime';
import { useSearchResultsHydrationRowsReleaseEmissionRuntime } from './use-search-results-hydration-rows-release-emission-runtime';
import { useSearchResultsHydrationRowsReleaseEventRuntime } from './use-search-results-hydration-rows-release-event-runtime';
import { useSearchResultsHydrationRowsReleaseRuntime } from './use-search-results-hydration-rows-release-runtime';
import { useSearchResultsHydrationSettleStateRuntime } from './use-search-results-hydration-settle-state-runtime';
import { useSearchResultsHydrationSyncLifecycleRuntime } from './use-search-results-hydration-sync-lifecycle-runtime';
import { useSearchResultsListFooterRuntime } from './use-search-results-list-footer-runtime';
import { useSearchResultsListHeaderTitleRuntime } from './use-search-results-list-header-title-runtime';
import { useSearchResultsListPremeasureRuntime } from './use-search-results-list-premeasure-runtime';
import { useSearchResultsListRenderItemRuntime } from './use-search-results-list-render-item-runtime';
import { useSearchResultsSectionedProjectionStateRuntime } from './use-search-results-sectioned-projection-state-runtime';
import { useSearchResultsSectionedProjectionTelemetryRuntime } from './use-search-results-sectioned-projection-telemetry-runtime';
import { useSearchResultsPageHeaderRuntime } from '../shared/use-search-results-page-header-runtime';

type UseSearchResultsReadModelSelectorsArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  results: SearchResponse | null;
  isInteractionLoadingActive: boolean;
  shouldHydrateResultsForRender: boolean;
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  rawSearchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  getRawSearchSurfaceRedrawPhase?: () => SearchSurfaceRedrawPhase;
  getAllowHydrationFinalizeCommit?: () => boolean;
  searchSurfaceRedrawCommitSpanPressureActive: boolean;
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
  searchInteractionRef: React.MutableRefObject<{
    isResultsListScrolling: boolean;
    isResultsSheetDragging?: boolean;
    isResultsSheetSettling?: boolean;
  }>;
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement | null;
  renderRestaurantCard: (
    item: RestaurantResult,
    index: number,
    preparedDescriptor?: RestaurantResultCardDescriptor | null
  ) => React.ReactElement | null;
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
  exactMatchWriter?: SearchRouteResultsPolicyExactMatchWriterFacet;
  readModelProjection?: SearchRouteResultsPolicyReadModelProjectionFacet;
  shouldRetainCommittedResultsForPolicy: boolean;
  onShowMoreExactDishes?: () => void;
  onShowMoreExactRestaurants?: () => void;
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
  safeResultsCountByTab: {
    dishes: number;
    restaurants: number;
  };
  isResultsHydrationSettled: boolean;
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
  renderListItem: NonNullable<FlashListProps<ResultsListItem>['renderItem']>;
  resultsPageHeaderComponent: React.ReactNode;
  listFooterComponent: React.ReactNode;
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
    isInteractionLoadingActive,
    shouldHydrateResultsForRender,
    searchSurfaceRedrawPhase,
    rawSearchSurfaceRedrawPhase,
    getRawSearchSurfaceRedrawPhase,
    getAllowHydrationFinalizeCommit,
    searchSurfaceRedrawCommitSpanPressureActive,
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
    exactMatchWriter,
    readModelProjection,
    shouldRetainCommittedResultsForPolicy,
    onShowMoreExactDishes,
    onShowMoreExactRestaurants,
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
  const resolveHydrationOperationId = useSearchResultsHydrationOperationIdRuntime({
    hydrationOperationId,
    searchRequestIdentity,
  });

  const exactMatchStateRuntime = useSearchResultsExactMatchStateRuntime({
    results,
    exactMatchWriter,
    onShowMoreExactDishes,
    onShowMoreExactRestaurants,
  });
  const resultsProjectionRuntime = useSearchResultsSectionedProjectionStateRuntime({
    activeTab,
    dishes,
    restaurants,
    exactMatchStateRuntime,
    results,
    shouldRetainCommittedResults: shouldRetainCommittedResultsForPolicy,
    readModelProjection,
    searchSurfaceRedrawPhase,
  });
  useSearchResultsSectionedProjectionTelemetryRuntime({
    activeTab,
    dishes,
    restaurants,
    results,
    resultsHydrationKey,
    shouldHydrateResultsForRender,
    searchSurfaceRedrawCommitSpanPressureActive,
    mapQueryBudget,
    emitRuntimeWriteSpan,
    projectionStateRuntime: resultsProjectionRuntime,
  });

  const hydrationSettleStateRuntime = useSearchResultsHydrationSettleStateRuntime({
    dishesCount: resultsProjectionRuntime.safeResultsCountByTab.dishes,
    restaurantsCount: resultsProjectionRuntime.safeResultsCountByTab.restaurants,
    resultsHydrationKey,
    hydratedResultsKey,
  });
  useSearchResultsHydrationRowsReleaseRuntime({
    resultsHydrationKey,
    activeOverlayKey,
    settleStateRuntime: hydrationSettleStateRuntime,
  });
  const hydrationCommitPolicyRuntime = useSearchResultsHydrationCommitPolicyRuntime({
    activeOverlayKey,
    getAllowHydrationFinalizeCommit,
    resultsHydrationKey,
  });
  const applyHydrationKey = useSearchResultsHydrationKeyApplyRuntime({
    setHydratedResultsKeySync,
    mapQueryBudget,
  });
  const emitHydrationKeyCommit = useSearchResultsHydrationKeyCommitEmissionRuntime({
    emitRuntimeWriteSpan,
    resolveOperationId: resolveHydrationOperationId,
    activeOverlayKey,
    searchRequestId,
  });
  const commitHydrationKey = React.useCallback(
    (nextHydrationKey: string | null) => {
      const durationMs = applyHydrationKey(nextHydrationKey);
      emitHydrationKeyCommit(nextHydrationKey, durationMs);
    },
    [applyHydrationKey, emitHydrationKeyCommit]
  );
  const canFinalizeRowsRelease = React.useCallback(() => {
    const interactionState = searchInteractionRef.current;
    const latestRawSearchSurfaceRedrawPhase =
      getRawSearchSurfaceRedrawPhase?.() ?? rawSearchSurfaceRedrawPhase;
    const latestAllowHydrationFinalizeCommit = getAllowHydrationFinalizeCommit?.() ?? true;
    const isPastVisibleAdmissionPhase = !isSearchSurfaceRedrawVisibleAdmissionPhase(
      latestRawSearchSurfaceRedrawPhase
    );
    return (
      latestAllowHydrationFinalizeCommit &&
      isPastVisibleAdmissionPhase &&
      interactionState.isResultsSheetDragging !== true &&
      interactionState.isResultsSheetSettling !== true
    );
  }, [
    getAllowHydrationFinalizeCommit,
    getRawSearchSurfaceRedrawPhase,
    rawSearchSurfaceRedrawPhase,
    searchInteractionRef,
  ]);
  const canCommitHydrationKey = React.useCallback(() => {
    const interactionState = searchInteractionRef.current;
    return (
      (getAllowHydrationFinalizeCommit?.() ?? true) &&
      interactionState.isResultsSheetDragging !== true &&
      interactionState.isResultsSheetSettling !== true
    );
  }, [getAllowHydrationFinalizeCommit, searchInteractionRef]);
  const onFinalizeRowsReleaseReady = React.useCallback(() => {
    commitSearchMountedResultsPreparedRowsTarget({
      readinessKey: resultsHydrationKey,
    });
    hydrationSettleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(
      hydrationSettleStateRuntime.hydrationRowsReleaseVersionToken
    );
  }, [hydrationSettleStateRuntime, resultsHydrationKey]);
  useSearchResultsHydrationSyncLifecycleRuntime({
    resultsHydrationKey,
    hydratedResultsKey,
    activeOverlayKey,
    shouldResetHydrationCommit: hydrationCommitPolicyRuntime.shouldResetHydrationCommit,
    phaseBMaterializerRef,
    resolveOperationId: resolveHydrationOperationId,
    commitHydrationKey,
    canCommitHydrationKey,
    canFinalizeRowsRelease,
    onFinalizeRowsReleaseReady,
  });
  const hydrationRowsReleaseEvent = useSearchResultsHydrationRowsReleaseEventRuntime({
    settleStateRuntime: hydrationSettleStateRuntime,
  });
  useSearchResultsHydrationRowsReleaseEmissionRuntime({
    activeOverlayKey,
    resultsHydrationKey,
    searchRequestId,
    mapQueryBudget,
    emitRuntimeWriteSpan,
    releaseToken: hydrationRowsReleaseEvent,
  });

  const renderListItem = useSearchResultsListRenderItemRuntime({
    renderDishCard,
    renderRestaurantCard,
    handleShowMoreExactDishes: exactMatchStateRuntime.handleShowMoreExactDishes,
    handleShowMoreExactRestaurants: exactMatchStateRuntime.handleShowMoreExactRestaurants,
  });

  const listHeaderTitle = useSearchResultsListHeaderTitleRuntime({
    submittedQuery,
  });
  const resultsPageHeaderComponent = useSearchResultsPageHeaderRuntime({
    activeTabColor,
    handleCloseResults,
    overlayHeaderActionProgress,
    shouldDisableResultsHeader,
    headerTitle: listHeaderTitle,
    handleResultsHeaderLayout,
    contentHorizontalPadding,
  });
  const listFooterComponent = useSearchResultsListFooterRuntime({
    activeSafeResultsCount: resultsProjectionRuntime.activeSafeResultsData.length,
    onDemandNotice,
    isInteractionLoadingActive,
    isLoadingMore,
    canLoadMore,
    activeTabColor,
  });
  const preMeasureOverlay = useSearchResultsListPremeasureRuntime({
    restaurants,
  });
  const flashListPolicyRuntime = useSearchResultsFlashListPolicyRuntime();
  const flashListViewabilityRuntime = useSearchResultsFlashListViewabilityRuntime({
    shouldLogResultsViewability,
    activeSafeResultsCount: resultsProjectionRuntime.activeSafeResultsData.length,
    searchInteractionRef,
  });
  const flashListRuntimeProps = React.useMemo(
    () => ({
      ...flashListPolicyRuntime,
      ...(flashListViewabilityRuntime ?? {}),
    }),
    [flashListPolicyRuntime, flashListViewabilityRuntime]
  );

  return {
    safeResultsCountByTab: resultsProjectionRuntime.safeResultsCountByTab,
    isResultsHydrationSettled: hydrationSettleStateRuntime.isResultsHydrationSettled,
    rowsByTab: resultsProjectionRuntime.rowsByTab,
    renderListItem,
    resultsPageHeaderComponent,
    listFooterComponent,
    preMeasureOverlay,
    flashListRuntimeProps,
  };
};

export type { ResultsListItem } from './list-read-model-builder';
