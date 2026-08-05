import React from 'react';

import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import { useSearchRootResultsArrivalRuntime } from './use-search-root-results-arrival-runtime';
import { useSearchRootRuntimeFlagsRuntime } from './use-search-root-runtime-flags-runtime';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type {
  SearchRootDataPlaneRuntime,
  SearchRootSessionCoreLane,
  } from './use-search-root-session-runtime-contract';

type UseSearchRootDataPlaneRuntimeArgs = {
  isSignedIn: boolean;
  rootSessionCoreLane: Pick<
    SearchRootSessionCoreLane,
    'searchRuntimeBus'
  >;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootDataPlaneRuntime = ({
  isSignedIn,
  rootSessionCoreLane,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootDataPlaneRuntimeArgs): SearchRootDataPlaneRuntime => {
  const { searchRuntimeBus } = rootSessionCoreLane;
  const resultsArrivalState = useSearchRootResultsArrivalRuntime({
    rootSessionCoreLane,
  });
  const runtimeFlags = useSearchRootRuntimeFlagsRuntime({
    rootSessionCoreLane,
    resultsArrivalState,
    foregroundPolicyPublicationAuthority,
  });
  const freezeGate = useSearchFreezeGateRuntime({
    searchRuntimeBus,
    resultsRequestKey: resultsArrivalState.resultsRequestKey,
  });
  const historyRuntime = useSearchHistoryRuntime({ isSignedIn });
  const filterStateRuntime = useSearchFilterStateRuntime(searchRuntimeBus);
  const requestStatusRuntime = useSearchRequestStatusRuntime();

  return React.useMemo<SearchRootDataPlaneRuntime>(
    () => ({
        resultsArrivalState,
        runtimeFlags,
        freezeGate,
        historyRuntime,
        filterStateRuntime,
        requestStatusRuntime,
      }),
    [
      filterStateRuntime,
      freezeGate,
      historyRuntime,
      requestStatusRuntime,
      resultsArrivalState,
      runtimeFlags,
    ]
  );
};
