import { useSearchRequestPresentationFlowRuntime } from './use-search-request-presentation-flow-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';

type UseSearchRootForegroundInputArgsRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
};

export type SearchRootForegroundInputArgsRuntime = Parameters<
  typeof useSearchRequestPresentationFlowRuntime
>[0]['foregroundInputArgs'];

export const useSearchRootForegroundInputArgsRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootScaffoldRuntime,
}: UseSearchRootForegroundInputArgsRuntimeArgs): SearchRootForegroundInputArgsRuntime => {
  const submittedQuery = rootSessionRuntime.resultsArrivalState.submittedQuery;

  return {
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery,
    resolvedSubmittedQuery: typeof submittedQuery === 'string' ? submittedQuery : '',
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    isSearchFocused: rootPrimitivesRuntime.searchState.isSearchFocused,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    dismissTransientOverlays: rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays,
    cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
  };
};
