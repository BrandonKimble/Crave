import React from 'react';

import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { OverlayKey } from '../../../../overlays/types';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { createSearchCloseTransitionState } from './results-presentation-shell-close-transition-state';

type UseResultsPresentationCloseTransitionIntentRuntimeArgs = {
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
  finalizedCloseIntentIdRef: React.MutableRefObject<string | null>;
  pendingCloseIntentIdRef: React.MutableRefObject<string | null>;
};

export const useResultsPresentationCloseTransitionIntentRuntime = ({
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionIntentRuntimeArgs): ResultsPresentationCloseTransitionIntentRuntime => {
  const pendingCloseIntentIdRef = React.useRef<string | null>(null);
  const activeCloseIntentIdRef = React.useRef<string | null>(null);
  const finalizedCloseIntentIdRef = React.useRef<string | null>(null);

  const setPendingCloseIntentId = React.useCallback((intentId: string | null) => {
    pendingCloseIntentIdRef.current = intentId;
  }, []);

  const matchesPendingCloseIntentId = React.useCallback((intentId: string) => {
    return pendingCloseIntentIdRef.current === intentId;
  }, []);

  const resetCloseTransition = React.useCallback(() => {
    activeCloseIntentIdRef.current = null;
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
      // S-C.4 item 3 step 2: the old ARM (origin capture into the store ledger) is gone —
      // the terminal dance only serves HOME dismissals now (children/non-search roots pop
      // via entry origins in the dismiss selector), and the home restore rides the dismiss
      // verb's ONE terminalDismiss switch. Nothing to arm, nothing to flush at finalize.
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
    [routeSceneVisibilityPolicyRuntime, shellLocalState]
  );

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
      finalizedCloseIntentIdRef,
      pendingCloseIntentIdRef,
    }),
    [
      beginCloseTransition,
      getActiveCloseIntentId,
      matchesPendingCloseIntentId,
      resetCloseTransition,
      setPendingCloseIntentId,
    ]
  );
};
