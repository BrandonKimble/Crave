import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingStateArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'query'
  | 'submittedQuery'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'isSuggestionPanelActive'
  | 'isSuggestionPanelVisible'
  | 'shouldTreatSearchAsResults'
  | 'showPollsOverlay'
  | 'profilePresentationActive'
  | 'searchSessionQueryRef'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'inputRef'
>;

type UseSearchRootForegroundEditingStateArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
};

export const useSearchRootForegroundEditingStateArgs = ({
  stateFoundationLane,
  resultsPresentationOwner,
  profileOwner,
}: UseSearchRootForegroundEditingStateArgsArgs): SearchRootForegroundEditingStateArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  return React.useMemo(
    () => ({
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
      isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
      isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
      shouldTreatSearchAsResults:
        resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
        rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      showPollsOverlay: false,
      profilePresentationActive: profileOwner.profileViewState.presentation.isPresentationActive,
      searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
      allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      inputRef: rootPrimitivesRuntime.searchState.inputRef,
    }),
    [
      profileOwner.profileViewState.presentation.isPresentationActive,
      resultsPresentationOwner.shellModel.backdropTarget,
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
      rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      rootPrimitivesRuntime.searchState.inputRef,
      rootPrimitivesRuntime.searchState.isSearchEditingRef,
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.query,
      rootPrimitivesRuntime.searchState.searchSessionQueryRef,
      rootSuggestionRuntime.isSuggestionPanelVisible,
    ]
  );
};
