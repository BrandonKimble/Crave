import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from './results-presentation-shell-runtime-contract';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

export type ResultsInteractionModel = {
  scheduleTabToggleCommit: (next: 'dishes' | 'restaurants') => void;
  notifyToggleInteractionFrostReady: (intentId: string) => void;
};

export type ResultsPresentationOwner = Pick<
  ResultsPresentationRuntimeOwner,
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
