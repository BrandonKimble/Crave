import React from 'react';

import { useSearchOverlayProfilerRender } from '../../../../overlays/SearchOverlayProfilerContext';
import type { SearchRootSearchSceneVisualRuntime } from './search-root-visual-runtime-contract';
import type { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';
import { useSearchRootSearchScenePanelBackgroundRuntime } from './use-search-root-search-scene-panel-background-runtime';
import { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';
import { useSearchRootSearchScenePanelSurfaceOverlayRuntime } from './use-search-root-search-scene-panel-surface-overlay-runtime';
import { useSearchRootSearchScenePanelWashOverlayRuntime } from './use-search-root-search-scene-panel-wash-overlay-runtime';
import type { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs = {
  sceneVisualRuntime: SearchRootSearchSceneVisualRuntime;
  resolvedResultsHeaderHeightForRender: number;
  filtersHeaderHeight: number;
  shouldDisableSearchBlur?: boolean;
  shouldShowResultsSurface: boolean;
  shouldRenderWhiteWash: boolean;
  shouldUseInteractionSurface: boolean;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
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
  filtersHeaderHeight,
  shouldDisableSearchBlur,
  shouldShowResultsSurface,
  shouldRenderWhiteWash,
  shouldUseInteractionSurface,
  surfaceActive,
  surfaceMode,
  interactionFrostAnimatedStyle,
  activeTab,
  resolvedResults,
  onDemandNotice,
}: SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs) => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  const shouldHoldInitialLoadingForAdmittedRows = false;
  const effectiveSurfaceMode = shouldHoldInitialLoadingForAdmittedRows
    ? 'initial_loading'
    : surfaceMode;
  const effectiveSurfaceActive = surfaceActive || shouldHoldInitialLoadingForAdmittedRows;
  const backgroundComponent = useSearchRootSearchScenePanelBackgroundRuntime({
    resolvedResultsHeaderHeightForRender,
    shouldDisableSearchBlur,
    shouldShowResultsSurface,
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
  });
  const surfaceOverlay = useSearchRootSearchScenePanelSurfaceOverlayRuntime({
    resolvedResultsHeaderHeightForRender,
    filtersHeaderHeight,
    shouldUseInteractionSurface,
    surfaceActive: effectiveSurfaceActive,
    surfaceMode: effectiveSurfaceMode,
    interactionFrostAnimatedStyle,
    surfaceContentRuntime: surfaceContent,
  });
  const overlayComponent = React.useMemo(() => {
    const overlay = React.createElement(React.Fragment, null, washOverlay, surfaceOverlay);
    return onProfilerRender ? (
      <React.Profiler id="SearchResultsLoadingCoverSurface" onRender={onProfilerRender}>
        {overlay}
      </React.Profiler>
    ) : (
      overlay
    );
  }, [onProfilerRender, surfaceOverlay, washOverlay]);

  return React.useMemo(
    () => ({
      backgroundComponent,
      overlayComponent,
    }),
    [backgroundComponent, overlayComponent]
  );
};
