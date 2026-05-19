import React from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

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
}) => {
  const headerTopValue = useSharedValue(resolvedResultsHeaderHeightForRender);
  const washMountedValue = useSharedValue(shouldRenderWhiteWash ? 1 : 0);

  React.useEffect(() => {
    headerTopValue.value = resolvedResultsHeaderHeightForRender;
  }, [headerTopValue, resolvedResultsHeaderHeightForRender]);
  React.useEffect(() => {
    washMountedValue.value = shouldRenderWhiteWash ? 1 : 0;
  }, [shouldRenderWhiteWash, washMountedValue]);

  const washPlacementAnimatedStyle = useAnimatedStyle(() => ({
    top: headerTopValue.value,
    transform: [{ scale: washMountedValue.value === 1 ? 1 : 0.001 }],
  }));

  return React.useMemo(
    () => (
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.resultsWashOverlay,
          sceneVisualRuntime.resultsWashAnimatedStyle,
          washPlacementAnimatedStyle,
        ]}
      />
    ),
    [sceneVisualRuntime.resultsWashAnimatedStyle, washPlacementAnimatedStyle]
  );
};
