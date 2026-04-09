import type React from 'react';

import { useResultsSheetInteractionSurface } from './use-results-sheet-interaction-surface';
import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import { useResultsSheetInteractionStateRuntime } from './use-results-sheet-interaction-state-runtime';
import { useResultsSheetLoadMoreRuntime } from './use-results-sheet-load-more-runtime';
import { useResultsSheetSnapRuntime } from './use-results-sheet-snap-runtime';

type UseSearchResultsSheetInteractionRuntimeArgs = {
  loadMoreArgs: Parameters<typeof useResultsSheetLoadMoreRuntime>[0];
  interactionStateArgs: Omit<
    Parameters<typeof useResultsSheetInteractionStateRuntime>[0],
    'onResultsListActivityStart'
  >;
  snapArgs: Omit<
    Parameters<typeof useResultsSheetSnapRuntime>[0],
    'resultsSheetSettlingRef' | 'handleResultsSheetDragStateChange' | 'setResultsSheetSettlingState'
  >;
  resetResultsListScrollProgressRef: React.MutableRefObject<() => void>;
};

export const useSearchResultsSheetInteractionRuntime = ({
  loadMoreArgs,
  interactionStateArgs,
  snapArgs,
  resetResultsListScrollProgressRef,
}: UseSearchResultsSheetInteractionRuntimeArgs): ResultsSheetInteractionModel => {
  const loadMoreRuntime = useResultsSheetLoadMoreRuntime(loadMoreArgs);
  const interactionStateRuntime = useResultsSheetInteractionStateRuntime({
    ...interactionStateArgs,
    onResultsListActivityStart: loadMoreRuntime.markResultsListUserScrollStart,
  });
  const snapRuntime = useResultsSheetSnapRuntime({
    ...snapArgs,
    resultsSheetSettlingRef: interactionStateRuntime.resultsSheetSettlingRef,
    handleResultsSheetDragStateChange: interactionStateRuntime.handleResultsSheetDragStateChange,
    setResultsSheetSettlingState: interactionStateRuntime.setResultsSheetSettlingState,
  });
  const resultsSheetInteractionModel = useResultsSheetInteractionSurface({
    loadMoreRuntime,
    interactionStateRuntime,
    snapRuntime,
  });

  resetResultsListScrollProgressRef.current =
    resultsSheetInteractionModel.resetResultsListScrollProgress;

  return resultsSheetInteractionModel;
};
