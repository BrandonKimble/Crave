import type {
  SearchRootOverlaySessionArgsRuntime,
  UseSearchRootScaffoldLaneRuntimeArgs,
} from './use-search-root-scaffold-lane-runtime-contract';

type UseSearchRootOverlaySessionArgsRuntimeArgs = Pick<
  UseSearchRootScaffoldLaneRuntimeArgs,
  'insets' | 'searchLayoutTop' | 'searchBarFrame' | 'isSuggestionPanelActive' | 'rootSessionRuntime'
>;

export const useSearchRootOverlaySessionArgsRuntime = ({
  insets,
  searchLayoutTop,
  searchBarFrame,
  isSuggestionPanelActive,
  rootSessionRuntime,
}: UseSearchRootOverlaySessionArgsRuntimeArgs): SearchRootOverlaySessionArgsRuntime => {
  const {
    runtimeOwner: { overlayRuntimeController },
    sharedSnapState: { hasUserSharedSnap, sharedSnap },
    runtimeFlags: { isSearchSessionActive, isSearchLoading },
    overlayCommandRuntime: {
      commandState: {
        pollsSheetSnap,
        isDockedPollsDismissed,
        bookmarksSheetSnap,
        profileSheetSnap,
        isNavRestorePending,
      },
      commandActions: { setIsNavRestorePending },
      showSaveListOverlay,
    },
  } = rootSessionRuntime;

  return {
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
    insetsBottom: insets.bottom,
  };
};
