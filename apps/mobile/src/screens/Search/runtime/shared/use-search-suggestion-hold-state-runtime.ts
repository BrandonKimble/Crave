import React from 'react';

import type {
  SearchSuggestionHoldStateRuntime,
  SearchSuggestionHoldStateRuntimeArgs,
  SearchSuggestionTransitionHold,
  SearchSuggestionTransitionHoldCapture,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldStateRuntime = ({
  query,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
}: SearchSuggestionHoldStateRuntimeArgs): SearchSuggestionHoldStateRuntime => {
  const createEmptySuggestionTransitionHold = React.useCallback(
    (): SearchSuggestionTransitionHold => ({
      active: false,
      query: '',
      suggestions: [],
      recentSearches: [],
      recentlyViewedRestaurants: [],
      recentlyViewedFoods: [],
      isRecentLoading: false,
      isRecentlyViewedLoading: false,
      isRecentlyViewedFoodsLoading: false,
      holdSuggestionPanel: false,
      holdSuggestionBackground: false,
      holdAutocomplete: false,
      holdRecent: false,
    }),
    []
  );

  const submitTransitionHoldRef = React.useRef<SearchSuggestionTransitionHold>(
    createEmptySuggestionTransitionHold()
  );

  const resetSubmitTransitionHold = React.useCallback(() => {
    if (!submitTransitionHoldRef.current.active) {
      return;
    }
    submitTransitionHoldRef.current = createEmptySuggestionTransitionHold();
  }, [createEmptySuggestionTransitionHold]);

  const resetSubmitTransitionHoldIfQueryChanged = React.useCallback(
    (nextQuery: string) => {
      if (!submitTransitionHoldRef.current.active) {
        return false;
      }
      if (submitTransitionHoldRef.current.query === nextQuery) {
        return false;
      }
      submitTransitionHoldRef.current = createEmptySuggestionTransitionHold();
      return true;
    },
    [createEmptySuggestionTransitionHold]
  );

  const captureSuggestionTransitionHold = React.useCallback(
    ({ enabled, flags }: SearchSuggestionTransitionHoldCapture) => {
      if (!enabled) {
        return false;
      }
      submitTransitionHoldRef.current = {
        active: true,
        query,
        suggestions: suggestions.slice(),
        recentSearches,
        recentlyViewedRestaurants,
        recentlyViewedFoods,
        isRecentLoading,
        isRecentlyViewedLoading,
        isRecentlyViewedFoodsLoading,
        holdSuggestionPanel: flags.holdSuggestionPanel,
        holdSuggestionBackground: flags.holdSuggestionBackground,
        holdAutocomplete: flags.holdAutocomplete,
        holdRecent: flags.holdRecent,
      };
      return true;
    },
    [
      isRecentLoading,
      isRecentlyViewedFoodsLoading,
      isRecentlyViewedLoading,
      query,
      recentSearches,
      recentlyViewedFoods,
      recentlyViewedRestaurants,
      suggestions,
    ]
  );

  return {
    submitTransitionHoldRef,
    resetSubmitTransitionHold,
    resetSubmitTransitionHoldIfQueryChanged,
    captureSuggestionTransitionHold,
  };
};
