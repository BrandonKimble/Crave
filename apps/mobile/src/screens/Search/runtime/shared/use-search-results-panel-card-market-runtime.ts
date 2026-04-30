import React from 'react';

import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

export const useSearchResultsPanelCardMarketRuntime = ({
  resolvedResults,
}: {
  resolvedResults: SearchResultsPayload;
}) => {
  const searchRequestId = React.useMemo(() => {
    const candidate = resolvedResults?.metadata?.searchRequestId;
    return typeof candidate === 'string' && candidate.trim().length > 0
      ? candidate
      : null;
  }, [resolvedResults?.metadata?.searchRequestId]);

  const primaryMarketKey = React.useMemo(() => {
    const candidate = resolvedResults?.metadata?.marketKey;
    return typeof candidate === 'string' && candidate.trim().length > 0
      ? candidate
      : null;
  }, [resolvedResults?.metadata?.marketKey]);

  const primaryFoodTerm = React.useMemo(() => {
    const term = resolvedResults?.metadata?.primaryFoodTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    return null;
  }, [resolvedResults?.metadata?.primaryFoodTerm]);

  return React.useMemo(
    () => ({
      primaryFoodTerm,
      primaryMarketKey,
      searchRequestId,
    }),
    [primaryFoodTerm, primaryMarketKey, searchRequestId]
  );
};
