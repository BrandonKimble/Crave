import React from 'react';
import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import styles from '../../styles';
import type { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';

// The results-surface overlays, reduced to their ideal shape (2026-07-06 owner directive):
// the CUTOUT SKELETON is the one and only loading visual. The old plain-white interaction
// cover fill, the 90ms interaction frost layer (+ its handoff-floor dance), and the P5-era
// initial-load white wash are all DELETED — the skeleton surface's own white plate hides the
// stale rows, and the interaction-loading mode is gated on a REAL toggle interaction
// (use-search-root-search-scene-interaction-loading-policy-runtime), so it can never flash
// over a fresh search's revealed cards. Initial loads render the leg's own skeleton page (P5)
// — nothing here. The empty-state surface is unchanged.
export const useSearchRootSearchScenePanelSurfaceOverlayRuntime = ({
  resolvedResultsHeaderHeightForRender,
  filtersHeaderHeight,
  surfaceActive,
  surfaceMode,
  surfaceContentRuntime,
}: {
  resolvedResultsHeaderHeightForRender: number;
  filtersHeaderHeight: number;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
  surfaceContentRuntime: ReturnType<typeof useSearchRootSearchScenePanelSurfaceContentRuntime>;
}) => {
  const headerTopValue = useSharedValue(resolvedResultsHeaderHeightForRender);
  // The toggle-strip (filters) height. On an INTERACTION (toggle) reload the skeleton surface
  // sits just below the strip so the strip stays visible + tappable.
  const filtersHeaderHeightValue = useSharedValue(filtersHeaderHeight);
  const surfaceActiveValue = useSharedValue(surfaceActive ? 1 : 0);
  const interactionLoadingModeValue = useSharedValue(surfaceMode === 'interaction_loading' ? 1 : 0);
  const emptyModeValue = useSharedValue(surfaceMode === 'empty' ? 1 : 0);
  const shouldExposeLoadingCover = surfaceMode === 'interaction_loading';

  React.useEffect(() => {
    headerTopValue.value = resolvedResultsHeaderHeightForRender;
  }, [headerTopValue, resolvedResultsHeaderHeightForRender]);
  React.useEffect(() => {
    filtersHeaderHeightValue.value = filtersHeaderHeight;
  }, [filtersHeaderHeight, filtersHeaderHeightValue]);
  React.useEffect(() => {
    surfaceActiveValue.value = surfaceActive ? 1 : 0;
  }, [surfaceActive, surfaceActiveValue]);
  React.useEffect(() => {
    interactionLoadingModeValue.value = surfaceMode === 'interaction_loading' ? 1 : 0;
    emptyModeValue.value = surfaceMode === 'empty' ? 1 : 0;
  }, [emptyModeValue, interactionLoadingModeValue, surfaceMode]);
  const emptySurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: surfaceActiveValue.value * emptyModeValue.value,
    top: headerTopValue.value,
  }));
  const loadingSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: surfaceActiveValue.value * interactionLoadingModeValue.value,
    // Interaction reload: start below the toggle strip so it stays uncovered.
    top: headerTopValue.value + filtersHeaderHeightValue.value,
  }));

  return React.useMemo(
    () => (
      <>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.resultsSurface, emptySurfaceAnimatedStyle]}
        >
          {surfaceContentRuntime.emptyContent}
        </Reanimated.View>
        {shouldExposeLoadingCover ? (
          <Reanimated.View
            pointerEvents="none"
            style={[styles.resultsLoadingCoverSurface, loadingSurfaceAnimatedStyle]}
          >
            <View
              accessible
              accessibilityLabel="Results loading cover"
              importantForAccessibility="yes"
              pointerEvents="none"
              style={styles.resultsLoadingCoverAccessibilityTarget}
              testID="results-loading-cover"
            />
            <View pointerEvents="none" style={styles.resultsLoadingCoverContent}>
              {surfaceContentRuntime.loadingContent}
            </View>
          </Reanimated.View>
        ) : null}
      </>
    ),
    [
      emptySurfaceAnimatedStyle,
      loadingSurfaceAnimatedStyle,
      shouldExposeLoadingCover,
      surfaceContentRuntime.emptyContent,
      surfaceContentRuntime.loadingContent,
    ]
  );
};
