import React from 'react';

import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';

type SearchRootSubmitReadModel = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['readModel'];

type UseSearchRootSubmitReadModelArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootSubmitReadModel = ({
  stateFoundationLane,
}: UseSearchRootSubmitReadModelArgs): SearchRootSubmitReadModel => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;

  // F5701 — three fields, three dependencies. This memo used to assemble 14 fields over a
  // 13-entry dependency array, eleven of which existed only to keep members fresh that the
  // submit owner never destructured. `currentResults` was the worst of them: an entire
  // SearchResponse identity, so every results arrival re-minted the read model.
  return React.useMemo(
    () => ({
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
    }),
    [
      rootPrimitivesRuntime.searchState.query,
      rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    ]
  );
};
