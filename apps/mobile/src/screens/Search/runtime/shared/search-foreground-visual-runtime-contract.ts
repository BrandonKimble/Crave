import { useAnimatedStyle, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from '../../../../navigation/runtime/app-route-nav-silhouette-authority';
// S-C.5 item 7: the old search-bottom-nav-motion-runtime module dissolved here — after the
// command sink's deletion (S-C.4 item 3b) it held only these shared types + the duration.
export const SEARCH_BOTTOM_NAV_MOTION_DURATION_MS = 360;

export type SearchBottomNavMotionTarget = 'hide' | 'show';

export type SearchBottomNavMotionRuntime = {
  navOpacity: SharedValue<number> | DerivedValue<number>;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
};

export type UseSearchForegroundVisualRuntimeArgs = {
  shouldDimResultsSheet: boolean;
  isSuggestionOverlayVisible: boolean;
  suggestionProgress: SharedValue<number>;
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
  searchChromeTransitionProgress: SharedValue<number>;
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
  bottomNavHiddenTranslateY: number;
  resultsSheetVisibilityAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  shouldHideBottomNavForRender: boolean;
  navBarCutoutIsHiding: boolean;
  navBarCutoutHidingProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetBodyExclusionHeight: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetMaskHeight: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetExclusionModeValue:
    | SharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>
    | DerivedValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
  bottomNavMotionRuntime: SearchBottomNavMotionRuntime;
};

export type SearchForegroundShortcutsVisualRuntime = {
  shouldMountSearchShortcuts: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
  searchShortcutChipAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchShortcutContentAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
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
