import React from 'react';
import { unstable_batchedUpdates } from 'react-native';
import {
  resolveSessionDismissPlan,
  type SessionDismissPlan,
} from '../../../../navigation/runtime/app-overlay-route-stack-algebra';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { createSearchSurfaceResultsExitTransaction } from './search-surface-results-transaction';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useResultsSurfaceExitTransactionExecutionRuntime } from './use-search-surface-results-exit-transaction-execution-runtime';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import type { OverlayKey } from '../../../../overlays/types';

type UseResultsPresentationCloseActionsRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  clearSearchState: SearchClearOwner['clearSearchState'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<AppRouteSharedSheetRuntimeOwner, 'sheetState'>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

type ResultsPresentationCloseActionsRuntime = {
  requestClosePresentationIntent: (options?: {
    outgoingSheetSceneKey?: OverlayKey | null;
  }) => string | null;
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
  resultsSheetRuntime,
  resultsRuntimeOwner,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
  beginCloseTransition,
  cancelSearchSheetCloseTransition,
  clearSearchState,
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
    ({
      outgoingSheetSceneKey = 'search',
    }: {
      outgoingSheetSceneKey?: OverlayKey | null;
    } = {}) =>
      executeSurfaceExitTransaction(
        createSearchSurfaceResultsExitTransaction(
          nextSearchSurfaceResultsExitTransactionId(),
          outgoingSheetSceneKey
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
      isClearingSearchRef.current = false;
      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction(intentId);
      cancelSearchSheetCloseTransition(intentId);
      resultsRuntimeOwner.cancelPresentationIntent(intentId);
    },
    [
      cancelSearchSheetCloseTransition,
      isClearingSearchRef,
      matchesPendingCloseIntentId,
      resultsRuntimeOwner,
      setPendingCloseIntentId,
    ]
  );

  // S-C.5 item 1 — THE MOTIONLESS EXECUTOR (pop-shaped dismissals: a child beneath the
  // session or a non-search root). No dismissTransaction, no sheet slide: teardown rides the
  // popped entries (origins restore presentation; the restaurant pop-teardown writer owns the
  // profile; the results_exit commit below owns the NATIVE world teardown — gated on a world
  // existing, else the exit has no native ack source and the transport would park at
  // exit_requested until a future enter supersedes it).
  const executeMotionlessSessionExit = React.useCallback(
    (dismissPlan: Extract<SessionDismissPlan, { kind: 'popToEntry' | 'popToRoot' }>) => {
      ignoreNextSearchBlurRef.current = true;
      unstable_batchedUpdates(() => {
        clearSearchState({
          skipPostSearchRestore: true,
        });
        resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
        setPendingCloseIntentId(null);
        const surfaceSnapshotForExit = getSearchSurfaceRuntime().getSnapshot();
        const hasWorldToExit =
          surfaceSnapshotForExit.activeBundle.kind === 'results' ||
          surfaceSnapshotForExit.heldBundle != null ||
          surfaceSnapshotForExit.redrawTransaction != null;
        if (hasWorldToExit) {
          resultsRuntimeOwner.commitSearchSurfaceResultsExitTransaction(
            createSearchSurfaceResultsExitTransaction(
              nextSearchSurfaceResultsExitTransactionId(),
              null
            )
          );
        }
        if (dismissPlan.kind === 'popToEntry') {
          routeSceneRuntime.routeOverlayRouteCommandRuntime.popToEntryRoute(dismissPlan.entryId, {
            applyOriginDetent: true,
          });
        } else {
          routeSceneRuntime.routeOverlayRouteCommandRuntime.popToRootRoute({
            applyOriginDetent: true,
          });
        }
        getSearchSurfaceRuntime().finalizeSessionExitWithoutDismissMotion();
      });
    },
    [
      clearSearchState,
      ignoreNextSearchBlurRef,
      nextSearchSurfaceResultsExitTransactionId,
      resultsRuntimeOwner,
      routeSceneRuntime,
      setPendingCloseIntentId,
    ]
  );

  // S-C.5 item 1 — THE TERMINAL EXECUTOR (home-root dismissals): the ONE terminalDismiss
  // switch pops the session and lands the docked home directly (docked polls = presentation
  // mode of the search root); the dismiss-transaction choreography it arms owns the sheet
  // slide + the native map wire exit. Outgoing scene derives from the stack fact.
  const executeTerminalHomeDismiss = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    unstable_batchedUpdates(() => {
      clearTypedQuery();
      isClearingSearchRef.current = true;
      const activeRouteKey =
        routeSceneRuntime.routeSceneSwitchRuntime.getRouteState().activeOverlayRoute.key;
      const outgoingSheetSceneKey: OverlayKey =
        activeRouteKey === 'restaurant' ? 'restaurant' : 'search';
      const closeIntentId = requestClosePresentationIntent({
        outgoingSheetSceneKey,
      });
      if (!closeIntentId) {
        return;
      }
      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
      setPendingCloseIntentId(closeIntentId);
    });
  }, [
    clearTypedQuery,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    requestClosePresentationIntent,
    resultsRuntimeOwner,
    routeSceneRuntime,
    setPendingCloseIntentId,
  ]);

  const beginCloseSearch = React.useCallback(() => {
    const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
    const hasVisibleSearchSurface =
      surfaceSnapshot.activeBundle.kind === 'results' ||
      surfaceSnapshot.heldBundle != null ||
      surfaceSnapshot.redrawTransaction != null ||
      surfaceSnapshot.dismissTransaction != null;
    // S-C.5 slice A: "a profile is open" is a STACK FACT (every profile open pushes the
    // 'restaurant' entry — plans/s-c5-restaurant-stack-fact.md). The probe showed the old
    // presentation-flag mirror only diverges for ONE frame on the close side, where the
    // stack fact is the MORE correct signal (the profile is already gone).
    const isRestaurantRouteActive =
      routeSceneRuntime.routeSceneSwitchRuntime.getRouteState().activeOverlayRoute.key ===
      'restaurant';
    const hasSearchToClose =
      isSearchSessionActive ||
      hasResults ||
      submittedQuery.length > 0 ||
      isRestaurantRouteActive ||
      hasVisibleSearchSurface;
    if (!hasSearchToClose) {
      clearTypedQuery();
      return;
    }

    // S-C.5 item 1: ONE decision, named executors. The stack-shape decision lives in the
    // algebra (resolveSessionDismissPlan); this hook resolves the plan and dispatches to the
    // executor that owns that shape's choreography.
    const routeState = routeSceneRuntime.routeSceneSwitchRuntime.getRouteState();
    const dismissPlan = resolveSessionDismissPlan(routeState);
    if (dismissPlan.kind !== 'terminalHome') {
      executeMotionlessSessionExit(dismissPlan);
      return;
    }
    executeTerminalHomeDismiss();
  }, [
    clearTypedQuery,
    executeMotionlessSessionExit,
    executeTerminalHomeDismiss,
    hasResults,
    isSearchSessionActive,
    routeSceneRuntime,
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
