import React from 'react';

import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import type { useSearchRootSearchSceneSurfaceRenderRowsRuntime } from './use-search-root-search-scene-surface-render-rows-runtime';

type UseSearchRootSearchSceneSurfaceRenderHeaderSourceRuntimeArgs = {
  listHeader: React.ReactNode;
  effectiveFiltersHeaderHeightBase: number;
  searchSceneSurfacePanelStateRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfacePanelStateRuntime
  >;
  searchSceneSurfaceRenderRowsRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfaceRenderRowsRuntime
  >;
};

export const useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime = ({
  listHeader,
  effectiveFiltersHeaderHeightBase,
  searchSceneSurfacePanelStateRuntime,
  searchSceneSurfaceRenderRowsRuntime,
}: UseSearchRootSearchSceneSurfaceRenderHeaderSourceRuntimeArgs) =>
  React.useMemo(() => {
    const shouldForceListHeaderForInteraction =
      searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState;
    const listHeaderForRenderLive =
      searchSceneSurfaceRenderRowsRuntime.renderRowCountLive > 0 ||
      shouldForceListHeaderForInteraction
        ? listHeader
        : null;
    const effectiveFiltersHeaderHeightForRenderLive =
      searchSceneSurfaceRenderRowsRuntime.renderRowCountLive > 0 ||
      shouldForceListHeaderForInteraction
        ? effectiveFiltersHeaderHeightBase
        : 0;

    return {
      effectiveFiltersHeaderHeightForRenderLive,
      listHeaderForRenderLive,
    };
  }, [
    effectiveFiltersHeaderHeightBase,
    listHeader,
    searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchSceneSurfaceRenderRowsRuntime.renderRowCountLive,
  ]);
