import React from 'react';

import type { SearchRouteSceneStackShellSpec } from '../../../../overlays/searchOverlayRouteHostContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../../../../overlays/searchOverlayRouteHostContract';
import type { SearchRootSearchScenePanelSurfaceRenderRuntime } from './use-search-root-search-scene-panel-surface-render-runtime';
import type { useSearchRootSearchSceneSheetPlaneRuntime } from './use-search-root-search-scene-sheet-plane-runtime';

export const useSearchRootSearchSceneShellSpecPublicationRuntime = ({
  searchSceneSheetPlaneRuntime,
  shouldShowResultsSurface,
  shouldShowInteractionLoadingState,
  searchScenePanelSurfaceRenderRuntime,
}: {
  searchSceneSheetPlaneRuntime: ReturnType<typeof useSearchRootSearchSceneSheetPlaneRuntime>;
  shouldShowResultsSurface: boolean;
  shouldShowInteractionLoadingState: boolean;
  searchScenePanelSurfaceRenderRuntime: SearchRootSearchScenePanelSurfaceRenderRuntime;
}): SearchRouteSceneStackShellSpec => {
  return React.useMemo(
    () =>
      normalizeSearchRouteSceneStackShellSpec({
        overlayKey: 'search',
        snapPoints: searchSceneSheetPlaneRuntime.snapPoints,
        listScrollEnabled:
          !shouldShowInteractionLoadingState && searchSceneSheetPlaneRuntime.interactionEnabled,
        runtimeModel: searchSceneSheetPlaneRuntime.runtimeModel,
        preventSwipeDismiss: true,
        onDragStateChange: searchSceneSheetPlaneRuntime.handleResultsSheetDragStateChange,
        onSettleStateChange: searchSceneSheetPlaneRuntime.handleResultsSheetSettlingChange,
        style: shouldShowResultsSurface
          ? searchScenePanelSurfaceRenderRuntime.resolvedStyle
          : undefined,
        surfaceStyle: shouldShowResultsSurface
          ? searchScenePanelSurfaceRenderRuntime.resolvedSurfaceStyle
          : undefined,
        onHidden: searchSceneSheetPlaneRuntime.onHidden,
        onSnapStart: searchSceneSheetPlaneRuntime.handleResultsSheetSnapStart,
        onSnapChange: searchSceneSheetPlaneRuntime.handleResultsSheetSnapChange,
        interactionEnabled: searchSceneSheetPlaneRuntime.interactionEnabled,
      }),
    [
      searchScenePanelSurfaceRenderRuntime.resolvedStyle,
      searchScenePanelSurfaceRenderRuntime.resolvedSurfaceStyle,
      searchSceneSheetPlaneRuntime.handleResultsSheetDragStateChange,
      searchSceneSheetPlaneRuntime.handleResultsSheetSettlingChange,
      searchSceneSheetPlaneRuntime.handleResultsSheetSnapChange,
      searchSceneSheetPlaneRuntime.handleResultsSheetSnapStart,
      searchSceneSheetPlaneRuntime.interactionEnabled,
      searchSceneSheetPlaneRuntime.onHidden,
      searchSceneSheetPlaneRuntime.runtimeModel,
      searchSceneSheetPlaneRuntime.snapPoints,
      shouldShowResultsSurface,
      shouldShowInteractionLoadingState,
    ]
  );
};
