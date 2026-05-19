import React from 'react';
import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import styles from '../../styles';
import type { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';
import type { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';

export const useSearchRootSearchScenePanelSurfaceOverlayRuntime = ({
  resolvedResultsHeaderHeightForRender,
  shouldUseInteractionSurface,
  surfaceActive,
  surfaceMode,
  interactionFrostAnimatedStyle,
  surfaceContentRuntime,
}: {
  resolvedResultsHeaderHeightForRender: number;
  shouldUseInteractionSurface: boolean;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
  interactionFrostAnimatedStyle: ReturnType<
    typeof useSearchRootSearchSceneInteractionFrostRuntime
  >['interactionFrostAnimatedStyle'];
  surfaceContentRuntime: ReturnType<typeof useSearchRootSearchScenePanelSurfaceContentRuntime>;
}) => {
  const headerTopValue = useSharedValue(resolvedResultsHeaderHeightForRender);
  const useInteractionSurfaceValue = useSharedValue(shouldUseInteractionSurface ? 1 : 0);
  const surfaceActiveValue = useSharedValue(surfaceActive ? 1 : 0);
  const initialLoadingModeValue = useSharedValue(surfaceMode === 'initial_loading' ? 1 : 0);
  const interactionLoadingModeValue = useSharedValue(surfaceMode === 'interaction_loading' ? 1 : 0);
  const emptyModeValue = useSharedValue(surfaceMode === 'empty' ? 1 : 0);
  const shouldExposeLoadingCover =
    surfaceMode === 'initial_loading' || surfaceMode === 'interaction_loading';

  React.useEffect(() => {
    headerTopValue.value = resolvedResultsHeaderHeightForRender;
  }, [headerTopValue, resolvedResultsHeaderHeightForRender]);
  React.useEffect(() => {
    useInteractionSurfaceValue.value = shouldUseInteractionSurface ? 1 : 0;
  }, [shouldUseInteractionSurface, useInteractionSurfaceValue]);
  React.useEffect(() => {
    surfaceActiveValue.value = surfaceActive ? 1 : 0;
  }, [surfaceActive, surfaceActiveValue]);
  React.useEffect(() => {
    initialLoadingModeValue.value = surfaceMode === 'initial_loading' ? 1 : 0;
    interactionLoadingModeValue.value = surfaceMode === 'interaction_loading' ? 1 : 0;
    emptyModeValue.value = surfaceMode === 'empty' ? 1 : 0;
  }, [emptyModeValue, initialLoadingModeValue, interactionLoadingModeValue, surfaceMode]);
  const normalSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value * (1 - useInteractionSurfaceValue.value) * emptyModeValue.value,
    top: headerTopValue.value,
  }));
  const loadingSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value *
      Math.max(initialLoadingModeValue.value, interactionLoadingModeValue.value),
    top: headerTopValue.value,
  }));
  const interactionSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value *
      useInteractionSurfaceValue.value *
      interactionLoadingModeValue.value,
    top: headerTopValue.value,
  }));
  const loadingContentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(initialLoadingModeValue.value, interactionLoadingModeValue.value),
  }));
  const emptyContentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: emptyModeValue.value,
  }));

  return React.useMemo(
    () => (
      <>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.resultsSurface, normalSurfaceAnimatedStyle]}
        >
          <Reanimated.View pointerEvents="none" style={emptyContentAnimatedStyle}>
            {surfaceContentRuntime.emptyContent}
          </Reanimated.View>
        </Reanimated.View>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.resultsLoadingCoverSurface, loadingSurfaceAnimatedStyle]}
        >
          {shouldExposeLoadingCover ? (
            <View pointerEvents="none" style={styles.resultsLoadingCoverFill} />
          ) : null}
          {shouldExposeLoadingCover ? (
            <View
              accessible
              accessibilityLabel="Results loading cover"
              importantForAccessibility="yes"
              pointerEvents="none"
              style={styles.resultsLoadingCoverAccessibilityTarget}
              testID="results-loading-cover"
            />
          ) : null}
          <Reanimated.View pointerEvents="none" style={loadingContentAnimatedStyle}>
            {surfaceContentRuntime.loadingContent}
          </Reanimated.View>
        </Reanimated.View>
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.resultsSurfaceInteraction,
            interactionFrostAnimatedStyle,
            interactionSurfaceAnimatedStyle,
          ]}
        />
      </>
    ),
    [
      emptyContentAnimatedStyle,
      interactionFrostAnimatedStyle,
      interactionSurfaceAnimatedStyle,
      loadingSurfaceAnimatedStyle,
      loadingContentAnimatedStyle,
      normalSurfaceAnimatedStyle,
      headerTopValue,
      shouldExposeLoadingCover,
      surfaceActiveValue,
      surfaceContentRuntime.emptyContent,
      surfaceContentRuntime.loadingContent,
    ]
  );
};
