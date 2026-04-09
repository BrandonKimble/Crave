import type { OverlaySheetSnap } from '../../../../overlays/types';
import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from './results-presentation-shell-runtime-contract';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

export type ResultsSheetExecutionModel = {
  requestResultsSheetSnap: (snap: OverlaySheetSnap, requestToken: number | null) => void;
  hideResultsSheet: (requestToken: number | null) => void;
};

export type ResultsInteractionModel = {
  scheduleTabToggleCommit: (next: 'dishes' | 'restaurants') => void;
  notifyToggleInteractionFrostReady: (intentId: string) => void;
};

export type ResultsPresentationOwner = Pick<
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
  interactionModel: ResultsInteractionModel;
  resultsSheetExecutionModel: ResultsSheetExecutionModel;
};
