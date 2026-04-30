import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { ResultsPresentationCloseTransitionIntentRuntime } from './use-results-presentation-close-transition-intent-runtime';

type UseResultsPresentationCloseTransitionFinalizeRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  cancelSearchCloseRestore: () => void;
  shellLocalState: ResultsPresentationShellLocalState;
  intentRuntime: Pick<
    ResultsPresentationCloseTransitionIntentRuntime,
    | 'pendingCloseIntentIdRef'
    | 'finalizedCloseIntentIdRef'
    | 'resetCloseTransition'
    | 'getActiveCloseIntentId'
    | 'cancelArmedSearchCloseRestore'
  >;
};

export type ResultsPresentationCloseTransitionFinalizeRuntime = {
  finalizeCloseTransition: (closeIntentId: string) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

export const useResultsPresentationCloseTransitionFinalizeRuntime = ({
  clearSearchState,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  cancelSearchCloseRestore,
  shellLocalState,
  intentRuntime,
}: UseResultsPresentationCloseTransitionFinalizeRuntimeArgs): ResultsPresentationCloseTransitionFinalizeRuntime => {
  const finalizeCloseSearch = React.useCallback(
    (intentId: string) => {
      if (intentRuntime.pendingCloseIntentIdRef.current !== intentId) {
        return;
      }

      clearSearchState({
        skipProfileDismissWait: true,
        skipPostSearchRestore: true,
        preserveForegroundEditing: shellLocalState.inputMode === 'editing',
      });
      intentRuntime.pendingCloseIntentIdRef.current = null;
    },
    [clearSearchState, intentRuntime, shellLocalState.inputMode]
  );

  const finalizeCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (intentRuntime.finalizedCloseIntentIdRef.current === closeIntentId) {
        return;
      }

      intentRuntime.finalizedCloseIntentIdRef.current = closeIntentId;
      finalizeCloseSearch(closeIntentId);
      const restored = flushPendingSearchOriginRestore();
      if (!restored) {
        requestDefaultPostSearchRestore();
      }
      intentRuntime.resetCloseTransition();
    },
    [
      finalizeCloseSearch,
      flushPendingSearchOriginRestore,
      intentRuntime,
      requestDefaultPostSearchRestore,
    ]
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

      cancelSearchCloseRestore();
      intentRuntime.cancelArmedSearchCloseRestore();
      intentRuntime.resetCloseTransition();
      shellLocalState.setHoldPersistentPollLane(false);
    },
    [cancelSearchCloseRestore, intentRuntime, shellLocalState]
  );

  return React.useMemo(
    () => ({
      finalizeCloseTransition,
      cancelSearchSheetCloseTransition,
    }),
    [cancelSearchSheetCloseTransition, finalizeCloseTransition]
  );
};
