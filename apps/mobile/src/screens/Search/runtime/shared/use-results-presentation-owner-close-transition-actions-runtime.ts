import React from 'react';

import {
  applySearchCloseCollapsedReached,
  applySearchCloseMapExitSettled,
  applySearchCloseSheetSettled,
} from './results-presentation-shell-close-transition-state';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';

type UseResultsPresentationOwnerCloseTransitionActionsRuntimeArgs = {
  shellLocalState: ResultsPresentationShellLocalState;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
  getActiveCloseIntentId: () => string | null;
  commitArmedSearchCloseRestore: () => void;
  finalizeCloseTransition: (closeIntentId: string) => void;
};

export const useResultsPresentationOwnerCloseTransitionActionsRuntime = ({
  shellLocalState,
  cancelSearchSheetCloseTransition,
  getActiveCloseIntentId,
  commitArmedSearchCloseRestore,
  finalizeCloseTransition,
}: UseResultsPresentationOwnerCloseTransitionActionsRuntimeArgs): ResultsCloseTransitionActions => {
  const markSearchSheetCloseMapExitSettled = React.useCallback(
    (closeIntentId: string) => {
      let shouldFinalize = false;
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseMapExitSettled({
          current,
          closeIntentId,
        });
        shouldFinalize = update.shouldFinalize;
        return update.nextState;
      });
      if (shouldFinalize) {
        finalizeCloseTransition(closeIntentId);
      }
    },
    [finalizeCloseTransition, shellLocalState]
  );

  const markSearchSheetCloseCollapsedReached = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      shellLocalState.setSearchCloseTransitionState((current) =>
        applySearchCloseCollapsedReached({
          current,
          closeIntentId: getActiveCloseIntentId(),
          snap,
        })
      );
    },
    [getActiveCloseIntentId, shellLocalState]
  );

  const markSearchSheetCloseSheetSettled = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      const activeCloseIntentId = getActiveCloseIntentId();
      if (!activeCloseIntentId || snap !== 'collapsed') {
        return;
      }
      commitArmedSearchCloseRestore();
      shellLocalState.setHoldPersistentPollLane(true);
      let shouldFinalize = false;
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseSheetSettled({
          current,
          closeIntentId: activeCloseIntentId,
          snap,
        });
        shouldFinalize = update.shouldFinalize;
        return update.nextState;
      });
      if (shouldFinalize) {
        finalizeCloseTransition(activeCloseIntentId);
      }
    },
    [
      commitArmedSearchCloseRestore,
      finalizeCloseTransition,
      getActiveCloseIntentId,
      shellLocalState,
    ]
  );

  return React.useMemo(
    () => ({
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseSheetSettled,
      cancelSearchSheetCloseTransition,
    }),
    [
      cancelSearchSheetCloseTransition,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseSheetSettled,
    ]
  );
};
