import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import {
  createPreparedResultsEnterSnapshot,
  createPreparedResultsExitSnapshot,
  resolvePreparedResultsEnterCoverState,
} from './prepared-presentation-transaction';
import type { ResultsPresentationActions } from './results-presentation-shell-runtime-contract';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import { resolvePreparedResultsEnterMutationKind } from './results-presentation-shell-prepared-intent';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import { useResultsPreparedEnterSnapshotExecutionRuntime } from './use-results-prepared-enter-snapshot-execution-runtime';
import { useResultsPreparedExitSnapshotExecutionRuntime } from './use-results-prepared-exit-snapshot-execution-runtime';
import { useResultsPreparedSnapshotShellApplicationRuntime } from './use-results-prepared-snapshot-shell-application-runtime';

type UseResultsPresentationOwnerPresentationActionsRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  handleCloseResultsUiReset: () => void;
  resultsSheetRuntime: Pick<
    ResultsSheetRuntimeOwner,
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  > &
    Pick<ResultsSheetRuntimeOwner, 'snapPoints'>;
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  scheduleCloseSearchCleanup: (closeIntentId: string) => void;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (closeIntentId: string) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

export const useResultsPresentationOwnerPresentationActionsRuntime = ({
  clearTypedQuery,
  submittedQuery,
  isSearchSessionActive,
  hasResults,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  handleCloseResultsUiReset,
  resultsSheetRuntime,
  shellLocalState,
  resultsRuntimeOwner,
  scheduleCloseSearchCleanup,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
  beginCloseTransition,
  cancelSearchSheetCloseTransition,
}: UseResultsPresentationOwnerPresentationActionsRuntimeArgs): ResultsPresentationActions => {
  const preparedResultsExitTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsExitTransactionId = React.useCallback((): string => {
    preparedResultsExitTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsExitTransactionSeqRef.current}`;
  }, []);

  const executePreparedExitSnapshot = useResultsPreparedExitSnapshotExecutionRuntime({
    resultsRuntimeOwner,
    animateSheetTo: resultsSheetRuntime.animateSheetTo,
    setDisplayQueryOverride: shellLocalState.setDisplayQueryOverride,
    beginCloseTransition,
  });

  const requestClosePresentationIntent = React.useCallback(
    () =>
      executePreparedExitSnapshot(
        createPreparedResultsExitSnapshot(nextPreparedResultsExitTransactionId())
      ),
    [executePreparedExitSnapshot, nextPreparedResultsExitTransactionId]
  );

  const cancelCloseSearch = React.useCallback(
    (intentId?: string) => {
      if (intentId != null && !matchesPendingCloseIntentId(intentId)) {
        return;
      }
      setPendingCloseIntentId(null);
      cancelCloseSearchCleanup();
      isClearingSearchRef.current = false;
      resultsRuntimeOwner.clearStagedPreparedResultsSnapshot(intentId);
      cancelSearchSheetCloseTransition(intentId);
      resultsRuntimeOwner.cancelPresentationIntent(intentId);
    },
    [
      cancelCloseSearchCleanup,
      cancelSearchSheetCloseTransition,
      isClearingSearchRef,
      matchesPendingCloseIntentId,
      resultsRuntimeOwner,
      setPendingCloseIntentId,
    ]
  );

  const beginCloseSearch = React.useCallback(() => {
    const hasSearchToClose = isSearchSessionActive || hasResults || submittedQuery.length > 0;
    if (!hasSearchToClose) {
      clearTypedQuery();
      return;
    }

    ignoreNextSearchBlurRef.current = true;
    resultsRuntimeOwner.clearStagedPreparedResultsSnapshot();
    const closeIntentId = requestClosePresentationIntent() ?? '';
    isClearingSearchRef.current = true;
    handleCloseResultsUiReset();
    scheduleCloseSearchCleanup(closeIntentId);
  }, [
    clearTypedQuery,
    handleCloseResultsUiReset,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    isSearchSessionActive,
    requestClosePresentationIntent,
    resultsRuntimeOwner,
    scheduleCloseSearchCleanup,
    submittedQuery.length,
  ]);

  const preparedResultsTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsTransactionId = React.useCallback((): string => {
    preparedResultsTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsTransactionSeqRef.current}`;
  }, []);

  const requestEditingPresentationIntent = React.useCallback(
    (intent: Extract<SearchPresentationIntent, { kind: 'focus_editing' | 'exit_editing' }>) => {
      shellLocalState.setInputMode(intent.kind === 'focus_editing' ? 'editing' : 'idle');
      return null;
    },
    [shellLocalState]
  );

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

  const requestSearchPresentationIntent = React.useCallback(
    (intent: SearchPresentationIntent) => {
      switch (intent.kind) {
        case 'focus_editing':
        case 'exit_editing':
          return requestEditingPresentationIntent(intent);
        case 'close':
          return requestClosePresentationIntent();
        default:
          return requestEnterPresentationIntent(intent);
      }
    },
    [
      requestClosePresentationIntent,
      requestEditingPresentationIntent,
      requestEnterPresentationIntent,
    ]
  );

  const handleCloseResults = React.useCallback(() => {
    beginCloseSearch();
  }, [beginCloseSearch]);

  return React.useMemo(
    () => ({
      requestSearchPresentationIntent,
      beginCloseSearch,
      handleCloseResults,
      cancelCloseSearch,
    }),
    [beginCloseSearch, cancelCloseSearch, handleCloseResults, requestSearchPresentationIntent]
  );
};
