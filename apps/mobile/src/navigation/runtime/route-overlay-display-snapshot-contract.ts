import type { OverlayKey } from '../../overlays/types';

export type RouteOverlayRootSnapshot = {
  rootOverlayKey: OverlayKey;
  isSearchOverlay: boolean;
};

// F5400 — THE DISPLAY LANE PUBLISHES ONE INTEGER, SO ITS SNAPSHOT IS ONE INTEGER.
//
// This type used to carry five fields; four of them (`rootOverlayKey`, `displayedSceneKey`,
// `isSearchOverlay`, `isDockedLane`) had ZERO readers. They were resolved on every recompute,
// keyed into a signature, compared by a five-field comparator, published — and read by nobody.
// One of them was derived off the committed PresentationFrame under an eight-line comment, for
// a consumer that did not exist; the sheet-host's live `displayedSceneKey` is a DIFFERENT lane
// reading the frame itself.
//
// A publication lane's snapshot type IS its contract with its consumers. A field no consumer
// names is not a contract, it is furniture — and furniture in a snapshot is worse than unused,
// because a future reader can start depending on a field the lane's dedupe does not key, and
// be served a stale value. The lane collapses to the value it actually publishes: the
// bottom-nav tab index, resolved ONCE (it used to be derived at three separate sites, free to
// diverge). If `displayedSceneKey` is wanted again it comes back with a subscription — which
// is the point.
export type RouteOverlayDisplaySnapshot = {
  activeTabIndex: number;
};

export type RouteOverlayDockedSceneVisibilitySnapshot = {
  isSearchOverlay: boolean;
  isDockedLane: boolean;
};

export type RouteOverlayChromeMode = 'search' | 'expandedMiddle';

export type RouteOverlayChromeModeSnapshot = {
  routeChromeOverlayMode: RouteOverlayChromeMode;
};
