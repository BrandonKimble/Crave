import React from 'react';

import type { SearchRootAutocompleteAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingAutocompleteArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'allowAutocompleteResults'
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'setIsAutocompleteSuppressed'
>;

type UseSearchRootForegroundEditingAutocompleteArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
};

export const useSearchRootForegroundEditingAutocompleteArgs = ({
  stateFoundationLane,
  autocompleteAuthorityRuntime,
}: UseSearchRootForegroundEditingAutocompleteArgsArgs): SearchRootForegroundEditingAutocompleteArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;
  const { autocompleteRuntime } = autocompleteAuthorityRuntime;

  return React.useMemo(
    () => ({
      allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
      suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
      cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      setIsAutocompleteSuppressed:
        rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    }),
    [
      autocompleteRuntime.allowAutocompleteResults,
      autocompleteRuntime.suppressAutocompleteResults,
      rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    ]
  );
};
