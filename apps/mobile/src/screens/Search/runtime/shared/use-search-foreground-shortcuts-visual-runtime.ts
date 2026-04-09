import {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import useTransitionDriver from '../../../../hooks/use-transition-driver';
import { SEARCH_CHROME_FADE_ZONE_PX } from '../../constants/search';
import { SEARCH_SHORTCUT_SHADOW } from '../../shadows';
import type {
  SearchForegroundShortcutsVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

const SEARCH_SHORTCUTS_FADE_MS = 0;
const SEARCH_SHORTCUT_BASE_SHADOW_OPACITY = Number(SEARCH_SHORTCUT_SHADOW.shadowOpacity ?? 0);
const SEARCH_SHORTCUT_BASE_ELEVATION = Number(SEARCH_SHORTCUT_SHADOW.elevation ?? 0);

type UseSearchForegroundShortcutsVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'shouldDisableSearchShortcuts'
  | 'shouldRenderSearchOverlay'
  | 'headerShortcutsVisibleTarget'
  | 'headerShortcutsInteractive'
  | 'isSearchOverlay'
  | 'isSuggestionPanelActive'
  | 'isSuggestionOverlayVisible'
  | 'backdropTarget'
  | 'suggestionProgress'
  | 'searchHeaderDefaultChromeProgress'
  | 'chromeTransitionExpanded'
  | 'chromeTransitionMiddle'
  | 'sheetTranslateY'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
>;

export const useSearchForegroundShortcutsVisualRuntime = ({
  shouldDisableSearchShortcuts,
  shouldRenderSearchOverlay,
  headerShortcutsVisibleTarget,
  headerShortcutsInteractive,
  isSearchOverlay,
  isSuggestionPanelActive,
  isSuggestionOverlayVisible,
  backdropTarget,
  suggestionProgress,
  searchHeaderDefaultChromeProgress,
  chromeTransitionExpanded,
  chromeTransitionMiddle,
  sheetTranslateY,
  searchChromeOpacity,
  searchChromeScale,
}: UseSearchForegroundShortcutsVisualRuntimeArgs): SearchForegroundShortcutsVisualRuntime => {
  const shouldShowSearchShortcutsTarget =
    !shouldDisableSearchShortcuts &&
    shouldRenderSearchOverlay &&
    (isSearchOverlay ? isSuggestionPanelActive || headerShortcutsVisibleTarget : true);
  const shouldEnableSearchShortcutsInteractionTarget =
    shouldShowSearchShortcutsTarget && headerShortcutsInteractive;
  const shouldKeepSearchShortcutsMountedForResultsExit =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    isSuggestionOverlayVisible &&
    backdropTarget === 'results';
  const { progress: searchShortcutsFadeProgress, isVisible: shouldRenderSearchShortcutsRow } =
    useTransitionDriver({
      enabled: true,
      target: shouldShowSearchShortcutsTarget ? 1 : 0,
      getDurationMs: () => SEARCH_SHORTCUTS_FADE_MS,
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
    const clampedAlpha = Math.max(0, Math.min(backgroundAlpha, 1));
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      shadowOpacity: SEARCH_SHORTCUT_BASE_SHADOW_OPACITY * clampedAlpha,
      elevation: clampedAlpha > 0 ? SEARCH_SHORTCUT_BASE_ELEVATION : 0,
    };
  }, [backdropTarget, isSuggestionOverlayVisible, isSuggestionPanelActive, suggestionProgress]);
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
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const searchShortcutsAnimatedStyle = useAnimatedStyle(() => {
    const sheetTop = sheetTranslateY.value;
    const fadeEndY = Math.min(
      chromeTransitionMiddle,
      chromeTransitionExpanded + SEARCH_CHROME_FADE_ZONE_PX
    );
    const uncoverProgress =
      fadeEndY > chromeTransitionExpanded
        ? interpolate(sheetTop, [chromeTransitionExpanded, fadeEndY], [0, 1], Extrapolation.CLAMP)
        : chromeTransitionMiddle <= chromeTransitionExpanded
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
    chromeTransitionExpanded,
    chromeTransitionMiddle,
    searchChromeOpacity,
    searchChromeScale,
    searchShortcutPresenceProgress,
    sheetTranslateY,
    shouldLockSearchChromeTransform,
  ]);

  return {
    shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      shouldMountSearchShortcuts && shouldEnableSearchShortcutsInteractionTarget,
    searchShortcutChipAnimatedStyle,
    searchShortcutsAnimatedStyle,
  };
};
