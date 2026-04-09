import React from 'react';

import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelSurfaceStateRuntime } from './use-search-results-panel-surface-state-runtime';

type UseSearchResultsPanelRouteVisibilityRuntimeArgs = Pick<
  SearchResultsPanelDataRuntime,
  'searchSheetContentLane'
> &
  Pick<SearchResultsPanelSurfaceStateRuntime, 'shouldRenderResultsSheet'>;

export const useSearchResultsPanelRouteVisibilityRuntime = ({
  searchSheetContentLane,
  shouldRenderResultsSheet,
}: UseSearchResultsPanelRouteVisibilityRuntimeArgs) => {
  return React.useMemo(
    () => ({
      shouldShowSearchPanel:
        searchSheetContentLane.kind !== 'persistent_poll' && shouldRenderResultsSheet,
      shouldShowDockedPollsPanel: searchSheetContentLane.kind === 'persistent_poll',
    }),
    [searchSheetContentLane.kind, shouldRenderResultsSheet]
  );
};
