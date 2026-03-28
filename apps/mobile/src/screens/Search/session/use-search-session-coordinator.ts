import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { OverlayKey } from '../../../store/overlayStore';
import {
  type SearchOverlaySheetSnap,
  type SearchSessionOriginContext,
  type TabOverlaySnap,
} from './search-session-types';
import { resolveSearchLaunchOriginSnap } from './use-search-origin-context';

type UseSearchSessionCoordinatorOptions = {
  rootOverlay: OverlayKey;
  pollsSheetSnap: SearchOverlaySheetSnap;
  bookmarksSheetSnap: SearchOverlaySheetSnap;
  profileSheetSnap: SearchOverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>;
  requestDockedPollsRestore: (snap?: TabOverlaySnap) => void;
  setIsNavRestorePending: React.Dispatch<React.SetStateAction<boolean>>;
  setTabOverlaySnapRequest: React.Dispatch<React.SetStateAction<TabOverlaySnap | null>>;
  setIsDockedPollsDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setOverlay: (overlay: OverlayKey) => void;
};

type SearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: TabOverlaySnap;
};

type UseSearchSessionCoordinatorResult = {
  isSearchOriginRestorePending: boolean;
  captureSearchSessionOrigin: () => void;
  armSearchCloseRestore: (options?: SearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
};

export const useSearchSessionCoordinator = ({
  rootOverlay,
  pollsSheetSnap,
  bookmarksSheetSnap,
  profileSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
  requestDockedPollsRestore,
  setIsNavRestorePending,
  setTabOverlaySnapRequest,
  setIsDockedPollsDismissed,
  setOverlay,
}: UseSearchSessionCoordinatorOptions): UseSearchSessionCoordinatorResult => {
  const searchSessionOriginRef = React.useRef<SearchSessionOriginContext | null>(null);
  const pendingSearchOriginRestoreRef = React.useRef<SearchSessionOriginContext | null>(null);
  const [isSearchOriginRestorePending, setIsSearchOriginRestorePending] = React.useState(false);

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

  const restoreSearchOriginContext = React.useCallback(
    (origin: SearchSessionOriginContext) => {
      if (origin.rootOverlay === 'search') {
        requestDockedPollsRestore(origin.tabSnap);
        setIsSearchOriginRestorePending(false);
        return;
      }
      unstable_batchedUpdates(() => {
        setIsNavRestorePending(false);
        if (origin.rootOverlay === 'polls') {
          setIsDockedPollsDismissed(false);
        }
        setOverlay(origin.rootOverlay);
        setTabOverlaySnapRequest(origin.tabSnap);
      });
      setIsSearchOriginRestorePending(false);
    },
    [
      requestDockedPollsRestore,
      setIsDockedPollsDismissed,
      setIsNavRestorePending,
      setOverlay,
      setTabOverlaySnapRequest,
    ]
  );

  const flushPendingSearchOriginRestore = React.useCallback(() => {
    const pendingOrigin = pendingSearchOriginRestoreRef.current;
    if (!pendingOrigin) {
      return false;
    }
    pendingSearchOriginRestoreRef.current = null;
    restoreSearchOriginContext(pendingOrigin);
    return true;
  }, [restoreSearchOriginContext]);

  const captureSearchSessionOrigin = React.useCallback(() => {
    pendingSearchOriginRestoreRef.current = null;
    setIsSearchOriginRestorePending(false);
    if (searchSessionOriginRef.current) {
      return;
    }
    searchSessionOriginRef.current = createCurrentOriginContext();
  }, [createCurrentOriginContext]);

  const armSearchCloseRestore = React.useCallback(
    ({ allowFallback = false, searchRootRestoreSnap }: SearchCloseRestoreOptions = {}) => {
      const capturedOriginContext = searchSessionOriginRef.current;
      const resolvedOriginContext =
        capturedOriginContext ?? (allowFallback ? createCurrentOriginContext() : null);
      const nextOriginContext =
        resolvedOriginContext?.rootOverlay === 'search' && searchRootRestoreSnap
          ? {
              ...resolvedOriginContext,
              tabSnap: searchRootRestoreSnap,
            }
          : resolvedOriginContext;
      const shouldRestoreOrigin = nextOriginContext != null;
      pendingSearchOriginRestoreRef.current = nextOriginContext;
      setIsSearchOriginRestorePending(false);
      searchSessionOriginRef.current = null;
      return shouldRestoreOrigin;
    },
    [createCurrentOriginContext]
  );

  const commitSearchCloseRestore = React.useCallback(() => {
    const hasPendingOrigin = pendingSearchOriginRestoreRef.current != null;
    setIsSearchOriginRestorePending(hasPendingOrigin);
    return hasPendingOrigin;
  }, []);

  const cancelSearchCloseRestore = React.useCallback(() => {
    pendingSearchOriginRestoreRef.current = null;
    setIsSearchOriginRestorePending(false);
  }, []);

  const requestDefaultPostSearchRestore = React.useCallback(() => {
    setIsSearchOriginRestorePending(false);
    if (pendingSearchOriginRestoreRef.current) {
      return;
    }
    requestDockedPollsRestore('collapsed');
  }, [requestDockedPollsRestore]);

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
