import React from 'react';

import type { SearchRootSearchSceneVisualRuntime } from './search-root-visual-runtime-contract';
import type { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';
import { useSearchRootSearchScenePanelBackgroundRuntime } from './use-search-root-search-scene-panel-background-runtime';
import { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';
import { useSearchRootSearchScenePanelSurfaceOverlayRuntime } from './use-search-root-search-scene-panel-surface-overlay-runtime';
import { useSearchRootSearchScenePanelWashOverlayRuntime } from './use-search-root-search-scene-panel-wash-overlay-runtime';
import type { useSearchRootRouteSearchSceneRenderRuntime } from './use-search-root-route-search-scene-render-runtime';
import type { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs = {
  sceneVisualRuntime: SearchRootSearchSceneVisualRuntime;
  resolvedResultsHeaderHeightForRender: number;
  preMeasureOverlay: React.ReactNode;
  shouldDisableSearchBlur?: boolean;
  shouldShowResultsSurface: boolean;
  shouldRenderWhiteWash: boolean;
  shouldUseInteractionSurface: boolean;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading';
  searchSceneRenderRuntime: ReturnType<typeof useSearchRootRouteSearchSceneRenderRuntime>;
  interactionFrostAnimatedStyle: ReturnType<
    typeof useSearchRootSearchSceneInteractionFrostRuntime
  >['interactionFrostAnimatedStyle'];
  activeTab: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>['activeTab'];
  resolvedResults: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >['resolvedResults'];
  onDemandNotice: ReturnType<typeof useSearchResultsPanelOnDemandNoticeRuntime>;
};

export const useSearchRootSearchScenePanelSurfaceCompositeRuntime = ({
  sceneVisualRuntime,
  resolvedResultsHeaderHeightForRender,
  preMeasureOverlay,
  shouldDisableSearchBlur,
  shouldShowResultsSurface,
  shouldRenderWhiteWash,
  shouldUseInteractionSurface,
  surfaceActive,
  surfaceMode,
  searchSceneRenderRuntime,
  interactionFrostAnimatedStyle,
  activeTab,
  resolvedResults,
  onDemandNotice,
}: SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs) => {
  const backgroundComponent = useSearchRootSearchScenePanelBackgroundRuntime({
    resolvedResultsHeaderHeightForRender,
    preMeasureOverlay,
    shouldDisableSearchBlur,
    shouldShowResultsSurface,
    surfaceMode,
  });
  const washOverlay = useSearchRootSearchScenePanelWashOverlayRuntime({
    sceneVisualRuntime,
    resolvedResultsHeaderHeightForRender,
    shouldRenderWhiteWash,
  });
  const surfaceContent = useSearchRootSearchScenePanelSurfaceContentRuntime({
    resolvedResults,
    activeTab,
    onDemandNotice,
    surfaceMode,
  });
  const surfaceOverlay = useSearchRootSearchScenePanelSurfaceOverlayRuntime({
    resolvedResultsHeaderHeightForRender,
    searchSceneRenderRuntime,
    shouldUseInteractionSurface,
    surfaceActive,
    interactionFrostAnimatedStyle,
    surfaceContent,
  });
  const overlayComponent = React.useMemo(
    () => React.createElement(React.Fragment, null, washOverlay, surfaceOverlay),
    [surfaceOverlay, washOverlay]
  );

  return React.useMemo(
    () => ({
      backgroundComponent,
      overlayComponent,
    }),
    [backgroundComponent, overlayComponent]
  );
};
