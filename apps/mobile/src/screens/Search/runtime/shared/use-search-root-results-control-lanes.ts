import React from 'react';

import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type {
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootPresentationStateRuntime,
  SearchRootResultsPresentationStateControlLane,
  SearchRootResultsSheetControlLane,
  SearchRootResultsTransitionControlLane,
} from './use-search-root-control-plane-runtime-contract';

export const useSearchRootResultsSheetControlLane = (
  resultsSheetInteractionModel: ResultsSheetInteractionModel
): SearchRootResultsSheetControlLane =>
  React.useMemo(
    () => ({
      resultsSheetInteractionModel,
    }),
    [resultsSheetInteractionModel]
  );

export const useSearchRootResultsPresentationStateControlLane = (
  presentationState: SearchRootPresentationStateRuntime
): SearchRootResultsPresentationStateControlLane =>
  React.useMemo(
    () => ({
      presentationState,
    }),
    [presentationState]
  );

export const useSearchRootResultsTransitionControlLane = (
  closeTransitionActions: ResultsCloseTransitionActions
): SearchRootResultsTransitionControlLane =>
  React.useMemo(
    () => ({
      closeTransitionActions,
    }),
    [closeTransitionActions]
  );

export const useSearchRootPreparedResultsSnapshotControlLane = (
  preparedResultsSnapshotKey: string | null
): SearchRootPreparedResultsSnapshotControlLane =>
  React.useMemo(
    () => ({
      preparedResultsSnapshotKey,
    }),
    [preparedResultsSnapshotKey]
  );
