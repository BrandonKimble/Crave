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

export const EMPTY_ROUTE_OVERLAY_ROOT_SNAPSHOT: RouteOverlayRootSnapshot = {
  rootOverlayKey: 'search',
  isSearchOverlay: true,
};

export const EMPTY_ROUTE_OVERLAY_DISPLAY_SNAPSHOT: RouteOverlayDisplaySnapshot = {
  rootOverlayKey: 'search',
  displayedRootOverlayKey: 'search',
  displayedSceneKey: 'search',
  isSearchOverlay: true,
  isPersistentPollLane: false,
};

export const EMPTY_ROUTE_OVERLAY_POLLS_VISIBILITY_SNAPSHOT: RouteOverlayPollsVisibilitySnapshot = {
  isSearchOverlay: false,
  isPersistentPollLane: false,
};

export const EMPTY_ROUTE_OVERLAY_CHROME_MODE_SNAPSHOT: RouteOverlayChromeModeSnapshot = {
  routeChromeOverlayMode: 'search',
};
