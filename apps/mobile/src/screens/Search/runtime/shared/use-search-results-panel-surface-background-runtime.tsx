import React from 'react';
import { View } from 'react-native';

import { FrostedGlassBackground } from '../../../../components/FrostedGlassBackground';
import type { SearchResultsPanelReadModelRuntime } from './use-search-results-panel-read-model-runtime';
import type { SearchResultsPanelRenderPolicyRuntime } from './use-search-results-panel-render-policy-runtime';
import type { SearchResultsPanelCoveredRenderRuntime } from './use-search-results-panel-covered-render-runtime';
import styles from '../../styles';

type UseSearchResultsPanelSurfaceBackgroundRuntimeArgs = {
  readModelRuntime: SearchResultsPanelReadModelRuntime;
  coveredRenderRuntime: SearchResultsPanelCoveredRenderRuntime;
  renderPolicyRuntime: SearchResultsPanelRenderPolicyRuntime;
  shouldDisableSearchBlur: boolean;
};

export type SearchResultsPanelSurfaceBackgroundRuntime = {
  resultsListBackground: React.ReactNode;
};

export const useSearchResultsPanelSurfaceBackgroundRuntime = ({
  readModelRuntime,
  coveredRenderRuntime,
  renderPolicyRuntime,
  shouldDisableSearchBlur,
}: UseSearchResultsPanelSurfaceBackgroundRuntimeArgs): SearchResultsPanelSurfaceBackgroundRuntime => {
  const { resultsReadModelSelectors } = readModelRuntime;
  const { resolvedResultsHeaderHeightForRender } = coveredRenderRuntime;
  const { shouldShowResultsSurface, surfaceMode } = renderPolicyRuntime;

  const initialLoadingTopOffset = resolvedResultsHeaderHeightForRender;
  const preMeasureOverlay = resultsReadModelSelectors.preMeasureOverlay;

  const resultsListBackground = React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return preMeasureOverlay;
    }
    if (shouldDisableSearchBlur) {
      return (
        <>
          <View style={[styles.resultsListBackground, { top: initialLoadingTopOffset }]} />
          {preMeasureOverlay}
        </>
      );
    }
    if (surfaceMode === 'initial_loading') {
      return (
        <>
          <FrostedGlassBackground />
          <View style={[styles.resultsListBackground, { top: initialLoadingTopOffset }]} />
          {preMeasureOverlay}
        </>
      );
    }
    return (
      <>
        <FrostedGlassBackground />
        {preMeasureOverlay}
      </>
    );
  }, [
    initialLoadingTopOffset,
    preMeasureOverlay,
    shouldDisableSearchBlur,
    shouldShowResultsSurface,
    surfaceMode,
  ]);

  return React.useMemo(
    () => ({
      resultsListBackground,
    }),
    [resultsListBackground]
  );
};
