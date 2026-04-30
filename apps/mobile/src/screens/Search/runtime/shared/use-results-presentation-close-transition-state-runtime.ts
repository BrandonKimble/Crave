import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationCloseTransitionFinalizeRuntime } from './use-results-presentation-close-transition-finalize-runtime';
import { useResultsPresentationCloseTransitionIntentRuntime } from './use-results-presentation-close-transition-intent-runtime';
import {
  applySearchCloseCollapsedReached,
  applySearchCloseMapExitSettled,
  applySearchCloseSheetSettled,
} from './results-presentation-shell-close-transition-state';

type UseResultsPresentationCloseTransitionStateRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  armSearchCloseRestore: (
    options?: import('./results-presentation-shell-runtime-contract').ArmSearchCloseRestoreOptions
  ) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationCloseTransitionStateRuntime = {
  closeTransitionActions: ResultsCloseTransitionActions;
  beginCloseTransition: (closeIntentId: string) => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

export const useResultsPresentationCloseTransitionStateRuntime = ({
  clearSearchState,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionStateRuntimeArgs): ResultsPresentationCloseTransitionStateRuntime => {
  const intentRuntime = useResultsPresentationCloseTransitionIntentRuntime({
    armSearchCloseRestore,
    shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });
  const finalizeRuntime = useResultsPresentationCloseTransitionFinalizeRuntime({
    clearSearchState,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
    cancelSearchCloseRestore,
    shellLocalState,
    intentRuntime,
  });

  const markSearchSheetCloseMapExitSettled = React.useCallback(
    (closeIntentId: string) => {
      let shouldFinalize = false;
      const isActiveCloseIntent = intentRuntime.getActiveCloseIntentId() === closeIntentId;
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseMapExitSettled({
          current,
          closeIntentId,
        });
        shouldFinalize = update.shouldFinalize;
        return update.nextState;
      });
      if (shouldFinalize || isActiveCloseIntent) {
        finalizeRuntime.finalizeCloseTransition(closeIntentId);
      }
    },
    [finalizeRuntime, intentRuntime, shellLocalState]
  );

  const markSearchSheetCloseCollapsedReached = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      shellLocalState.setSearchCloseTransitionState((current) =>
        applySearchCloseCollapsedReached({
          current,
          closeIntentId: intentRuntime.getActiveCloseIntentId(),
          snap,
        })
      );
    },
    [intentRuntime, shellLocalState]
  );

  const markSearchSheetCloseSheetSettled = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      const activeCloseIntentId = intentRuntime.getActiveCloseIntentId();
      if (!activeCloseIntentId || snap !== 'collapsed') {
        return;
      }
      intentRuntime.commitArmedSearchCloseRestore(commitSearchCloseRestore);
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
        finalizeRuntime.finalizeCloseTransition(activeCloseIntentId);
      }
    },
    [commitSearchCloseRestore, finalizeRuntime, intentRuntime, shellLocalState]
  );

  const closeTransitionActions = React.useMemo(
    () => ({
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseSheetSettled,
      cancelSearchSheetCloseTransition: finalizeRuntime.cancelSearchSheetCloseTransition,
    }),
    [
      finalizeRuntime.cancelSearchSheetCloseTransition,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseSheetSettled,
    ]
  );

  return React.useMemo(
    () => ({
      closeTransitionActions,
      beginCloseTransition: intentRuntime.beginCloseTransition,
      setPendingCloseIntentId: intentRuntime.setPendingCloseIntentId,
      matchesPendingCloseIntentId: intentRuntime.matchesPendingCloseIntentId,
    }),
    [
      closeTransitionActions,
      intentRuntime.beginCloseTransition,
      intentRuntime.matchesPendingCloseIntentId,
      intentRuntime.setPendingCloseIntentId,
    ]
  );
};
