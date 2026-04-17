import React from 'react';

import type { SegmentValue } from '../constants/search';
import type { SearchMode, SubmitSearchOptions } from './use-search-submit-entry-owner';
import type { StructuredSearchFilters } from './use-search-request-preparation-owner';

type SearchSubmitActionOwnerArgs = {
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  canLoadMore: boolean;
  currentPage: number;
  isLoadingMore: boolean;
  isPaginationExhausted: boolean;
  isSearchRequestInFlightRef: React.MutableRefObject<boolean>;
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  loadMoreShortcutResults: () => void;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options?: {
      preserveSheetState?: boolean;
      replaceResultsInPlace?: boolean;
      transitionFromDockedPolls?: boolean;
      filters?: StructuredSearchFilters;
      forceFreshBounds?: boolean;
    }
  ) => Promise<void>;
};

export type SearchSubmitRerunParams = {
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
};

export const useSearchSubmitActionOwner = ({
  query,
  submittedQuery,
  hasResults,
  canLoadMore,
  currentPage,
  isLoadingMore,
  isPaginationExhausted,
  isSearchRequestInFlightRef,
  submitSearch,
  loadMoreShortcutResults,
  submitViewportShortcut,
}: SearchSubmitActionOwnerArgs) => {
  const loadMoreResults = React.useCallback(
    (searchMode: SearchMode) => {
      if (
        isSearchRequestInFlightRef.current ||
        isLoadingMore ||
        !hasResults ||
        !canLoadMore ||
        isPaginationExhausted
      ) {
        return;
      }
      if (searchMode === 'shortcut') {
        loadMoreShortcutResults();
        return;
      }
      const nextPage = currentPage + 1;
      const activeQuery = submittedQuery || query;
      if (!activeQuery.trim()) {
        return;
      }
      void submitSearch({ page: nextPage, append: true }, activeQuery);
    },
    [
      canLoadMore,
      currentPage,
      hasResults,
      isLoadingMore,
      isPaginationExhausted,
      isSearchRequestInFlightRef,
      loadMoreShortcutResults,
      query,
      submitSearch,
      submittedQuery,
    ]
  );

  const rerunActiveSearch = React.useCallback(
    async (params: SearchSubmitRerunParams) => {
      const rerunQuery = (params.submittedQuery || params.query).trim();
      if (!rerunQuery) {
        return;
      }
      if (params.searchMode === 'shortcut' && params.isSearchSessionActive) {
        const fallbackShortcutLabel =
          params.activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const submittedLabel = params.submittedQuery.trim() || fallbackShortcutLabel;
        await submitViewportShortcut(params.activeTab, submittedLabel, {
          preserveSheetState: params.preserveSheetState,
          replaceResultsInPlace: params.replaceResultsInPlace,
          forceFreshBounds: true,
        });
        return;
      }
      await submitSearch(
        {
          preserveSheetState: params.preserveSheetState,
          replaceResultsInPlace: params.replaceResultsInPlace,
          forceFreshBounds: true,
        },
        rerunQuery
      );
    },
    [submitViewportShortcut, submitSearch]
  );

  return {
    loadMoreResults,
    rerunActiveSearch,
  };
};
