import React from 'react';

import type {
  SearchForegroundInteractionRetryRuntime,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundRetryRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'submittedQuery'
  | 'hasResults'
  | 'isOffline'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
>;

export const useSearchForegroundRetryRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  hasResults,
  isOffline,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
}: UseSearchForegroundRetryRuntimeArgs): SearchForegroundInteractionRetryRuntime => {
  const { submitSearch } = submitRuntime;
  const [shouldRetrySearchOnReconnect, setShouldRetrySearchOnReconnect] = React.useState(false);

  React.useEffect(() => {
    if (!isOffline) {
      return;
    }
    if (!isSearchSessionActive || hasResults || isSearchLoading || isLoadingMore) {
      return;
    }
    setShouldRetrySearchOnReconnect(true);
  }, [hasResults, isLoadingMore, isOffline, isSearchLoading, isSearchSessionActive]);

  React.useEffect(() => {
    if (isOffline) {
      return;
    }
    if (!shouldRetrySearchOnReconnect) {
      return;
    }
    if (!isSearchSessionActive || hasResults || isSearchLoading || isLoadingMore) {
      return;
    }
    const retryQuery = (submittedQuery || query).trim();
    if (!retryQuery) {
      setShouldRetrySearchOnReconnect(false);
      return;
    }
    setShouldRetrySearchOnReconnect(false);
    void submitSearch({ preserveSheetState: true }, retryQuery);
  }, [
    hasResults,
    isLoadingMore,
    isOffline,
    isSearchLoading,
    isSearchSessionActive,
    query,
    shouldRetrySearchOnReconnect,
    submitSearch,
    submittedQuery,
  ]);

  return {
    shouldRetrySearchOnReconnect,
  };
};
