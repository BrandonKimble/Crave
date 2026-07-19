import React from 'react';

import type {
  SearchRootRouteSearchSceneReadModelRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchResultsPanelCardMetadataRuntime } from './use-search-results-panel-card-metadata-runtime';
import { useSearchResultsPanelCardRenderRuntime } from './use-search-results-panel-card-render-runtime';
import { useSearchResultsPanelDishCardMetricsRuntime } from './use-search-results-panel-dish-card-metrics-runtime';
import { useSearchResultsPanelRestaurantCardMetricsRuntime } from './use-search-results-panel-restaurant-card-metrics-runtime';
import { useSearchRootRouteSearchSceneSelectorResultsRuntime } from './use-search-root-route-search-scene-selector-results-runtime';
import { useSearchRootSearchSceneListHeaderRuntime } from './use-search-root-search-scene-list-header-runtime';
import type { SearchRootRuntimeRouteSearchSceneDataRuntime } from './route-search-scene-runtime-contract';

export const useSearchRootRouteSearchSceneReadModelRuntime = ({
  overlayFoundationAssemblyRuntime,
  profileControlRuntime,
  filterModalControlLane,
  routeSearchSceneDataRuntime,
  readModelPolicyWriters,
}: Pick<
  SearchRootRouteSearchSceneReadModelRuntimeArgs,
  | 'overlayFoundationAssemblyRuntime'
  | 'profileControlRuntime'
  | 'filterModalControlLane'
  | 'readModelPolicyWriters'
> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
}): SearchRootRuntimeRouteSearchSceneReadModelRuntime => {
  const routeSearchSceneCardMetadataRuntime = useSearchResultsPanelCardMetadataRuntime({
    resolvedResults:
      routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
  });
  const routeSearchSceneRestaurantCardMetricsRuntime =
    useSearchResultsPanelRestaurantCardMetricsRuntime({
      dishes: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.dishes,
      restaurants: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.restaurants,
      searchRequestId: routeSearchSceneCardMetadataRuntime.searchRequestId,
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
    cardMetadataRuntime: routeSearchSceneCardMetadataRuntime,
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
