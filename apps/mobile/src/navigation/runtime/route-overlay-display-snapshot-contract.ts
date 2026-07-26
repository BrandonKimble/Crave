import type { OverlayKey } from '../../overlays/types';

export type RouteOverlayRootSnapshot = {
  rootOverlayKey: OverlayKey;
  isSearchOverlay: boolean;
};

export type RouteOverlayDisplaySnapshot = {
  rootOverlayKey: OverlayKey;
  displayedRootOverlayKey: OverlayKey | null;
  displayedSceneKey: OverlayKey | null;
  isSearchOverlay: boolean;
  isDockedLane: boolean;
};

export type RouteOverlayDockedSceneVisibilitySnapshot = {
  isSearchOverlay: boolean;
  isDockedLane: boolean;
};

export type RouteOverlayChromeMode = 'search' | 'expandedMiddle';

export type RouteOverlayChromeModeSnapshot = {
  routeChromeOverlayMode: RouteOverlayChromeMode;
};
