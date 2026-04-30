import React from 'react';

import type {
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
} from './route-search-scene-runtime-contract';
import { createSearchRootSearchSceneCoveredRenderFreezeRuntime } from '../controller/search-root-search-scene-covered-render-freeze-runtime';
import { useSearchRootSearchSceneSurfaceRenderHeaderScrollRuntime } from './use-search-root-search-scene-surface-render-header-scroll-runtime';
import { useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime } from './use-search-root-search-scene-surface-render-header-source-runtime';
import { useSearchRootSearchSceneSurfaceRenderRowsRuntime } from './use-search-root-search-scene-surface-render-rows-runtime';
import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';

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
  const routeSearchSceneSurfaceRenderRowsRuntime =
    useSearchRootSearchSceneSurfaceRenderRowsRuntime({
      activeTab:
        routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState
          .activeTab,
      resultsReadModelSelectors:
        routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors,
    });
  const routeSearchSceneSurfaceRenderHeaderSourceRuntime =
    useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime({
      listHeader: routeSearchSceneReadModelRuntime.routeSearchSceneListHeader,
      effectiveFiltersHeaderHeightBase:
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
          .effectiveFiltersHeaderHeightBase,
      searchSceneSurfacePanelStateRuntime:
        routeSearchSceneSurfacePanelStateRuntime,
      searchSceneSurfaceRenderRowsRuntime:
        routeSearchSceneSurfaceRenderRowsRuntime,
    });
  const routeSearchSceneScrollHeaderForRenderLive =
    useSearchRootSearchSceneSurfaceRenderHeaderScrollRuntime({
      searchSceneSurfacePanelStateRuntime:
        routeSearchSceneSurfacePanelStateRuntime,
      searchSceneSurfaceRenderHeaderSourceRuntime:
        routeSearchSceneSurfaceRenderHeaderSourceRuntime,
    });
  const coveredRenderFreezeRuntimeRef = React.useRef<
    ReturnType<typeof createSearchRootSearchSceneCoveredRenderFreezeRuntime> | null
  >(null);

  if (coveredRenderFreezeRuntimeRef.current == null) {
    coveredRenderFreezeRuntimeRef.current =
      createSearchRootSearchSceneCoveredRenderFreezeRuntime();
  }

  const renderRuntimeValue = coveredRenderFreezeRuntimeRef.current.resolve({
    shouldFreezeCoveredResultsRender:
      routeSearchSceneSurfacePanelStateRuntime.shouldFreezeCoveredResultsRender,
    activeListLive: routeSearchSceneSurfaceRenderRowsRuntime.activeListLive,
    primaryRowsLive: routeSearchSceneSurfaceRenderRowsRuntime.primaryRowsLive,
    secondaryRowsLive:
      routeSearchSceneSurfaceRenderRowsRuntime.secondaryRowsLive,
    scrollHeaderForRenderLive: routeSearchSceneScrollHeaderForRenderLive,
    effectiveFiltersHeaderHeightForRenderLive:
      routeSearchSceneSurfaceRenderHeaderSourceRuntime.effectiveFiltersHeaderHeightForRenderLive,
    renderRowCountLive:
      routeSearchSceneSurfaceRenderRowsRuntime.renderRowCountLive,
  });

  return React.useMemo(
    () => ({
      activeList: renderRuntimeValue.activeList,
      effectiveFiltersHeaderHeightForRender:
        renderRuntimeValue.effectiveFiltersHeaderHeightForRender,
      primaryRowsForRender: renderRuntimeValue.primaryRowsForRender,
      resultsContentContainerStyle:
        renderRuntimeValue.resultsContentContainerStyle,
      scrollHeaderForRender: renderRuntimeValue.scrollHeaderForRender,
      secondaryRowsForRender: renderRuntimeValue.secondaryRowsForRender,
    }),
    [
      renderRuntimeValue.activeList,
      renderRuntimeValue.effectiveFiltersHeaderHeightForRender,
      renderRuntimeValue.primaryRowsForRender,
      renderRuntimeValue.resultsContentContainerStyle,
      renderRuntimeValue.scrollHeaderForRender,
      renderRuntimeValue.secondaryRowsForRender,
    ]
  );
};
