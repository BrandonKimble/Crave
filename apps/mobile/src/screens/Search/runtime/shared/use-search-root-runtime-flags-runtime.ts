import React from 'react';
import { selectIsSearchSessionActive, selectSearchMode } from './search-desired-tuple-selectors';

import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type {
  SearchRootResultsArrivalState,
  SearchRootRuntimeFlagsRuntime,
  SearchRootSessionCoreLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootRuntimeFlagsRuntimeArgs = {
  rootSessionCoreLane: Pick<
    SearchRootSessionCoreLane,
    'searchRuntimeBus'
  >;
  resultsArrivalState: Pick<SearchRootResultsArrivalState, 'resultsRequestKey'>;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootRuntimeFlagsRuntime = ({
  rootSessionCoreLane,
  resultsArrivalState,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootRuntimeFlagsRuntimeArgs): SearchRootRuntimeFlagsRuntime => {
  const { searchRuntimeBus } = rootSessionCoreLane;
  const runtimeFlagsState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      searchMode: selectSearchMode(state),
      isSearchSessionActive: selectIsSearchSessionActive(state),
    }),
    (left, right) =>
      left.searchMode === right.searchMode &&
      left.isSearchSessionActive === right.isSearchSessionActive,
    ['desiredTuple'] as const,
    'root_runtime_flags'
  );
  const { searchMode, isSearchSessionActive } = runtimeFlagsState;

  const isSearchRequestLoadingRef = React.useRef(false);
  const setSearchRequestLoading = React.useCallback(
    (isLoadingNext: boolean) => {
      if (isSearchRequestLoadingRef.current === isLoadingNext) {
        return;
      }
      isSearchRequestLoadingRef.current = isLoadingNext;
      searchRuntimeBus.publish({
        isSearchLoading: isLoadingNext,
      });
      foregroundPolicyPublicationAuthority.publishCurrent('searchLoading');
    },
    [foregroundPolicyPublicationAuthority, searchRuntimeBus]
  );

  React.useEffect(() => {
    searchRuntimeBus.publish({
      isSearchLoading: isSearchRequestLoadingRef.current,
    });
  }, [searchRuntimeBus]);

  return React.useMemo<SearchRootRuntimeFlagsRuntime>(
    () => ({
        searchMode,
        isSearchSessionActive,
        isSearchLoading: isSearchRequestLoadingRef.current,
        isSearchRequestLoadingRef,
        setSearchRequestLoading,
        // F1735/F1032(b): the redraw-coordinator operationId could never be non-null, so
        // the old redraw-operation-id-or-request-key fallback always resolved
        // to the results request key — now stated directly.
        hydrationOperationId: resultsArrivalState.resultsRequestKey,
      }),
    [
      isSearchSessionActive,
      resultsArrivalState.resultsRequestKey,
      searchMode,
      setSearchRequestLoading,
    ]
  );
};
