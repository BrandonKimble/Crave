import type {
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';

export type AppRouteSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

export type AppRoutePostSearchRestoreOptions = {
  mode?: 'full' | 'chrome-only';
};

export type AppRouteOverlaySessionSnapshot = {
  isSearchOriginRestorePending: boolean;
  shouldShowDockedPollsTarget: boolean;
  shouldShowDockedPolls: boolean;
  shouldShowPollsSheet: boolean;
};

export type AppRouteOverlaySessionActions = {
  captureSearchSessionOrigin: () => void;
  armSearchCloseRestore: (
    options?: AppRouteSearchCloseRestoreOptions
  ) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  prepareSearchSessionEntry: (options?: { captureOrigin?: boolean }) => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: (options?: AppRoutePostSearchRestoreOptions) => void;
};

export type AppRouteOverlaySessionAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteOverlaySessionSnapshot;
};

export type AppRouteOverlaySessionRuntime =
  AppRouteOverlaySessionSnapshot &
  AppRouteOverlaySessionActions;

export type AppRouteOverlaySessionControllerSharedSnapState = {
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>;
};
