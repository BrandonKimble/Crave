import React from 'react';
import { Easing } from 'react-native-reanimated';
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type UseSearchSuggestionLayoutAnimationRuntimeArgs = {
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldDriveSuggestionLayout: boolean;
  suggestionHeaderHeightTarget: number;
  suggestionScrollTopTarget: number;
  suggestionScrollMaxHeightTarget: number | undefined;
};

type SearchSuggestionLayoutAnimationRuntime = {
  resetSearchHeaderFocusProgress: () => void;
  searchHeaderFocusProgress: ReturnType<typeof useSharedValue<number>>;
  suggestionHeaderHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollTopAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollMaxHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionHeaderDividerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
};

const SUGGESTION_PANEL_FADE_MS = 200;

export const useSearchSuggestionLayoutAnimationRuntime = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  suggestionHeaderHeightTarget,
  suggestionScrollTopTarget,
  suggestionScrollMaxHeightTarget,
}: UseSearchSuggestionLayoutAnimationRuntimeArgs): SearchSuggestionLayoutAnimationRuntime => {
  const suggestionHeaderHeightValue = useSharedValue(0);
  const suggestionScrollOffset = useSharedValue(0);
  const suggestionScrollTopValue = useSharedValue(0);
  const suggestionScrollMaxHeightValue = useSharedValue(0);
  const searchHeaderFocusProgress = useSharedValue(0);

  React.useEffect(() => {
    if (!isSuggestionPanelVisible) {
      suggestionScrollOffset.value = 0;
    }
  }, [isSuggestionPanelVisible, suggestionScrollOffset]);

  const suggestionSpacingInitializedRef = React.useRef(false);
  const suggestionSpacingEasing = Easing.out(Easing.cubic);
  const isSuggestionClosing = isSuggestionPanelVisible && !isSuggestionPanelActive;

  React.useEffect(() => {
    if (!shouldDriveSuggestionLayout) {
      return;
    }
    const nextHeaderHeight = suggestionHeaderHeightTarget;
    const nextScrollTop = suggestionScrollTopTarget;
    const nextMaxHeight = suggestionScrollMaxHeightTarget ?? 0;

    if (!suggestionSpacingInitializedRef.current) {
      suggestionHeaderHeightValue.value = nextHeaderHeight;
      suggestionScrollTopValue.value = nextScrollTop;
      suggestionScrollMaxHeightValue.value = nextMaxHeight;
      suggestionSpacingInitializedRef.current = true;
      return;
    }

    if (isSuggestionClosing) {
      return;
    }

    suggestionHeaderHeightValue.value = withTiming(nextHeaderHeight, {
      duration: SUGGESTION_PANEL_FADE_MS,
      easing: suggestionSpacingEasing,
    });
    suggestionScrollTopValue.value = withTiming(nextScrollTop, {
      duration: SUGGESTION_PANEL_FADE_MS,
      easing: suggestionSpacingEasing,
    });
    suggestionScrollMaxHeightValue.value = withTiming(nextMaxHeight, {
      duration: SUGGESTION_PANEL_FADE_MS,
      easing: suggestionSpacingEasing,
    });
  }, [
    isSuggestionClosing,
    shouldDriveSuggestionLayout,
    suggestionHeaderHeightTarget,
    suggestionScrollMaxHeightTarget,
    suggestionScrollTopTarget,
    suggestionSpacingEasing,
    suggestionHeaderHeightValue,
    suggestionScrollMaxHeightValue,
    suggestionScrollTopValue,
  ]);

  const suggestionHeaderHeightAnimatedStyle = useAnimatedStyle(() => ({
    height: suggestionHeaderHeightValue.value,
  }));
  const suggestionScrollTopAnimatedStyle = useAnimatedStyle(() => ({
    marginTop: suggestionScrollTopValue.value,
  }));
  const suggestionScrollMaxHeightAnimatedStyle = useAnimatedStyle(() => ({
    maxHeight: suggestionScrollMaxHeightValue.value,
  }));
  const suggestionScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      suggestionScrollOffset.value = event.contentOffset.y;
    },
  });
  const suggestionHeaderDividerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(suggestionScrollOffset.value / 16, 1)),
  }));
  const resetSearchHeaderFocusProgress = React.useCallback(() => {
    searchHeaderFocusProgress.value = 0;
  }, [searchHeaderFocusProgress]);

  return React.useMemo(
    () => ({
      resetSearchHeaderFocusProgress,
      searchHeaderFocusProgress,
      suggestionHeaderHeightAnimatedStyle,
      suggestionScrollTopAnimatedStyle,
      suggestionScrollMaxHeightAnimatedStyle,
      suggestionHeaderDividerAnimatedStyle,
      suggestionScrollHandler,
    }),
    [
      resetSearchHeaderFocusProgress,
      searchHeaderFocusProgress,
      suggestionHeaderDividerAnimatedStyle,
      suggestionHeaderHeightAnimatedStyle,
      suggestionScrollHandler,
      suggestionScrollMaxHeightAnimatedStyle,
      suggestionScrollTopAnimatedStyle,
    ]
  );
};
