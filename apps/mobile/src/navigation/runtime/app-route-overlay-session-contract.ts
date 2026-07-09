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
  armSearchCloseRestore: (options?: AppRouteSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  prepareSearchSessionEntry: (options?: AppRouteSearchSessionEntryOptions) => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
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
