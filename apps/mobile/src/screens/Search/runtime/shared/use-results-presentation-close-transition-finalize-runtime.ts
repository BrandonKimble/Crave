import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { ResultsPresentationCloseTransitionIntentRuntime } from './use-results-presentation-close-transition-intent-runtime';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

type UseResultsPresentationCloseTransitionFinalizeRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: (options?: { mode?: 'full' | 'chrome-only' }) => void;
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
        if (terminalDismissSource === 'profile') {
          requestDefaultPostSearchRestore({ mode: 'chrome-only' });
        } else {
          const restored = flushPendingSearchOriginRestore();
          if (!restored) {
            requestDefaultPostSearchRestore();
          }
        }
        getSearchSurfaceRuntime().resetToPollPage();
        intentRuntime.resetCloseTransition();
      });
    },
    [
      finalizeCloseSearch,
      flushPendingSearchOriginRestore,
      intentRuntime,
      requestDefaultPostSearchRestore,
      shellLocalState.searchCloseTransitionState,
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
