import React from 'react';

import {
  createSearchSurfaceResultsEnterTransaction,
  resolveSearchSurfaceResultsEnterCoverState,
} from './search-surface-results-transaction';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import { resolveSearchSurfaceResultsEnterMutationKind } from './results-presentation-shell-transaction-intent';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsSurfaceEnterTransactionExecutionRuntime } from './use-search-surface-results-enter-transaction-execution-runtime';
import { useResultsSurfaceTransactionShellApplicationRuntime } from './use-search-surface-results-transaction-shell-application-runtime';

type UseResultsPresentationEnterActionsRuntimeArgs = {
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    'prepareShortcutSheetTransition'
  >;
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationEnterActionsRuntime = {
  requestEnterPresentationIntent: (
    intent: Exclude<
      SearchPresentationIntent,
      { kind: 'focus_editing' | 'exit_editing' | 'close' }
    >
  ) => string;
};

export const useResultsPresentationEnterActionsRuntime = ({
  resultsSheetRuntime,
  shellLocalState,
  resultsRuntimeOwner,
  cancelSearchSheetCloseTransition,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationEnterActionsRuntimeArgs): ResultsPresentationEnterActionsRuntime => {
  const searchSurfaceResultsTransactionSeqRef = React.useRef(0);
  const nextSearchSurfaceResultsTransactionId = React.useCallback((): string => {
    searchSurfaceResultsTransactionSeqRef.current += 1;
    return `search-surface-results-transaction:${searchSurfaceResultsTransactionSeqRef.current}`;
  }, []);

  const applySurfaceTransactionShell = useResultsSurfaceTransactionShellApplicationRuntime({
    cancelSearchSheetCloseTransition,
    routeSceneVisibilityPolicyRuntime,
    setBackdropTarget: shellLocalState.setBackdropTarget,
    setInputMode: shellLocalState.setInputMode,
  });

  const executeSurfaceEnterTransaction = useResultsSurfaceEnterTransactionExecutionRuntime({
    resultsRuntimeOwner,
    prepareShortcutSheetTransition: resultsSheetRuntime.prepareShortcutSheetTransition,
    setDisplayQueryOverride: shellLocalState.setDisplayQueryOverride,
  });

  const requestEnterPresentationIntent = React.useCallback(
    (
      intent: Exclude<
        SearchPresentationIntent,
        { kind: 'focus_editing' | 'exit_editing' | 'close' }
      >
    ) => {
      const preserveSheetState = intent.preserveSheetState === true;
      const shouldPrepareShortcutSheetTransition =
        !preserveSheetState &&
        (intent.transitionFromDockedPolls === true || intent.kind === 'shortcut_submit');
      const snapshot = createSearchSurfaceResultsEnterTransaction(
        intent.transactionId ?? nextSearchSurfaceResultsTransactionId(),
        resolveSearchSurfaceResultsEnterMutationKind(intent.kind),
        resolveSearchSurfaceResultsEnterCoverState(preserveSheetState)
      );

      cancelCloseSearchCleanup();
      setPendingCloseIntentId(null);
      applySurfaceTransactionShell(snapshot);
      return executeSurfaceEnterTransaction({
        snapshot,
        displayQueryOverride: intent.query,
        preserveSheetState,
        shouldPrepareShortcutSheetTransition,
        entrySurface: intent.entrySurface,
      });
    },
    [
      applySurfaceTransactionShell,
      cancelCloseSearchCleanup,
      executeSurfaceEnterTransaction,
      nextSearchSurfaceResultsTransactionId,
      setPendingCloseIntentId,
    ]
  );

  return React.useMemo(
    () => ({
      requestEnterPresentationIntent,
    }),
    [requestEnterPresentationIntent]
  );
};
