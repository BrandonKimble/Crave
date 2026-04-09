import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import type {
  SearchRootSessionRuntime,
  UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';
import type { SearchRootSessionStateRuntime } from './use-search-root-session-state-runtime';

type UseSearchRootSessionSearchServicesRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  'isSignedIn'
> &
  SearchRootSessionStateRuntime;

export type SearchRootSessionSearchServicesRuntime = Pick<
  SearchRootSessionRuntime,
  'freezeGate' | 'historyRuntime' | 'filterStateRuntime' | 'requestStatusRuntime'
>;

export const useSearchRootSessionSearchServicesRuntime = ({
  isSignedIn,
  runtimeOwner,
  resultsArrivalState,
  runtimeFlags,
  primitives,
}: UseSearchRootSessionSearchServicesRuntimeArgs): SearchRootSessionSearchServicesRuntime => {
  const freezeGate = useSearchFreezeGateRuntime({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
    resultsRequestKey: resultsArrivalState.resultsRequestKey,
    searchMode: runtimeFlags.searchMode,
    getPerfNow: primitives.getPerfNow,
    runOneHandoffCoordinatorRef: runtimeOwner.runOneHandoffCoordinatorRef,
    runOneCommitSpanPressureByOperationRef: primitives.runOneCommitSpanPressureByOperationRef,
  });
  const historyRuntime = useSearchHistoryRuntime({ isSignedIn });
  const filterStateRuntime = useSearchFilterStateRuntime();
  const requestStatusRuntime = useSearchRequestStatusRuntime();

  return {
    freezeGate,
    historyRuntime,
    filterStateRuntime,
    requestStatusRuntime,
  };
};
