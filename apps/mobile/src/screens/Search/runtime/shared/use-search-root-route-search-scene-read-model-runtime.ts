import React from 'react';

import type {
  SearchRootRouteSearchSceneReadModelRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchResultsPanelCardMarketRuntime } from './use-search-results-panel-card-market-runtime';
import { useSearchResultsPanelCardRenderRuntime } from './use-search-results-panel-card-render-runtime';
import { useSearchResultsPanelDishCardMetricsRuntime } from './use-search-results-panel-dish-card-metrics-runtime';
import { useSearchResultsPanelRestaurantCardMetricsRuntime } from './use-search-results-panel-restaurant-card-metrics-runtime';
import { useSearchRootRouteSearchSceneSelectorResultsRuntime } from './use-search-root-route-search-scene-selector-results-runtime';
import { useSearchRootSearchSceneListHeaderRuntime } from './use-search-root-search-scene-list-header-runtime';
import type { SearchRootRuntimeRouteSearchSceneDataRuntime } from './route-search-scene-runtime-contract';

export const useSearchRootRouteSearchSceneReadModelRuntime = ({
  overlayFoundationAssemblyRuntime,
  visualAssemblyRuntime,
  profileControlRuntime,
  filterModalControlLane,
  routeSearchSceneDataRuntime,
  readModelPolicyWriters,
}: Pick<
  SearchRootRouteSearchSceneReadModelRuntimeArgs,
  | 'overlayFoundationAssemblyRuntime'
  | 'visualAssemblyRuntime'
  | 'profileControlRuntime'
  | 'filterModalControlLane'
  | 'readModelPolicyWriters'
> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
}): SearchRootRuntimeRouteSearchSceneReadModelRuntime => {
  const routeSearchSceneCardMarketRuntime = useSearchResultsPanelCardMarketRuntime({
    resolvedResults:
      routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
  });
  const routeSearchSceneRestaurantCardMetricsRuntime =
    useSearchResultsPanelRestaurantCardMetricsRuntime({
      dishes: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.dishes,
      restaurants: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.restaurants,
      searchRequestId: routeSearchSceneCardMarketRuntime.searchRequestId,
    });
  const routeSearchSceneDishCardMetricsRuntime = useSearchResultsPanelDishCardMetricsRuntime({
    dishes: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.dishes,
  });
  const routeSearchSceneCardRenderRuntime = useSearchResultsPanelCardRenderRuntime({
    getDishSaveHandler:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.routeOverlayCommandActions
        .getDishSaveHandler,
    getRestaurantSaveHandler:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.routeOverlayCommandActions
        .getRestaurantSaveHandler,
    stableOpenRestaurantProfileFromResults:
      profileControlRuntime.profilePresentationControlLane.stableOpenRestaurantProfileFromResults,
    openScoreInfo: filterModalControlLane.filterModalRuntime.openScoreInfo,
    cardMarketRuntime: routeSearchSceneCardMarketRuntime,
    dishCardMetricsRuntime: routeSearchSceneDishCardMetricsRuntime,
    restaurantCardMetricsRuntime: routeSearchSceneRestaurantCardMetricsRuntime,
  });
  const routeSearchSceneListHeader = useSearchRootSearchSceneListHeaderRuntime({
    filtersHeaderRuntimeForReadModel:
      routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
        .filtersHeaderRuntimeForReadModel,
    handleFiltersHeaderLayout:
      routeSearchSceneDataRuntime.routeSearchSceneHeaderLayoutRuntime.handleFiltersHeaderLayout,
  });
  const routeSearchSceneSelectorResultsRuntime =
    useSearchRootRouteSearchSceneSelectorResultsRuntime({
      visualAssemblyRuntime,
      routeSearchSceneDataRuntime,
      routeSearchSceneCardRenderRuntime,
      readModelPolicyWriters,
    });

  return React.useMemo(
    () => ({
      routeSearchSceneCardRenderRuntime,
      routeSearchSceneListHeader,
      ...routeSearchSceneSelectorResultsRuntime,
    }),
    [
      routeSearchSceneCardRenderRuntime,
      routeSearchSceneListHeader,
      routeSearchSceneSelectorResultsRuntime,
    ]
  );
};
