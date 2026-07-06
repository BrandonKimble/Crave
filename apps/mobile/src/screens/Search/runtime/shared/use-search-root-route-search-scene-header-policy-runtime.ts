import type {
  SearchRootRouteSearchSceneDataRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataStateRuntime,
  SearchRootRuntimeRouteSearchSceneHeaderPolicyRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchResultsPanelFiltersRuntimeState } from './use-search-results-panel-filters-runtime-state';
import { useSearchRootSearchSceneChromeFreezeRuntime } from './use-search-root-search-scene-chrome-freeze-runtime';
import { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import { useSearchRootSearchSceneInteractionLoadingPolicyRuntime } from './use-search-root-search-scene-interaction-loading-policy-runtime';

export const useSearchRootRouteSearchSceneHeaderPolicyRuntime = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  filterModalControlLane,
  routeSearchSceneDataStateRuntime,
}: Pick<
  SearchRootRouteSearchSceneDataRuntimeArgs,
  'sessionAssemblyRuntime' | 'stateAssemblyRuntime' | 'filterModalControlLane'
> & {
  routeSearchSceneDataStateRuntime: SearchRootRuntimeRouteSearchSceneDataStateRuntime;
}): SearchRootRuntimeRouteSearchSceneHeaderPolicyRuntime => {
  const routeSearchSceneFiltersRuntimeState = useSearchResultsPanelFiltersRuntimeState(
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus
  );
  const routeSearchSceneHeaderLayoutRuntime = useSearchRootSearchSceneHeaderLayoutRuntime();
  const routeSearchSceneFiltersHeaderRuntime = useSearchRootSearchSceneFiltersHeaderRuntime({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    filterModalControlLane,
    searchResultsRuntimeState: routeSearchSceneDataStateRuntime.routeSearchSceneResultsRuntimeState,
    searchFiltersRuntimeState: routeSearchSceneFiltersRuntimeState,
    hydrationKeyRuntime: routeSearchSceneDataStateRuntime.routeSearchSceneHydrationKeyRuntime,
    scheduleTabToggleCommit:
      routeSearchSceneDataStateRuntime.routeSearchSceneScheduleTabToggleCommit,
  });
  const routeSearchSceneChromeFreezeRuntime = useSearchRootSearchSceneChromeFreezeRuntime({
    searchResultsRuntimeState: routeSearchSceneDataStateRuntime.routeSearchSceneResultsRuntimeState,
    searchHydrationRuntimeState:
      routeSearchSceneDataStateRuntime.routeSearchSceneHydrationRuntimeState,
    resolvedResultsRuntime: routeSearchSceneDataStateRuntime.routeSearchSceneResolvedResultsRuntime,
    filtersHeaderRuntime: routeSearchSceneFiltersHeaderRuntime,
    effectiveFiltersHeaderHeight: routeSearchSceneHeaderLayoutRuntime.effectiveFiltersHeaderHeight,
    effectiveResultsHeaderHeight: routeSearchSceneHeaderLayoutRuntime.effectiveResultsHeaderHeight,
  });
  const routeSearchSceneAllowsInteractionLoadingState =
    useSearchRootSearchSceneInteractionLoadingPolicyRuntime({
      searchSheetContentLaneKind:
        routeSearchSceneDataStateRuntime.routeSearchSceneSearchSheetContentLane.kind,
      searchRuntimeBus: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    });

  return {
    routeSearchSceneFiltersRuntimeState,
    routeSearchSceneHeaderLayoutRuntime,
    routeSearchSceneFiltersHeaderRuntime,
    routeSearchSceneChromeFreezeRuntime,
    routeSearchSceneAllowsInteractionLoadingState,
  };
};
