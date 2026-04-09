import { useSearchRouteSessionController } from '../../../../overlays/useSearchRouteSessionController';
import { useSearchBottomNavRuntime } from './use-search-bottom-nav-runtime';
import { useSearchDockedPollsVisibilityRuntime } from './use-search-docked-polls-visibility-runtime';
import { useSearchNavRestoreRuntime } from './use-search-nav-restore-runtime';
import { useSearchOverlayRenderVisibilityRuntime } from './use-search-overlay-render-visibility-runtime';
import { useSearchOverlayStoreRuntime } from './use-search-overlay-store-runtime';

type UseSearchOverlaySessionRuntimeArgs = {
  overlayRuntimeController: Parameters<
    typeof useSearchOverlayStoreRuntime
  >[0]['overlayRuntimeController'];
  pollsSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['pollsSheetSnap'];
  bookmarksSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['bookmarksSheetSnap'];
  profileSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['profileSheetSnap'];
  isDockedPollsDismissed: Parameters<
    typeof useSearchRouteSessionController
  >[0]['isDockedPollsDismissed'];
  hasUserSharedSnap: Parameters<typeof useSearchRouteSessionController>[0]['hasUserSharedSnap'];
  sharedSnap: Parameters<typeof useSearchRouteSessionController>[0]['sharedSnap'];
  isNavRestorePending: Parameters<typeof useSearchNavRestoreRuntime>[0]['isNavRestorePending'];
  setIsNavRestorePending: Parameters<
    typeof useSearchNavRestoreRuntime
  >[0]['setIsNavRestorePending'];
  showSaveListOverlay: Parameters<
    typeof useSearchOverlayRenderVisibilityRuntime
  >[0]['showSaveListOverlay'];
  isSuggestionPanelActive: Parameters<
    typeof useSearchDockedPollsVisibilityRuntime
  >[0]['isSuggestionPanelActive'];
  isSearchSessionActive: Parameters<
    typeof useSearchDockedPollsVisibilityRuntime
  >[0]['isSearchSessionActive'];
  isSearchLoading: Parameters<typeof useSearchDockedPollsVisibilityRuntime>[0]['isSearchLoading'];
  searchLayoutTop: Parameters<typeof useSearchBottomNavRuntime>[0]['searchLayoutTop'];
  searchBarFrame: Parameters<typeof useSearchBottomNavRuntime>[0]['searchBarFrame'];
  insetsBottom: Parameters<typeof useSearchBottomNavRuntime>[0]['insetsBottom'];
};

export const useSearchOverlaySessionRuntime = ({
  overlayRuntimeController,
  pollsSheetSnap,
  bookmarksSheetSnap,
  profileSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
  isNavRestorePending,
  setIsNavRestorePending,
  showSaveListOverlay,
  isSuggestionPanelActive,
  isSearchSessionActive,
  isSearchLoading,
  searchLayoutTop,
  searchBarFrame,
  insetsBottom,
}: UseSearchOverlaySessionRuntimeArgs) => {
  const overlayStoreRuntime = useSearchOverlayStoreRuntime({
    overlayRuntimeController,
  });
  const routeSessionRuntime = useSearchRouteSessionController({
    rootOverlay: overlayStoreRuntime.rootOverlay,
    pollsSheetSnap,
    bookmarksSheetSnap,
    profileSheetSnap,
    isDockedPollsDismissed,
    hasUserSharedSnap,
    sharedSnap,
  });
  const bottomNavRuntime = useSearchBottomNavRuntime({
    searchLayoutTop,
    searchBarFrame,
    insetsBottom,
  });
  const dockedPollsVisibilityRuntime = useSearchDockedPollsVisibilityRuntime({
    isSearchOverlay: overlayStoreRuntime.isSearchOverlay,
    showPollsOverlay: overlayStoreRuntime.showPollsOverlay,
    isSuggestionPanelActive,
    isSearchSessionActive,
    isSearchLoading,
    isSearchOriginRestorePending: routeSessionRuntime.isSearchOriginRestorePending,
    isDockedPollsDismissed,
  });

  useSearchNavRestoreRuntime({
    isNavRestorePending,
    isSearchOverlay: overlayStoreRuntime.isSearchOverlay,
    shouldShowDockedPollsTarget: dockedPollsVisibilityRuntime.shouldShowDockedPollsTarget,
    pollsSheetSnap,
    setIsNavRestorePending,
  });

  const shouldRenderSearchOverlay = useSearchOverlayRenderVisibilityRuntime({
    isSearchOverlay: overlayStoreRuntime.isSearchOverlay,
    shouldShowPollsSheet: dockedPollsVisibilityRuntime.shouldShowPollsSheet,
    showBookmarksOverlay: overlayStoreRuntime.showBookmarksOverlay,
    showProfileOverlay: overlayStoreRuntime.showProfileOverlay,
    showSaveListOverlay,
  });

  return {
    ...overlayStoreRuntime,
    ...routeSessionRuntime,
    ...bottomNavRuntime,
    ...dockedPollsVisibilityRuntime,
    shouldRenderSearchOverlay,
  };
};
