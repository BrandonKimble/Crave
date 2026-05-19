import React from 'react';

import { createSearchRootResultsSheetInteractionModel } from '../controller/search-root-results-sheet-interaction-runtime';
import { createSearchRootResultsSheetMotionRuntimeValue } from '../controller/search-root-results-sheet-motion-runtime';
import type { SubmitRuntimeResult } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootResultsSheetInteractionStateRuntime } from './use-search-root-results-sheet-interaction-state-runtime';
import { useSearchRootResultsSheetLoadMoreRuntime } from './use-search-root-results-sheet-load-more-runtime';
import { useSearchRootResultsSheetSnapRuntime } from './use-search-root-results-sheet-snap-runtime';

type UseSearchRootResultsSheetInteractionModelRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  submitRuntimeResult: SubmitRuntimeResult;
};

export const useSearchRootResultsSheetInteractionModelRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  submitRuntimeResult,
}: UseSearchRootResultsSheetInteractionModelRuntimeArgs) => {
  const { rootDataPlaneRuntime } = stateFoundationLane;
  const { rootInstrumentationRuntime } = rootOverlayFoundationRuntime;

  const { searchMode, isSearchLoading } = rootDataPlaneRuntime.runtimeFlags;
  const { isLoadingMore, canLoadMore, currentPage } =
    rootDataPlaneRuntime.resultsArrivalState;

  const resultsSheetLoadMoreRuntime = useSearchRootResultsSheetLoadMoreRuntime({
    submitRuntimeResult,
    shouldLogSearchStateChanges:
      rootInstrumentationRuntime.shouldLogSearchStateChanges,
    searchMode,
    isSearchLoading,
    isLoadingMore,
    canLoadMore,
    currentPage,
  });
  const resultsSheetInteractionStateRuntime =
    useSearchRootResultsSheetInteractionStateRuntime({
      stateFoundationLane,
      rootOverlayFoundationRuntime,
    });
  const resultsSheetSnapRuntime = useSearchRootResultsSheetSnapRuntime({
    rootOverlayFoundationRuntime,
    interactionStateRuntime: resultsSheetInteractionStateRuntime,
  });
  const resultsSheetMotionRuntime = React.useMemo(
    () =>
      createSearchRootResultsSheetMotionRuntimeValue({
        handleResultsSheetSnapStart:
          resultsSheetSnapRuntime.handleResultsSheetSnapStart,
        handleResultsListScrollBegin:
          resultsSheetInteractionStateRuntime.handleResultsListScrollBegin,
        handleResultsListScrollEnd:
          resultsSheetInteractionStateRuntime.handleResultsListScrollEnd,
        handleResultsListMomentumBegin:
          resultsSheetInteractionStateRuntime.handleResultsListMomentumBegin,
        handleResultsListMomentumEnd:
          resultsSheetInteractionStateRuntime.handleResultsListMomentumEnd,
        handleResultsSheetDragStateChange:
          resultsSheetInteractionStateRuntime.handleResultsSheetDragStateChange,
        handleResultsSheetSettlingChange:
          resultsSheetSnapRuntime.handleResultsSheetSettlingChange,
        handleResultsSheetSnapChange:
          resultsSheetSnapRuntime.handleResultsSheetSnapChange,
      }),
    [
      resultsSheetInteractionStateRuntime.handleResultsListMomentumBegin,
      resultsSheetInteractionStateRuntime.handleResultsListMomentumEnd,
      resultsSheetInteractionStateRuntime.handleResultsListScrollBegin,
      resultsSheetInteractionStateRuntime.handleResultsListScrollEnd,
      resultsSheetInteractionStateRuntime.handleResultsSheetDragStateChange,
      resultsSheetSnapRuntime.handleResultsSheetSettlingChange,
      resultsSheetSnapRuntime.handleResultsSheetSnapChange,
      resultsSheetSnapRuntime.handleResultsSheetSnapStart,
    ]
  );
  const resultsSheetInteractionModel = React.useMemo(
    () =>
      createSearchRootResultsSheetInteractionModel({
        handleResultsSheetSnapStart:
          resultsSheetMotionRuntime.handleResultsSheetSnapStart,
        handleResultsListScrollBegin: () => {
          resultsSheetLoadMoreRuntime.markResultsListUserScrollStart();
          resultsSheetMotionRuntime.handleResultsListScrollBegin();
        },
        handleResultsListScrollEnd:
          resultsSheetMotionRuntime.handleResultsListScrollEnd,
        handleResultsListMomentumBegin: () => {
          resultsSheetLoadMoreRuntime.markResultsListUserScrollStart();
          resultsSheetMotionRuntime.handleResultsListMomentumBegin();
        },
        handleResultsListMomentumEnd:
          resultsSheetMotionRuntime.handleResultsListMomentumEnd,
        handleResultsSheetDragStateChange:
          resultsSheetMotionRuntime.handleResultsSheetDragStateChange,
        handleResultsSheetSettlingChange:
          resultsSheetMotionRuntime.handleResultsSheetSettlingChange,
        handleResultsEndReached:
          resultsSheetLoadMoreRuntime.handleResultsEndReached,
        handleResultsSheetSnapChange:
          resultsSheetMotionRuntime.handleResultsSheetSnapChange,
        resetResultsListScrollProgress:
          resultsSheetLoadMoreRuntime.resetResultsListScrollProgress,
      }),
    [
      resultsSheetLoadMoreRuntime.handleResultsEndReached,
      resultsSheetLoadMoreRuntime.markResultsListUserScrollStart,
      resultsSheetLoadMoreRuntime.resetResultsListScrollProgress,
      resultsSheetMotionRuntime.handleResultsListMomentumBegin,
      resultsSheetMotionRuntime.handleResultsListMomentumEnd,
      resultsSheetMotionRuntime.handleResultsListScrollBegin,
      resultsSheetMotionRuntime.handleResultsListScrollEnd,
      resultsSheetMotionRuntime.handleResultsSheetDragStateChange,
      resultsSheetMotionRuntime.handleResultsSheetSettlingChange,
      resultsSheetMotionRuntime.handleResultsSheetSnapChange,
      resultsSheetMotionRuntime.handleResultsSheetSnapStart,
    ]
  );

  return resultsSheetInteractionModel;
};
