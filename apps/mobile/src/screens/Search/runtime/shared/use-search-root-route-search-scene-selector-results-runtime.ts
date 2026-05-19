import React from 'react';

import type { SearchResponse } from '../../../../types';
import { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRouteResultsPolicyReadModelWriterFacets } from './search-route-results-policy-domain-contract';
import type {
  SearchRootRouteSearchSceneReadModelRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
  SearchRootRuntimeRouteSearchSceneSelectorResultsRuntime,
} from './route-search-scene-runtime-contract';
import {
  selectSearchSurfaceVisualPolicy,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';

export const useSearchRootRouteSearchSceneSelectorResultsRuntime = ({
  visualAssemblyRuntime,
  routeSearchSceneDataRuntime,
  routeSearchSceneCardRenderRuntime,
  readModelPolicyWriters,
}: Pick<SearchRootRouteSearchSceneReadModelRuntimeArgs, 'visualAssemblyRuntime'> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneCardRenderRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime['routeSearchSceneCardRenderRuntime'];
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
}): SearchRootRuntimeRouteSearchSceneSelectorResultsRuntime => {
  const shouldHoldResultsHeader = useSearchSurfaceRuntimeSelector(
    React.useCallback(
      (surfaceSnapshot) => selectSearchSurfaceVisualPolicy(surfaceSnapshot).shouldHoldResultsHeader,
      []
    ),
    Object.is
  );
  const routeSearchSceneResultsReadModelSelectors = useSearchResultsReadModelSelectors({
    activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
    dishes: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.dishes,
    restaurants: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.restaurants,
    results: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime
      .resolvedResults as SearchResponse | null,
    isInteractionLoadingActive:
      routeSearchSceneDataRuntime.routeSearchScenePresentationRuntimeState.renderPolicy
        .surfaceMode === 'interaction_loading' &&
      routeSearchSceneDataRuntime.routeSearchSceneAllowsInteractionLoadingState,
    shouldHydrateResultsForRender:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.shouldHydrateResultsForRender,
    searchSurfaceRedrawPhase:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState.searchSurfaceRedrawPhase,
    rawSearchSurfaceRedrawPhase:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState.rawSearchSurfaceRedrawPhase,
    getRawSearchSurfaceRedrawPhase:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState.getRawSearchSurfaceRedrawPhase,
    getAllowHydrationFinalizeCommit:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState
        .getAllowHydrationFinalizeCommit,
    searchSurfaceRedrawCommitSpanPressureActive:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState
        .searchSurfaceRedrawCommitSpanPressureActive,
    mapQueryBudget: routeSearchSceneDataRuntime.routeSearchSceneMapQueryBudget,
    canLoadMore: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.canLoadMore,
    isLoadingMore: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.isLoadingMore,
    onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
    activeTabColor: routeSearchSceneDataRuntime.routeSearchSceneFiltersHeaderRuntime.accentColor,
    shouldDisableResultsHeader:
      (!shouldHoldResultsHeader &&
        routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind ===
          'persistent_poll') ||
      (!shouldHoldResultsHeader &&
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime.submittedQueryForReadModel.trim()
          .length === 0),
    shouldUseResultsHeaderBlur: true,
    submittedQuery:
      routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime.submittedQueryForReadModel,
    handleCloseResults: routeSearchSceneDataRuntime.routeSearchSceneHandleCloseResults,
    handleResultsHeaderLayout:
      routeSearchSceneDataRuntime.routeSearchSceneHeaderLayoutRuntime.handleResultsHeaderLayout,
    overlayHeaderActionProgress:
      visualAssemblyRuntime.sceneVisualRuntime.overlayHeaderActionProgress,
    headerDividerAnimatedStyle:
      routeSearchSceneDataRuntime.routeSearchSceneHeaderDividerAnimatedStyle,
    shouldLogResultsViewability:
      routeSearchSceneDataRuntime.routeSearchSceneShouldLogResultsViewability,
    searchInteractionRef: routeSearchSceneDataRuntime.routeSearchSceneSearchInteractionRef,
    onRuntimeMechanismEvent: routeSearchSceneDataRuntime.routeSearchSceneOnRuntimeMechanismEvent,
    resultsHydrationKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.resultsHydrationKey,
    hydratedResultsKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.hydratedResultsKey,
    hydrationOperationId: null,
    activeOverlayKey: 'search',
    setHydratedResultsKeySync:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.setHydratedResultsKeySync,
    phaseBMaterializerRef: routeSearchSceneDataRuntime.routeSearchScenePhaseBMaterializerRef,
    contentHorizontalPadding:
      routeSearchSceneDataRuntime.routeSearchSceneFiltersHeaderRuntime.contentHorizontalPadding,
    renderDishCard: ((item, index) =>
      routeSearchSceneCardRenderRuntime.renderDishCard(item, index)) as Parameters<
      typeof useSearchResultsReadModelSelectors
    >[0]['renderDishCard'],
    renderRestaurantCard: ((item, index, preparedDescriptor) =>
      routeSearchSceneCardRenderRuntime.renderRestaurantCard(
        item,
        index,
        preparedDescriptor
      )) as Parameters<typeof useSearchResultsReadModelSelectors>[0]['renderRestaurantCard'],
    exactMatchWriter: readModelPolicyWriters.exactMatch,
    readModelProjection: readModelPolicyWriters.projection,
    shouldRetainCommittedResultsForPolicy:
      routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind !== 'persistent_poll',
  });

  return {
    routeSearchSceneResultsReadModelSelectors,
  };
};
