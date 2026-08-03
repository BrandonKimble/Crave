import React from 'react';

import type { SearchResponse } from '../../../../types';
import type { useSearchResultsSectionedProjectionStateRuntime } from './use-search-results-sectioned-projection-state-runtime';

type SearchResultsSectionedProjectionTelemetryRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: Array<unknown>;
  restaurants: Array<unknown>;
  results: SearchResponse | null;
  resultsIdentityKey: string | null;
  shouldHydrateResultsForRender: boolean;
  searchSurfaceRedrawCommitSpanPressureActive: boolean;
  emitRuntimeWriteSpan: (payload: Record<string, unknown>) => void;
  projectionStateRuntime: ReturnType<typeof useSearchResultsSectionedProjectionStateRuntime>;
};

export const useSearchResultsSectionedProjectionTelemetryRuntime = ({
  activeTab,
  dishes,
  restaurants,
  results,
  resultsIdentityKey,
  shouldHydrateResultsForRender,
  searchSurfaceRedrawCommitSpanPressureActive,
  emitRuntimeWriteSpan,
  projectionStateRuntime,
}: SearchResultsSectionedProjectionTelemetryRuntimeArgs) => {
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
    const sectionedRowCount = projectionStateRuntime.activeSectionedRowCount;
    const safeResultsCount = projectionStateRuntime.activeSafeResultsCount;

    emitRuntimeWriteSpan({
      label: 'list_read_model_build',
      requestVersionKey,
      searchRequestId,
      resultsIdentityKey,
      activeTab,
      durationMs,
      sectionedRowCount,
      safeResultsCount,
      shouldHydrateResultsForRender,
      searchSurfaceRedrawCommitSpanPressureActive,
    });
  }, [
    activeTab,
    emitRuntimeWriteSpan,
    projectionStateRuntime.activeSafeResultsCount,
    projectionStateRuntime.activeSectionedRowCount,
    projectionStateRuntime.buildDurationMs,
    requestVersionKey,
    resultsIdentityKey,
    searchSurfaceRedrawCommitSpanPressureActive,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);
};
