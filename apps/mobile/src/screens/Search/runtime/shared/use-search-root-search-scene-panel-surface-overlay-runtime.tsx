import React from 'react';
import { View } from 'react-native';
import Reanimated from 'react-native-reanimated';

import styles from '../../styles';
import type { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';
import type { useSearchRootRouteSearchSceneRenderRuntime } from './use-search-root-route-search-scene-render-runtime';

export const useSearchRootSearchScenePanelSurfaceOverlayRuntime = ({
  resolvedResultsHeaderHeightForRender,
  searchSceneRenderRuntime,
  shouldUseInteractionSurface,
  surfaceActive,
  interactionFrostAnimatedStyle,
  surfaceContent,
}: {
  resolvedResultsHeaderHeightForRender: number;
  searchSceneRenderRuntime: ReturnType<
    typeof useSearchRootRouteSearchSceneRenderRuntime
  >;
  shouldUseInteractionSurface: boolean;
  surfaceActive: boolean;
  interactionFrostAnimatedStyle: ReturnType<
    typeof useSearchRootSearchSceneInteractionFrostRuntime
  >['interactionFrostAnimatedStyle'];
  surfaceContent: React.ReactNode;
}) =>
  React.useMemo(() => {
    const initialLoadingTopOffset = resolvedResultsHeaderHeightForRender;
    const interactionLoadingTopOffset =
      initialLoadingTopOffset +
      searchSceneRenderRuntime.effectiveFiltersHeaderHeightForRender;
    const overlayTopOffset =
      shouldUseInteractionSurface
        ? interactionLoadingTopOffset
        : initialLoadingTopOffset;
    const surfaceStyle = shouldUseInteractionSurface
      ? styles.resultsSurfaceInteraction
      : styles.resultsSurface;
    const interactionSurfaceStyle =
      shouldUseInteractionSurface
        ? [surfaceStyle, { top: overlayTopOffset }, interactionFrostAnimatedStyle]
        : null;

    if (
      !surfaceActive ||
      surfaceContent == null
    ) {
      return null;
    }

    if (shouldUseInteractionSurface) {
      return (
        <Reanimated.View style={interactionSurfaceStyle}>
          {surfaceContent}
        </Reanimated.View>
      );
    }

    return <View style={[surfaceStyle, { top: overlayTopOffset }]}>{surfaceContent}</View>;
  }, [
    interactionFrostAnimatedStyle,
    searchSceneRenderRuntime.effectiveFiltersHeaderHeightForRender,
    resolvedResultsHeaderHeightForRender,
    shouldUseInteractionSurface,
    surfaceActive,
    surfaceContent,
  ]);
