import type {
  SearchRootRouteSearchSceneDataRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootRouteSearchSceneDataStateRuntime } from './use-search-root-route-search-scene-data-state-runtime';
import { useSearchResultsPanelFiltersRuntimeState } from './use-search-results-panel-filters-runtime-state';
import { useSearchRootSearchSceneChromeFreezeRuntime } from './use-search-root-search-scene-chrome-freeze-runtime';
import { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import { useSearchRootSearchSceneInteractionLoadingPolicyRuntime } from './use-search-root-search-scene-interaction-loading-policy-runtime';
import { selectSearchRootRouteSearchSceneRuntimeSignalsRuntime } from './select-search-root-route-search-scene-runtime-signals-runtime';

export const useSearchRootRouteSearchSceneDataRuntime = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  routeSceneSwitchAuthority,
  controlAuthorityRuntime,
  filterModalControlLane,
  readModelPolicyWriters,
}: Pick<
  SearchRootRouteSearchSceneDataRuntimeArgs,
  | 'sessionAssemblyRuntime'
  | 'stateAssemblyRuntime'
  | 'overlayFoundationAssemblyRuntime'
  | 'routeSceneSwitchAuthority'
  | 'controlAuthorityRuntime'
  | 'filterModalControlLane'
  | 'readModelPolicyWriters'
>): SearchRootRuntimeRouteSearchSceneDataRuntime => {
  const routeSearchSceneDataStateRuntime = useSearchRootRouteSearchSceneDataStateRuntime({
    sessionAssemblyRuntime,
    routeSceneSwitchAuthority,
    controlAuthorityRuntime,
    readModelPolicyWriters,
  });
  const routeSearchSceneFiltersRuntimeState = useSearchResultsPanelFiltersRuntimeState(
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus
  );
  const routeSearchSceneHeaderLayoutRuntime = useSearchRootSearchSceneHeaderLayoutRuntime();
  const routeSearchSceneFiltersHeaderRuntime = useSearchRootSearchSceneFiltersHeaderRuntime({
    searchRuntimeBus: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    filterModalControlLane,
    scheduleTabToggleCommit:
      routeSearchSceneDataStateRuntime.routeSearchSceneScheduleTabToggleCommit,
  });
  const routeSearchSceneChromeFreezeRuntime = useSearchRootSearchSceneChromeFreezeRuntime({
    searchResultsRuntimeState: routeSearchSceneDataStateRuntime.routeSearchSceneResultsRuntimeState,
    filtersHeaderRuntime: routeSearchSceneFiltersHeaderRuntime,
    effectiveFiltersHeaderHeight: routeSearchSceneHeaderLayoutRuntime.effectiveFiltersHeaderHeight,
  });
  const routeSearchSceneAllowsInteractionLoadingState =
    useSearchRootSearchSceneInteractionLoadingPolicyRuntime({
      searchSheetContentLaneKind:
        routeSearchSceneDataStateRuntime.routeSearchSceneSearchSheetContentLane.kind,
      searchRuntimeBus: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    });
  const routeSearchSceneHeaderPolicyRuntime = {
    routeSearchSceneFiltersRuntimeState,
    routeSearchSceneHeaderLayoutRuntime,
    routeSearchSceneFiltersHeaderRuntime,
    routeSearchSceneChromeFreezeRuntime,
    routeSearchSceneAllowsInteractionLoadingState,
  };
  const routeSearchSceneRuntimeSignalsRuntime =
    selectSearchRootRouteSearchSceneRuntimeSignalsRuntime({
      sessionAssemblyRuntime,
      stateAssemblyRuntime,
      overlayFoundationAssemblyRuntime,
    });

  return {
    ...routeSearchSceneDataStateRuntime,
    ...routeSearchSceneHeaderPolicyRuntime,
    ...routeSearchSceneRuntimeSignalsRuntime,
  };
};
