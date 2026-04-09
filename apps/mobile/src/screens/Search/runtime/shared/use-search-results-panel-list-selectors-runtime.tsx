import React from 'react';

import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelChromeRuntime } from './use-search-results-panel-chrome-runtime';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';

type UseSearchResultsPanelListSelectorsRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  | 'resultsSheetRuntime'
  | 'searchInteractionRef'
  | 'mapQueryBudget'
  | 'overlayHeaderActionProgress'
  | 'shouldLogResultsViewability'
  | 'onRuntimeMechanismEvent'
  | 'phaseBMaterializerRef'
> & {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  chromeRuntime: SearchResultsPanelChromeRuntime;
};

export type SearchResultsPanelListSelectorsRuntime = {
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export const useSearchResultsPanelListSelectorsRuntime = ({
  resultsSheetRuntime,
  searchInteractionRef,
  mapQueryBudget,
  overlayHeaderActionProgress,
  shouldLogResultsViewability,
  onRuntimeMechanismEvent,
  phaseBMaterializerRef,
  panelDataRuntime,
  chromeRuntime,
}: UseSearchResultsPanelListSelectorsRuntimeArgs): SearchResultsPanelListSelectorsRuntime => {
  const { headerDividerAnimatedStyle } = resultsSheetRuntime;
  const {
    searchSheetContentLane,
    handleCloseResults,
    activeTab,
    canLoadMore,
    isLoadingMore,
    activeOverlayKey,
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    resultsHydrationKey,
    hydratedResultsKey,
    shouldHydrateResultsForRender,
    setHydratedResultsKeySync,
    dishes,
    restaurants,
    resolvedResults,
    onDemandNotice,
    renderDishCard,
    renderRestaurantCard,
    renderPolicy,
  } = panelDataRuntime;
  const {
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlurForRender,
    submittedQueryForReadModel,
    handleResultsHeaderLayout,
  } = chromeRuntime;

  const allowsInteractionLoadingState =
    searchSheetContentLane.kind !== 'results_closing' &&
    searchSheetContentLane.kind !== 'persistent_poll';

  const resultsReadModelSelectors = useSearchResultsReadModelSelectors({
    activeTab,
    dishes,
    restaurants,
    results: resolvedResults,
    isInteractionLoadingActive:
      renderPolicy.surfaceMode === 'interaction_loading' && allowsInteractionLoadingState,
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

  return React.useMemo(
    () => ({
      resultsReadModelSelectors,
    }),
    [resultsReadModelSelectors]
  );
};
