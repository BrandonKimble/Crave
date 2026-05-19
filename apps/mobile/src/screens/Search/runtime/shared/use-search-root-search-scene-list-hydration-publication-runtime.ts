import type * as React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import type { SearchRuntimeInteractionState } from './use-search-root-session-runtime-contract';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import { useSearchRootSearchSceneListHydrationPatchRuntime } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useResultsPresentationSurfaceHydrationPublicationRuntime } from './use-results-presentation-surface-hydration-publication-runtime';

type UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  searchInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState>;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export const useSearchRootSearchSceneListHydrationPublicationRuntime = ({
  activeTab,
  resultsPresentationSurfaceAuthority,
  routeSceneSwitchAuthority,
  searchInteractionRef,
  hydrationKeyRuntime,
  resultsReadModelSelectors,
}: UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs) => {
  const searchSceneListHydrationPatch = useSearchRootSearchSceneListHydrationPatchRuntime({
    hydrationKeyRuntime,
    resultsReadModelSelectors,
  });

  useResultsPresentationSurfaceHydrationPublicationRuntime({
    activeTab,
    resultsPresentationSurfaceAuthority,
    routeSceneSwitchAuthority,
    searchInteractionRef,
    searchSceneListHydrationPatch,
  });
};
