import { useAnimatedStyle } from 'react-native-reanimated';

import { SEARCH_SHORTCUT_SHADOW } from '../../shadows';
import type {
  SearchForegroundShortcutsVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

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
  const shouldMountSearchShortcuts =
    shouldShowSearchShortcutsTarget || shouldKeepSearchShortcutsMountedForResultsExit;
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
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const searchShortcutsAnimatedStyle = useAnimatedStyle(() => {
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity: 1,
      transform: [{ scale: chromeScale }],
    };
  }, [searchChromeScale, shouldLockSearchChromeTransform]);

  return {
    shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      shouldMountSearchShortcuts && shouldEnableSearchShortcutsInteractionTarget,
    searchShortcutChipAnimatedStyle,
    searchShortcutsAnimatedStyle,
  };
};
