import type {
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';
import type { LaunchIntentChildAnchor } from './app-route-types';

// Additive options for capturing the launch origin. childAnchor carries the exact comment a
// cross-surface reveal launched from; the dismiss restore READS it (resolveChildOriginRePush →
// re-push pollDetail with the comment anchor) to return to that exact comment.
export type AppRouteSearchSessionEntryOptions = {
  captureOrigin?: boolean;
  childAnchor?: LaunchIntentChildAnchor | null;
};

export type AppRouteSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

export type AppRouteOverlaySessionSnapshot = {
  isSearchOriginRestorePending: boolean;
  shouldShowDockedPollsTarget: boolean;
  shouldShowDockedPolls: boolean;
  shouldShowPollsSheet: boolean;
};

export type AppRouteOverlaySessionActions = {
  captureSearchSessionOrigin: (childAnchor?: LaunchIntentChildAnchor | null) => void;
  armSearchCloseRestore: (options?: AppRouteSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  prepareSearchSessionEntry: (options?: AppRouteSearchSessionEntryOptions) => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  // Return-to-origin foundation — TOP-LEVEL-RICH dismiss seam (the LAST gap).
  // `isTopLevelRichSeededOriginCaptured` is a pure read: true iff the captured origin is a
  // top-level-rich SEEDED origin (bookmarks / profile) — i.e. NOT a degenerate home origin and
  // NOT a re-pushable child (comment→pollDetail). The dismiss caller reads it BEFORE tearing down
  // the surface so the teardown→re-root order matches finalize.
  isTopLevelRichSeededOriginCaptured: () => boolean;
  // If the captured origin is a top-level-rich SEEDED origin, re-root DIRECTLY to it in ONE
  // swapImmediately switch (no `terminalDismiss→polls` intermediate to supersede → no blank) and
  // return true; otherwise no-op and return false (caller falls back to the normal collapse
  // dismiss). The degenerate home + child-origin dismisses never reach this (they return false).
  dismissRestoreToTopLevelRichOrigin: () => boolean;
};

export type AppRouteOverlaySessionAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteOverlaySessionSnapshot;
};

export type AppRouteOverlaySessionRuntime = AppRouteOverlaySessionSnapshot &
  AppRouteOverlaySessionActions;

export type AppRouteOverlaySessionControllerSharedSnapState = {
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>;
};
