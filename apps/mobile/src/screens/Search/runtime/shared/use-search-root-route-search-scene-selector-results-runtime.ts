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
    canLoadMore: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.canLoadMore,
    isLoadingMore: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.isLoadingMore,
    onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
    activeTabColor: routeSearchSceneDataRuntime.routeSearchSceneFiltersHeaderRuntime.accentColor,
    submittedQuery:
      routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime.submittedQueryForReadModel,
    handleCloseResults: routeSearchSceneDataRuntime.routeSearchSceneHandleCloseResults,
    searchInteractionRef: routeSearchSceneDataRuntime.routeSearchSceneSearchInteractionRef,
    onRuntimeMechanismEvent: routeSearchSceneDataRuntime.routeSearchSceneOnRuntimeMechanismEvent,
    resultsIdentityKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.resultsIdentityKey,
    hydratedResultsKey:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.hydratedResultsKey,
    // F1328: deliberately NOT threaded from the runtime flags' derived redraw operation id —
    // these read-model selectors decide hydration off resultsIdentityKey/hydratedResultsKey
    // only, so they must not couple to the redraw-operation identity (a real value exists one
    // runtime away at use-search-root-runtime-flags-runtime.ts, on purpose not read here).
    hydrationOperationId: null,
    // This selector runtime only ever backs the 'search' route scene.
    activeOverlayKey: 'search',
    setHydratedResultsKeySync:
      routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime.setHydratedResultsKeySync,
    phaseBMaterializerRef: routeSearchSceneDataRuntime.routeSearchScenePhaseBMaterializerRef,
    renderDishCard: routeSearchSceneCardRenderRuntime.renderDishCard,
    renderRestaurantCard: routeSearchSceneCardRenderRuntime.renderRestaurantCard,
    exactMatchWriter: readModelPolicyWriters.exactMatch,
    readModelProjection: readModelPolicyWriters.projection,
    shouldRetainCommittedResultsForPolicy:
      routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind !== 'docked_scene',
  });

  return {
    routeSearchSceneResultsReadModelSelectors,
  };
};
