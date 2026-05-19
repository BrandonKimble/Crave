import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { createSearchSurfaceResultsExitTransaction } from './search-surface-results-transaction';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useResultsSurfaceExitTransactionExecutionRuntime } from './use-search-surface-results-exit-transaction-execution-runtime';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

type UseResultsPresentationCloseActionsRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  prepareRestaurantProfileForTerminalSearchDismissRef: React.MutableRefObject<() => void>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<AppRouteResultsSheetRuntimeOwner, 'sheetState'>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (
    closeIntentId: string,
    options?: { terminalDismissSource?: 'results' | 'profile' }
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

type ResultsPresentationCloseActionsRuntime = {
  requestClosePresentationIntent: (terminalDismissSource?: 'results' | 'profile') => string | null;
  beginCloseSearch: () => void;
  handleCloseResults: () => void;
  cancelCloseSearch: (intentId?: string) => void;
};

export const useResultsPresentationCloseActionsRuntime = ({
  clearTypedQuery,
  submittedQuery,
  isSearchSessionActive,
  hasResults,
  profilePresentationActiveRef,
  prepareRestaurantProfileForTerminalSearchDismissRef,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  resultsSheetRuntime,
  resultsRuntimeOwner,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
  beginCloseTransition,
  cancelSearchSheetCloseTransition,
}: UseResultsPresentationCloseActionsRuntimeArgs): ResultsPresentationCloseActionsRuntime => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const searchSurfaceResultsExitTransactionSeqRef = React.useRef(0);
  const nextSearchSurfaceResultsExitTransactionId = React.useCallback((): string => {
    searchSurfaceResultsExitTransactionSeqRef.current += 1;
    return `search-surface-results-transaction:${searchSurfaceResultsExitTransactionSeqRef.current}`;
  }, []);

  const executeSurfaceExitTransaction = useResultsSurfaceExitTransactionExecutionRuntime({
    getCurrentSheetSnap: () => resultsSheetRuntime.sheetState,
    beginCloseTransition,
    resultsRuntimeOwner,
  });

  const requestClosePresentationIntent = React.useCallback(
    (terminalDismissSource: 'results' | 'profile' = 'results') =>
      executeSurfaceExitTransaction(
        createSearchSurfaceResultsExitTransaction(
          nextSearchSurfaceResultsExitTransactionId(),
          terminalDismissSource
        )
      ),
    [executeSurfaceExitTransaction, nextSearchSurfaceResultsExitTransactionId]
  );

  const cancelCloseSearch = React.useCallback(
    (intentId?: string) => {
      if (intentId != null && !matchesPendingCloseIntentId(intentId)) {
        return;
      }
      setPendingCloseIntentId(null);
      cancelCloseSearchCleanup();
      isClearingSearchRef.current = false;
      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction(intentId);
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
    const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
    const hasVisibleSearchSurface =
      surfaceSnapshot.activeBundle.kind === 'results' ||
      surfaceSnapshot.heldBundle != null ||
      surfaceSnapshot.redrawTransaction != null ||
      surfaceSnapshot.dismissTransaction != null;
    const hasSearchToClose =
      isSearchSessionActive ||
      hasResults ||
      submittedQuery.length > 0 ||
      profilePresentationActiveRef.current ||
      hasVisibleSearchSurface;
    if (!hasSearchToClose) {
      clearTypedQuery();
      return;
    }

    ignoreNextSearchBlurRef.current = true;
    unstable_batchedUpdates(() => {
      clearTypedQuery();
      isClearingSearchRef.current = true;
      const terminalDismissSource =
        profilePresentationActiveRef.current ||
        routeSceneRuntime.routeSceneSwitchRuntime.getRouteState().activeOverlayRoute.key ===
          'restaurant'
          ? 'profile'
          : 'results';
      if (terminalDismissSource === 'profile') {
        prepareRestaurantProfileForTerminalSearchDismissRef.current();
      }
      const closeIntentId = requestClosePresentationIntent(terminalDismissSource);
      if (!closeIntentId) {
        return;
      }

      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
      setPendingCloseIntentId(closeIntentId);
    });
  }, [
    clearTypedQuery,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    isSearchSessionActive,
    prepareRestaurantProfileForTerminalSearchDismissRef,
    profilePresentationActiveRef,
    requestClosePresentationIntent,
    routeSceneRuntime,
    resultsSheetRuntime,
    resultsRuntimeOwner,
    setPendingCloseIntentId,
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
