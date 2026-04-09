import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';

type UseResultsSheetSnapRuntimeArgs = {
  handleSheetSnapChange: (nextSnap: OverlaySheetSnap | 'hidden') => void;
  markSearchSheetCloseSheetSettled: (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden') => void;
  resultsSheetSettlingRef: React.MutableRefObject<boolean>;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  setResultsSheetSettlingState: (isSettling: boolean) => void;
};

type ResultsSheetSnapRuntime = {
  handleResultsSheetSnapStart: (snap: OverlaySheetSnap | 'hidden') => void;
  handleResultsSheetSnapChange: (snap: OverlaySheetSnap) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
};

export const useResultsSheetSnapRuntime = ({
  handleSheetSnapChange,
  markSearchSheetCloseSheetSettled,
  resultsSheetSettlingRef,
  handleResultsSheetDragStateChange,
  setResultsSheetSettlingState,
}: UseResultsSheetSnapRuntimeArgs): ResultsSheetSnapRuntime => {
  const pendingResultsSheetSnapRef = React.useRef<OverlaySheetSnap | null>(null);
  const activeResultsSheetSnapRef = React.useRef<OverlaySheetSnap>('hidden');

  const applyResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      activeResultsSheetSnapRef.current = snap;
      handleSheetSnapChange(snap);
    },
    [handleSheetSnapChange]
  );

  const handleResultsSheetSnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (snap === 'hidden') {
        return;
      }
      pendingResultsSheetSnapRef.current = null;
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange]
  );

  const handleResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (resultsSheetSettlingRef.current) {
        pendingResultsSheetSnapRef.current = snap;
        return;
      }
      applyResultsSheetSnapChange(snap);
      if (snap === 'collapsed') {
        markSearchSheetCloseSheetSettled(snap);
      }
    },
    [applyResultsSheetSnapChange, markSearchSheetCloseSheetSettled, resultsSheetSettlingRef]
  );

  const handleResultsSheetSettlingChange = React.useCallback(
    (isSettling: boolean) => {
      setResultsSheetSettlingState(isSettling);
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
        markSearchSheetCloseSheetSettled(settledSnap);
      }
      handleResultsSheetDragStateChange(false);
    },
    [
      applyResultsSheetSnapChange,
      handleResultsSheetDragStateChange,
      markSearchSheetCloseSheetSettled,
      setResultsSheetSettlingState,
    ]
  );

  return React.useMemo(
    () => ({
      handleResultsSheetSnapStart,
      handleResultsSheetSnapChange,
      handleResultsSheetSettlingChange,
    }),
    [handleResultsSheetSnapChange, handleResultsSheetSnapStart, handleResultsSheetSettlingChange]
  );
};
