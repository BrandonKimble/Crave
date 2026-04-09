import React from 'react';

import type { FlashListProps } from '@shopify/flash-list';

import { logger } from '../../../../utils';
import type { ResultsListItem } from '../read-models/read-model-selectors';

type UseResultsSheetLoadMoreRuntimeArgs = {
  loadMoreResults: (searchMode: 'natural' | 'shortcut' | null) => void;
  searchMode: 'natural' | 'shortcut' | null;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  currentPage: number;
  shouldLogSearchStateChanges: boolean;
};

type ResultsSheetLoadMoreRuntime = {
  markResultsListUserScrollStart: () => void;
  handleResultsEndReached: FlashListProps<ResultsListItem>['onEndReached'];
  resetResultsListScrollProgress: () => void;
};

export const useResultsSheetLoadMoreRuntime = ({
  loadMoreResults,
  searchMode,
  isSearchLoading,
  isLoadingMore,
  canLoadMore,
  currentPage,
  shouldLogSearchStateChanges,
}: UseResultsSheetLoadMoreRuntimeArgs): ResultsSheetLoadMoreRuntime => {
  const hasUserScrolledResultsRef = React.useRef(false);
  const allowLoadMoreForCurrentScrollRef = React.useRef(true);
  const loadMoreResultsRef = React.useRef(loadMoreResults);
  const searchModeRef = React.useRef(searchMode);
  const isSearchLoadingRef = React.useRef(isSearchLoading);
  const isLoadingMoreRef = React.useRef(isLoadingMore);
  const canLoadMoreRef = React.useRef(canLoadMore);
  const currentPageRef = React.useRef(currentPage);
  const lastLoadMorePageRef = React.useRef<number | null>(null);

  loadMoreResultsRef.current = loadMoreResults;
  searchModeRef.current = searchMode;
  isSearchLoadingRef.current = isSearchLoading;
  isLoadingMoreRef.current = isLoadingMore;
  canLoadMoreRef.current = canLoadMore;
  currentPageRef.current = currentPage;

  const markResultsListUserScrollStart = React.useCallback(() => {
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
  }, []);

  const handleResultsEndReached = React.useCallback<
    FlashListProps<ResultsListItem>['onEndReached']
  >(
    (info) => {
      if (!hasUserScrolledResultsRef.current) {
        return;
      }
      if (
        info &&
        typeof info.distanceFromEnd === 'number' &&
        Number.isFinite(info.distanceFromEnd) &&
        info.distanceFromEnd > 0
      ) {
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
    },
    [shouldLogSearchStateChanges]
  );

  const resetResultsListScrollProgress = React.useCallback(() => {
    hasUserScrolledResultsRef.current = false;
  }, []);

  return React.useMemo(
    () => ({
      markResultsListUserScrollStart,
      handleResultsEndReached,
      resetResultsListScrollProgress,
    }),
    [handleResultsEndReached, markResultsListUserScrollStart, resetResultsListScrollProgress]
  );
};
