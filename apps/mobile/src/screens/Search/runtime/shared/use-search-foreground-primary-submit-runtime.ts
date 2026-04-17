import React from 'react';

import type {
  SearchForegroundSubmitRuntimeArgs,
  SearchForegroundInteractionSubmitHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import type { SearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundPrimarySubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'submittedQuery'
  | 'searchMode'
  | 'activeTab'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'shouldShowDockedPolls'
  | 'resetFocusedMapState'
  | 'resetMapMoveFlag'
  | 'setQuery'
  | 'setRestaurantOnlyIntent'
> & {
  preparationRuntime: Pick<SearchForegroundSubmitPreparationRuntime, 'prepareSubmitChrome'>;
};

export type SearchForegroundPrimarySubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSubmit' | 'handleBestDishesHere' | 'handleBestRestaurantsHere' | 'handleSearchThisArea'
>;

export const useSearchForegroundPrimarySubmitRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  shouldShowDockedPolls,
  resetFocusedMapState,
  resetMapMoveFlag,
  setQuery,
  setRestaurantOnlyIntent,
  preparationRuntime,
}: UseSearchForegroundPrimarySubmitRuntimeArgs): SearchForegroundPrimarySubmitRuntime => {
  const { submitSearch, submitViewportShortcut, rerunActiveSearch } = submitRuntime;
  const { prepareSubmitChrome } = preparationRuntime;

  const handleSubmit = React.useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      prepareSubmitChrome({ captureOrigin: true });
    } else {
      prepareSubmitChrome();
    }
    void submitSearch({ transitionFromDockedPolls: shouldShowDockedPolls });
  }, [prepareSubmitChrome, query, shouldShowDockedPolls, submitSearch]);

  const handleBestDishesHere = React.useCallback(() => {
    prepareSubmitChrome({ captureOrigin: true });
    setQuery('Best dishes');
    void submitViewportShortcut('dishes', 'Best dishes', {
      transitionFromDockedPolls: shouldShowDockedPolls,
    });
  }, [prepareSubmitChrome, setQuery, shouldShowDockedPolls, submitViewportShortcut]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    prepareSubmitChrome({ captureOrigin: true });
    setQuery('Best restaurants');
    void submitViewportShortcut('restaurants', 'Best restaurants', {
      transitionFromDockedPolls: shouldShowDockedPolls,
    });
  }, [prepareSubmitChrome, setQuery, shouldShowDockedPolls, submitViewportShortcut]);

  const handleSearchThisArea = React.useCallback(() => {
    if (isSearchLoading || isLoadingMore || !hasResults) {
      return;
    }
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    resetMapMoveFlag();
    void rerunActiveSearch({
      searchMode,
      activeTab,
      submittedQuery,
      query,
      isSearchSessionActive,
      preserveSheetState: true,
    });
  }, [
    activeTab,
    hasResults,
    isLoadingMore,
    isSearchLoading,
    isSearchSessionActive,
    query,
    rerunActiveSearch,
    resetFocusedMapState,
    resetMapMoveFlag,
    searchMode,
    setRestaurantOnlyIntent,
    submittedQuery,
  ]);

  return {
    handleSubmit,
    handleBestDishesHere,
    handleBestRestaurantsHere,
    handleSearchThisArea,
  };
};
