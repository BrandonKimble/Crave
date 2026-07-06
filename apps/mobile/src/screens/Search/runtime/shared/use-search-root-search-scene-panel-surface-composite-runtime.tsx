import React from 'react';

import { useSearchOverlayProfilerRender } from '../../../../overlays/SearchOverlayProfilerContext';
import { useSearchRootSearchScenePanelBackgroundRuntime } from './use-search-root-search-scene-panel-background-runtime';
import { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';
import { useSearchRootSearchScenePanelSurfaceOverlayRuntime } from './use-search-root-search-scene-panel-surface-overlay-runtime';
import type { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs = {
  resolvedResultsHeaderHeightForRender: number;
  filtersHeaderHeight: number;
  shouldDisableSearchBlur?: boolean;
  shouldShowResultsSurface: boolean;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
  activeTab: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>['activeTab'];
  resolvedResults: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >['resolvedResults'];
  onDemandNotice: ReturnType<typeof useSearchResultsPanelOnDemandNoticeRuntime>;
};

export const useSearchRootSearchScenePanelSurfaceCompositeRuntime = ({
  resolvedResultsHeaderHeightForRender,
  filtersHeaderHeight,
  shouldDisableSearchBlur,
  shouldShowResultsSurface,
  surfaceActive,
  surfaceMode,
  activeTab,
  resolvedResults,
  onDemandNotice,
}: SearchRootSearchScenePanelSurfaceCompositeRuntimeArgs) => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  const backgroundComponent = useSearchRootSearchScenePanelBackgroundRuntime({
    resolvedResultsHeaderHeightForRender,
    shouldDisableSearchBlur,
    shouldShowResultsSurface,
  });
  const surfaceContent = useSearchRootSearchScenePanelSurfaceContentRuntime({
    resolvedResults,
    activeTab,
    onDemandNotice,
  });
  const surfaceOverlay = useSearchRootSearchScenePanelSurfaceOverlayRuntime({
    resolvedResultsHeaderHeightForRender,
    filtersHeaderHeight,
    surfaceActive,
    surfaceMode,
    surfaceContentRuntime: surfaceContent,
  });
  const overlayComponent = React.useMemo(() => {
    return onProfilerRender ? (
      <React.Profiler id="SearchResultsLoadingCoverSurface" onRender={onProfilerRender}>
        {surfaceOverlay}
      </React.Profiler>
    ) : (
      surfaceOverlay
    );
  }, [onProfilerRender, surfaceOverlay]);

  return React.useMemo(
    () => ({
      backgroundComponent,
      overlayComponent,
    }),
    [backgroundComponent, overlayComponent]
  );
};
