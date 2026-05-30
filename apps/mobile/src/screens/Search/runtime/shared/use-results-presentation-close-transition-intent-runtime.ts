import React from 'react';

import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { OverlayKey } from '../../../../overlays/types';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { createSearchCloseTransitionState } from './results-presentation-shell-close-transition-state';

type UseResultsPresentationCloseTransitionIntentRuntimeArgs = {
  armSearchCloseRestore: (
    options?: import('./results-presentation-shell-runtime-contract').ArmSearchCloseRestoreOptions
  ) => boolean;
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export type ResultsPresentationCloseTransitionIntentRuntime = {
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  getActiveCloseIntentId: () => string | null;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      terminalDismissSource?: 'results' | 'profile';
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  resetCloseTransition: () => void;
  commitArmedSearchCloseRestore: (commitSearchCloseRestore: () => boolean) => void;
  cancelArmedSearchCloseRestore: () => void;
  finalizedCloseIntentIdRef: React.MutableRefObject<string | null>;
  pendingCloseIntentIdRef: React.MutableRefObject<string | null>;
};

export const useResultsPresentationCloseTransitionIntentRuntime = ({
  armSearchCloseRestore,
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionIntentRuntimeArgs): ResultsPresentationCloseTransitionIntentRuntime => {
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
    routeSceneVisibilityPolicyRuntime.updateCloseTransitionActive(false);
    shellLocalState.setSearchCloseTransitionState(null);
  }, [routeSceneVisibilityPolicyRuntime, shellLocalState]);

  const beginCloseTransition = React.useCallback(
    (
      closeIntentId: string,
      options?: {
        terminalDismissSource?: 'results' | 'profile';
        outgoingSheetSceneKey?: OverlayKey | null;
      }
    ) => {
      if (activeCloseIntentIdRef.current === closeIntentId) {
        return;
      }

      const terminalDismissSource = options?.terminalDismissSource ?? 'results';
      activeCloseIntentIdRef.current = closeIntentId;
      finalizedCloseIntentIdRef.current = null;
      hasArmedRestoreRef.current =
        terminalDismissSource === 'profile'
          ? false
          : armSearchCloseRestore({
              allowFallback: true,
              searchRootRestoreSnap: 'collapsed',
            });
      hasCommittedRestoreRef.current = false;
      shellLocalState.setHoldPersistentPollLane(false);
      shellLocalState.setBackdropTarget('default');
      shellLocalState.setInputMode('idle');
      routeSceneVisibilityPolicyRuntime.updateCloseTransitionActive(true);
      const nextCloseTransitionState = createSearchCloseTransitionState(
        closeIntentId,
        terminalDismissSource
      );
      shellLocalState.setSearchCloseTransitionState(nextCloseTransitionState);
    },
    [armSearchCloseRestore, routeSceneVisibilityPolicyRuntime, shellLocalState]
  );

  const commitArmedSearchCloseRestore = React.useCallback(
    (commitSearchCloseRestore: () => boolean) => {
      if (hasArmedRestoreRef.current && !hasCommittedRestoreRef.current) {
        hasCommittedRestoreRef.current = commitSearchCloseRestore();
      }
    },
    []
  );

  const cancelArmedSearchCloseRestore = React.useCallback(() => {
    hasArmedRestoreRef.current = false;
    hasCommittedRestoreRef.current = false;
  }, []);

  const getActiveCloseIntentId = React.useCallback(() => {
    return activeCloseIntentIdRef.current;
  }, []);

  return React.useMemo(
    () => ({
      setPendingCloseIntentId,
      matchesPendingCloseIntentId,
      getActiveCloseIntentId,
      beginCloseTransition,
      resetCloseTransition,
      commitArmedSearchCloseRestore,
      cancelArmedSearchCloseRestore,
      finalizedCloseIntentIdRef,
      pendingCloseIntentIdRef,
    }),
    [
      beginCloseTransition,
      cancelArmedSearchCloseRestore,
      commitArmedSearchCloseRestore,
      getActiveCloseIntentId,
      matchesPendingCloseIntentId,
      resetCloseTransition,
      setPendingCloseIntentId,
    ]
  );
};
