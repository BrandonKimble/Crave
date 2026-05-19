import React from 'react';

import type {
  SearchForegroundCommandRuntimeArgs,
  SearchForegroundInteractionCommandRuntime,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundSubmitRuntime } from './use-search-foreground-submit-runtime';

export const useSearchForegroundCommandRuntime = ({
  isOffline,
  ...submitRuntimeArgs
}: SearchForegroundCommandRuntimeArgs): SearchForegroundInteractionCommandRuntime => {
  const submitHandlers = useSearchForegroundSubmitRuntime(submitRuntimeArgs);
  const [shouldRetrySearchOnReconnect, setShouldRetrySearchOnReconnect] = React.useState(false);

  React.useEffect(() => {
    if (!isOffline) {
      return;
    }
    if (
      !submitRuntimeArgs.isSearchSessionActive ||
      submitRuntimeArgs.hasResults ||
      submitRuntimeArgs.isSearchLoading ||
      submitRuntimeArgs.isLoadingMore
    ) {
      return;
    }
    setShouldRetrySearchOnReconnect(true);
  }, [
    isOffline,
    submitRuntimeArgs.hasResults,
    submitRuntimeArgs.isLoadingMore,
    submitRuntimeArgs.isSearchLoading,
    submitRuntimeArgs.isSearchSessionActive,
  ]);

  React.useEffect(() => {
    if (isOffline) {
      return;
    }
    if (!shouldRetrySearchOnReconnect) {
      return;
    }
    if (
      !submitRuntimeArgs.isSearchSessionActive ||
      submitRuntimeArgs.hasResults ||
      submitRuntimeArgs.isSearchLoading ||
      submitRuntimeArgs.isLoadingMore
    ) {
      return;
    }
    const retryQuery = (submitRuntimeArgs.submittedQuery || submitRuntimeArgs.query).trim();
    if (!retryQuery) {
      setShouldRetrySearchOnReconnect(false);
      return;
    }
    setShouldRetrySearchOnReconnect(false);
    void submitRuntimeArgs.submitRuntime.submitSearch(
      { preserveSheetState: true, entrySurface: 'results' },
      retryQuery
    );
  }, [
    isOffline,
    shouldRetrySearchOnReconnect,
    submitRuntimeArgs.hasResults,
    submitRuntimeArgs.isLoadingMore,
    submitRuntimeArgs.isSearchLoading,
    submitRuntimeArgs.isSearchSessionActive,
    submitRuntimeArgs.query,
    submitRuntimeArgs.submittedQuery,
    submitRuntimeArgs.submitRuntime,
  ]);

  return React.useMemo(
    () => ({
      shouldRetrySearchOnReconnect,
      ...submitHandlers,
    }),
    [shouldRetrySearchOnReconnect, submitHandlers]
  );
};
