import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';

export const useSearchRootSearchSceneListPreparedRowsKeyPatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): string | null =>
  hydrationKeyRuntime.resultsHydrationKey;
