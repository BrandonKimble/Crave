import React from 'react';

import { createSearchRootRuntimeFlagsValue } from '../controller/search-root-data-plane-runtime';
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
    'searchRuntimeBus' | 'searchSurfaceRedrawCoordinatorRef'
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
      searchMode: state.searchMode,
      isSearchSessionActive: state.isSearchSessionActive,
    }),
    (left, right) =>
      left.searchMode === right.searchMode &&
      left.isSearchSessionActive === right.isSearchSessionActive,
    ['searchMode', 'isSearchSessionActive'] as const,
    'root_runtime_flags'
  );
  const { searchMode, isSearchSessionActive } = runtimeFlagsState;
  const searchSurfaceRedrawOperationId = searchRuntimeBus.getState().searchSurfaceRedrawOperationId;

  const setSearchMode = React.useCallback<
    React.Dispatch<React.SetStateAction<'natural' | 'shortcut' | null>>
  >(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === 'function'
          ? (
              nextValue as (
                previous: 'natural' | 'shortcut' | null
              ) => 'natural' | 'shortcut' | null
            )(searchMode)
          : nextValue;
      if (resolvedValue === searchMode) {
        return;
      }
      searchRuntimeBus.publish({
        searchMode: resolvedValue,
      });
    },
    [searchMode, searchRuntimeBus]
  );

  const setIsSearchSessionActive = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === 'function'
          ? (nextValue as (previous: boolean) => boolean)(isSearchSessionActive)
          : nextValue;
      if (resolvedValue === isSearchSessionActive) {
        return;
      }
      searchRuntimeBus.publish({
        isSearchSessionActive: resolvedValue,
      });
      foregroundPolicyPublicationAuthority.publishCurrent('searchSessionActive');
    },
    [foregroundPolicyPublicationAuthority, isSearchSessionActive, searchRuntimeBus]
  );

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

  return React.useMemo(
    () =>
      createSearchRootRuntimeFlagsValue({
        searchMode,
        isSearchSessionActive,
        searchSurfaceRedrawOperationId,
        setSearchMode,
        setIsSearchSessionActive,
        isSearchLoading: isSearchRequestLoadingRef.current,
        isSearchRequestLoadingRef,
        setSearchRequestLoading,
        hydrationOperationId:
          searchSurfaceRedrawOperationId ?? resultsArrivalState.resultsRequestKey,
      }),
    [
      isSearchSessionActive,
      resultsArrivalState.resultsRequestKey,
      searchSurfaceRedrawOperationId,
      searchMode,
      setIsSearchSessionActive,
      setSearchMode,
      setSearchRequestLoading,
    ]
  );
};
