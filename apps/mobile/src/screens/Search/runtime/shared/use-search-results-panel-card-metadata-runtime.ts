import React from 'react';

import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

export const useSearchResultsPanelCardMetadataRuntime = ({
  resolvedResults,
}: {
  resolvedResults: SearchResultsPayload;
}) => {
  const searchRequestId = React.useMemo(() => {
    const candidate = resolvedResults?.metadata?.searchRequestId;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
  }, [resolvedResults?.metadata?.searchRequestId]);

  const primaryItemTerm = React.useMemo(() => {
    const term = resolvedResults?.metadata?.primaryItemTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    return null;
  }, [resolvedResults?.metadata?.primaryItemTerm]);

  return React.useMemo(
    () => ({
      primaryItemTerm,
      searchRequestId,
    }),
    [primaryItemTerm, searchRequestId]
  );
};
