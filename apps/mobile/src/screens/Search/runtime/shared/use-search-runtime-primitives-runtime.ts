import React from 'react';

import type { MapBounds } from '../../../../types';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type UseSearchRuntimePrimitivesRuntimeArgs = {
  markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
};

export const useSearchRuntimePrimitivesRuntime = ({
  markerEngineRef,
}: UseSearchRuntimePrimitivesRuntimeArgs) => {
  const searchInteractionRef = React.useRef<SearchInteractionState>({
    isInteracting: false,
    isResultsSheetDragging: false,
    isResultsListScrolling: false,
    isResultsSheetSettling: false,
  });
  const anySheetDraggingRef = React.useRef(false);
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const runOneCommitSpanPressureByOperationRef = React.useRef<Map<string, number>>(new Map());

  const getPerfNow = React.useCallback(() => {
    if (typeof performance?.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);

  const readRuntimeMemoryDiagnostics = React.useCallback(() => null, []);

  const handleShortcutSearchCoverageSnapshot = React.useCallback(
    (snapshot: {
      searchRequestId: string;
      bounds: MapBounds | null;
      entities: Record<string, unknown>;
    }) => {
      markerEngineRef.current?.handleShortcutSearchCoverageSnapshot?.(snapshot);
    },
    [markerEngineRef]
  );

  const resetShortcutCoverageState = React.useCallback(() => {
    markerEngineRef.current?.resetShortcutCoverageState?.();
  }, [markerEngineRef]);

  return React.useMemo(
    () => ({
      searchInteractionRef,
      anySheetDraggingRef,
      lastSearchRequestIdRef,
      runOneCommitSpanPressureByOperationRef,
      getPerfNow,
      readRuntimeMemoryDiagnostics,
      handleShortcutSearchCoverageSnapshot,
      resetShortcutCoverageState,
    }),
    [
      getPerfNow,
      handleShortcutSearchCoverageSnapshot,
      readRuntimeMemoryDiagnostics,
      resetShortcutCoverageState,
    ]
  );
};
