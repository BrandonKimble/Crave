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

  const markResultsListUserScrollStart = React.useCallback(() => {
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
  }, []);

  const resetResultsListScrollProgress = React.useCallback(() => {
    hasUserScrolledResultsRef.current = false;
  }, []);

  const handleResultsEndReached = React.useCallback(() => {
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
    }),
    [
      handleResultsEndReached,
      markResultsListUserScrollStart,
      resetResultsListScrollProgress,
    ]
  );
};
