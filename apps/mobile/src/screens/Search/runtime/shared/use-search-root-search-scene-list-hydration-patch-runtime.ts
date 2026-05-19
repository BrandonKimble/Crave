import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import { useSearchRootSearchSceneListHydrationRenderPatchRuntime } from './use-search-root-search-scene-list-hydration-render-patch-runtime';
import { useSearchRootSearchSceneListHydrationStatusPatchRuntime } from './use-search-root-search-scene-list-hydration-status-patch-runtime';

export type SearchRootSearchSceneListHydrationPatch = {
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  resultsPreparedRowsKey: string | null;
  listPreparedRowsReady: boolean;
  shouldHydrateResultsForRender: boolean;
  isResultsHydrationSettled: boolean;
};

export const useSearchRootSearchSceneListHydrationPatchRuntime = ({
  hydrationKeyRuntime,
  resultsReadModelSelectors,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
}): SearchRootSearchSceneListHydrationPatch => ({
  ...useSearchRootSearchSceneListHydrationRenderPatchRuntime({
    hydrationKeyRuntime,
  }),
  ...useSearchRootSearchSceneListHydrationStatusPatchRuntime({
    resultsReadModelSelectors,
  }),
});
