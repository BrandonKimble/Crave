import React from 'react';
import Reanimated from 'react-native-reanimated';

import styles from '../../styles';
import type { SearchRootSearchSceneVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootSearchScenePanelWashOverlayRuntime = ({
  sceneVisualRuntime,
  resolvedResultsHeaderHeightForRender,
  shouldRenderWhiteWash,
}: {
  sceneVisualRuntime: SearchRootSearchSceneVisualRuntime;
  resolvedResultsHeaderHeightForRender: number;
  shouldRenderWhiteWash: boolean;
}) =>
  React.useMemo(() => {
    if (!shouldRenderWhiteWash) {
      return null;
    }

    return (
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.resultsWashOverlay,
          {
            top: resolvedResultsHeaderHeightForRender,
          },
          sceneVisualRuntime.resultsWashAnimatedStyle,
        ]}
      />
    );
  }, [
    sceneVisualRuntime.resultsWashAnimatedStyle,
    resolvedResultsHeaderHeightForRender,
    shouldRenderWhiteWash,
  ]);
