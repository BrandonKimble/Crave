import React from 'react';
import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import styles from '../../styles';
import { setResultsRowsHiddenForLoading } from './search-results-rows-visibility';
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
  // TR5-N (initial reveal parity, owner-reported): the INITIAL load needs this cover too. The
  // transition leg's skeleton page ends when the scene settles, but page-1 rows hydrate into the
  // live list BEFORE the reveal joint (cards visibly swapped in ~0.5-1s before the strip+pins;
  // measured rowsAdmission shell->full 483ms ahead of cardsAdmit). Holding the cutout skeleton
  // over the body for the WHOLE initial_loading mode lets the rows mount+measure beneath it
  // (readiness still commits from the list layoutEffect), and the joint then lifts the cover,
  // reveals the strip, and starts the pin ramp on the same tick — the toggle choreography.
  // Full-body offset: the strip is HIDDEN during initial_loading, so no filters-height inset.
  const initialLoadingModeValue = useSharedValue(surfaceMode === 'initial_loading' ? 1 : 0);
  const shouldExposeLoadingCover =
    surfaceMode === 'interaction_loading' || surfaceMode === 'initial_loading';
  // RENDER-TIME, not animated (proven 2026-07-08 on the empty-favorites blank sheet):
  // this hook renders in the scene body-spec family where React effects may never
  // commit — an effect-written shared value stayed 0 while the surface re-rendered 25×
  // with surfaceMode 'empty'. The empty surface mounts/unmounts by render like the
  // loading cover, and its top offset is the render-time prop.
  const shouldExposeEmptySurface = surfaceMode === 'empty';

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
    initialLoadingModeValue.value = surfaceMode === 'initial_loading' ? 1 : 0;
    // TRUE CUTOUTS (owner directive): while EITHER loading cover is up, the rows beneath
    // hide (same write, same frame) so the skeleton's holes are real windows to the
    // hoisted frost — no self-frost fallback, no stale rows through the holes.
    setResultsRowsHiddenForLoading(
      surfaceMode === 'interaction_loading' || surfaceMode === 'initial_loading'
    );
  }, [initialLoadingModeValue, interactionLoadingModeValue, surfaceMode]);
  const loadingSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      surfaceActiveValue.value *
      Math.max(interactionLoadingModeValue.value, initialLoadingModeValue.value),
    // Interaction reload: start below the toggle strip so it stays uncovered. Initial
    // load: the strip is hidden, so the cover is full-body. Both are TRANSPARENT behind
    // the skeleton's own white plate — its holes are real windows down to the hoisted
    // frost (the rows beneath hide via the rows-visibility level, same frame).
    top: headerTopValue.value + filtersHeaderHeightValue.value * interactionLoadingModeValue.value,
  }));

  return React.useMemo(
    () => (
      <>
        {shouldExposeEmptySurface ? (
          <View
            pointerEvents="none"
            style={[styles.resultsSurface, { top: resolvedResultsHeaderHeightForRender }]}
          >
            {surfaceContentRuntime.emptyContent}
          </View>
        ) : null}
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
              {surfaceMode === 'initial_loading'
                ? surfaceContentRuntime.initialLoadingContent
                : surfaceContentRuntime.loadingContent}
            </View>
          </Reanimated.View>
        ) : null}
      </>
    ),
    [
      loadingSurfaceAnimatedStyle,
      resolvedResultsHeaderHeightForRender,
      shouldExposeEmptySurface,
      shouldExposeLoadingCover,
      surfaceMode,
      surfaceContentRuntime.emptyContent,
      surfaceContentRuntime.initialLoadingContent,
      surfaceContentRuntime.loadingContent,
    ]
  );
};
