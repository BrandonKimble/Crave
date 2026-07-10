import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { ResultsPresentationCloseTransitionIntentRuntime } from './use-results-presentation-close-transition-intent-runtime';

type UseResultsPresentationCloseTransitionFinalizeRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  shellLocalState: ResultsPresentationShellLocalState;
  intentRuntime: Pick<
    ResultsPresentationCloseTransitionIntentRuntime,
    | 'pendingCloseIntentIdRef'
    | 'finalizedCloseIntentIdRef'
    | 'resetCloseTransition'
    | 'getActiveCloseIntentId'
  >;
};

export type ResultsPresentationCloseTransitionFinalizeRuntime = {
  finalizeCloseTransition: (closeIntentId: string) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

export const useResultsPresentationCloseTransitionFinalizeRuntime = ({
  clearSearchState,
  shellLocalState,
  intentRuntime,
}: UseResultsPresentationCloseTransitionFinalizeRuntimeArgs): ResultsPresentationCloseTransitionFinalizeRuntime => {
  const finalizeCloseSearch = React.useCallback(
    (intentId: string, terminalDismissSource: 'results' | 'profile') => {
      if (intentRuntime.pendingCloseIntentIdRef.current !== intentId) {
        return false;
      }

      clearSearchState({
        skipPostSearchRestore: true,
        preserveForegroundEditing: shellLocalState.inputMode === 'editing',
        skipProfileDismissClear: terminalDismissSource !== 'profile',
      });
      intentRuntime.pendingCloseIntentIdRef.current = null;
      return true;
    },
    [clearSearchState, intentRuntime, shellLocalState.inputMode]
  );

  const finalizeCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (intentRuntime.finalizedCloseIntentIdRef.current === closeIntentId) {
        return;
      }

      intentRuntime.finalizedCloseIntentIdRef.current = closeIntentId;
      unstable_batchedUpdates(() => {
        const terminalDismissSource =
          shellLocalState.searchCloseTransitionState?.closeIntentId === closeIntentId
            ? shellLocalState.searchCloseTransitionState.terminalDismissSource
            : 'results';
        const didFinalizeCloseSearch = finalizeCloseSearch(closeIntentId, terminalDismissSource);
        if (!didFinalizeCloseSearch) {
          intentRuntime.resetCloseTransition();
          return;
        }
        getSearchSurfaceRuntime().completeDismissHandoff(closeIntentId);
        // S-C.4 item 3 step 2: NO restore emission here — the home landing already rode the
        // dismiss verb's ONE terminalDismiss switch (targetSceneKey 'search', docked-polls
        // mode). The old flush/default pair (and the ledger they read) is deleted; children
        // and non-search roots never reach this dance (the dismiss selector pops them).
        intentRuntime.resetCloseTransition();
      });
    },
    [finalizeCloseSearch, intentRuntime, shellLocalState.searchCloseTransitionState]
  );

  const cancelSearchSheetCloseTransition = React.useCallback(
    (closeIntentId?: string) => {
      const activeCloseIntentId = intentRuntime.getActiveCloseIntentId();
      if (
        closeIntentId != null &&
        activeCloseIntentId != null &&
        activeCloseIntentId !== closeIntentId
      ) {
        return;
      }

      intentRuntime.resetCloseTransition();
      shellLocalState.setHoldPersistentPollLane(false);
    },
    [intentRuntime, shellLocalState]
  );

  return React.useMemo(
    () => ({
      finalizeCloseTransition,
      cancelSearchSheetCloseTransition,
    }),
    [cancelSearchSheetCloseTransition, finalizeCloseTransition]
  );
};
