import React from 'react';

type SearchResultsHydrationOperationIdRuntimeArgs = {
  hydrationOperationId: string | null;
  searchRequestIdentity: string | null;
};

export const useSearchResultsHydrationOperationIdRuntime = ({
  hydrationOperationId,
  searchRequestIdentity,
}: SearchResultsHydrationOperationIdRuntimeArgs) => {
  const hydrationOperationIdRef = React.useRef(hydrationOperationId);
  hydrationOperationIdRef.current = hydrationOperationId;
  const searchRequestIdentityRef = React.useRef(searchRequestIdentity);
  searchRequestIdentityRef.current = searchRequestIdentity;

  return React.useCallback(
    () =>
      hydrationOperationIdRef.current ??
      searchRequestIdentityRef.current ??
      'hydration-sync-no-request',
    []
  );
};
