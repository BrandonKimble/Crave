import React from 'react';

import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
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
  const { isLoadingMore, canLoadMore, currentPage } = rootDataPlaneRuntime.resultsArrivalState;

  const resultsSheetLoadMoreRuntime = useSearchRootResultsSheetLoadMoreRuntime({
    submitRuntimeResult,
    shouldLogSearchStateChanges: rootInstrumentationRuntime.shouldLogSearchStateChanges,
    searchMode,
    isSearchLoading,
    isLoadingMore,
    canLoadMore,
    currentPage,
  });
  const resultsSheetInteractionStateRuntime = useSearchRootResultsSheetInteractionStateRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
  const resultsSheetSnapRuntime = useSearchRootResultsSheetSnapRuntime({
    interactionStateRuntime: resultsSheetInteractionStateRuntime,
  });
  /**
   * F1619: this used to be TWO repackers in a row. A `motion` value re-wrapped six handlers
   * (its own hand-copied subset type of `ResultsSheetInteractionModel`), and the model below
   * immediately read those six fields back out. The motion memo could only change when one of
   * the six changed — exactly the condition the model's own deps already encode — so it was an
   * allocation and a copy of the field list, not a memo boundary. The model now reads its
   * sources directly and `Pick<>`s nothing by hand: the contract type IS the contract.
   */
  const resultsSheetInteractionModel = React.useMemo<ResultsSheetInteractionModel>(
    () => ({
      handleResultsListScrollBegin: () => {
        resultsSheetLoadMoreRuntime.markResultsListUserScrollStart();
        resultsSheetInteractionStateRuntime.handleResultsListScrollBegin();
      },
      handleResultsListScrollEnd: resultsSheetInteractionStateRuntime.handleResultsListScrollEnd,
      handleResultsListMomentumBegin: () => {
        resultsSheetLoadMoreRuntime.markResultsListUserScrollStart();
        resultsSheetInteractionStateRuntime.handleResultsListMomentumBegin();
      },
      handleResultsListMomentumEnd:
        resultsSheetInteractionStateRuntime.handleResultsListMomentumEnd,
      handleResultsSheetDragStateChange:
        resultsSheetInteractionStateRuntime.handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange: resultsSheetSnapRuntime.handleResultsSheetSettlingChange,
      handleResultsEndReached: resultsSheetLoadMoreRuntime.handleResultsEndReached,
      resetResultsListScrollProgress: resultsSheetLoadMoreRuntime.resetResultsListScrollProgress,
      handleResultsListUserScrollActivity:
        resultsSheetLoadMoreRuntime.handleResultsListUserScrollActivity,
    }),
    [
      resultsSheetInteractionStateRuntime.handleResultsListMomentumBegin,
      resultsSheetInteractionStateRuntime.handleResultsListMomentumEnd,
      resultsSheetInteractionStateRuntime.handleResultsListScrollBegin,
      resultsSheetInteractionStateRuntime.handleResultsListScrollEnd,
      resultsSheetInteractionStateRuntime.handleResultsSheetDragStateChange,
      resultsSheetLoadMoreRuntime.handleResultsEndReached,
      resultsSheetLoadMoreRuntime.handleResultsListUserScrollActivity,
      resultsSheetLoadMoreRuntime.markResultsListUserScrollStart,
      resultsSheetLoadMoreRuntime.resetResultsListScrollProgress,
      resultsSheetSnapRuntime.handleResultsSheetSettlingChange,
    ]
  );

  return resultsSheetInteractionModel;
};
