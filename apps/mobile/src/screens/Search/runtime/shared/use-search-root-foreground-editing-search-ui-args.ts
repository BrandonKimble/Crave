import React from 'react';

import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingSearchUiArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
>;

type UseSearchRootForegroundEditingSearchUiArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootForegroundEditingSearchUiArgs = ({
  stateFoundationLane,
}: UseSearchRootForegroundEditingSearchUiArgsArgs): SearchRootForegroundEditingSearchUiArgs => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
      setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
      setQuery: rootPrimitivesRuntime.searchState.setQuery,
    }),
    [
      rootPrimitivesRuntime.searchState.setIsSearchFocused,
      rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.setQuery,
      rootPrimitivesRuntime.searchState.setShowSuggestions,
      rootPrimitivesRuntime.searchState.setSuggestions,
    ]
  );
};
