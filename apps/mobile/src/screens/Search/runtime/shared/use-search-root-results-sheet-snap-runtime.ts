import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { useSearchRootResultsSheetInteractionStateRuntime } from './use-search-root-results-sheet-interaction-state-runtime';

const isVisibleResultsSheetSnap = (
  snap: OverlaySheetSnap | 'hidden'
): snap is Exclude<OverlaySheetSnap, 'hidden'> => snap !== 'hidden';

type UseSearchRootResultsSheetSnapRuntimeArgs = {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  closeTransitionActions: ResultsCloseTransitionActions;
  interactionStateRuntime: ReturnType<
    typeof useSearchRootResultsSheetInteractionStateRuntime
  >;
};

export const useSearchRootResultsSheetSnapRuntime = ({
  rootOverlayFoundationRuntime,
  closeTransitionActions,
  interactionStateRuntime,
}: UseSearchRootResultsSheetSnapRuntimeArgs) => {
  const { appRouteResultsSheetRuntimeOwner } = rootOverlayFoundationRuntime;
  const pendingResultsSheetSnapRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'> | null>(
    null
  );
  const activeResultsSheetSnapRef = React.useRef<OverlaySheetSnap>('hidden');

  const applyResultsSheetSnapChange = React.useCallback(
    (snap: Exclude<OverlaySheetSnap, 'hidden'>) => {
      activeResultsSheetSnapRef.current = snap;
      appRouteResultsSheetRuntimeOwner.handleSheetSnapChange(snap);
    },
    [appRouteResultsSheetRuntimeOwner]
  );

  const handleResultsSheetSnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      pendingResultsSheetSnapRef.current = null;
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange]
  );

  const handleResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      if (interactionStateRuntime.resultsSheetSettlingRef.current) {
        pendingResultsSheetSnapRef.current = snap;
        return;
      }
      applyResultsSheetSnapChange(snap);
      if (snap === 'collapsed') {
        closeTransitionActions.markSearchSheetCloseSheetSettled(snap);
      }
    },
    [applyResultsSheetSnapChange, closeTransitionActions, interactionStateRuntime.resultsSheetSettlingRef]
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
      if (settledSnap === 'collapsed') {
        closeTransitionActions.markSearchSheetCloseSheetSettled(settledSnap);
      }
      interactionStateRuntime.handleResultsSheetDragStateChange(false);
    },
    [
      applyResultsSheetSnapChange,
      closeTransitionActions,
      interactionStateRuntime,
    ]
  );

  return React.useMemo(
    () => ({
      handleResultsSheetSnapStart,
      handleResultsSheetSnapChange,
      handleResultsSheetSettlingChange,
    }),
    [
      handleResultsSheetSettlingChange,
      handleResultsSheetSnapChange,
      handleResultsSheetSnapStart,
    ]
  );
};
