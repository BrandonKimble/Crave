import React from 'react';

import type { OverlayKey } from '../../../../overlays/types';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationCloseTransitionStateRuntime } from './use-results-presentation-close-transition-state-runtime';

// LEG-4 NOTE (plans/toggle-strip-rebuild-ledger.md §Leg 4): the close-SEARCH-CLEANUP
// runtime that used to be composed here was DELETED as dead code. Its schedule entry
// point lost its last caller in 9fa642d7 (the S-C.5 close rebuild): every dismissal
// shape now reaches `clearSearchState` — a strict superset of the old cleanup body —
// either directly (motionless pop exits) or via `finalizeCloseSearch` (terminal home
// dismissals). A cleanup hook that can never fire is a latent-bug factory, not a
// safety net.

type UseResultsPresentationCloseTransitionRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

/** Owned here now: this shape used to live only inside the deleted repacker module. */
type ResultsPresentationCloseTransitionRuntime = {
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

export const useResultsPresentationCloseTransitionRuntime = ({
  clearSearchState,
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionRuntimeArgs): ResultsPresentationCloseTransitionRuntime => {
  const closeTransitionStateRuntime = useResultsPresentationCloseTransitionStateRuntime({
    clearSearchState,
    shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });

  return React.useMemo<ResultsPresentationCloseTransitionRuntime>(
    () => ({
        closeTransitionActions: closeTransitionStateRuntime.closeTransitionActions,
        beginCloseTransition: closeTransitionStateRuntime.beginCloseTransition,
        setPendingCloseIntentId: closeTransitionStateRuntime.setPendingCloseIntentId,
        matchesPendingCloseIntentId: closeTransitionStateRuntime.matchesPendingCloseIntentId,
      }),
    [
      closeTransitionStateRuntime.beginCloseTransition,
      closeTransitionStateRuntime.closeTransitionActions,
      closeTransitionStateRuntime.matchesPendingCloseIntentId,
      closeTransitionStateRuntime.setPendingCloseIntentId,
    ]
  );
};
