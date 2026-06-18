import React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';

export const useSearchRootSearchSceneListHydrationSettlePatchRuntime = ({
  resultsReadModelSelectors,
}: {
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
}): Pick<SearchRootSearchSceneListHydrationPatch, 'isResultsHydrationSettled'> =>
  React.useMemo(
    () => ({
      isResultsHydrationSettled: resultsReadModelSelectors.isResultsHydrationSettled,
    }),
    [resultsReadModelSelectors.isResultsHydrationSettled]
  );
