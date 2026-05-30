import type {
  ResultsInteractionModel,
  ResultsPresentationOwner,
} from '../shared/results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from '../shared/results-presentation-runtime-owner-contract';
import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from '../shared/results-presentation-shell-runtime-contract';
import type { SearchResultsShellModel } from '../shared/results-presentation-shell-contract';

type ResultsPresentationRuntimeOwnerValue = ResultsPresentationRuntimeOwner;

export const createResultsPresentationRuntimeOwnerValue = ({
  searchSurfaceResultsTransactionKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  beginSearchThisAreaPresentationPending,
  stageSearchSurfaceResultsTransaction,
  commitSearchSurfaceResultsExitTransaction,
  clearStagedSearchSurfaceResultsTransaction,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
}: ResultsPresentationRuntimeOwnerValue): ResultsPresentationRuntimeOwnerValue => ({
  searchSurfaceResultsTransactionKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  beginSearchThisAreaPresentationPending,
  stageSearchSurfaceResultsTransaction,
  commitSearchSurfaceResultsExitTransaction,
  clearStagedSearchSurfaceResultsTransaction,
  handlePageOneResultsCommitted,
  cancelPresentationIntent,
  handlePresentationIntentAbort,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
});

type ResultsPresentationOwnerValue = Pick<
  ResultsPresentationOwner,
  | 'searchSurfaceResultsTransactionKey'
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'cancelToggleInteraction'
  | 'beginSearchThisAreaPresentationPending'
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
};

export const createResultsPresentationOwnerValue = ({
  searchSurfaceResultsTransactionKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  cancelToggleInteraction,
  beginSearchThisAreaPresentationPending,
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
}: ResultsPresentationOwnerValue): ResultsPresentationOwnerValue => ({
  searchSurfaceResultsTransactionKey,
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  cancelToggleInteraction,
  beginSearchThisAreaPresentationPending,
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
});
