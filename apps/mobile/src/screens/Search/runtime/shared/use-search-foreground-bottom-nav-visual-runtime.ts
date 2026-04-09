import React from 'react';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SCREEN_HEIGHT } from '../../constants/search';
import type {
  SearchForegroundBottomNavVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

const RESULTS_WASH_FADE_MS = 220;

type UseSearchForegroundBottomNavVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'shouldDimResultsSheet'
  | 'isSuggestionOverlayVisible'
  | 'suggestionProgress'
  | 'shouldSuspendResultsSheet'
  | 'isSearchOverlay'
  | 'inputMode'
  | 'searchSheetContentLaneKind'
  | 'navBarTopForSnaps'
  | 'fallbackNavBarHeight'
  | 'bottomNavHiddenTranslateY'
  | 'searchHeaderDefaultChromeProgress'
  | 'isSuggestionPanelActive'
  | 'backdropTarget'
>;

export const useSearchForegroundBottomNavVisualRuntime = ({
  shouldDimResultsSheet,
  isSuggestionOverlayVisible,
  suggestionProgress,
  shouldSuspendResultsSheet,
  isSearchOverlay,
  inputMode,
  searchSheetContentLaneKind,
  navBarTopForSnaps,
  fallbackNavBarHeight,
  bottomNavHiddenTranslateY,
  searchHeaderDefaultChromeProgress,
  isSuggestionPanelActive,
  backdropTarget,
}: UseSearchForegroundBottomNavVisualRuntimeArgs): SearchForegroundBottomNavVisualRuntime => {
  const shouldHideBottomNavForSearchResultsMotion =
    isSearchOverlay &&
    inputMode !== 'editing' &&
    (backdropTarget === 'results' || searchSheetContentLaneKind === 'results_closing');
  const shouldHideBottomNavForSuggestionSurface = !isSearchOverlay && isSuggestionPanelActive;
  const navBarTop = shouldHideBottomNavForSearchResultsMotion ? SCREEN_HEIGHT : navBarTopForSnaps;
  const navBarHeight = shouldHideBottomNavForSearchResultsMotion ? 0 : fallbackNavBarHeight;

  const resultsWashOpacity = useSharedValue(0);
  const bottomNavHideProgress = useSharedValue(shouldHideBottomNavForSearchResultsMotion ? 0 : 1);
  const resultsWashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resultsWashOpacity.value,
  }));
  const resultsSheetVisibilityAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: shouldDimResultsSheet ? 1 - suggestionProgress.value : 1,
    }),
    [shouldDimResultsSheet]
  );
  const bottomNavItemVisibilityAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: isSuggestionOverlayVisible ? 1 - suggestionProgress.value : 1,
    }),
    [isSuggestionOverlayVisible]
  );

  React.useEffect(() => {
    resultsWashOpacity.value = withTiming(shouldSuspendResultsSheet ? 1 : 0, {
      duration: RESULTS_WASH_FADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [resultsWashOpacity, shouldSuspendResultsSheet]);
  React.useEffect(() => {
    bottomNavHideProgress.value = withTiming(shouldHideBottomNavForSearchResultsMotion ? 0 : 1, {
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [bottomNavHideProgress, shouldHideBottomNavForSearchResultsMotion]);

  const shouldDriveBottomNavFromSearchClose =
    isSearchOverlay && inputMode !== 'editing' && searchSheetContentLaneKind === 'results_closing';
  const [isSearchCloseNavHandoffActive, setIsSearchCloseNavHandoffActive] = React.useState(
    shouldDriveBottomNavFromSearchClose
  );
  const searchCloseNavHandoffActive = useSharedValue(shouldDriveBottomNavFromSearchClose ? 1 : 0);

  React.useEffect(() => {
    if (shouldDriveBottomNavFromSearchClose) {
      setIsSearchCloseNavHandoffActive(true);
      searchCloseNavHandoffActive.value = 1;
    }
  }, [searchCloseNavHandoffActive, shouldDriveBottomNavFromSearchClose]);

  useAnimatedReaction(
    () => {
      if (!searchCloseNavHandoffActive.value) {
        return false;
      }
      return (
        !shouldDriveBottomNavFromSearchClose &&
        !shouldHideBottomNavForSearchResultsMotion &&
        bottomNavHideProgress.value >= 0.999
      );
    },
    (shouldRelease, previousShouldRelease) => {
      if (shouldRelease && !previousShouldRelease) {
        searchCloseNavHandoffActive.value = 0;
        runOnJS(setIsSearchCloseNavHandoffActive)(false);
      }
    },
    [
      bottomNavHideProgress,
      searchCloseNavHandoffActive,
      shouldDriveBottomNavFromSearchClose,
      shouldHideBottomNavForSearchResultsMotion,
    ]
  );

  const shouldHideBottomNavForRender =
    shouldHideBottomNavForSearchResultsMotion || shouldHideBottomNavForSuggestionSurface;
  const navBarCutoutIsHiding =
    shouldHideBottomNavForSearchResultsMotion && !isSearchCloseNavHandoffActive;
  const bottomNavVisualProgress = useDerivedValue(() => {
    if (searchCloseNavHandoffActive.value > 0.5) {
      return Math.max(searchHeaderDefaultChromeProgress.value, bottomNavHideProgress.value);
    }
    return bottomNavHideProgress.value;
  }, [bottomNavHideProgress, searchHeaderDefaultChromeProgress, searchCloseNavHandoffActive]);
  const bottomNavAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: (1 - bottomNavVisualProgress.value) * bottomNavHiddenTranslateY,
        },
      ],
    }),
    [bottomNavHiddenTranslateY, bottomNavVisualProgress]
  );

  return {
    navBarTop,
    navBarHeight,
    resultsWashAnimatedStyle,
    resultsSheetVisibilityAnimatedStyle,
    bottomNavItemVisibilityAnimatedStyle,
    shouldHideBottomNavForRender,
    navBarCutoutIsHiding,
    navBarCutoutProgress: bottomNavVisualProgress,
    bottomNavAnimatedStyle,
  };
};
