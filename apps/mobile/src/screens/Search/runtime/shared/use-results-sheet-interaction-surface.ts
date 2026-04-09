import React from 'react';

import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type { ResultsSheetInteractionStateRuntime } from './use-results-sheet-interaction-state-runtime';
import type { ResultsSheetLoadMoreRuntime } from './use-results-sheet-load-more-runtime';
import type { ResultsSheetSnapRuntime } from './use-results-sheet-snap-runtime';

type UseResultsSheetInteractionSurfaceArgs = {
  loadMoreRuntime: ResultsSheetLoadMoreRuntime;
  interactionStateRuntime: ResultsSheetInteractionStateRuntime;
  snapRuntime: ResultsSheetSnapRuntime;
};

export const useResultsSheetInteractionSurface = ({
  loadMoreRuntime,
  interactionStateRuntime,
  snapRuntime,
}: UseResultsSheetInteractionSurfaceArgs): ResultsSheetInteractionModel =>
  React.useMemo(
    () => ({
      handleResultsSheetSnapStart: snapRuntime.handleResultsSheetSnapStart,
      handleResultsListScrollBegin: interactionStateRuntime.handleResultsListScrollBegin,
      handleResultsListScrollEnd: interactionStateRuntime.handleResultsListScrollEnd,
      handleResultsListMomentumBegin: interactionStateRuntime.handleResultsListMomentumBegin,
      handleResultsListMomentumEnd: interactionStateRuntime.handleResultsListMomentumEnd,
      handleResultsSheetDragStateChange: interactionStateRuntime.handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange: snapRuntime.handleResultsSheetSettlingChange,
      handleResultsEndReached: loadMoreRuntime.handleResultsEndReached,
      handleResultsSheetSnapChange: snapRuntime.handleResultsSheetSnapChange,
      resetResultsListScrollProgress: loadMoreRuntime.resetResultsListScrollProgress,
    }),
    [interactionStateRuntime, loadMoreRuntime, snapRuntime]
  );
