import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRuntimePrimitivesRuntime } from './use-search-root-session-runtime-contract';
import type { RuntimeMemoryDiagnostics } from './use-search-root-session-runtime-contract';

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
  // F1334 — A DIAGNOSTICS READER THAT REPORTS NOTHING, AND SAYS SO.
  //
  // This returns `null` and always has. What made it dishonest was the CONTRACT, which did not
  // merely permit null — it declared the return type as `() => null`, i.e. it promised the
  // absence. Two real consumers then spread the result: the stall instrument attaches it to
  // every `[SearchPerf] JS stall` line, and the instrumentation runtime merges it into
  // `readRuntimeDiagnostics`. Both were silently reporting "no memory diagnostics available"
  // as if that were a measurement.
  //
  // React Native gives us no JS-heap reader on either platform (no `performance.memory`, no
  // `global.gc` hooks) — so "nothing to report" is the TRUTH here, not a stub awaiting a body.
  // The honest shape is to say that at the type level: the contract now returns
  // `RuntimeMemoryDiagnostics | null`, so a consumer must handle absence and a future real
  // reader can be dropped in without touching a single call site. NOT deleted, because the two
  // consumers' shapes are the seam a real reader would arrive through.
  const readRuntimeMemoryDiagnostics = React.useCallback(
    (): RuntimeMemoryDiagnostics | null => null,
    []
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
      resetShortcutCoverageState,
    }),
    [getPerfNow, readRuntimeMemoryDiagnostics, resetShortcutCoverageState]
  );
};
