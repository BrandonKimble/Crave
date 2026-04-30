import React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import { useSearchRootSearchSceneListHydrationPatchRuntime } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListHydrationPublishEffectRuntime } from './use-search-root-search-scene-list-hydration-publish-effect-runtime';

type UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  resultsReadModelSelectors: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >;
};

export const useSearchRootSearchSceneListHydrationPublicationRuntime = ({
  searchRuntimeBus,
  resolvedResultsRuntime,
  hydrationKeyRuntime,
  resultsReadModelSelectors,
}: UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs) => {
  const searchSceneListHydrationPatch =
    useSearchRootSearchSceneListHydrationPatchRuntime({
      resolvedResultsRuntime,
      hydrationKeyRuntime,
      resultsReadModelSelectors,
    });

  useSearchRootSearchSceneListHydrationPublishEffectRuntime({
    searchRuntimeBus,
    searchSceneListHydrationPatch,
  });
};
