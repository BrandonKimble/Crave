import React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import { useSearchRootSearchSceneListHydrationRenderPatchRuntime } from './use-search-root-search-scene-list-hydration-render-patch-runtime';
import { useSearchRootSearchSceneListHydrationStatusPatchRuntime } from './use-search-root-search-scene-list-hydration-status-patch-runtime';

export type SearchRootSearchSceneListHydrationPatch = {
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  resultsFirstPaintKey: string | null;
  listFirstPaintReady: boolean;
  shouldHydrateResultsForRender: boolean;
  isResultsHydrationSettled: boolean;
};

export const useSearchRootSearchSceneListHydrationPatchRuntime = ({
  resolvedResultsRuntime,
  hydrationKeyRuntime,
  resultsReadModelSelectors,
}: {
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  resultsReadModelSelectors: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >;
}): SearchRootSearchSceneListHydrationPatch => ({
  ...useSearchRootSearchSceneListHydrationRenderPatchRuntime({
    resolvedResultsRuntime,
    hydrationKeyRuntime,
  }),
  ...useSearchRootSearchSceneListHydrationStatusPatchRuntime({
    resultsReadModelSelectors,
  }),
});
