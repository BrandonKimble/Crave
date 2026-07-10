import React from 'react';

import type { SegmentValue } from '../constants/search';
import type { SearchMode, SubmitSearchOptions } from './use-search-submit-entry-owner';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from '../runtime/shared/shortcut-toggle-display-query';

type SearchSubmitActionOwnerArgs = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options: {
      searchThisArea?: boolean;
      forceFreshBounds?: boolean;
    }
  ) => Promise<void>;
};

// S-A (the great trigger deletion): this owner serves exactly ONE caller — the
// search-this-area press (variant reruns ride the toggle coordinator → reconciler, never
// this path). The rerun params lost the presentation flags; the reconciler classifies the
// bounds-only delta as area_rerun and derives the intent.
export type SearchSubmitRerunParams = {
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
};

export const useSearchSubmitActionOwner = ({
  submitSearch,
  submitViewportShortcut,
}: SearchSubmitActionOwnerArgs) => {
  const rerunActiveSearch = React.useCallback(
    async (params: SearchSubmitRerunParams) => {
      const rerunQuery = (params.submittedQuery || params.query).trim();
      if (!rerunQuery) {
        // The shortcut branch below never needs the query (it has a per-tab fallback
        // label), so this bail only guards the natural-rerun path.
        if (params.searchMode !== 'shortcut' || !params.isSearchSessionActive) {
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
          searchThisArea: true,
          forceFreshBounds: true,
        });
        return;
      }
      await submitSearch(
        {
          replaceResultsInPlace: true,
          forceFreshBounds: true,
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
