import React from 'react';

import type { SearchResponse } from '../../../../types';
import type { MapQueryBudget } from '../map/map-query-budget';
import type { useSearchResultsSectionedProjectionStateRuntime } from './use-search-results-sectioned-projection-state-runtime';

type SearchResultsSectionedProjectionTelemetryRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: Array<unknown>;
  restaurants: Array<unknown>;
  results: SearchResponse | null;
  resultsHydrationKey: string | null;
  shouldHydrateResultsForRender: boolean;
  runOneCommitSpanPressureActive: boolean;
  mapQueryBudget: MapQueryBudget;
  emitRuntimeWriteSpan: (payload: Record<string, unknown>) => void;
  projectionStateRuntime: ReturnType<typeof useSearchResultsSectionedProjectionStateRuntime>;
};

export const useSearchResultsSectionedProjectionTelemetryRuntime = ({
  activeTab,
  dishes,
  restaurants,
  results,
  resultsHydrationKey,
  shouldHydrateResultsForRender,
  runOneCommitSpanPressureActive,
  mapQueryBudget,
  emitRuntimeWriteSpan,
  projectionStateRuntime,
}: SearchResultsSectionedProjectionTelemetryRuntimeArgs) => {
  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const responsePage = results?.metadata?.page ?? 1;
  const requestVersionKey = `${searchRequestId ?? 'no-request'}::${
    resultsHydrationKey ?? 'no-hydration'
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

    mapQueryBudget.recordRuntimeAttributionDurationMs(
      'list_read_model_build',
      durationMs
    );
    emitRuntimeWriteSpan({
      label: 'list_read_model_build',
      requestVersionKey,
      searchRequestId,
      resultsHydrationKey,
      activeTab,
      durationMs,
      sectionedRowCount,
      safeResultsCount,
      shouldHydrateResultsForRender,
      runOneCommitSpanPressureActive,
    });
  }, [
    activeTab,
    emitRuntimeWriteSpan,
    mapQueryBudget,
    projectionStateRuntime.activeSafeResultsCount,
    projectionStateRuntime.activeSectionedRowCount,
    projectionStateRuntime.buildDurationMs,
    requestVersionKey,
    resultsHydrationKey,
    runOneCommitSpanPressureActive,
    searchRequestId,
    shouldHydrateResultsForRender,
  ]);
};
