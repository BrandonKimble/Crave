import React from 'react';

import {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useTransitionDriver } from '../../../hooks';
import { SEARCH_CHROME_FADE_ZONE_PX } from '../constants/search';
import type {
  SearchBackdropTarget,
  SearchInputMode,
  SearchSheetContentLane,
} from './use-search-presentation-controller';

type UseSearchChromeVisualModelArgs = {
  isSearchOverlay: boolean;
  inputMode: SearchInputMode;
  backdropTarget: SearchBackdropTarget;
  searchSheetContentLane: SearchSheetContentLane;
  isSuggestionPanelActive: boolean;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForMotion: boolean;
  shouldHideBottomNavForSuggestionSurface: boolean;
  bottomNavHideProgress: SharedValue<number>;
  bottomNavHiddenTranslateY: number;
  searchHeaderDefaultChromeProgress: SharedValue<number>;
  shouldShowSearchShortcutsTarget: boolean;
  shouldKeepSearchShortcutsMountedForResultsExit: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
  searchShortcutsFadeDurationMs: number;
  suggestionProgress: SharedValue<number>;
  sheetTranslateY: SharedValue<number>;
  chromeTransitionExpandedY: number;
  chromeTransitionMiddleY: number;
  searchChromeOpacity: SharedValue<number>;
  searchChromeScale: SharedValue<number>;
  shouldLockSearchChromeTransform: boolean;
  shortcutShadowOpacity: number;
  shortcutShadowElevation: number;
};

