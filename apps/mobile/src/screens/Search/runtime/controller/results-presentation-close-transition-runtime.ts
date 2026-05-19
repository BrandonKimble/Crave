import type { ResultsCloseTransitionActions } from '../shared/results-presentation-shell-runtime-contract';

type ResultsPresentationCloseTransitionRuntimeValue = {
  closeTransitionActions: ResultsCloseTransitionActions;
  beginCloseTransition: (
    closeIntentId: string,
    options?: { terminalDismissSource?: 'results' | 'profile' }
  ) => void;
  scheduleCloseSearchCleanup: (closeIntentId: string) => void;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

export const createResultsPresentationCloseTransitionRuntimeValue = ({
  closeTransitionActions,
  beginCloseTransition,
  scheduleCloseSearchCleanup,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
}: ResultsPresentationCloseTransitionRuntimeValue): ResultsPresentationCloseTransitionRuntimeValue => ({
  closeTransitionActions,
  beginCloseTransition,
  scheduleCloseSearchCleanup,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
});
