import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootResultsSheetInteractionStateRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootResultsSheetInteractionStateRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootResultsSheetInteractionStateRuntimeArgs) => {
  const { sessionPrimitivesLane } = stateFoundationLane;
  const {
    rootResultsSheetRuntimeLane,
    appRouteResultsSheetRuntimeOwner,
  } = rootOverlayFoundationRuntime;

  const resultsSheetDraggingRef = React.useRef(false);
  const resultsListScrollingRef = React.useRef(false);
  const resultsSheetSettlingRef = React.useRef(false);

  const updateSearchInteractionRef = React.useCallback(
    (
      next: Partial<{
        isInteracting: boolean;
        isResultsSheetDragging: boolean;
        isResultsListScrolling: boolean;
        isResultsSheetSettling: boolean;
      }>
    ) => {
      const current = sessionPrimitivesLane.primitives.searchInteractionRef.current;
      const merged = { ...current, ...next };
      merged.isInteracting =
        merged.isResultsSheetDragging ||
        merged.isResultsListScrolling ||
        merged.isResultsSheetSettling;
      sessionPrimitivesLane.primitives.searchInteractionRef.current = merged;
      rootResultsSheetRuntimeLane.mapMotionPressureController.updateInteractionState({
        isSearchInteracting: merged.isInteracting,
        isAnySheetDragging:
          sessionPrimitivesLane.primitives.anySheetDraggingRef.current,
      });
    },
    [
      rootResultsSheetRuntimeLane.mapMotionPressureController,
      sessionPrimitivesLane.primitives.anySheetDraggingRef,
      sessionPrimitivesLane.primitives.searchInteractionRef,
    ]
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
      sessionPrimitivesLane.primitives.anySheetDraggingRef.current = isDragging;
      updateSearchInteractionRef({ isResultsSheetDragging: isDragging });
      if (isDragging) {
        rootResultsSheetRuntimeLane.cancelPendingMapMovementUpdates();
        return;
      }
      rootResultsSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [
      rootResultsSheetRuntimeLane,
      sessionPrimitivesLane.primitives.anySheetDraggingRef,
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
        rootResultsSheetRuntimeLane.flushDeferredMapMovementState();
      }
    },
    [rootResultsSheetRuntimeLane, updateSearchInteractionRef]
  );

  const setResultsSheetSettlingState = React.useCallback(
    (isSettling: boolean) => {
      if (resultsSheetSettlingRef.current === isSettling) {
        return;
      }

      resultsSheetSettlingRef.current = isSettling;
      updateSearchInteractionRef({ isResultsSheetSettling: isSettling });
      if (isSettling) {
        rootResultsSheetRuntimeLane.cancelPendingMapMovementUpdates();
        return;
      }
      if (resultsSheetDraggingRef.current) {
        handleResultsSheetDragStateChange(false);
      }
      rootResultsSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [
      handleResultsSheetDragStateChange,
      rootResultsSheetRuntimeLane,
      updateSearchInteractionRef,
    ]
  );

  const handleResultsListScrollBegin = React.useCallback(() => {
    setResultsListScrolling(true);
  }, [setResultsListScrolling]);

  const handleResultsListScrollEnd = React.useCallback(() => {
    if (appRouteResultsSheetRuntimeOwner.resultsMomentum.value) {
      return;
    }
    setResultsListScrolling(false);
  }, [appRouteResultsSheetRuntimeOwner.resultsMomentum, setResultsListScrolling]);

  const handleResultsListMomentumBegin = React.useCallback(() => {
    setResultsListScrolling(true);
  }, [setResultsListScrolling]);

  const handleResultsListMomentumEnd = React.useCallback(() => {
    setResultsListScrolling(false);
  }, [setResultsListScrolling]);

  return React.useMemo(
    () => ({
      resultsSheetSettlingRef,
      handleResultsSheetDragStateChange,
      setResultsSheetSettlingState,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
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
