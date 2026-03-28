import React from 'react';

import { useBookmarksPanelSpec } from '../../../overlays/panels/BookmarksPanel';
import { usePollsPanelSpec } from '../../../overlays/panels/PollsPanel';
import { useProfilePanelSpec } from '../../../overlays/panels/ProfilePanel';
import { useRestaurantPanelSpec } from '../../../overlays/panels/RestaurantPanel';
import { useSaveListPanelSpec } from '../../../overlays/panels/SaveListPanel';
import type { OverlayContentSpec, OverlaySheetSnap } from '../../../overlays/types';
import type { OverlayHeaderActionMode } from '../../../overlays/useOverlayHeaderActionController';
import { useSearchOverlaySheetResolution } from './use-search-overlay-sheet-resolution';
import type { SearchSheetContentLane } from './use-search-presentation-controller';

type PollsPanelOptions = Parameters<typeof usePollsPanelSpec>[0];
type BookmarksPanelOptions = Parameters<typeof useBookmarksPanelSpec>[0];
type ProfilePanelOptions = Parameters<typeof useProfilePanelSpec>[0];
type RestaurantPanelOptions = Parameters<typeof useRestaurantPanelSpec>[0];
type SaveListPanelOptions = Parameters<typeof useSaveListPanelSpec>[0];

type RestaurantSnapRequest = {
  snap: Exclude<OverlaySheetSnap, 'hidden'>;
  token: number;
} | null;

type UseSearchOverlayPanelsArgs = {
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  pollCreationPanelSpec: OverlayContentSpec<unknown> | null;
  shouldShowRestaurantOverlay: boolean;
  shouldShowPollsSheet: boolean;
  shouldRenderResultsSheet: boolean;
  searchSheetContentLane: SearchSheetContentLane;
  isDockedPollsDismissed: boolean;
  isSuggestionPanelActive: boolean;
  isForegroundEditing: boolean;
  searchHeaderActionModeOverride: OverlayHeaderActionMode | null;
  setSearchHeaderActionModeOverride: React.Dispatch<
    React.SetStateAction<OverlayHeaderActionMode | null>
  >;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
  pollsPanelOptions: PollsPanelOptions;
  bookmarksPanelOptions: BookmarksPanelOptions;
  profilePanelOptions: ProfilePanelOptions;
  restaurantPanelBaseOptions: RestaurantPanelOptions;
  restaurantSnapRequest: RestaurantSnapRequest;
  handleRestaurantOverlaySnapStart: (snap: OverlaySheetSnap) => void;
  handleRestaurantOverlaySnapChange: (snap: OverlaySheetSnap) => void;
  saveListPanelOptions: SaveListPanelOptions;
};

type UseSearchOverlayPanelsResult = {
  overlaySheetKey: ReturnType<typeof useSearchOverlaySheetResolution>['overlaySheetKey'];
  overlaySheetSpec: ReturnType<typeof useSearchOverlaySheetResolution>['overlaySheetSpec'];
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlayHeaderActionMode: OverlayHeaderActionMode;
  pollsPanelSpec: OverlayContentSpec<unknown> | null;
};

export const useSearchOverlayPanels = ({
  searchPanelSpec,
  pollCreationPanelSpec,
  shouldShowRestaurantOverlay,
  shouldShowPollsSheet,
  shouldRenderResultsSheet,
  searchSheetContentLane,
  isDockedPollsDismissed,
  isSuggestionPanelActive,
  isForegroundEditing,
  searchHeaderActionModeOverride,
  setSearchHeaderActionModeOverride,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  pollsPanelOptions,
  bookmarksPanelOptions,
  profilePanelOptions,
  restaurantPanelBaseOptions,
  restaurantSnapRequest,
  handleRestaurantOverlaySnapStart,
  handleRestaurantOverlaySnapChange,
  saveListPanelOptions,
}: UseSearchOverlayPanelsArgs): UseSearchOverlayPanelsResult => {
  const pollsPanelSpec = usePollsPanelSpec(pollsPanelOptions);
  const bookmarksPanelSpec = useBookmarksPanelSpec(bookmarksPanelOptions);
  const profilePanelSpec = useProfilePanelSpec(profilePanelOptions);
  const restaurantPanelSpecBase = useRestaurantPanelSpec(restaurantPanelBaseOptions);
  const restaurantPanelSpec = React.useMemo(() => {
    if (!restaurantPanelSpecBase) {
      return null;
    }
    return {
      ...restaurantPanelSpecBase,
      snapTo: restaurantSnapRequest?.snap ?? null,
      snapToToken: restaurantSnapRequest?.token,
      onSnapStart: handleRestaurantOverlaySnapStart,
      onSnapChange: handleRestaurantOverlaySnapChange,
    };
  }, [
    handleRestaurantOverlaySnapChange,
    handleRestaurantOverlaySnapStart,
    restaurantPanelSpecBase,
    restaurantSnapRequest?.snap,
    restaurantSnapRequest?.token,
  ]);

  const saveListPanelSpec = useSaveListPanelSpec(saveListPanelOptions);
  const showSaveListOverlay = saveListPanelOptions.visible;

  const {
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode,
  } = useSearchOverlaySheetResolution({
    searchPanelSpec,
    pollsPanelSpec,
    bookmarksPanelSpec,
    profilePanelSpec,
    restaurantPanelSpec,
    saveListPanelSpec,
    pollCreationPanelSpec,
    showSaveListOverlay,
    shouldShowRestaurantOverlay,
    shouldShowPollsSheet,
    shouldRenderResultsSheet,
    searchSheetContentLane,
    isDockedPollsDismissed,
    isSuggestionPanelActive,
    isForegroundEditing,
    searchHeaderActionModeOverride,
    setSearchHeaderActionModeOverride,
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
  });

  return {
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode,
    pollsPanelSpec: pollsPanelSpec as OverlayContentSpec<unknown> | null,
  };
};
