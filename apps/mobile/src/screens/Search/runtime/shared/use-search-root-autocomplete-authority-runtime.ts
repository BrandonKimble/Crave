import React from 'react';

import type { SearchRootAutocompleteAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';

type UseSearchRootAutocompleteAuthorityRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootAutocompleteAuthorityRuntime = ({
  stateFoundationLane,
}: UseSearchRootAutocompleteAuthorityRuntimeArgs): SearchRootAutocompleteAuthorityRuntime => {
  const {
    rootPrimitivesRuntime,
    rootDataPlaneRuntime,
    rootSuggestionRuntime,
  } = stateFoundationLane;

  const autocompleteRuntime = useSearchAutocompleteRuntime({
    query: rootPrimitivesRuntime.searchState.query,
    isSuggestionScreenActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    runAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.runAutocomplete,
    cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
  });

  const autocompleteControlPort = React.useMemo(
    () => ({
      allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
      suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
    }),
    [
      autocompleteRuntime.allowAutocompleteResults,
      autocompleteRuntime.suppressAutocompleteResults,
    ]
  );

  return React.useMemo(
    () => ({
      autocompleteRuntime,
      autocompleteControlPort,
    }),
    [autocompleteControlPort, autocompleteRuntime]
  );
};
