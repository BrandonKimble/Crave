import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { createPreparedResultsExitSnapshot } from './prepared-presentation-transaction';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import { useResultsPreparedExitSnapshotExecutionRuntime } from './use-results-prepared-exit-snapshot-execution-runtime';

type UseResultsPresentationCloseActionsRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  handleCloseResultsUiReset: () => void;
  resultsSheetRuntime: Pick<AppRouteResultsSheetRuntimeOwner, 'animateSheetTo' | 'sheetState'>;
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  scheduleCloseSearchCleanup: (closeIntentId: string) => void;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (closeIntentId: string) => void;
  markSearchSheetCloseSheetSettled: (
    snap: Exclude<import('../../../../overlays/types').OverlaySheetSnap, 'hidden'>
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

type ResultsPresentationCloseActionsRuntime = {
  requestClosePresentationIntent: () => string | null;
  beginCloseSearch: () => void;
  handleCloseResults: () => void;
  cancelCloseSearch: (intentId?: string) => void;
};

export const useResultsPresentationCloseActionsRuntime = ({
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
  markSearchSheetCloseSheetSettled,
  cancelSearchSheetCloseTransition,
}: UseResultsPresentationCloseActionsRuntimeArgs): ResultsPresentationCloseActionsRuntime => {
  const preparedResultsExitTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsExitTransactionId = React.useCallback((): string => {
    preparedResultsExitTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsExitTransactionSeqRef.current}`;
  }, []);

  const executePreparedExitSnapshot = useResultsPreparedExitSnapshotExecutionRuntime({
    resultsRuntimeOwner,
    animateSheetTo: resultsSheetRuntime.animateSheetTo,
    getCurrentSheetSnap: () => resultsSheetRuntime.sheetState,
    setDisplayQueryOverride: shellLocalState.setDisplayQueryOverride,
    beginCloseTransition,
    markSearchSheetCloseSheetSettled,
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

  const handleCloseResults = React.useCallback(() => {
    beginCloseSearch();
  }, [beginCloseSearch]);

  return React.useMemo(
    () => ({
      requestClosePresentationIntent,
      beginCloseSearch,
      handleCloseResults,
      cancelCloseSearch,
    }),
    [beginCloseSearch, cancelCloseSearch, handleCloseResults, requestClosePresentationIntent]
  );
};
