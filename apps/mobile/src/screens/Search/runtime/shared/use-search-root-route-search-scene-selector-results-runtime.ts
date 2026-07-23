import type { SearchResponse } from '../../../../types';
import { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRouteResultsPolicyReadModelWriterFacets } from './search-route-results-policy-domain-contract';
import type {
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
  SearchRootRuntimeRouteSearchSceneSelectorResultsRuntime,
} from './route-search-scene-runtime-contract';

export const useSearchRootRouteSearchSceneSelectorResultsRuntime = ({
  routeSearchSceneDataRuntime,
  routeSearchSceneCardRenderRuntime,
  readModelPolicyWriters,
}: {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneCardRenderRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime['routeSearchSceneCardRenderRuntime'];
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
}): SearchRootRuntimeRouteSearchSceneSelectorResultsRuntime => {
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
      routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState
        .getRawSearchSurfaceRedrawPhase,
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
    submittedQuery:
      routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime.submittedQueryForReadModel,
    handleCloseResults: routeSearchSceneDataRuntime.routeSearchSceneHandleCloseResults,
    shouldLogResultsViewability:
      routeSearchSceneDataRuntime.routeSearchSceneShouldLogResultsViewability,
    searchInteractionRef: routeSearchSceneDataRuntime.routeSearchSceneSearchInteractionRef,
    onRuntimeMechanismEvent: routeSearchSceneDataRuntime.routeSearchSceneOnRuntimeMechanismEvent,
    resultsIdentityKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.resultsIdentityKey,
    hydratedResultsKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.hydratedResultsKey,
    hydrationOperationId: null,
    activeOverlayKey: 'search',
    setHydratedResultsKeySync:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.setHydratedResultsKeySync,
    phaseBMaterializerRef: routeSearchSceneDataRuntime.routeSearchScenePhaseBMaterializerRef,
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
