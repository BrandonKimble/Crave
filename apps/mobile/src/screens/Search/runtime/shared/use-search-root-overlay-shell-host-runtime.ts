import React from 'react';

import type { SearchOverlayShellHostSnapshot } from './search-overlay-shell-host-snapshot-contract';
import type {
  SearchRootOverlayHostRuntimeParams,
  SearchRootOverlayShellHostRuntime,
} from './search-root-overlay-host-runtime-contract';
import { useSearchRootOverlayGateVisualSourceRuntime } from './use-search-root-overlay-gate-visual-source-runtime';
import { useSearchRootOverlayBottomNavVisualRuntime } from './use-search-root-overlay-bottom-nav-visual-runtime';
import { useSearchRootOverlayPriceModalLayerRuntime } from './use-search-root-overlay-price-modal-layer-runtime';
import { useSearchRootOverlayRankAndScoreModalLayerRuntime } from './use-search-root-overlay-rank-and-score-modal-layer-runtime';

export const useSearchRootOverlayShellHostRuntime = ({
  appEntryPlaneRuntime,
  rootOverlayFoundationRuntime,
  overlayHostVisualRuntime,
  filterModalControlLane,
}: Pick<
  SearchRootOverlayHostRuntimeParams,
  | 'appEntryPlaneRuntime'
  | 'rootOverlayFoundationRuntime'
  | 'overlayHostVisualRuntime'
  | 'filterModalControlLane'
>): SearchRootOverlayShellHostRuntime => {
  const overlayGateSnapshot = useSearchRootOverlayGateVisualSourceRuntime({
    appEntryPlaneRuntime,
    rootOverlayFoundationRuntime,
    visualRuntime: overlayHostVisualRuntime,
  });
  const bottomNavVisualInputs = useSearchRootOverlayBottomNavVisualRuntime({
    rootOverlayFoundationRuntime,
    visualRuntime: overlayHostVisualRuntime,
  });
  const rankAndScoreModalLayer = useSearchRootOverlayRankAndScoreModalLayerRuntime({
    rootOverlayFoundationRuntime,
    filterModalControlLane,
  });
  const priceModalLayer = useSearchRootOverlayPriceModalLayerRuntime({
    rootOverlayFoundationRuntime,
    filterModalControlLane,
  });
  const statusBarFadeHeight = overlayGateSnapshot.isFocused
    ? overlayGateSnapshot.statusBarFadeHeight
    : null;
  const backdropFocused = overlayGateSnapshot.isFocused;
  const backdropDimProgress = overlayHostVisualRuntime.overlayBackdropDimProgress;
  const overlayShellHostSnapshot = React.useMemo<SearchOverlayShellHostSnapshot>(
    () => ({
      isFocused: appEntryPlaneRuntime.isFocused && backdropFocused,
      statusBarFadeHeight,
      backdropDimProgress,
      bottomNavVisualInputs,
      rankAndScoreModalLayer,
      priceModalLayer,
    }),
    [
      appEntryPlaneRuntime.isFocused,
      backdropDimProgress,
      backdropFocused,
      bottomNavVisualInputs,
      priceModalLayer,
      rankAndScoreModalLayer,
      statusBarFadeHeight,
    ]
  );

  return {
    overlayGateSnapshot,
    overlayShellSnapshot: overlayShellHostSnapshot,
  };
};
