import React from 'react';

import type { SharedValue } from 'react-native-reanimated';

import type { MapMotionPressureController } from '../map/map-motion-pressure';

type SearchInteractionStateLike = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type UseResultsSheetInteractionStateRuntimeArgs = {
  anySheetDraggingRef: React.MutableRefObject<boolean>;
  searchInteractionRef: React.MutableRefObject<SearchInteractionStateLike>;
  mapMotionPressureController: MapMotionPressureController;
  cancelPendingMapMovementUpdates: () => void;
  flushDeferredMapMovementState: () => void;
  resultsMomentum: SharedValue<boolean>;
  onResultsListActivityStart: () => void;
};

export type ResultsSheetInteractionStateRuntime = {
  resultsSheetSettlingRef: React.MutableRefObject<boolean>;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsListScrollBegin: () => void;
  handleResultsListScrollEnd: () => void;
  handleResultsListMomentumBegin: () => void;
  handleResultsListMomentumEnd: () => void;
  setResultsSheetSettlingState: (isSettling: boolean) => void;
};

export const useResultsSheetInteractionStateRuntime = ({
  anySheetDraggingRef,
  searchInteractionRef,
  mapMotionPressureController,
  cancelPendingMapMovementUpdates,
  flushDeferredMapMovementState,
  resultsMomentum,
  onResultsListActivityStart,
}: UseResultsSheetInteractionStateRuntimeArgs): ResultsSheetInteractionStateRuntime => {
  const resultsSheetDraggingRef = React.useRef(false);
  const resultsListScrollingRef = React.useRef(false);
  const resultsSheetSettlingRef = React.useRef(false);

  const updateSearchInteractionRef = React.useCallback(
    (next: Partial<SearchInteractionStateLike>) => {
      const current = searchInteractionRef.current;
      const merged = { ...current, ...next };
      merged.isInteracting =
        merged.isResultsSheetDragging ||
        merged.isResultsListScrolling ||
        merged.isResultsSheetSettling;
      searchInteractionRef.current = merged;
      mapMotionPressureController.updateInteractionState({
        isSearchInteracting: merged.isInteracting,
        isAnySheetDragging: anySheetDraggingRef.current,
      });
    },
    [anySheetDraggingRef, mapMotionPressureController, searchInteractionRef]
  );

  const handleResultsSheetDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      if (!isDragging && resultsSheetSettlingRef.current) {
        return;
      }
      if (resultsSheetDraggingRef.current === isDragging) {
        return;
      }
      resultsSheetDraggingRef.current = isDragging;
      anySheetDraggingRef.current = isDragging;
      updateSearchInteractionRef({ isResultsSheetDragging: isDragging });
      if (isDragging) {
        cancelPendingMapMovementUpdates();
        return;
      }
      flushDeferredMapMovementState();
    },
    [
      anySheetDraggingRef,
      cancelPendingMapMovementUpdates,
      flushDeferredMapMovementState,
      updateSearchInteractionRef,
    ]
  );

  const setResultsListScrolling = React.useCallback(
    (isScrolling: boolean) => {
      if (resultsListScrollingRef.current === isScrolling) {
        return;
      }
      resultsListScrollingRef.current = isScrolling;
      updateSearchInteractionRef({ isResultsListScrolling: isScrolling });
      if (!isScrolling) {
        flushDeferredMapMovementState();
      }
    },
    [flushDeferredMapMovementState, updateSearchInteractionRef]
  );

  const setResultsSheetSettlingState = React.useCallback(
    (isSettling: boolean) => {
      if (resultsSheetSettlingRef.current === isSettling) {
        return;
      }
      resultsSheetSettlingRef.current = isSettling;
      updateSearchInteractionRef({ isResultsSheetSettling: isSettling });
      if (isSettling) {
        cancelPendingMapMovementUpdates();
        return;
      }
      if (resultsSheetDraggingRef.current) {
        handleResultsSheetDragStateChange(false);
      }
      flushDeferredMapMovementState();
    },
    [
      cancelPendingMapMovementUpdates,
      flushDeferredMapMovementState,
      handleResultsSheetDragStateChange,
      updateSearchInteractionRef,
    ]
  );

  const handleResultsListScrollBegin = React.useCallback(() => {
    onResultsListActivityStart();
    setResultsListScrolling(true);
  }, [onResultsListActivityStart, setResultsListScrolling]);

  const handleResultsListScrollEnd = React.useCallback(() => {
    if (resultsMomentum.value) {
      return;
    }
    setResultsListScrolling(false);
  }, [resultsMomentum, setResultsListScrolling]);

  const handleResultsListMomentumBegin = React.useCallback(() => {
    onResultsListActivityStart();
    setResultsListScrolling(true);
  }, [onResultsListActivityStart, setResultsListScrolling]);

  const handleResultsListMomentumEnd = React.useCallback(() => {
    setResultsListScrolling(false);
  }, [setResultsListScrolling]);

  return React.useMemo(
    () => ({
      resultsSheetSettlingRef,
      handleResultsSheetDragStateChange,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      setResultsSheetSettlingState,
    }),
    [
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsSheetDragStateChange,
      setResultsSheetSettlingState,
    ]
  );
};
