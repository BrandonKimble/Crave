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

  // RT-5 (red-team 2026-07-10): the duplicate reconnect auto-retry lane is DELETED.
  // It was a tuple-equal no-op for natural sessions (the failed submit already wrote the
  // tuple; the rewrite publishes nothing) and an identity-coercer for shortcut/entity
  // sessions (re-submitting the shortcut label as a natural LLM query = session_replace
  // racing the real resume). Reconnect retry has ONE owner:
  // retrySearchDesiredResolution (use-search-route-results-policy-domain-runtime), which
  // force-bumps the generation and re-resolves the SAME desire.
  React.useEffect(() => {
    if (!isOffline && shouldRetrySearchOnReconnect) {
      setShouldRetrySearchOnReconnect(false);
    }
  }, [isOffline, shouldRetrySearchOnReconnect]);

  return React.useMemo(
    () => ({
      shouldRetrySearchOnReconnect,
      ...submitHandlers,
    }),
    [shouldRetrySearchOnReconnect, submitHandlers]
  );
};
