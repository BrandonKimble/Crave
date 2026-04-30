import React from 'react';

import {
  createPreparedResultsEnterSnapshot,
  resolvePreparedResultsEnterCoverState,
} from './prepared-presentation-transaction';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import { resolvePreparedResultsEnterMutationKind } from './results-presentation-shell-prepared-intent';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import { useResultsPreparedEnterSnapshotExecutionRuntime } from './use-results-prepared-enter-snapshot-execution-runtime';
import { useResultsPreparedSnapshotShellApplicationRuntime } from './use-results-prepared-snapshot-shell-application-runtime';

type UseResultsPresentationEnterActionsRuntimeArgs = {
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    'animateSheetTo' | 'prepareShortcutSheetTransition'
  >;
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
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
}: UseResultsPresentationEnterActionsRuntimeArgs): ResultsPresentationEnterActionsRuntime => {
  const preparedResultsTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsTransactionId = React.useCallback((): string => {
    preparedResultsTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsTransactionSeqRef.current}`;
  }, []);

  const applyPreparedSnapshotShell = useResultsPreparedSnapshotShellApplicationRuntime({
    cancelSearchSheetCloseTransition,
    setBackdropTarget: shellLocalState.setBackdropTarget,
    setInputMode: shellLocalState.setInputMode,
  });

  const executePreparedEnterSnapshot = useResultsPreparedEnterSnapshotExecutionRuntime({
    resultsRuntimeOwner,
    animateSheetTo: resultsSheetRuntime.animateSheetTo,
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
      const shouldPrepareShortcutSheetTransition =
        intent.preserveSheetState !== true && intent.transitionFromDockedPolls === true;
      const preserveSheetState = intent.preserveSheetState === true;
      const snapshot = createPreparedResultsEnterSnapshot(
        intent.transactionId ?? nextPreparedResultsTransactionId(),
        resolvePreparedResultsEnterMutationKind(intent.kind),
        resolvePreparedResultsEnterCoverState(preserveSheetState)
      );

      applyPreparedSnapshotShell(snapshot);
      return executePreparedEnterSnapshot({
        snapshot,
        displayQueryOverride: intent.query,
        preserveSheetState,
        shouldPrepareShortcutSheetTransition,
      });
    },
    [applyPreparedSnapshotShell, executePreparedEnterSnapshot, nextPreparedResultsTransactionId]
  );

  return React.useMemo(
    () => ({
      requestEnterPresentationIntent,
    }),
    [requestEnterPresentationIntent]
  );
};
