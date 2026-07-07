import React from 'react';

import type { SegmentValue } from '../constants/search';
import { logger } from '../../../utils';
import type {
  SearchMode,
  SearchSubmitEntrySurface,
  SubmitSearchOptions,
  SearchSubmitInPlaceRerunIntentKind,
} from './use-search-submit-entry-owner';
import type { StructuredSearchFilters } from './use-search-request-preparation-owner';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from '../runtime/shared/shortcut-toggle-display-query';

type SearchSubmitActionOwnerArgs = {
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  canLoadMore: boolean;
  currentPage: number;
  isLoadingMore: boolean;
  isPaginationExhausted: boolean;
  isSearchRequestInFlightRef: React.MutableRefObject<boolean>;
  /** S3a: a resolver-run rerun is in flight — appends must not race it. */
  isWorldResolving: () => boolean;
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  loadMoreShortcutResults: () => void;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options: {
      preserveSheetState?: boolean;
      replaceResultsInPlace?: boolean;
      transitionFromDockedPolls?: boolean;
      filters?: StructuredSearchFilters;
      forceFreshBounds?: boolean;
      presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
      entrySurface: SearchSubmitEntrySurface;
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
  filters?: StructuredSearchFilters;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
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
  isWorldResolving,
  submitSearch,
  loadMoreShortcutResults,
  submitViewportShortcut,
}: SearchSubmitActionOwnerArgs) => {
  const loadMoreResults = React.useCallback(
    (searchMode: SearchMode) => {
      if (
        isSearchRequestInFlightRef.current ||
        isWorldResolving() ||
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
      isWorldResolving,
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
        // A variant_rerun commit has ALREADY armed the pending cover — a silent return here
        // strands it until the presentation watchdog force-commits (~9s of hung skeleton).
        // The shortcut branch below never needs the query (it has a per-tab fallback label),
        // so this bail only guards the natural-rerun path — and it must be LOUD.
        if (params.searchMode !== 'shortcut' || !params.isSearchSessionActive) {
          if (params.presentationIntentKind === 'variant_rerun') {
            logger.error('variant_rerun dropped: empty rerun query with pending cover armed', {
              searchMode: params.searchMode ?? 'null',
              isSearchSessionActive: params.isSearchSessionActive,
            });
          }
          return;
        }
      }
      if (params.searchMode === 'shortcut' && params.isSearchSessionActive) {
        const fallbackShortcutLabel =
          params.activeTab === 'restaurants'
            ? SHORTCUT_QUERY_LABEL_BY_TAB.restaurants
            : SHORTCUT_QUERY_LABEL_BY_TAB.dishes;
        const submittedLabel = params.submittedQuery.trim() || fallbackShortcutLabel;
        await submitViewportShortcut(params.activeTab, submittedLabel, {
          preserveSheetState: params.preserveSheetState,
          replaceResultsInPlace: params.replaceResultsInPlace,
          filters: params.filters,
          forceFreshBounds: true,
          presentationIntentKind: params.presentationIntentKind,
          entrySurface: 'results',
        });
        return;
      }
      await submitSearch(
        {
          preserveSheetState: params.preserveSheetState,
          replaceResultsInPlace: params.replaceResultsInPlace,
          openNow: params.filters?.openNow,
          priceLevels: params.filters?.priceLevels,
          includeSimilar: params.filters?.includeSimilar,
          forceFreshBounds: true,
          presentationIntentKind: params.presentationIntentKind,
          entrySurface: 'results',
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
