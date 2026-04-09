import { useSearchRequestPresentationFlowRuntime } from './use-search-request-presentation-flow-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

type UseSearchRootAutocompleteArgsRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
};

export type SearchRootAutocompleteArgsRuntime = Parameters<
  typeof useSearchRequestPresentationFlowRuntime
>[0]['autocompleteArgs'];

export const useSearchRootAutocompleteArgsRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
}: UseSearchRootAutocompleteArgsRuntimeArgs): SearchRootAutocompleteArgsRuntime => ({
  query: rootPrimitivesRuntime.searchState.query,
  isSuggestionScreenActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
  isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
  isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
  runAutocomplete: rootSessionRuntime.requestStatusRuntime.runAutocomplete,
  cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
  setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
  setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
});
