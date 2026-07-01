import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
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
        // Phase 5 (canonical-sheet-transition-master-plan §4 Failure 4) — flush the origin
        // restore for EVERY terminal dismiss, including profile/restaurant. The old
        // `terminalDismissSource !== 'profile'` skip meant a restaurant-from-comment dismiss
        // ran NO restore at all (neither flushPendingSearchOriginRestore NOR the default),
        // stranding the user on the docked-search HOME. flushPendingSearchOriginRestore now
        // re-pushes the captured pollDetail comment origin; the default fallback covers a
        // dismiss with no captured origin (e.g. a restaurant opened from a result card).
        const restored = flushPendingSearchOriginRestore();
        if (!restored) {
          requestDefaultPostSearchRestore();
        }
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
