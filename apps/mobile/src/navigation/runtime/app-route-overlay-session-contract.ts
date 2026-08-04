import type { TabOverlaySnap } from '../../overlays/searchRouteSessionTypes';

export type AppRouteSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

// F956(g)/(h): this snapshot used to carry THREE booleans — `shouldShowDockedSceneTarget`,
// `shouldShowDockedScene` and `shouldShowPollsSheet` — all three assigned the SAME value by
// the one writer (app-route-overlay-session-state-controller). Two thirds of the snapshot
// was a rename ledger: an equality fn comparing a value to itself twice, and readers picking
// a name by habit rather than by meaning. One target, one name.
export type AppRouteOverlaySessionSnapshot = {
  shouldShowDockedSceneTarget: boolean;
};

// S-C.4 item 3 step 2 — the close-restore origin is a VALUE the caller holds, not a store
// ledger: capture at intent time, pass back at restore time. The arm/commit/cancel/flush
// four-verb ceremony died with the two-switch home dance (the home dismissal's restore rides
// the dismiss verb's ONE terminalDismiss switch; the clear lanes are synchronous).
export type AppRouteOverlaySessionActions = {
  captureSearchCloseOrigin: (
    options?: AppRouteSearchCloseRestoreOptions
  ) => import('../../overlays/searchRouteSessionTypes').OriginSnapshot | null;
  restoreSearchCloseOrigin: (
    origin: import('../../overlays/searchRouteSessionTypes').OriginSnapshot | null
  ) => void;
};

export type AppRouteOverlaySessionAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteOverlaySessionSnapshot;
};

// F956(f): `AppRouteOverlaySessionRuntime` (snapshot & actions) lived here with no
// importer anywhere in apps/mobile/src — the two halves are consumed separately. Deleted.
