import React from 'react';

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
  searchSheetContentLaneKind: 'results_live' | 'results_closing' | 'persistent_poll';
  allowsInteractionLoadingState: boolean;
};

export const useSearchRootSearchSceneSurfacePanelStateRuntime = ({
  searchPresentationRuntimeState,
  searchHydrationRuntimeState,
  searchResultsRuntimeState,
  resolvedResultsRuntime,
  searchSheetContentLaneKind,
  allowsInteractionLoadingState,
}: UseSearchRootSearchSceneSurfacePanelStateRuntimeArgs) => {
  const shouldSuppressResultsSurface = searchSheetContentLaneKind === 'persistent_poll';
  const hasResolvedResults =
    !shouldSuppressResultsSurface &&
    (resolvedResultsRuntime.resolvedResults != null ||
      searchResultsRuntimeState.resultsRequestKey != null ||
      searchResultsRuntimeState.resultsIdentityCandidateKey != null ||
      searchResultsRuntimeState.resultsDishCount > 0 ||
      searchResultsRuntimeState.resultsRestaurantCount > 0);
  const activeTabRenderableRowCount = shouldSuppressResultsSurface
    ? 0
    : searchResultsRuntimeState.activeTab === 'restaurants'
      ? searchResultsRuntimeState.resultsRestaurantCount
      : searchResultsRuntimeState.resultsDishCount;

  return React.useMemo(() => {
    const panelState = resolveResultsPresentationPanelPolicyFacts({
      renderPolicy: searchPresentationRuntimeState.renderPolicy,
      allowsInteractionLoadingState: shouldSuppressResultsSurface
        ? false
        : allowsInteractionLoadingState,
      hasRenderableRows: activeTabRenderableRowCount > 0,
      hasResolvedResults,
      isSearchLoading: searchResultsRuntimeState.isSearchLoading,
      shouldUsePlaceholderRows: false,
      freezeClassification: searchHydrationRuntimeState.chromeFreezeClassification,
    });
    if (!shouldSuppressResultsSurface) {
      return panelState;
    }
    return {
      ...panelState,
      shouldShowInteractionLoadingState: false,
      shouldShowInitialLoadingState: false,
      shouldShowLoadingState: false,
      shouldFreezeCoveredResultsRender: false,
      shouldShowResultsCards: false,
      surfaceMode: 'none' as const,
      shouldShowResultsSurface: false,
      surfaceActive: false,
      shouldHideScrollHeaderForSurface: false,
    };
  }, [
    allowsInteractionLoadingState,
    activeTabRenderableRowCount,
    hasResolvedResults,
    shouldSuppressResultsSurface,
    searchHydrationRuntimeState.chromeFreezeClassification,
    searchPresentationRuntimeState.renderPolicy,
    searchResultsRuntimeState.activeTab,
    searchResultsRuntimeState.resultsDishCount,
    searchResultsRuntimeState.resultsIdentityCandidateKey,
    searchResultsRuntimeState.resultsRestaurantCount,
    searchResultsRuntimeState.isSearchLoading,
  ]);
};
