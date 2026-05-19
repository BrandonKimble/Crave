import React from 'react';

import { createSearchRootDataPlaneRuntimeValue } from '../controller/search-root-data-plane-runtime';
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
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootDataPlaneRuntimeArgs = {
  isSignedIn: boolean;
  rootSessionCoreLane: Pick<
    SearchRootSessionCoreLane,
    'searchRuntimeBus' | 'searchSurfaceRedrawCoordinatorRef'
  >;
  rootSessionPrimitivesLane: Pick<SearchRootSessionPrimitivesLane, 'primitives'>;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootDataPlaneRuntime = ({
  isSignedIn,
  rootSessionCoreLane,
  rootSessionPrimitivesLane,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootDataPlaneRuntimeArgs): SearchRootDataPlaneRuntime => {
  const { searchRuntimeBus, searchSurfaceRedrawCoordinatorRef } = rootSessionCoreLane;
  const { primitives } = rootSessionPrimitivesLane;
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
    searchMode: runtimeFlags.searchMode,
    getPerfNow: primitives.getPerfNow,
    searchSurfaceRedrawCoordinatorRef: searchSurfaceRedrawCoordinatorRef as Parameters<
      typeof useSearchFreezeGateRuntime
    >[0]['searchSurfaceRedrawCoordinatorRef'],
    searchSurfaceRedrawCommitSpanPressureByOperationRef:
      primitives.searchSurfaceRedrawCommitSpanPressureByOperationRef,
  });
  const historyRuntime = useSearchHistoryRuntime({ isSignedIn });
  const filterStateRuntime = useSearchFilterStateRuntime();
  const requestStatusRuntime = useSearchRequestStatusRuntime();

  return React.useMemo(
    () =>
      createSearchRootDataPlaneRuntimeValue({
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
