import React from 'react';

import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
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
  const { rootSharedSheetRuntimeLane, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;

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
      rootSharedSheetRuntimeLane.mapMotionPressureController.updateInteractionState({
        isSearchInteracting: merged.isInteracting,
        isAnySheetDragging: sessionPrimitivesLane.primitives.anySheetDraggingRef.current,
      });
    },
    [
      rootSharedSheetRuntimeLane.mapMotionPressureController,
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
        return;
      }
      rootSharedSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [
      rootSharedSheetRuntimeLane,
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
        rootSharedSheetRuntimeLane.flushDeferredMapMovementState();
      }
    },
    [rootSharedSheetRuntimeLane, updateSearchInteractionRef]
  );

  const setResultsSheetSettlingState = React.useCallback(
    (isSettling: boolean) => {
      if (resultsSheetSettlingRef.current === isSettling) {
        return;
      }

      resultsSheetSettlingRef.current = isSettling;
      updateSearchInteractionRef({ isResultsSheetSettling: isSettling });
      if (isSettling) {
        return;
      }
      if (resultsSheetDraggingRef.current) {
        handleResultsSheetDragStateChange(false);
      }
      rootSharedSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [handleResultsSheetDragStateChange, rootSharedSheetRuntimeLane, updateSearchInteractionRef]
  );

  // [SE-QSTALL root fix, 2026-07-10] The interaction flags are RESULTS-SESSION-SCOPED state,
  // but their settle/drag END events ride the sheet plane's motion callbacks — and a terminal
  // dismissal detaches the results plane MID-SETTLE, so the end event dispatches to the next
  // plane's handler and the flags latch true forever. A latched isResultsSheetSettling starves
  // the hydration publication runtime (its motion-lane gate re-defers on a rAF loop), which
  // starves listPreparedRowsReady, which parks the NEXT session's enter commit at skeleton —
  // hit by any submit that doesn't itself move the sheet (the /q deep-link lane; typed submits
  // mask it by starting a new settle cycle). The flags' OWNER ends them with the session: when
  // the surface's active bundle stops being 'results', no results-sheet motion can exist.
  React.useEffect(() => {
    const surfaceRuntime = getSearchSurfaceRuntime();
    let lastActiveBundleKind = surfaceRuntime.getSnapshot().activeBundle.kind;
    return surfaceRuntime.subscribe(() => {
      const activeBundleKind = surfaceRuntime.getSnapshot().activeBundle.kind;
      if (activeBundleKind === lastActiveBundleKind) {
        return;
      }
      lastActiveBundleKind = activeBundleKind;
      // RT-8: zero on BOTH edges. Leaving 'results' ends the session's flags; entering
      // 'results' clears anything a late motion-BEGIN from the detached plane re-latched
      // while no results sheet existed (no END can ever pair it).
      resultsSheetDraggingRef.current = false;
      resultsListScrollingRef.current = false;
      resultsSheetSettlingRef.current = false;
      sessionPrimitivesLane.primitives.anySheetDraggingRef.current = false;
      updateSearchInteractionRef({
        isResultsSheetDragging: false,
        isResultsListScrolling: false,
        isResultsSheetSettling: false,
      });
    });
  }, [sessionPrimitivesLane.primitives.anySheetDraggingRef, updateSearchInteractionRef]);

  const handleResultsListScrollBegin = React.useCallback(() => {
    setResultsListScrolling(true);
  }, [setResultsListScrolling]);

  const handleResultsListScrollEnd = React.useCallback(() => {
    if (appRouteSharedSheetRuntimeOwner.sheetMomentum.value) {
      return;
    }
    setResultsListScrolling(false);
  }, [appRouteSharedSheetRuntimeOwner.sheetMomentum, setResultsListScrolling]);

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
