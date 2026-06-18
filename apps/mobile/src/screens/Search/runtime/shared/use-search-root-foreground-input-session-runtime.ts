import React from 'react';

import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';

type UseSearchRootForegroundInputSessionRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootDataPlaneRuntime: Pick<SearchRootDataPlaneRuntime, 'resultsArrivalState' | 'runtimeFlags'>;
};

type SearchRootForegroundInputSessionRuntime = {
  resolvedSubmittedQuery: string;
  captureSearchSessionQuery: () => void;
  handleQueryChange: (value: string) => void;
};

export const useSearchRootForegroundInputSessionRuntime = ({
  rootPrimitivesRuntime,
  rootDataPlaneRuntime,
}: UseSearchRootForegroundInputSessionRuntimeArgs): SearchRootForegroundInputSessionRuntime => {
  const resolvedSubmittedQuery =
    typeof rootDataPlaneRuntime.resultsArrivalState.submittedQuery === 'string'
      ? rootDataPlaneRuntime.resultsArrivalState.submittedQuery
      : '';

  const captureSearchSessionQuery = React.useCallback(() => {
    if (
      !rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive ||
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive
    ) {
      return;
    }
    rootPrimitivesRuntime.searchState.searchSessionQueryRef.current =
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery ||
      rootPrimitivesRuntime.searchState.query;
  }, [
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.query,
    rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
  ]);

  const handleQueryChange = React.useCallback(
    (value: string) => {
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed(false);
      rootPrimitivesRuntime.searchState.setQuery(value);
    },
    [
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      rootPrimitivesRuntime.searchState.setQuery,
    ]
  );

  return React.useMemo(
    () => ({
      resolvedSubmittedQuery,
      captureSearchSessionQuery,
      handleQueryChange,
    }),
    [captureSearchSessionQuery, handleQueryChange, resolvedSubmittedQuery]
  );
};
