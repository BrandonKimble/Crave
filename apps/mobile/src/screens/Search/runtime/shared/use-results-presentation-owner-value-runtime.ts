import React from 'react';

import { createResultsPresentationOwnerValue } from '../controller/results-presentation-owner-runtime';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';
import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from './results-presentation-shell-runtime-contract';

type UseResultsPresentationOwnerValueRuntimeArgs = Pick<
  ResultsPresentationRuntimeOwner,
  | 'preparedResultsSnapshotKey'
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'cancelToggleInteraction'
  | 'handlePageOneResultsCommitted'
  | 'cancelPresentationIntent'
  | 'handlePresentationIntentAbort'
  | 'handleExecutionBatchMountedHidden'
  | 'handleMarkerEnterStarted'
  | 'handleMarkerEnterSettled'
  | 'handleMarkerExitStarted'
  | 'handleMarkerExitSettled'
> & {
  shellModel: SearchResultsShellModel;
  presentationActions: ResultsPresentationActions;
  closeTransitionActions: ResultsCloseTransitionActions;
  interactionModel: ResultsPresentationOwner['interactionModel'];
  resultsSheetExecutionModel: ResultsPresentationOwner['resultsSheetExecutionModel'];
};

export const useResultsPresentationOwnerValueRuntime = ({
  shellModel,
  presentationActions,
  closeTransitionActions,
  interactionModel,
  resultsSheetExecutionModel,
  ...resultsRuntimeOwner
}: UseResultsPresentationOwnerValueRuntimeArgs): ResultsPresentationOwner =>
  React.useMemo(
    () =>
      createResultsPresentationOwnerValue({
        preparedResultsSnapshotKey: resultsRuntimeOwner.preparedResultsSnapshotKey,
        pendingTogglePresentationIntentId:
          resultsRuntimeOwner.pendingTogglePresentationIntentId,
        scheduleToggleCommit: resultsRuntimeOwner.scheduleToggleCommit,
        cancelToggleInteraction: resultsRuntimeOwner.cancelToggleInteraction,
        handlePageOneResultsCommitted:
          resultsRuntimeOwner.handlePageOneResultsCommitted,
        cancelPresentationIntent: resultsRuntimeOwner.cancelPresentationIntent,
        handlePresentationIntentAbort:
          resultsRuntimeOwner.handlePresentationIntentAbort,
        handleExecutionBatchMountedHidden:
          resultsRuntimeOwner.handleExecutionBatchMountedHidden,
        handleMarkerEnterStarted: resultsRuntimeOwner.handleMarkerEnterStarted,
        handleMarkerEnterSettled: resultsRuntimeOwner.handleMarkerEnterSettled,
        handleMarkerExitStarted: resultsRuntimeOwner.handleMarkerExitStarted,
        handleMarkerExitSettled: resultsRuntimeOwner.handleMarkerExitSettled,
        shellModel,
        presentationActions,
        closeTransitionActions,
        interactionModel,
        resultsSheetExecutionModel,
      }),
    [
      closeTransitionActions,
      interactionModel,
      presentationActions,
      resultsRuntimeOwner,
      resultsSheetExecutionModel,
      shellModel,
    ]
  );
