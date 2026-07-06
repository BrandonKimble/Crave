import React from 'react';

import { logger } from '../../../../utils';
import type { SearchMode } from '../../hooks/use-search-submit-entry-owner';
import type { SubmitRuntimeResult } from './use-search-root-control-plane-runtime-contract';

type UseSearchRootResultsSheetLoadMoreRuntimeArgs = {
  submitRuntimeResult: SubmitRuntimeResult;
  shouldLogSearchStateChanges: boolean;
  searchMode: SearchMode;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  currentPage: number;
};

export const useSearchRootResultsSheetLoadMoreRuntime = ({
  submitRuntimeResult,
  shouldLogSearchStateChanges,
  searchMode,
  isSearchLoading,
  isLoadingMore,
  canLoadMore,
  currentPage,
}: UseSearchRootResultsSheetLoadMoreRuntimeArgs) => {
  const hasUserScrolledResultsRef = React.useRef(false);
  const allowLoadMoreForCurrentScrollRef = React.useRef(true);
  const lastLoadMorePageRef = React.useRef<number | null>(null);
  const loadMoreResultsRef = React.useRef(submitRuntimeResult.loadMoreResults);
  const searchModeRef = React.useRef(searchMode);
  const isSearchLoadingRef = React.useRef(isSearchLoading);
  const isLoadingMoreRef = React.useRef(isLoadingMore);
  const canLoadMoreRef = React.useRef(canLoadMore);
  const currentPageRef = React.useRef(currentPage);

  loadMoreResultsRef.current = submitRuntimeResult.loadMoreResults;
  searchModeRef.current = searchMode;
  isSearchLoadingRef.current = isSearchLoading;
  isLoadingMoreRef.current = isLoadingMore;
  canLoadMoreRef.current = canLoadMore;
  currentPageRef.current = currentPage;

  // Pagination fix (ledger #6): the gesture-handoff scroll container produces NO native drag
  // events (finger on the sheet's GestureDetector, worklet-driven scroll), so the old
  // scroll-begin marker never fired and the anti-auto-load gate blocked loadMore forever.
  // The live signal is the list's onScroll offset: a real user scroll takes the offset past
  // the threshold; mount/reveal resets sit at ~0, so spurious layout-time endReached stays
  // blocked (the gate's original intent).
  const USER_SCROLL_ACTIVITY_MIN_OFFSET_PX = 100;
  const handleResultsListUserScrollActivity = React.useCallback((offsetY: number) => {
    if (offsetY < USER_SCROLL_ACTIVITY_MIN_OFFSET_PX) {
      return;
    }
    if (__DEV__ && !hasUserScrolledResultsRef.current) {
      console.log(`[PAGDBG] scroll activity marked offsetY=${Math.round(offsetY)}`);
    }
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
  }, []);

  const markResultsListUserScrollStart = React.useCallback(() => {
    if (__DEV__ && !hasUserScrolledResultsRef.current) {
      console.log('[PAGDBG] scrollStart marked');
    }
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
  }, []);

  const resetResultsListScrollProgress = React.useCallback(() => {
    hasUserScrolledResultsRef.current = false;
  }, []);

  const handleResultsEndReached = React.useCallback(() => {
    if (__DEV__) {
      console.log(
        `[PAGDBG] endReached scrolled=${hasUserScrolledResultsRef.current} allow=${allowLoadMoreForCurrentScrollRef.current} canLoadMore=${canLoadMoreRef.current} loading=${isSearchLoadingRef.current} loadingMore=${isLoadingMoreRef.current} page=${currentPageRef.current}`
      );
    }
    if (!hasUserScrolledResultsRef.current) {
      return;
    }
    if (!allowLoadMoreForCurrentScrollRef.current) {
      return;
    }
    if (!canLoadMoreRef.current || isSearchLoadingRef.current || isLoadingMoreRef.current) {
      return;
    }

    const nextPage = currentPageRef.current + 1;
    if (lastLoadMorePageRef.current === nextPage) {
      return;
    }

    allowLoadMoreForCurrentScrollRef.current = false;
    lastLoadMorePageRef.current = nextPage;
    if (shouldLogSearchStateChanges) {
      logger.debug(
        `[SearchPerf] endReached page=${currentPageRef.current} next=${nextPage} mode=${
          searchModeRef.current ?? 'none'
        }`
      );
    }
    loadMoreResultsRef.current(searchModeRef.current);
  }, [shouldLogSearchStateChanges]);

  return React.useMemo(
    () => ({
      markResultsListUserScrollStart,
      resetResultsListScrollProgress,
      handleResultsEndReached,
      handleResultsListUserScrollActivity,
    }),
    [
      handleResultsEndReached,
      handleResultsListUserScrollActivity,
      markResultsListUserScrollStart,
      resetResultsListScrollProgress,
    ]
  );
};
