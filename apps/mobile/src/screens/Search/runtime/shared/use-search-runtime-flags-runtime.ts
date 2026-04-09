import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type UseSearchRuntimeFlagsRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
};

type UseSearchRuntimeFlagsRuntimeResult = {
  searchMode: 'natural' | 'shortcut' | null;
  isSearchSessionActive: boolean;
  runOneHandoffOperationId: string | null;
  setSearchMode: React.Dispatch<React.SetStateAction<'natural' | 'shortcut' | null>>;
  setIsSearchSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  isSearchLoading: boolean;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
  setSearchRequestLoading: (isLoadingNext: boolean) => void;
  hydrationOperationId: string | null;
};

export const useSearchRuntimeFlagsRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
}: UseSearchRuntimeFlagsRuntimeArgs): UseSearchRuntimeFlagsRuntimeResult => {
  const runtimeFlagsState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      searchMode: state.searchMode,
      isSearchSessionActive: state.isSearchSessionActive,
      runOneHandoffOperationId: state.runOneHandoffOperationId,
    }),
    (left, right) =>
      left.searchMode === right.searchMode &&
      left.isSearchSessionActive === right.isSearchSessionActive &&
      left.runOneHandoffOperationId === right.runOneHandoffOperationId,
    ['searchMode', 'isSearchSessionActive', 'runOneHandoffOperationId'] as const
  );
  const { searchMode, isSearchSessionActive, runOneHandoffOperationId } = runtimeFlagsState;

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
    },
    [isSearchSessionActive, searchRuntimeBus]
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
    },
    [searchRuntimeBus]
  );

  React.useEffect(() => {
    searchRuntimeBus.publish({
      isSearchLoading: isSearchRequestLoadingRef.current,
    });
  }, [searchRuntimeBus]);

  return React.useMemo(
    () => ({
      searchMode,
      isSearchSessionActive,
      runOneHandoffOperationId,
      setSearchMode,
      setIsSearchSessionActive,
      isSearchLoading: isSearchRequestLoadingRef.current,
      isSearchRequestLoadingRef,
      setSearchRequestLoading,
      hydrationOperationId: runOneHandoffOperationId ?? resultsRequestKey,
    }),
    [
      isSearchSessionActive,
      resultsRequestKey,
      runOneHandoffOperationId,
      searchMode,
      setIsSearchSessionActive,
      setSearchMode,
      setSearchRequestLoading,
    ]
  );
};
