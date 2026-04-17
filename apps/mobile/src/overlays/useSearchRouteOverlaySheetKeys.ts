import React from 'react';

import type { OverlayKey } from './types';
import type { SearchRouteOverlaySheetKeys } from './searchResolvedRouteHostModelContract';

type UseSearchRouteOverlaySheetKeysArgs = {
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  isDockedPollsDismissed: boolean;
  rootOverlayKey: OverlayKey;
  activeOverlayRouteKey: OverlayKey;
  showSaveListOverlay: boolean;
};

const resolveSearchRouteOverlayKey = ({
  shouldShowSearchPanel,
  shouldShowDockedPollsPanel,
  isDockedPollsDismissed,
  rootOverlayKey,
}: Omit<UseSearchRouteOverlaySheetKeysArgs, 'activeOverlayRouteKey' | 'showSaveListOverlay'>):
  | 'search'
  | 'polls'
  | null => {
  const isSearchRootOverlay = rootOverlayKey === 'search';
  if (!isSearchRootOverlay) {
    return shouldShowSearchPanel ? 'search' : null;
  }
  if (shouldShowDockedPollsPanel && !isDockedPollsDismissed) {
    return 'polls';
  }
  return shouldShowSearchPanel ? 'search' : null;
};

const resolveOverlaySheetKey = ({
  activeOverlayRouteKey,
  rootOverlayKey,
  searchRouteOverlayKey,
  showSaveListOverlay,
}: {
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  searchRouteOverlayKey: 'search' | 'polls' | null;
  showSaveListOverlay: boolean;
}): OverlayKey | null => {
  if (activeOverlayRouteKey === 'pollCreation') {
    return 'pollCreation';
  }
  if (showSaveListOverlay) {
    return 'saveList';
  }
  if (rootOverlayKey === 'profile') {
    return 'profile';
  }
  if (rootOverlayKey === 'bookmarks') {
    return 'bookmarks';
  }
  if (searchRouteOverlayKey === 'polls') {
    return 'polls';
  }
  if (searchRouteOverlayKey === 'search') {
    return 'search';
  }
  return null;
};

export const useSearchRouteOverlaySheetKeys = ({
  shouldShowSearchPanel,
  shouldShowDockedPollsPanel,
  isDockedPollsDismissed,
  rootOverlayKey,
  activeOverlayRouteKey,
  showSaveListOverlay,
}: UseSearchRouteOverlaySheetKeysArgs): SearchRouteOverlaySheetKeys =>
  React.useMemo(() => {
    const searchRouteOverlayKey = resolveSearchRouteOverlayKey({
      shouldShowSearchPanel,
      shouldShowDockedPollsPanel,
      isDockedPollsDismissed,
      rootOverlayKey,
    });
    const overlaySheetKey = resolveOverlaySheetKey({
      activeOverlayRouteKey,
      rootOverlayKey,
      searchRouteOverlayKey,
      showSaveListOverlay,
    });
    const resolvedOverlaySheetVisible = overlaySheetKey != null;

    return {
      searchRouteOverlayKey,
      overlaySheetKey,
      resolvedOverlaySheetVisible,
      overlaySheetApplyNavBarCutout: resolvedOverlaySheetVisible,
      isPersistentPollLane: searchRouteOverlayKey === 'polls',
      isSearchOverlay: rootOverlayKey === 'search',
      showPollsOverlay: false,
      showBookmarksOverlay: rootOverlayKey === 'bookmarks',
      showProfileOverlay: rootOverlayKey === 'profile',
      showSaveListOverlay,
    };
  }, [
    activeOverlayRouteKey,
    isDockedPollsDismissed,
    rootOverlayKey,
    shouldShowDockedPollsPanel,
    shouldShowSearchPanel,
    showSaveListOverlay,
  ]);
