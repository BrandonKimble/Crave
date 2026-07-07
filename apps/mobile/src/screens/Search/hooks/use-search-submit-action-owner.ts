import React from 'react';

import type { SegmentValue } from '../constants/search';
import { logger } from '../../../utils';
import type {
  SearchMode,
  SearchSubmitEntrySurface,
  SubmitSearchOptions,
  SearchSubmitInPlaceRerunIntentKind,
  StructuredSearchFilters,
} from './use-search-submit-entry-owner';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from '../runtime/shared/shortcut-toggle-display-query';

type SearchSubmitActionOwnerArgs = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
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
  submitSearch,
  submitViewportShortcut,
}: SearchSubmitActionOwnerArgs) => {
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
    rerunActiveSearch,
  };
};
