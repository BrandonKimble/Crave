import type {
  ResultsInteractionModel,
  ResultsPresentationOwner,
  ResultsSheetExecutionModel,
} from '../shared/results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from '../shared/results-presentation-runtime-owner-contract';
import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from '../shared/results-presentation-shell-runtime-contract';
import type { SearchResultsShellModel } from '../shared/results-presentation-shell-contract';

type ResultsPresentationRuntimeOwnerValue = ResultsPresentationRuntimeOwner;

export const createResultsPresentationRuntimeOwnerValue = ({
  preparedResultsSnapshotKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  stagePreparedResultsSnapshot,
  commitPreparedResultsSnapshot,
  clearStagedPreparedResultsSnapshot,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
}: ResultsPresentationRuntimeOwnerValue): ResultsPresentationRuntimeOwnerValue => ({
  preparedResultsSnapshotKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  stagePreparedResultsSnapshot,
  commitPreparedResultsSnapshot,
  clearStagedPreparedResultsSnapshot,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
});

type ResultsSheetExecutionModelValue = ResultsSheetExecutionModel;

export const createResultsSheetExecutionModelValue = ({
  requestResultsSheetSnap,
  hideResultsSheet,
}: ResultsSheetExecutionModelValue): ResultsSheetExecutionModelValue => ({
  requestResultsSheetSnap,
  hideResultsSheet,
});

type ResultsPresentationOwnerValue = Pick<
  ResultsPresentationOwner,
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
  interactionModel: ResultsInteractionModel;
  resultsSheetExecutionModel: ResultsSheetExecutionModel;
};

export const createResultsPresentationOwnerValue = ({
  preparedResultsSnapshotKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  cancelToggleInteraction,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
  shellModel,
  presentationActions,
  closeTransitionActions,
  interactionModel,
  resultsSheetExecutionModel,
}: ResultsPresentationOwnerValue): ResultsPresentationOwnerValue => ({
  preparedResultsSnapshotKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  cancelToggleInteraction,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
  shellModel,
  presentationActions,
  closeTransitionActions,
  interactionModel,
  resultsSheetExecutionModel,
});
