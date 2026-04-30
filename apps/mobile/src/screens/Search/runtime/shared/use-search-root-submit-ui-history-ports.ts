import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootRecentActivityAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type SearchRootSubmitUiHistoryPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'loadRecentHistory' | 'updateLocalRecentSearches'
>;

type UseSearchRootSubmitUiHistoryPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
};

export const useSearchRootSubmitUiHistoryPorts = ({
  stateFoundationLane,
  recentActivityAuthorityRuntime,
}: UseSearchRootSubmitUiHistoryPortsArgs): SearchRootSubmitUiHistoryPorts => {
  const { rootDataPlaneRuntime } = stateFoundationLane;
  const { recentActivityRuntime } = recentActivityAuthorityRuntime;

  return React.useMemo(
    () => ({
      loadRecentHistory: rootDataPlaneRuntime.historyRuntime.loadRecentHistory,
      updateLocalRecentSearches:
        recentActivityRuntime.deferRecentSearchUpsert as unknown as SearchRootSubmitUiHistoryPorts['updateLocalRecentSearches'],
    }),
    [
      recentActivityRuntime.deferRecentSearchUpsert,
      rootDataPlaneRuntime.historyRuntime.loadRecentHistory,
    ]
  );
};
