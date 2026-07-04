import React from 'react';
import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import styles from '../../styles';
import type { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';
import type { useSearchRootSearchScenePanelSurfaceContentRuntime } from './use-search-root-search-scene-panel-surface-content-runtime';

// P5 (page-switch-master-plan.md §6-P5 / owner req 2e): the INITIAL-load self-frost cover is
// DELETED. The search leg is a first-class page now — during an initial load the leg itself
// paints the results skeleton (the never-null skeleton page pre-bundle, then the list's
// ListEmptyComponent skeleton), frost-through to the map like every other scene-stack leg, and
// the reveal join completes the skeleton→results swap as the switch's paint-ack. The cover's old
// job (hiding the outgoing feed during the reveal crossfade) is structural now: 'search' is a
// SEEDED hard-swap target, so there IS no outgoing feed under the presented leg.
//
// The INTERACTION (toggle-reload) cover below is a QUERY-flow surface and stays byte-identical —
// it hides the STALE rows of the current results while a toggle refetch runs, pushed below the
// toggle strip so the strip stays visible + tappable. Its ideal shape belongs to the
// toggle-strip effort (TR5), not the page-switch work.
export const useSearchRootSearchScenePanelSurfaceOverlayRuntime = ({
  resolvedResultsHeaderHeightForRender,
  filtersHeaderHeight,
  shouldUseInteractionSurface,
  surfaceActive,
  surfaceMode,
  interactionFrostAnimatedStyle,
  surfaceContentRuntime,
}: {
  resolvedResultsHeaderHeightForRender: number;
  filtersHeaderHeight: number;
  shouldUseInteractionSurface: boolean;
  surfaceActive: boolean;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
  interactionFrostAnimatedStyle: ReturnType<
    typeof useSearchRootSearchSceneInteractionFrostRuntime
  >['interactionFrostAnimatedStyle'];
  surfaceContentRuntime: ReturnType<typeof useSearchRootSearchScenePanelSurfaceContentRuntime>;
}) => {
  const headerTopValue = useSharedValue(resolvedResultsHeaderHeightForRender);
  // The toggle-strip (filters) height. On an INTERACTION (toggle) reload the loading surface sits
  // just below the strip so the strip stays visible + tappable and the loading state animates
  // under it.
  const filtersHeaderHeightValue = useSharedValue(filtersHeaderHeight);
  const useInteractionSurfaceValue = useSharedValue(shouldUseInteractionSurface ? 1 : 0);
  const surfaceActiveValue = useSharedValue(surfaceActive ? 1 : 0);
  const interactionLoadingModeValue = useSharedValue(surfaceMode === 'interaction_loading' ? 1 : 0);
  const emptyModeValue = useSharedValue(surfaceMode === 'empty' ? 1 : 0);
  // P5: only the interaction (toggle) reload exposes the loading cover; the initial load renders
  // NOTHING here — the leg's own skeleton page/list is the loading visual.
  const shouldExposeLoadingCover = surfaceMode === 'interaction_loading';

  React.useEffect(() => {
    headerTopValue.value = resolvedResultsHeaderHeightForRender;
  }, [headerTopValue, resolvedResultsHeaderHeightForRender]);
  React.useEffect(() => {
    filtersHeaderHeightValue.value = filtersHeaderHeight;
  }, [filtersHeaderHeight, filtersHeaderHeightValue]);
  React.useEffect(() => {
    useInteractionSurfaceValue.value = shouldUseInteractionSurface ? 1 : 0;
  }, [shouldUseInteractionSurface, useInteractionSurfaceValue]);
  React.useEffect(() => {
    surfaceActiveValue.value = surfaceActive ? 1 : 0;
  }, [surfaceActive, surfaceActiveValue]);
  React.useEffect(() => {
    interactionLoadingModeValue.value = surfaceMode === 'interaction_loading' ? 1 : 0;
    emptyModeValue.value = surfaceMode === 'empty' ? 1 : 0;
  }, [emptyModeValue, interactionLoadingModeValue, surfaceMode]);
  const normalSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value * (1 - useInteractionSurfaceValue.value) * emptyModeValue.value,
    top: headerTopValue.value,
  }));
  const loadingSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: surfaceActiveValue.value * interactionLoadingModeValue.value,
    // Interaction reload: start below the toggle strip so it stays uncovered.
    top: headerTopValue.value + interactionLoadingModeValue.value * filtersHeaderHeightValue.value,
  }));
  const interactionSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value *
      useInteractionSurfaceValue.value *
      interactionLoadingModeValue.value,
    top: headerTopValue.value + interactionLoadingModeValue.value * filtersHeaderHeightValue.value,
  }));
  const loadingContentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interactionLoadingModeValue.value,
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
        {shouldExposeLoadingCover ? (
          <Reanimated.View
            pointerEvents="none"
            style={[styles.resultsLoadingCoverSurface, loadingSurfaceAnimatedStyle]}
          >
            <View pointerEvents="none" style={styles.resultsLoadingCoverFill} />
            <View
              accessible
              accessibilityLabel="Results loading cover"
              importantForAccessibility="yes"
              pointerEvents="none"
              style={styles.resultsLoadingCoverAccessibilityTarget}
              testID="results-loading-cover"
            />
            <Reanimated.View pointerEvents="none" style={loadingContentAnimatedStyle}>
              {surfaceContentRuntime.loadingContent}
            </Reanimated.View>
          </Reanimated.View>
        ) : null}
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
      shouldExposeLoadingCover,
      surfaceContentRuntime.emptyContent,
      surfaceContentRuntime.loadingContent,
    ]
  );
};
