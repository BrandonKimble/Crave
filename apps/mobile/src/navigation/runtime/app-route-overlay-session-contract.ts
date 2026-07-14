import type { TabOverlaySnap } from '../../overlays/searchRouteSessionTypes';

export type AppRouteSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

export type AppRouteOverlaySessionSnapshot = {
  shouldShowDockedPollsTarget: boolean;
  shouldShowDockedPolls: boolean;
  shouldShowPollsSheet: boolean;
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

export type AppRouteOverlaySessionRuntime = AppRouteOverlaySessionSnapshot &
  AppRouteOverlaySessionActions;
