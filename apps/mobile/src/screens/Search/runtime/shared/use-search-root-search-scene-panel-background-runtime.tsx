import React from 'react';
import { View } from 'react-native';

import { FrostedGlassBackground } from '../../../../components/FrostedGlassBackground';
import styles from '../../styles';

export const useSearchRootSearchScenePanelBackgroundRuntime = ({
  resolvedResultsHeaderHeightForRender,
  preMeasureOverlay,
  shouldDisableSearchBlur = false,
  shouldShowResultsSurface,
  surfaceMode,
}: {
  resolvedResultsHeaderHeightForRender: number;
  preMeasureOverlay: React.ReactNode;
  shouldDisableSearchBlur?: boolean;
  shouldShowResultsSurface: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading';
}) =>
  React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return preMeasureOverlay;
    }
    if (shouldDisableSearchBlur) {
      return (
        <>
          <View
            style={[
              styles.resultsListBackground,
              {
                top: resolvedResultsHeaderHeightForRender,
              },
            ]}
          />
          {preMeasureOverlay}
        </>
      );
    }
    if (surfaceMode === 'initial_loading') {
      return (
        <>
          <FrostedGlassBackground />
          <View
            style={[
              styles.resultsListBackground,
              {
                top: resolvedResultsHeaderHeightForRender,
              },
            ]}
          />
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
    preMeasureOverlay,
    resolvedResultsHeaderHeightForRender,
    shouldDisableSearchBlur,
    shouldShowResultsSurface,
    surfaceMode,
  ]);
