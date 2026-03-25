import React from 'react';

import { createOverlayRegistry } from '../../../overlays/OverlayRegistry';
import type { OverlayContentSpec, OverlayKey } from '../../../overlays/types';
import type { OverlayHeaderActionMode } from '../../../overlays/useOverlayHeaderActionController';
import type { SearchSheetContentLane } from './use-search-presentation-controller';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic overlay specs use varying item types
type OverlaySpec = OverlayContentSpec<any> | null;

type UseSearchOverlaySheetResolutionArgs = {
  searchPanelSpec: OverlaySpec;
  pollsPanelSpec: OverlaySpec;
  bookmarksPanelSpec: OverlaySpec;
  profilePanelSpec: OverlaySpec;
  restaurantPanelSpec: OverlaySpec;
  saveListPanelSpec: OverlaySpec;
  pollCreationPanelSpec: OverlaySpec;
  shouldShowPollCreationPanel: boolean;
  showSaveListOverlay: boolean;
  shouldShowRestaurantOverlay: boolean;
  showProfileOverlay: boolean;
  showBookmarksOverlay: boolean;
  shouldShowPollsSheet: boolean;
  shouldRenderResultsSheet: boolean;
  isSearchOverlay: boolean;
  searchSheetContentLane: SearchSheetContentLane;
  isSuggestionPanelActive: boolean;
  isForegroundEditing: boolean;
  searchHeaderActionModeOverride: OverlayHeaderActionMode | null;
  setSearchHeaderActionModeOverride: React.Dispatch<
    React.SetStateAction<OverlayHeaderActionMode | null>
  >;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
};

type UseSearchOverlaySheetResolutionResult = {
  activeOverlayKey: OverlayKey | null;
  overlaySheetKey: OverlayKey | null;
  overlaySheetSpec: OverlaySpec;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlayHeaderActionMode: OverlayHeaderActionMode;
};

export const useSearchOverlaySheetResolution = ({
  searchPanelSpec,
  pollsPanelSpec,
  bookmarksPanelSpec,
  profilePanelSpec,
  restaurantPanelSpec,
  saveListPanelSpec,
  pollCreationPanelSpec,
  shouldShowPollCreationPanel,
  showSaveListOverlay,
  shouldShowRestaurantOverlay,
  showProfileOverlay,
  showBookmarksOverlay,
  shouldShowPollsSheet,
  shouldRenderResultsSheet,
  isSearchOverlay,
  searchSheetContentLane,
  isSuggestionPanelActive,
  isForegroundEditing,
  searchHeaderActionModeOverride,
  setSearchHeaderActionModeOverride,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
}: UseSearchOverlaySheetResolutionArgs): UseSearchOverlaySheetResolutionResult => {
  const overlayRegistry = React.useMemo(
    () =>
      createOverlayRegistry({
        search: searchPanelSpec,
        polls: pollsPanelSpec,
        bookmarks: bookmarksPanelSpec,
        profile: profilePanelSpec,
        restaurant: restaurantPanelSpec,
        saveList: saveListPanelSpec,
        price: null,
        scoreInfo: null,
        pollCreation: pollCreationPanelSpec,
      }),
    [
      bookmarksPanelSpec,
      pollCreationPanelSpec,
      pollsPanelSpec,
      profilePanelSpec,
      restaurantPanelSpec,
      saveListPanelSpec,
      searchPanelSpec,
    ]
  );

  const activeSearchSheetContentKey = React.useMemo<OverlayKey | null>(() => {
    if (!isSearchOverlay) {
      return shouldRenderResultsSheet ? 'search' : null;
    }
    if (searchSheetContentLane.kind === 'persistent_poll') {
      return 'polls';
    }
    return shouldRenderResultsSheet ? 'search' : null;
  }, [isSearchOverlay, searchSheetContentLane.kind, shouldRenderResultsSheet]);

  const activeOverlayKey = React.useMemo<OverlayKey | null>(() => {
    if (shouldShowPollCreationPanel) {
      return 'pollCreation';
    }
    if (showSaveListOverlay) {
      return 'saveList';
    }
    if (shouldShowRestaurantOverlay && restaurantPanelSpec) {
      return 'restaurant';
    }
    if (showProfileOverlay) {
      return 'profile';
    }
    if (showBookmarksOverlay) {
      return 'bookmarks';
    }
    if (activeSearchSheetContentKey === 'polls') {
      return 'polls';
    }
    if (shouldShowPollsSheet) {
      return 'polls';
    }
    if (activeSearchSheetContentKey === 'search') {
      return 'search';
    }
    return null;
  }, [
    activeSearchSheetContentKey,
    restaurantPanelSpec,
    shouldShowPollCreationPanel,
    shouldShowPollsSheet,
    shouldShowRestaurantOverlay,
    showBookmarksOverlay,
    showProfileOverlay,
    showSaveListOverlay,
  ]);

  const overlaySheetKey = activeOverlayKey;
  const overlaySheetSpecBase = overlaySheetKey ? overlayRegistry[overlaySheetKey] : null;
  const shouldSuppressOverlaySheetForForegroundEditing =
    isForegroundEditing &&
    (overlaySheetKey === 'search' ||
      overlaySheetKey === 'polls' ||
      overlaySheetKey === 'bookmarks' ||
      overlaySheetKey === 'profile');
  const shouldSuppressTabOverlaySheetForSuggestions =
    !isSearchOverlay &&
    isSuggestionPanelActive &&
    (overlaySheetKey === 'polls' ||
      overlaySheetKey === 'bookmarks' ||
      overlaySheetKey === 'profile');

  const overlaySheetSpec = React.useMemo(() => {
    if (!overlaySheetSpecBase || !overlaySheetKey) {
      return null;
    }
    if (shouldSuppressOverlaySheetForForegroundEditing) {
      return null;
    }
    if (shouldSuppressTabOverlaySheetForSuggestions) {
      return null;
    }
    if (overlaySheetKey !== 'search') {
      return overlaySheetSpecBase;
    }
    return {
      ...overlaySheetSpecBase,
      onDragStateChange: handleResultsSheetDragStateChange,
      onSettleStateChange: handleResultsSheetSettlingChange,
    };
  }, [
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    isForegroundEditing,
    overlaySheetKey,
    overlaySheetSpecBase,
    shouldSuppressOverlaySheetForForegroundEditing,
    shouldSuppressTabOverlaySheetForSuggestions,
  ]);

  const overlaySheetVisible = Boolean(overlaySheetSpec && overlaySheetKey);
  const overlaySheetApplyNavBarCutout = overlaySheetVisible;

  React.useEffect(() => {
    if (overlaySheetKey === 'search') {
      return;
    }
    if (searchHeaderActionModeOverride !== null) {
      setSearchHeaderActionModeOverride(null);
    }
  }, [overlaySheetKey, searchHeaderActionModeOverride, setSearchHeaderActionModeOverride]);

  const overlayHeaderActionMode = React.useMemo<OverlayHeaderActionMode>(() => {
    if (overlaySheetKey === 'polls') {
      return 'follow-collapse';
    }
    if (overlaySheetKey === 'search') {
      return searchHeaderActionModeOverride ?? 'fixed-close';
    }
    return 'fixed-close';
  }, [overlaySheetKey, searchHeaderActionModeOverride]);

  return {
    activeOverlayKey,
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode,
  };
};
