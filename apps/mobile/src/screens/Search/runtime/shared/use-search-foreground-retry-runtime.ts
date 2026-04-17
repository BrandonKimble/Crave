import React from 'react';

import type {
  SearchForegroundRetryRuntimeArgs,
  SearchForegroundInteractionRetryRuntime,
} from './use-search-foreground-interaction-runtime-contract';

export const useSearchForegroundRetryRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  hasResults,
  isOffline,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
}: SearchForegroundRetryRuntimeArgs): SearchForegroundInteractionRetryRuntime => {
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
