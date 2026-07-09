import React from 'react';
import { unstable_batchedUpdates } from 'react-native';
import { requestSearchBottomNavMotionTarget } from './search-bottom-nav-motion-runtime';

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
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  prepareRestaurantProfileForTerminalSearchDismissRef: React.MutableRefObject<() => void>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<AppRouteSharedSheetRuntimeOwner, 'sheetState'>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      terminalDismissSource?: 'results' | 'profile';
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};

type ResultsPresentationCloseActionsRuntime = {
  requestClosePresentationIntent: (options?: {
    terminalDismissSource?: 'results' | 'profile';
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
      terminalDismissSource = 'results',
      outgoingSheetSceneKey = terminalDismissSource === 'profile' ? 'restaurant' : 'search',
    }: {
      terminalDismissSource?: 'results' | 'profile';
      outgoingSheetSceneKey?: OverlayKey | null;
    } = {}) =>
      executeSurfaceExitTransaction(
        createSearchSurfaceResultsExitTransaction(
          nextSearchSurfaceResultsExitTransactionId(),
          terminalDismissSource,
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

    // Return-to-origin foundation — TOP-LEVEL-RICH dismiss seam (the LAST gap). If the CAPTURED
    // origin is a top-level-rich SEEDED origin (favorites-as-search launched from bookmarks /
    // profile), dismiss it as a SINGLE swapImmediately re-root DIRECTLY to the captured origin —
    // bypassing the `terminalDismiss→polls` collapse choreography entirely. That intermediate is
    // what used to BLANK this dismiss: it preserved the dismissing search handoff for its sheet
    // slide, then the boundary restore re-rooted `polls→bookmarks` swapImmediately and SUPERSEDED
    // it before it settled, latching the native presentation on a torn-down outgoing handoff. With
    // no intermediate there is nothing to supersede. `dismissRestoreToTopLevelRichOrigin` does the
    // SINGLE re-root (and returns true) ONLY for that origin shape; a degenerate home / restaurant-
    // profile / comment→pollDetail child origin returns false and falls through to the UNCHANGED
    // terminalDismiss path below (the home seam stays byte-identical). We tear down the search
    // SURFACE first with skipPostSearchRestore (it does NOT arm/flush, so the captured origin
    // survives), THEN emit the single re-root — mirroring the finalize CLEAR→RESTORE order.
    // S-C.2 (plans/s-c-de-special-search.md): a search session PUSHED over a bookmarks/profile
    // root dismisses as a plain POP — the root was never destroyed, and the popped entry's
    // origin (S-B origin-on-entry) restores the departed presentation. The slot-based rich
    // seam below remains for legacy (search-root) flows until S-C.3.
    {
      const routeState = routeSceneRuntime.routeSceneSwitchRuntime.getRouteState();
      // Search-root (home) sessions keep the LEGACY terminalDismiss choreography for now —
      // it owns the native map exit (the wire's dismiss correlation) that a bare pop skips
      // (proven: home pop left the dismissed world's dots on the map). The motionless dismiss
      // transaction that lets home dismiss be a true pop is S-C.3-B
      // (plans/s-c-de-special-search.md). Its setRoot collapse of [home, session] → [home] is
      // stack-legal (setRoot = tab reset).
      const isPushedSearchSession =
        routeState.activeOverlayRoute.key === 'search' &&
        routeState.overlayRouteStackLength > 1 &&
        routeState.rootOverlayKey !== 'search';
      if (isPushedSearchSession) {
        ignoreNextSearchBlurRef.current = true;
        unstable_batchedUpdates(() => {
          clearSearchState({
            skipPostSearchRestore: true,
            skipProfileDismissClear: true,
          });
          resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
          setPendingCloseIntentId(null);
          routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute({
            applyOriginDetent: true,
          });
          getSearchSurfaceRuntime().finalizeSessionExitWithoutDismissMotion();

          // The submit choreography commanded the nav out; the pop path owns commanding it
          // home (the terminalDismiss choreography that normally does this is skipped).
          requestSearchBottomNavMotionTarget('show');
        });
        return;
      }
    }

    if (routeSceneRuntime.routeOverlaySessionActions.isTopLevelRichSeededOriginCaptured()) {
      ignoreNextSearchBlurRef.current = true;
      unstable_batchedUpdates(() => {
        clearSearchState({
          skipPostSearchRestore: true,
          skipProfileDismissClear: true,
        });
        resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
        setPendingCloseIntentId(null);
        routeSceneRuntime.routeOverlaySessionActions.dismissRestoreToTopLevelRichOrigin();
      });
      return;
    }

    // Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore / P2).
    // TWO dismiss mechanisms, both richness-gated on the captured OriginSnapshot (never on a
    // call-site anchor-scene `if`): the top-level-rich seam ABOVE handles bookmarks/profile in a
    // single synchronous swapImmediately re-root; EVERYTHING ELSE (home + comment→pollDetail child)
    // runs the SAME terminalDismiss surface-exit choreography BELOW, which ARMS the snapshot
    // (armSearchCloseRestore) and, on the collapse boundary, flushes the ONE richness-gated restore
    // (flushPendingSearchOriginRestore → restorePendingOrigin). The snapshot's SHAPE decides the
    // motion — a DEGENERATE home origin short-circuits to the byte-identical {polls,search}@collapsed
    // home switch; a RICH child origin (a poll-discussion COMMENT, anchor.sceneKey==='pollDetail')
    // re-roots the origin home BENEATH the child and re-pushes the exact child scene that rises to
    // the captured detent. The branch is read from the snapshot inside restorePendingOrigin.
    ignoreNextSearchBlurRef.current = true;
    unstable_batchedUpdates(() => {
      clearTypedQuery();
      isClearingSearchRef.current = true;
      const activeRouteKey =
        routeSceneRuntime.routeSceneSwitchRuntime.getRouteState().activeOverlayRoute.key;
      const outgoingSheetSceneKey: OverlayKey =
        profilePresentationActiveRef.current || activeRouteKey === 'restaurant'
          ? 'restaurant'
          : 'search';
      const terminalDismissSource = outgoingSheetSceneKey === 'restaurant' ? 'profile' : 'results';
      if (terminalDismissSource === 'profile') {
        prepareRestaurantProfileForTerminalSearchDismissRef.current();
      }
      const closeIntentId = requestClosePresentationIntent({
        terminalDismissSource,
        outgoingSheetSceneKey,
      });
      if (!closeIntentId) {
        return;
      }

      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
      setPendingCloseIntentId(closeIntentId);
    });
  }, [
    clearSearchState,
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
