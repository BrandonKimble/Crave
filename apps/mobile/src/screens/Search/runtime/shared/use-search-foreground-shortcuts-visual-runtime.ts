import React from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN } from '../../constants/search';
import { SEARCH_SHORTCUT_SHADOW } from '../../shadows';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type {
  SearchForegroundShortcutsVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

const SEARCH_SHORTCUT_BASE_SHADOW_OPACITY = Number(SEARCH_SHORTCUT_SHADOW.shadowOpacity ?? 0);
const SEARCH_SHORTCUT_BASE_ELEVATION = Number(SEARCH_SHORTCUT_SHADOW.elevation ?? 0);
const SEARCH_SHORTCUT_VISIBILITY_TIMING = { duration: 180 };

type UseSearchForegroundShortcutsVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'isSuggestionOverlayVisible'
  | 'backdropTarget'
  | 'suggestionProgress'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
  | 'searchChromeTranslateY'
  | 'shouldDisableSearchShortcuts'
  | 'shouldRenderSearchOverlay'
  | 'headerShortcutsVisibleTarget'
  | 'headerShortcutsInteractive'
  | 'isSearchOverlay'
>;

export const useSearchForegroundShortcutsVisualRuntime = ({
  isSuggestionPanelActive,
  isSuggestionOverlayVisible,
  backdropTarget,
  suggestionProgress,
  searchChromeOpacity,
  searchChromeScale,
  searchChromeTranslateY,
  shouldDisableSearchShortcuts,
  shouldRenderSearchOverlay,
  headerShortcutsVisibleTarget,
  headerShortcutsInteractive,
  isSearchOverlay,
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
  const shouldEnableSearchShortcutsInteraction =
    shouldMountSearchShortcuts && shouldEnableSearchShortcutsInteractionTarget;
  const isShortcutExitingToResults =
    isSuggestionOverlayVisible && !isSuggestionPanelActive && backdropTarget === 'results';
  const shortcutOpacityTarget =
    shouldShowSearchShortcutsTarget && !isShortcutExitingToResults ? 1 : 0;
  const shortcutOpacityProgress = useSharedValue(shortcutOpacityTarget);
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  React.useEffect(() => {
    shortcutOpacityProgress.value = withTiming(
      shortcutOpacityTarget,
      SEARCH_SHORTCUT_VISIBILITY_TIMING
    );
  }, [shortcutOpacityProgress, shortcutOpacityTarget]);
  React.useEffect(() => {
    if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
      event: 'search_shortcuts_visibility_contract',
      backdropTarget,
      headerShortcutsInteractive,
      headerShortcutsVisibleTarget,
      isSearchOverlay,
      isSuggestionOverlayVisible,
      isSuggestionPanelActive,
      shouldEnableSearchShortcutsInteraction,
      shouldKeepMountedForResultsExit: shouldKeepSearchShortcutsMountedForResultsExit,
      shouldMountSearchShortcuts,
      shouldRenderSearchOverlay,
      shouldShowSearchShortcutsTarget,
      shortcutBackgroundOpacityTarget: shortcutOpacityTarget,
      shortcutChipContainerOpacityTarget: shortcutOpacityTarget,
      shortcutContentOpacityTarget: shortcutOpacityTarget,
      shortcutOpacityTargetsShareTransition: true,
      shortcutOpacityTransitionDurationMs: SEARCH_SHORTCUT_VISIBILITY_TIMING.duration,
    });
  }, [
    activeScenarioConfig,
    backdropTarget,
    headerShortcutsInteractive,
    headerShortcutsVisibleTarget,
    isSearchOverlay,
    isSuggestionOverlayVisible,
    isSuggestionPanelActive,
    shouldEnableSearchShortcutsInteraction,
    shouldKeepSearchShortcutsMountedForResultsExit,
    shouldMountSearchShortcuts,
    shouldRenderSearchOverlay,
    shouldShowSearchShortcutsTarget,
    shortcutOpacityTarget,
  ]);
  const searchShortcutChipAnimatedStyle = useAnimatedStyle(() => {
    const backgroundAlpha = isShortcutExitingToResults
      ? 0
      : isSuggestionOverlayVisible
        ? 1 - suggestionProgress.value
        : shortcutOpacityProgress.value;
    const clampedAlpha = Math.max(0, Math.min(backgroundAlpha, 1));
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      shadowOpacity: SEARCH_SHORTCUT_BASE_SHADOW_OPACITY * clampedAlpha,
      elevation: clampedAlpha > 0 ? SEARCH_SHORTCUT_BASE_ELEVATION : 0,
    };
  }, [
    isShortcutExitingToResults,
    isSuggestionOverlayVisible,
    shortcutOpacityProgress,
    suggestionProgress,
  ]);
  const searchShortcutContentAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: 1,
    }),
    []
  );
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const searchShortcutsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = isShortcutExitingToResults
      ? suggestionProgress.value
      : isSuggestionOverlayVisible
        ? 1
        : shortcutOpacityProgress.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    const chromeTranslateY = shouldLockSearchChromeTransform ? 0 : searchChromeTranslateY.value;
    const chromeRecedeOpacity = shouldLockSearchChromeTransform ? 1 : searchChromeOpacity.value;
    return {
      opacity: opacity * chromeRecedeOpacity,
      transformOrigin: SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN,
      transform: [{ translateY: chromeTranslateY }, { scale: chromeScale }],
    };
  }, [
    isShortcutExitingToResults,
    isSuggestionOverlayVisible,
    searchChromeOpacity,
    searchChromeScale,
    searchChromeTranslateY,
    shortcutOpacityProgress,
    shouldLockSearchChromeTransform,
    suggestionProgress,
  ]);

  return {
    shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction,
    searchShortcutChipAnimatedStyle,
    searchShortcutContentAnimatedStyle,
    searchShortcutsAnimatedStyle,
  };
};
