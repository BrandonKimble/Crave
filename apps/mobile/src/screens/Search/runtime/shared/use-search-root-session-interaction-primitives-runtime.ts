import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRuntimePrimitivesRuntime } from './use-search-root-session-runtime-contract';

type UseSearchRootSessionInteractionPrimitivesRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
};

export const useSearchRootSessionInteractionPrimitivesRuntime = ({
  rootPrimitivesRuntime,
}: UseSearchRootSessionInteractionPrimitivesRuntimeArgs): SearchRuntimePrimitivesRuntime => {
  const searchInteractionRef = React.useRef({
    isInteracting: false,
    isResultsSheetDragging: false,
    isResultsListScrolling: false,
    isResultsSheetSettling: false,
  });
  const anySheetDraggingRef = React.useRef(false);
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const searchSurfaceRedrawCommitSpanPressureByOperationRef = React.useRef<Map<string, number>>(
    new Map()
  );

  const getPerfNow = React.useCallback(() => {
    if (typeof performance?.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);
  const readRuntimeMemoryDiagnostics = React.useCallback(() => null, []);
  const handleShortcutSearchCoverageSnapshot = React.useCallback<
    SearchRuntimePrimitivesRuntime['handleShortcutSearchCoverageSnapshot']
  >(
    (snapshot) => {
      rootPrimitivesRuntime.mapState.markerEngineRef.current?.handleShortcutSearchCoverageSnapshot?.(
        snapshot
      );
    },
    [rootPrimitivesRuntime.mapState.markerEngineRef]
  );
  const resetShortcutCoverageState = React.useCallback(() => {
    rootPrimitivesRuntime.mapState.markerEngineRef.current?.resetShortcutCoverageState?.();
  }, [rootPrimitivesRuntime.mapState.markerEngineRef]);

  return React.useMemo(
    () => ({
      searchInteractionRef,
      anySheetDraggingRef,
      lastSearchRequestIdRef,
      searchSurfaceRedrawCommitSpanPressureByOperationRef,
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
