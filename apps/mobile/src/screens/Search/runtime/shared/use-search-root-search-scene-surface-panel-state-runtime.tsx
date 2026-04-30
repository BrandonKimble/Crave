import React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import { resolveResultsPresentationPanelPolicyFacts } from './results-presentation-policy-facts-resolver';
import type { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import type { useSearchResultsPanelPresentationRuntimeState } from './use-search-results-panel-presentation-runtime-state';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type UseSearchRootSearchSceneSurfacePanelStateRuntimeArgs = {
  searchPresentationRuntimeState: ReturnType<typeof useSearchResultsPanelPresentationRuntimeState>;
  searchHydrationRuntimeState: ReturnType<typeof useSearchResultsPanelHydrationRuntimeState>;
  searchResultsRuntimeState: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>;
  resolvedResultsRuntime: ReturnType<typeof useSearchResultsPanelRetainedResultsRuntime>;
  allowsInteractionLoadingState: boolean;
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export const useSearchRootSearchSceneSurfacePanelStateRuntime = ({
  searchPresentationRuntimeState,
  searchHydrationRuntimeState,
  searchResultsRuntimeState,
  resolvedResultsRuntime,
  allowsInteractionLoadingState,
  resultsReadModelSelectors,
}: UseSearchRootSearchSceneSurfacePanelStateRuntimeArgs) => {
  const hasResolvedResults = resolvedResultsRuntime.resolvedResults != null;

  return React.useMemo(
    () =>
      resolveResultsPresentationPanelPolicyFacts({
        renderPolicy: searchPresentationRuntimeState.renderPolicy,
        allowsInteractionLoadingState,
        hasRenderableRows:
          resultsReadModelSelectors.rowsByTab[searchResultsRuntimeState.activeTab].length > 0,
        hasResolvedResults,
        isSearchLoading: searchResultsRuntimeState.isSearchLoading,
        shouldUsePlaceholderRows: false,
        freezeClassification: searchHydrationRuntimeState.chromeFreezeClassification,
      }),
    [
      allowsInteractionLoadingState,
      hasResolvedResults,
      resultsReadModelSelectors.rowsByTab,
      searchHydrationRuntimeState.chromeFreezeClassification,
      searchPresentationRuntimeState.renderPolicy,
      searchResultsRuntimeState.activeTab,
      searchResultsRuntimeState.isSearchLoading,
    ]
  );
};
