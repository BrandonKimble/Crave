import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListFirstPaintPatchRuntime } from './use-search-root-search-scene-list-first-paint-patch-runtime';
import { useSearchRootSearchSceneListHydrationKeyPatchRuntime } from './use-search-root-search-scene-list-hydration-key-patch-runtime';

export const useSearchRootSearchSceneListHydrationRenderPatchRuntime = ({
  resolvedResultsRuntime,
  hydrationKeyRuntime,
}: {
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  | 'resultsHydrationKey'
  | 'hydratedResultsKey'
  | 'resultsFirstPaintKey'
  | 'listFirstPaintReady'
  | 'shouldHydrateResultsForRender'
> => ({
  ...useSearchRootSearchSceneListHydrationKeyPatchRuntime({
    hydrationKeyRuntime,
  }),
  ...useSearchRootSearchSceneListFirstPaintPatchRuntime({
    resolvedResultsRuntime,
    hydrationKeyRuntime,
  }),
});
