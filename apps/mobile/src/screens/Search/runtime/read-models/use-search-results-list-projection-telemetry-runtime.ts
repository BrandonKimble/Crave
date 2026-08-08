import React from 'react';

import type { SearchResponse } from '../../../../types';
import type { useSearchResultsListProjectionStateRuntime } from './use-search-results-list-projection-state-runtime';

type SearchResultsListProjectionTelemetryRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: Array<unknown>;
  restaurants: Array<unknown>;
  results: SearchResponse | null;
  resultsIdentityKey: string | null;
  shouldHydrateResultsForRender: boolean;
  emitRuntimeWriteSpan: (payload: Record<string, unknown>) => void;
  projectionStateRuntime: ReturnType<typeof useSearchResultsListProjectionStateRuntime>;
};

export const useSearchResultsListProjectionTelemetryRuntime = ({
  activeTab,
  dishes,
  restaurants,
  results,
  resultsIdentityKey,
  shouldHydrateResultsForRender,
  emitRuntimeWriteSpan,
  projectionStateRuntime,
}: SearchResultsListProjectionTelemetryRuntimeArgs) => {
  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const responsePage = results?.metadata?.page ?? 1;
  const requestVersionKey = `${searchRequestId ?? 'no-request'}::${
    resultsIdentityKey ?? 'no-hydration'
  }::page:${responsePage}::dishes:${dishes.length}::restaurants:${restaurants.length}`;

  const previousBuildKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (previousBuildKeyRef.current === requestVersionKey) {
      return;
    }
    previousBuildKeyRef.current = requestVersionKey;
    const durationMs = projectionStateRuntime.buildDurationMs;
    const safeResultsCount = projectionStateRuntime.activeSafeResultsCount;

    emitRuntimeWriteSpan({
      label: 'list_read_model_build',
      requestVersionKey,
      searchRequestId,
      resultsIdentityKey,
      activeTab,
      durationMs,
      safeResultsCount,
      shouldHydrateResultsForRender,
    });
  }, [
    activeTab,
    emitRuntimeWriteSpan,
    projectionStateRuntime.activeSafeResultsCount,
    projectionStateRuntime.buildDurationMs,
    requestVersionKey,
    resultsIdentityKey,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);
};
