import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundSearchAreaSubmitRuntimeArgs = Pick<
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
  | 'resetFocusedMapState'
  | 'resetMapMoveFlag'
  | 'setRestaurantOnlyIntent'
>;

type SearchForegroundSearchAreaSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSearchThisArea'
>;

export const useSearchForegroundSearchAreaSubmitRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  resetFocusedMapState,
  resetMapMoveFlag,
  setRestaurantOnlyIntent,
}: UseSearchForegroundSearchAreaSubmitRuntimeArgs): SearchForegroundSearchAreaSubmitRuntime => {
  const { rerunActiveSearch } = submitRuntime;

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

  return React.useMemo(
    () => ({
      handleSearchThisArea,
    }),
    [handleSearchThisArea]
  );
};
