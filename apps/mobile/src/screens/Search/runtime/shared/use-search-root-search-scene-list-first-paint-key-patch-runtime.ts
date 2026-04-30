import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

export const useSearchRootSearchSceneListFirstPaintKeyPatchRuntime = ({
  resolvedResultsRuntime,
  hydrationKeyRuntime,
}: {
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): string | null =>
  resolvedResultsRuntime.resolvedResults != null
    ? hydrationKeyRuntime.resultsHydrationKey
    : null;
