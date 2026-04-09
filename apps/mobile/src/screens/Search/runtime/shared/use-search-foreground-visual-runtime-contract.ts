import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

export type UseSearchForegroundVisualRuntimeArgs = {
  shouldDimResultsSheet: boolean;
  isSuggestionOverlayVisible: boolean;
  suggestionProgress: SharedValue<number>;
  shouldSuspendResultsSheet: boolean;
  isSearchOverlay: boolean;
  inputMode: 'editing' | 'resting';
  searchSheetContentLaneKind: string;
  navBarTopForSnaps: number;
  fallbackNavBarHeight: number;
  bottomNavHiddenTranslateY: number;
  searchHeaderDefaultChromeProgress: SharedValue<number>;
  shouldDisableSearchShortcuts: boolean;
  shouldRenderSearchOverlay: boolean;
  headerShortcutsVisibleTarget: boolean;
  headerShortcutsInteractive: boolean;
  backdropTarget: 'suggestions' | 'results' | 'none';
  isSuggestionPanelActive: boolean;
  chromeTransitionExpanded: number;
  chromeTransitionMiddle: number;
  sheetTranslateY: SharedValue<number>;
  searchChromeOpacity: SharedValue<number>;
  searchChromeScale: SharedValue<number>;
  isSearchSessionActive: boolean;
  mapMovedSinceSearch: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  hasResults: boolean;
  searchLayoutTop: number;
  searchLayoutHeight: number;
  insetsTop: number;
};

export type SearchForegroundBottomNavVisualRuntime = {
  navBarTop: number;
  navBarHeight: number;
  resultsWashAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  resultsSheetVisibilityAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  bottomNavItemVisibilityAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  shouldHideBottomNavForRender: boolean;
  navBarCutoutIsHiding: boolean;
  navBarCutoutProgress: SharedValue<number>;
  bottomNavAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

export type SearchForegroundShortcutsVisualRuntime = {
  shouldMountSearchShortcuts: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
  searchShortcutChipAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchShortcutsAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

export type SearchForegroundChromeSurfaceVisualRuntime = {
  searchSurfaceAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchBarContainerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionPanelAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

export type SearchForegroundSearchThisAreaVisualRuntime = {
  shouldShowSearchThisArea: boolean;
  searchThisAreaTop: number;
  searchThisAreaAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  statusBarFadeHeight: number;
};

export type SearchForegroundVisualRuntime = SearchForegroundBottomNavVisualRuntime &
  SearchForegroundShortcutsVisualRuntime &
  SearchForegroundChromeSurfaceVisualRuntime &
  SearchForegroundSearchThisAreaVisualRuntime;
