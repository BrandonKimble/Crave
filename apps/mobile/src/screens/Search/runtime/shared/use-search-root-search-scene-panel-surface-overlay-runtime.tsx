import React from 'react';
import { View } from 'react-native';

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
  surfaceMode,
  surfaceContentRuntime,
}: {
  resolvedResultsHeaderHeightForRender: number;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading' | 'results';
  surfaceContentRuntime: ReturnType<typeof useSearchRootSearchScenePanelSurfaceContentRuntime>;
}) => {
  // THE PINNED LOADING COVER IS DEAD (pending-block arc 2026-07-18, skeleton-sheet law
  // §1): while a redraw episode is live the LIST'S OWN DATA is the pending block (the
  // motion fence in SearchMountedSceneBody presents it), so there are no stale rows to
  // hide, no cover to position (its animated header/strip top math died with it), and
  // no rows-visibility level. The loading face scrolls and drags as the real sheet.
  // The EMPTY surface remains: render-time mount (proven 2026-07-08 — this hook renders
  // in the scene body-spec family where React effects may never commit).
  const shouldExposeEmptySurface = surfaceMode === 'empty';

  return React.useMemo(
    () => (
      <>
        {shouldExposeEmptySurface ? (
          // box-none: the surface itself is touch-transparent, but its children (the
          // failure Retry button) must receive taps.
          <View
            pointerEvents="box-none"
            style={[styles.resultsSurface, { top: resolvedResultsHeaderHeightForRender }]}
          >
            {surfaceContentRuntime.emptyContent}
          </View>
        ) : null}
      </>
    ),
    [
      resolvedResultsHeaderHeightForRender,
      shouldExposeEmptySurface,
      surfaceContentRuntime.emptyContent,
    ]
  );
};
