import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { OverlayKey } from '../store/overlayStore';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import {
  requestSearchRouteDockedRestore,
  useSearchRouteOverlayCommandStore,
} from './searchRouteOverlayCommandStore';
import { useSearchRouteSessionStore } from './searchRouteSessionStore';
import { resolveSearchLaunchOriginSnap } from './searchRouteSessionUtils';
import type {
  SearchOverlaySheetSnap,
  SearchSessionOriginContext,
  TabOverlaySnap,
} from './searchRouteSessionTypes';

type UseSearchRouteSessionControllerArgs = {
  rootOverlay: OverlayKey;
  pollsSheetSnap: SearchOverlaySheetSnap;
  bookmarksSheetSnap: SearchOverlaySheetSnap;
  profileSheetSnap: SearchOverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>;
};

type SearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

export type SearchRouteSessionControllerRuntime = {
  isSearchOriginRestorePending: boolean;
  captureSearchSessionOrigin: () => void;
  armSearchCloseRestore: (options?: SearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
};

const restoreSearchOriginContext = (origin: SearchSessionOriginContext): void => {
  const overlayCommandState = useSearchRouteOverlayCommandStore.getState();
  const sessionState = useSearchRouteSessionStore.getState();

  if (origin.rootOverlay === 'search') {
    requestSearchRouteDockedRestore({
      snap: origin.tabSnap,
    });
    sessionState.setIsSearchOriginRestorePending(false);
    return;
  }

  unstable_batchedUpdates(() => {
    overlayCommandState.setIsNavRestorePending(false);
    if (origin.rootOverlay === 'polls') {
      overlayCommandState.setIsDockedPollsDismissed(false);
    }
    appOverlayRouteController.setRootRoute(origin.rootOverlay);
    overlayCommandState.setTabOverlaySnapRequest(origin.tabSnap);
  });
  sessionState.setIsSearchOriginRestorePending(false);
};

export const useSearchRouteSessionController = ({
  rootOverlay,
  pollsSheetSnap,
  bookmarksSheetSnap,
  profileSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
}: UseSearchRouteSessionControllerArgs): SearchRouteSessionControllerRuntime => {
  const isSearchOriginRestorePending = useSearchRouteSessionStore(
    (state) => state.isSearchOriginRestorePending
  );

  const createCurrentOriginContext = React.useCallback(
    (): SearchSessionOriginContext => ({
      rootOverlay,
      tabSnap: resolveSearchLaunchOriginSnap({
        overlay: rootOverlay,
        pollsSheetSnap,
        bookmarksSheetSnap,
        profileSheetSnap,
        isDockedPollsDismissed,
        hasUserSharedSnap,
        sharedSnap,
      }),
    }),
    [
      bookmarksSheetSnap,
      hasUserSharedSnap,
      isDockedPollsDismissed,
      pollsSheetSnap,
      profileSheetSnap,
      rootOverlay,
      sharedSnap,
    ]
  );

  const flushPendingSearchOriginRestore = React.useCallback(() => {
    const sessionState = useSearchRouteSessionStore.getState();
    const pendingOrigin = sessionState.pendingOriginRestoreContext;
    if (!pendingOrigin) {
      return false;
    }
    sessionState.setPendingOriginRestoreContext(null);
    restoreSearchOriginContext(pendingOrigin);
    return true;
  }, []);

  const captureSearchSessionOrigin = React.useCallback(() => {
    const sessionState = useSearchRouteSessionStore.getState();
    sessionState.setPendingOriginRestoreContext(null);
    sessionState.setIsSearchOriginRestorePending(false);
    if (sessionState.capturedOriginContext) {
      return;
    }
    sessionState.setCapturedOriginContext(createCurrentOriginContext());
  }, [createCurrentOriginContext]);

  const armSearchCloseRestore = React.useCallback(
    ({ allowFallback = false, searchRootRestoreSnap }: SearchCloseRestoreOptions = {}) => {
      const sessionState = useSearchRouteSessionStore.getState();
      const resolvedOriginContext =
        sessionState.capturedOriginContext ?? (allowFallback ? createCurrentOriginContext() : null);
      const nextOriginContext =
        resolvedOriginContext?.rootOverlay === 'search' && searchRootRestoreSnap
          ? {
              ...resolvedOriginContext,
              tabSnap: searchRootRestoreSnap,
            }
          : resolvedOriginContext;
      const shouldRestoreOrigin = nextOriginContext != null;
      sessionState.setPendingOriginRestoreContext(nextOriginContext);
      sessionState.setIsSearchOriginRestorePending(false);
      sessionState.setCapturedOriginContext(null);
      return shouldRestoreOrigin;
    },
    [createCurrentOriginContext]
  );

  const commitSearchCloseRestore = React.useCallback(() => {
    const sessionState = useSearchRouteSessionStore.getState();
    const hasPendingOrigin = sessionState.pendingOriginRestoreContext != null;
    sessionState.setIsSearchOriginRestorePending(hasPendingOrigin);
    return hasPendingOrigin;
  }, []);

  const cancelSearchCloseRestore = React.useCallback(() => {
    const sessionState = useSearchRouteSessionStore.getState();
    sessionState.setPendingOriginRestoreContext(null);
    sessionState.setIsSearchOriginRestorePending(false);
  }, []);

  const requestDefaultPostSearchRestore = React.useCallback(() => {
    const sessionState = useSearchRouteSessionStore.getState();
    if (sessionState.pendingOriginRestoreContext) {
      sessionState.setIsSearchOriginRestorePending(false);
      return;
    }
    requestSearchRouteDockedRestore({
      snap: 'collapsed',
    });
    sessionState.setIsSearchOriginRestorePending(false);
  }, []);

  return {
    isSearchOriginRestorePending,
    captureSearchSessionOrigin,
    armSearchCloseRestore,
    commitSearchCloseRestore,
    cancelSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
  };
};
