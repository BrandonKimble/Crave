import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListHydrationSettlePatchRuntime } from './use-search-root-search-scene-list-hydration-settle-patch-runtime';

export const useSearchRootSearchSceneListHydrationStatusPatchRuntime = ({
  resultsReadModelSelectors,
}: {
  resultsReadModelSelectors: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'isResultsHydrationSettled'
> =>
  useSearchRootSearchSceneListHydrationSettlePatchRuntime({
    resultsReadModelSelectors,
  });
