import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import {
  useSearchClearOwner,
  type SearchClearOwner,
  type UseSearchClearOwnerArgs,
} from '../../hooks/use-search-clear-owner';
import {
  useSearchRequestRuntimeOwner,
  type SearchRequestRuntimeOwner,
} from '../../hooks/use-search-request-runtime-owner';
import {
  useResultsPresentationOwner,
  type ResultsPresentationOwner,
  type UseResultsPresentationOwnerArgs,
} from './use-results-presentation-runtime-owner';

type UseSearchRequestPresentationRuntimeArgs = {
  requestRuntimeArgs: Parameters<typeof useSearchRequestRuntimeOwner>[0];
  clearOwnerArgs: UseSearchClearOwnerArgs<AutocompleteMatch>;
  resultsPresentationArgs: Omit<
    UseResultsPresentationOwnerArgs<AutocompleteMatch>,
    'clearTypedQuery' | 'clearSearchState' | 'cancelActiveSearchRequest'
  >;
};

export type SearchRequestPresentationRuntime = {
  searchRequestRuntimeOwner: SearchRequestRuntimeOwner;
  clearOwner: SearchClearOwner;
  resultsPresentationOwner: ResultsPresentationOwner;
};

export const useSearchRequestPresentationRuntime = ({
  requestRuntimeArgs,
  clearOwnerArgs,
  resultsPresentationArgs,
}: UseSearchRequestPresentationRuntimeArgs): SearchRequestPresentationRuntime => {
  const searchRequestRuntimeOwner = useSearchRequestRuntimeOwner(requestRuntimeArgs);
  const clearOwner = useSearchClearOwner({
    ...clearOwnerArgs,
    cancelActiveSearchRequest: searchRequestRuntimeOwner.cancelActiveSearchRequest,
  });
  const resultsPresentationOwner = useResultsPresentationOwner({
    ...resultsPresentationArgs,
    clearTypedQuery: clearOwner.clearTypedQuery,
    clearSearchState: clearOwner.clearSearchState,
    cancelActiveSearchRequest: searchRequestRuntimeOwner.cancelActiveSearchRequest,
  });

  return React.useMemo(
    () => ({
      searchRequestRuntimeOwner,
      clearOwner,
      resultsPresentationOwner,
    }),
    [clearOwner, resultsPresentationOwner, searchRequestRuntimeOwner]
  );
};
