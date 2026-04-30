import type { AppRouteHostVisualRuntime } from '../../../../navigation/runtime/app-route-host-visual-runtime-contract';
import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import type { useSearchCloseVisualHandoffRuntime } from './use-search-close-visual-handoff-runtime';

export type SearchRootCloseHandoffVisualRuntime = {
  closeVisualHandoffProgress: ReturnType<
    typeof useSearchCloseVisualHandoffRuntime
  >['closeVisualHandoffProgress'];
};

export type SearchRootOverlayHostVisualRuntime = Pick<
  SearchForegroundVisualRuntime,
  | 'statusBarFadeHeight'
  | 'bottomNavAnimatedStyle'
  | 'shouldHideBottomNavForRender'
  | 'bottomNavItemVisibilityAnimatedStyle'
  | 'shouldMountSearchShortcuts'
  | 'shouldEnableSearchShortcutsInteraction'
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
> &
  Pick<AppRouteSceneChromeMotionRuntime, 'overlayBackdropDimProgress'>;

export type SearchRootSearchSceneVisualRuntime = Pick<
  SearchForegroundVisualRuntime,
  | 'resultsSheetVisibilityAnimatedStyle'
  | 'resultsWashAnimatedStyle'
> &
  Pick<AppRouteSceneChromeMotionRuntime, 'overlayHeaderActionProgress'>;

export type SearchRootOverlaySuggestionShellVisualRuntime = Pick<
  SearchForegroundVisualRuntime,
  | 'shouldHideBottomNavForRender'
  | 'navBarHeight'
  | 'searchSurfaceAnimatedStyle'
  | 'suggestionPanelAnimatedStyle'
>;

export type SearchRootOverlayHeaderSearchBarVisualRuntime = Pick<
  SearchForegroundVisualRuntime,
  'searchBarContainerAnimatedStyle'
> &
  Pick<AppRouteSceneChromeMotionRuntime, 'searchBarInputAnimatedStyle'>;

export type SearchRootOverlayHeaderSearchThisAreaVisualRuntime = Pick<
  SearchForegroundVisualRuntime,
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
  | 'searchThisAreaAnimatedStyle'
>;

export type SearchRootOverlaySceneHostVisualRuntime =
  SearchRootOverlaySuggestionShellVisualRuntime &
    SearchRootOverlayHeaderSearchBarVisualRuntime &
    SearchRootOverlayHeaderSearchThisAreaVisualRuntime;

export type SearchRootHostVisualRuntime = {
  routeHostVisualRuntime: AppRouteHostVisualRuntime;
  overlayHostVisualRuntime: SearchRootOverlayHostVisualRuntime;
  overlaySceneHostVisualRuntime: SearchRootOverlaySceneHostVisualRuntime;
};
