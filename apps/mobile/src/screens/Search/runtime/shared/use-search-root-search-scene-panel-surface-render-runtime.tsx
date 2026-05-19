import React from 'react';
import Reanimated from 'react-native-reanimated';

import { overlaySheetStyles } from '../../../../overlays/overlaySheetStyles';
import styles from '../../styles';
import type { useSearchRootSearchScenePanelBackgroundRuntime } from './use-search-root-search-scene-panel-background-runtime';
import type { useSearchRootSearchScenePanelSurfaceOverlayRuntime } from './use-search-root-search-scene-panel-surface-overlay-runtime';
import type { useSearchRootSearchSceneSheetPlaneRuntime } from './use-search-root-search-scene-sheet-plane-runtime';

export const useSearchRootSearchScenePanelSurfaceRenderRuntime = ({
  backgroundComponent,
  overlayComponent,
  searchSceneSheetPlaneRuntime,
}: {
  backgroundComponent: ReturnType<
    typeof useSearchRootSearchScenePanelBackgroundRuntime
  >;
  overlayComponent: ReturnType<
    typeof useSearchRootSearchScenePanelSurfaceOverlayRuntime
  >;
  searchSceneSheetPlaneRuntime: ReturnType<
    typeof useSearchRootSearchSceneSheetPlaneRuntime
  >;
}) => {
  const resolvedStyle = React.useMemo(
    () => [overlaySheetStyles.container, searchSceneSheetPlaneRuntime.style],
    [searchSceneSheetPlaneRuntime.style]
  );
  const resolvedSurfaceStyle = React.useMemo(
    () => [
      overlaySheetStyles.surface,
      styles.resultsSheetSurface,
    ],
    []
  );
  const underlayComponent = React.useMemo(
    () => (
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.resultsShadow,
          searchSceneSheetPlaneRuntime.resultsContainerAnimatedStyle,
        ]}
      />
    ),
    [searchSceneSheetPlaneRuntime.resultsContainerAnimatedStyle]
  );

  return React.useMemo(
    () => ({
      backgroundComponent,
      overlayComponent,
      resolvedStyle,
      resolvedSurfaceStyle,
      underlayComponent,
    }),
    [
      backgroundComponent,
      overlayComponent,
      resolvedStyle,
      resolvedSurfaceStyle,
      underlayComponent,
    ]
  );
};

export type SearchRootSearchScenePanelSurfaceRenderRuntime = ReturnType<
  typeof useSearchRootSearchScenePanelSurfaceRenderRuntime
>;
