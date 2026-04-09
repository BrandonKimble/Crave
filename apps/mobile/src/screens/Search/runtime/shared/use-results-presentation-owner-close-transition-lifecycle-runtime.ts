import React from 'react';

import { createSearchCloseTransitionState } from './results-presentation-shell-close-transition-state';
import type { UseResultsPresentationOwnerActionRuntimeArgs } from './results-presentation-owner-action-runtime-contract';

type ResultsPresentationOwnerCloseTransitionLifecycleRuntime = {
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (closeIntentId: string) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
  getActiveCloseIntentId: () => string | null;
  commitArmedSearchCloseRestore: () => void;
  finalizeCloseTransition: (closeIntentId: string) => void;
};

type UseResultsPresentationOwnerCloseTransitionLifecycleRuntimeArgs = Pick<
  UseResultsPresentationOwnerActionRuntimeArgs<never>,
  | 'clearSearchState'
  | 'armSearchCloseRestore'
  | 'commitSearchCloseRestore'
  | 'cancelSearchCloseRestore'
  | 'flushPendingSearchOriginRestore'
  | 'requestDefaultPostSearchRestore'
  | 'shellLocalState'
>;

export const useResultsPresentationOwnerCloseTransitionLifecycleRuntime = ({
  clearSearchState,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  shellLocalState,
}: UseResultsPresentationOwnerCloseTransitionLifecycleRuntimeArgs): ResultsPresentationOwnerCloseTransitionLifecycleRuntime => {
  const pendingCloseIntentIdRef = React.useRef<string | null>(null);
  const activeCloseIntentIdRef = React.useRef<string | null>(null);
  const hasArmedRestoreRef = React.useRef(false);
  const hasCommittedRestoreRef = React.useRef(false);
  const finalizedCloseIntentIdRef = React.useRef<string | null>(null);

  const setPendingCloseIntentId = React.useCallback((intentId: string | null) => {
    pendingCloseIntentIdRef.current = intentId;
  }, []);

  const matchesPendingCloseIntentId = React.useCallback((intentId: string) => {
    return pendingCloseIntentIdRef.current === intentId;
  }, []);

  const resetCloseTransition = React.useCallback(() => {
    activeCloseIntentIdRef.current = null;
    hasArmedRestoreRef.current = false;
    hasCommittedRestoreRef.current = false;
    finalizedCloseIntentIdRef.current = null;
    shellLocalState.setSearchCloseTransitionState(null);
  }, [shellLocalState]);

  const finalizeCloseSearch = React.useCallback(
    (intentId: string) => {
      if (pendingCloseIntentIdRef.current !== intentId) {
        return;
      }
      clearSearchState({
        skipProfileDismissWait: true,
        skipPostSearchRestore: true,
        preserveForegroundEditing: shellLocalState.inputMode === 'editing',
      });
      pendingCloseIntentIdRef.current = null;
    },
    [clearSearchState, shellLocalState.inputMode]
  );

  const finalizeCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (finalizedCloseIntentIdRef.current === closeIntentId) {
        return;
      }
      finalizedCloseIntentIdRef.current = closeIntentId;
      finalizeCloseSearch(closeIntentId);
      const restored = flushPendingSearchOriginRestore();
      if (!restored) {
        requestDefaultPostSearchRestore();
      }
      resetCloseTransition();
    },
    [
      finalizeCloseSearch,
      flushPendingSearchOriginRestore,
      requestDefaultPostSearchRestore,
      resetCloseTransition,
    ]
  );

  const beginCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (activeCloseIntentIdRef.current === closeIntentId) {
        return;
      }
      activeCloseIntentIdRef.current = closeIntentId;
      finalizedCloseIntentIdRef.current = null;
      hasArmedRestoreRef.current = armSearchCloseRestore({
        allowFallback: true,
        searchRootRestoreSnap: 'collapsed',
      });
      hasCommittedRestoreRef.current = false;
      shellLocalState.setHoldPersistentPollLane(false);
      shellLocalState.setSearchCloseTransitionState(
        createSearchCloseTransitionState(closeIntentId)
      );
    },
    [armSearchCloseRestore, shellLocalState]
  );

  const commitArmedSearchCloseRestore = React.useCallback(() => {
    if (hasArmedRestoreRef.current && !hasCommittedRestoreRef.current) {
      hasCommittedRestoreRef.current = commitSearchCloseRestore();
    }
  }, [commitSearchCloseRestore]);

  const cancelSearchSheetCloseTransition = React.useCallback(
    (closeIntentId?: string) => {
      if (
        closeIntentId != null &&
        activeCloseIntentIdRef.current != null &&
        activeCloseIntentIdRef.current !== closeIntentId
      ) {
        return;
      }
      cancelSearchCloseRestore();
      resetCloseTransition();
      shellLocalState.setHoldPersistentPollLane(false);
    },
    [cancelSearchCloseRestore, resetCloseTransition, shellLocalState]
  );

  const getActiveCloseIntentId = React.useCallback(() => {
    return activeCloseIntentIdRef.current;
  }, []);

  return React.useMemo(
    () => ({
      setPendingCloseIntentId,
      matchesPendingCloseIntentId,
      beginCloseTransition,
      cancelSearchSheetCloseTransition,
      getActiveCloseIntentId,
      commitArmedSearchCloseRestore,
      finalizeCloseTransition,
    }),
    [
      beginCloseTransition,
      cancelSearchSheetCloseTransition,
      commitArmedSearchCloseRestore,
      finalizeCloseTransition,
      getActiveCloseIntentId,
      matchesPendingCloseIntentId,
      setPendingCloseIntentId,
    ]
  );
};
