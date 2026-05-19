import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { useSearchRootResultsSheetInteractionStateRuntime } from './use-search-root-results-sheet-interaction-state-runtime';

const isVisibleResultsSheetSnap = (
  snap: OverlaySheetSnap | 'hidden'
): snap is Exclude<OverlaySheetSnap, 'hidden'> => snap !== 'hidden';

type UseSearchRootResultsSheetSnapRuntimeArgs = {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  interactionStateRuntime: ReturnType<typeof useSearchRootResultsSheetInteractionStateRuntime>;
};

export const useSearchRootResultsSheetSnapRuntime = ({
  rootOverlayFoundationRuntime,
  interactionStateRuntime,
}: UseSearchRootResultsSheetSnapRuntimeArgs) => {
  const { appRouteResultsSheetRuntimeOwner } = rootOverlayFoundationRuntime;
  const pendingResultsSheetSnapRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'> | null>(null);
  const activeResultsSheetSnapRef = React.useRef<OverlaySheetSnap>('hidden');

  const applyResultsSheetSnapChange = React.useCallback(
    (snap: Exclude<OverlaySheetSnap, 'hidden'>) => {
      activeResultsSheetSnapRef.current = snap;
      appRouteResultsSheetRuntimeOwner.handleSheetSnapChange(snap);
    },
    [appRouteResultsSheetRuntimeOwner]
  );

  const markSearchSurfaceSheetReadyForVisibleSnap = React.useCallback(() => {
    const searchSurfaceRuntime = getSearchSurfaceRuntime();
    const transactionId = searchSurfaceRuntime.getActiveOrPendingRedrawTransactionId();
    if (transactionId == null) {
      return;
    }
    searchSurfaceRuntime.markRedrawSheetReady(transactionId);
  }, []);

  const handleResultsSheetSnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      markSearchSurfaceSheetReadyForVisibleSnap();
      pendingResultsSheetSnapRef.current = null;
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange, markSearchSurfaceSheetReadyForVisibleSnap]
  );

  const handleResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      markSearchSurfaceSheetReadyForVisibleSnap();
      if (interactionStateRuntime.resultsSheetSettlingRef.current) {
        pendingResultsSheetSnapRef.current = snap;
        return;
      }
      applyResultsSheetSnapChange(snap);
    },
    [
      applyResultsSheetSnapChange,
      interactionStateRuntime.resultsSheetSettlingRef,
      markSearchSurfaceSheetReadyForVisibleSnap,
    ]
  );

  const handleResultsSheetSettlingChange = React.useCallback(
    (isSettling: boolean) => {
      interactionStateRuntime.setResultsSheetSettlingState(isSettling);
      if (isSettling) {
        return;
      }

      let settledSnap = activeResultsSheetSnapRef.current;
      if (pendingResultsSheetSnapRef.current) {
        const pending = pendingResultsSheetSnapRef.current;
        pendingResultsSheetSnapRef.current = null;
        applyResultsSheetSnapChange(pending);
        settledSnap = pending;
      }
      interactionStateRuntime.handleResultsSheetDragStateChange(false);
    },
    [applyResultsSheetSnapChange, interactionStateRuntime]
  );

  return React.useMemo(
    () => ({
      handleResultsSheetSnapStart,
      handleResultsSheetSnapChange,
      handleResultsSheetSettlingChange,
    }),
    [handleResultsSheetSettlingChange, handleResultsSheetSnapChange, handleResultsSheetSnapStart]
  );
};