type UseSearchChromeVisualModelResult = {
  bottomNavVisualProgress: SharedValue<number>;
  bottomNavAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  shouldHideBottomNavForRender: boolean;
  navBarCutoutProgress: SharedValue<number>;
  navBarCutoutIsHiding: boolean;
  shouldMountSearchShortcuts: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
  searchShortcutsAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchShortcutChipAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

const shadowFadeStyle = (baseOpacity: number, baseElevation: number, alpha: number) => {
  'worklet';
  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  return {
    shadowOpacity: baseOpacity * clampedAlpha,
    elevation: clampedAlpha > 0 ? baseElevation : 0,
  };
};

export const useSearchChromeVisualModel = ({
  isSearchOverlay,
  inputMode,
  backdropTarget,
  searchSheetContentLane,
  isSuggestionPanelActive,
  isSuggestionOverlayVisible,
  shouldHideBottomNavForMotion,
  shouldHideBottomNavForSuggestionSurface,
  bottomNavHideProgress,
  bottomNavHiddenTranslateY,
  searchHeaderDefaultChromeProgress,
  shouldShowSearchShortcutsTarget,
  shouldKeepSearchShortcutsMountedForResultsExit,
  shouldEnableSearchShortcutsInteraction,
  searchShortcutsFadeDurationMs,
  suggestionProgress,
  sheetTranslateY,
  chromeTransitionExpandedY,
  chromeTransitionMiddleY,
  searchChromeOpacity,
  searchChromeScale,
  shouldLockSearchChromeTransform,
  shortcutShadowOpacity,
  shortcutShadowElevation,
}: UseSearchChromeVisualModelArgs): UseSearchChromeVisualModelResult => {
  const shouldDriveBottomNavFromSearchClose =
    isSearchOverlay && inputMode !== 'editing' && searchSheetContentLane.kind === 'results_closing';
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
        !shouldHideBottomNavForMotion &&
        bottomNavHideProgress.value >= 0.999
      );
    },
    (shouldRelease, previousShouldRelease) => {
      if (shouldRelease && !previousShouldRelease) {
        searchCloseNavHandoffActive.value = 0;
        runOnJS(setIsSearchCloseNavHandoffActive)(false);
      }
    },
    [bottomNavHideProgress, shouldDriveBottomNavFromSearchClose, shouldHideBottomNavForMotion]
  );

  const shouldHideBottomNavForRender =
    shouldHideBottomNavForMotion || shouldHideBottomNavForSuggestionSurface;
  const navBarCutoutIsHiding = shouldHideBottomNavForMotion && !isSearchCloseNavHandoffActive;

  const bottomNavVisualProgress = useDerivedValue(() => {
    if (searchCloseNavHandoffActive.value > 0.5) {
      return Math.max(searchHeaderDefaultChromeProgress.value, bottomNavHideProgress.value);
    }
    return bottomNavHideProgress.value;
  }, []);

  const bottomNavAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: (1 - bottomNavVisualProgress.value) * bottomNavHiddenTranslateY }],
    }),
    [bottomNavHiddenTranslateY]
  );

  const { progress: searchShortcutsFadeProgress, isVisible: shouldRenderSearchShortcutsRow } =
    useTransitionDriver({
      enabled: true,
      target: shouldShowSearchShortcutsTarget ? 1 : 0,
      getDurationMs: () => searchShortcutsFadeDurationMs,
      getEasing: () => Easing.linear,
    });

  const shouldMountSearchShortcuts =
    shouldShowSearchShortcutsTarget ||
    shouldRenderSearchShortcutsRow ||
    shouldKeepSearchShortcutsMountedForResultsExit;

  const searchShortcutChipAnimatedStyle = useAnimatedStyle(() => {
    const isShortcutExitingToResults =
      isSuggestionOverlayVisible && !isSuggestionPanelActive && backdropTarget === 'results';
    const backgroundAlpha = isSuggestionOverlayVisible
      ? isShortcutExitingToResults
        ? 0
        : 1 - suggestionProgress.value
      : 1;
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      ...shadowFadeStyle(shortcutShadowOpacity, shortcutShadowElevation, backgroundAlpha),
    };
  }, [
    backdropTarget,
    isSuggestionOverlayVisible,
    isSuggestionPanelActive,
    shortcutShadowElevation,
    shortcutShadowOpacity,
  ]);

  const searchShortcutPresenceProgress = useDerivedValue(() => {
    if (isSuggestionOverlayVisible) {
      if (!isSuggestionPanelActive && backdropTarget === 'results') {
        return suggestionProgress.value;
      }
      return 1;
    }
    return Math.min(searchShortcutsFadeProgress.value, searchHeaderDefaultChromeProgress.value);
  }, [
    backdropTarget,
    isSuggestionOverlayVisible,
    isSuggestionPanelActive,
    searchHeaderDefaultChromeProgress,
    searchShortcutsFadeProgress,
    suggestionProgress,
  ]);

  const searchShortcutsAnimatedStyle = useAnimatedStyle(() => {
    const sheetTop = sheetTranslateY.value;
    const fadeEndY = Math.min(
      chromeTransitionMiddleY,
      chromeTransitionExpandedY + SEARCH_CHROME_FADE_ZONE_PX
    );
    const uncoverProgress =
      fadeEndY > chromeTransitionExpandedY
        ? interpolate(sheetTop, [chromeTransitionExpandedY, fadeEndY], [0, 1], Extrapolation.CLAMP)
        : chromeTransitionMiddleY <= chromeTransitionExpandedY
        ? 1
        : 0;
    const presence = Math.max(0, Math.min(1, searchShortcutPresenceProgress.value));
    const visibility = Math.min(presence, uncoverProgress);
    const opacity = searchChromeOpacity.value * visibility;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity,
      transform: [{ scale: chromeScale }],
    };
  }, [
    chromeTransitionExpandedY,
    chromeTransitionMiddleY,
    searchChromeOpacity,
    searchChromeScale,
    searchShortcutPresenceProgress,
    sheetTranslateY,
    shouldLockSearchChromeTransform,
  ]);

  return {
    bottomNavVisualProgress,
    bottomNavAnimatedStyle,
    shouldHideBottomNavForRender,
    navBarCutoutProgress: bottomNavVisualProgress,
    navBarCutoutIsHiding,
    shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      shouldMountSearchShortcuts && shouldEnableSearchShortcutsInteraction,
    searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle,
  };
};

export default useSearchChromeVisualModel;
