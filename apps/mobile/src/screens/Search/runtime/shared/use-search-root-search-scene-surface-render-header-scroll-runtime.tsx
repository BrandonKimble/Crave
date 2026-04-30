import React from 'react';
import { View, type ViewStyle } from 'react-native';

import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import type { useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime } from './use-search-root-search-scene-surface-render-header-source-runtime';

const HIDDEN_SCROLL_HEADER_STYLE: ViewStyle = { opacity: 0 };

type UseSearchRootSearchSceneSurfaceRenderHeaderScrollRuntimeArgs = {
  searchSceneSurfacePanelStateRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfacePanelStateRuntime
  >;
  searchSceneSurfaceRenderHeaderSourceRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime
  >;
};

export const useSearchRootSearchSceneSurfaceRenderHeaderScrollRuntime = ({
  searchSceneSurfacePanelStateRuntime,
  searchSceneSurfaceRenderHeaderSourceRuntime,
}: UseSearchRootSearchSceneSurfaceRenderHeaderScrollRuntimeArgs) =>
  React.useMemo(() => {
    const { listHeaderForRenderLive } = searchSceneSurfaceRenderHeaderSourceRuntime;
    if (!listHeaderForRenderLive) {
      return null;
    }
    if (!searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface) {
      return listHeaderForRenderLive;
    }
    return (
      <View pointerEvents="none" style={HIDDEN_SCROLL_HEADER_STYLE}>
        {listHeaderForRenderLive}
      </View>
    );
  }, [
    searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface,
    searchSceneSurfaceRenderHeaderSourceRuntime,
  ]);
