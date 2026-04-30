import type {
  SearchRootRouteSearchSceneDataRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootRouteSearchSceneDataStateRuntime } from './use-search-root-route-search-scene-data-state-runtime';
import { useSearchRootRouteSearchSceneHeaderPolicyRuntime } from './use-search-root-route-search-scene-header-policy-runtime';
import { useSearchRootRouteSearchSceneRuntimeSignalsRuntime } from './use-search-root-route-search-scene-runtime-signals-runtime';

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
  const routeSearchSceneHeaderPolicyRuntime = useSearchRootRouteSearchSceneHeaderPolicyRuntime({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    filterModalControlLane,
    routeSearchSceneDataStateRuntime,
  });
  const routeSearchSceneRuntimeSignalsRuntime = useSearchRootRouteSearchSceneRuntimeSignalsRuntime({
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
