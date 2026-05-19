import React from 'react';

import type {
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime } from './use-search-root-search-scene-surface-render-header-source-runtime';
import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import { RESULTS_BOTTOM_PADDING } from '../../constants/search';

export const useSearchRootRouteSearchSceneRenderRuntime = ({
  routeSearchSceneDataRuntime,
  routeSearchSceneReadModelRuntime,
  routeSearchSceneSurfacePanelStateRuntime,
}: {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneReadModelRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime;
  routeSearchSceneSurfacePanelStateRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfacePanelStateRuntime
  >;
}) => {
  const routeSearchSceneSurfaceRenderHeaderSourceRuntime =
    useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime({
      listHeader: routeSearchSceneReadModelRuntime.routeSearchSceneListHeader,
      effectiveFiltersHeaderHeightBase:
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
          .effectiveFiltersHeaderHeightBase,
      searchSceneSurfacePanelStateRuntime: routeSearchSceneSurfacePanelStateRuntime,
    });
  return React.useMemo(
    () => ({
      activeList: 'primary' as const,
      effectiveFiltersHeaderHeightForRender:
        routeSearchSceneSurfaceRenderHeaderSourceRuntime.effectiveFiltersHeaderHeightForRenderLive,
      resultsBodyHeaderHeightForRender: 0,
      resultsContentContainerStyle: {
        paddingTop: 0,
        paddingBottom: RESULTS_BOTTOM_PADDING,
      },
      scrollHeaderForRender: null,
      resultsToggleStripForRender:
        routeSearchSceneSurfaceRenderHeaderSourceRuntime.resultsToggleStripForRenderLive,
    }),
    [
      routeSearchSceneSurfaceRenderHeaderSourceRuntime.effectiveFiltersHeaderHeightForRenderLive,
      routeSearchSceneSurfaceRenderHeaderSourceRuntime.resultsToggleStripForRenderLive,
    ]
  );
};
