import React from 'react';

import type { SearchResultsPanelOnDemandQueryRuntime } from './search-results-panel-hydration-runtime-contract';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

type UseSearchResultsPanelOnDemandQueryRuntimeArgs = {
  resolvedResults: SearchResultsPayload;
  submittedQuery: string;
};

export const useSearchResultsPanelOnDemandQueryRuntime = ({
  resolvedResults,
  submittedQuery,
}: UseSearchResultsPanelOnDemandQueryRuntimeArgs): SearchResultsPanelOnDemandQueryRuntime => {
  const onDemandNoticeQuery = React.useMemo(() => {
    const sourceQuery = resolvedResults?.metadata?.sourceQuery;
    const normalizedSourceQuery = typeof sourceQuery === 'string' ? sourceQuery.trim() : '';
    return submittedQuery.trim() || normalizedSourceQuery;
  }, [resolvedResults?.metadata?.sourceQuery, submittedQuery]);

  return React.useMemo(
    () => ({
      onDemandNoticeQuery,
    }),
    [onDemandNoticeQuery]
  );
};
