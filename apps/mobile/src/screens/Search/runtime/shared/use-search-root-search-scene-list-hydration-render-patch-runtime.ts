import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListPreparedRowsPatchRuntime } from './use-search-root-search-scene-list-prepared-rows-patch-runtime';
import { useSearchRootSearchSceneListHydrationKeyPatchRuntime } from './use-search-root-search-scene-list-hydration-key-patch-runtime';

export const useSearchRootSearchSceneListHydrationRenderPatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  | 'resultsHydrationKey'
  | 'hydratedResultsKey'
  | 'resultsPreparedRowsKey'
  | 'listPreparedRowsReady'
  | 'shouldHydrateResultsForRender'
> => ({
  ...useSearchRootSearchSceneListHydrationKeyPatchRuntime({
    hydrationKeyRuntime,
  }),
  ...useSearchRootSearchSceneListPreparedRowsPatchRuntime({
    hydrationKeyRuntime,
  }),
});
