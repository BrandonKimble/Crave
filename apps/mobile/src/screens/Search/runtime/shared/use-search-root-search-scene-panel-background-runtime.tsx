import React from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import styles from '../../styles';

export const useSearchRootSearchScenePanelBackgroundRuntime = ({
  resolvedResultsHeaderHeightForRender,
  shouldDisableSearchBlur = false,
  shouldShowResultsSurface,
}: {
  resolvedResultsHeaderHeightForRender: number;
  shouldDisableSearchBlur?: boolean;
  shouldShowResultsSurface: boolean;
}) => {
  const headerTopValue = useSharedValue(resolvedResultsHeaderHeightForRender);
  const showResultsSurfaceValue = useSharedValue(shouldShowResultsSurface ? 1 : 0);
  const disableSearchBlurValue = useSharedValue(shouldDisableSearchBlur ? 1 : 0);

  React.useEffect(() => {
    headerTopValue.value = resolvedResultsHeaderHeightForRender;
  }, [headerTopValue, resolvedResultsHeaderHeightForRender]);
  React.useEffect(() => {
    showResultsSurfaceValue.value = shouldShowResultsSurface ? 1 : 0;
  }, [showResultsSurfaceValue, shouldShowResultsSurface]);
  React.useEffect(() => {
    disableSearchBlurValue.value = shouldDisableSearchBlur ? 1 : 0;
  }, [disableSearchBlurValue, shouldDisableSearchBlur]);
  const solidBackgroundAnimatedStyle = useAnimatedStyle(() => ({
    opacity: showResultsSurfaceValue.value * disableSearchBlurValue.value,
    top: headerTopValue.value,
  }));

  return React.useMemo(
    () => (
      <>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.resultsListBackground, solidBackgroundAnimatedStyle]}
        />
      </>
    ),
    [solidBackgroundAnimatedStyle]
  );
};
