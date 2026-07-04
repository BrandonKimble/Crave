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
  isPersistentPollLane: boolean;
};

export type RouteOverlayPollsVisibilitySnapshot = {
  isSearchOverlay: boolean;
  isPersistentPollLane: boolean;
};

export type RouteOverlayChromeMode = 'search' | 'expandedMiddle';

export type RouteOverlayChromeModeSnapshot = {
  routeChromeOverlayMode: RouteOverlayChromeMode;
};
