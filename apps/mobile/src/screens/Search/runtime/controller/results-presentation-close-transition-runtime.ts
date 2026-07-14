import type { ResultsCloseTransitionActions } from '../shared/results-presentation-shell-runtime-contract';
import type { OverlayKey } from '../../../../overlays/types';

type ResultsPresentationCloseTransitionRuntimeValue = {
  closeTransitionActions: ResultsCloseTransitionActions;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

export const createResultsPresentationCloseTransitionRuntimeValue = ({
  closeTransitionActions,
  beginCloseTransition,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
}: ResultsPresentationCloseTransitionRuntimeValue): ResultsPresentationCloseTransitionRuntimeValue => ({
  closeTransitionActions,
  beginCloseTransition,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
});
