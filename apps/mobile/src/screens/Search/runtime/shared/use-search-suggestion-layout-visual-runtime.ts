import React from 'react';
import { Easing } from 'react-native-reanimated';
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  SCREEN_HEIGHT,
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_SHORTCUTS_STRIP_FALLBACK_HEIGHT,
  SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM,
  SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP,
  SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
  SHORTCUT_CHIP_HOLE_PADDING,
} from '../../constants/search';
import type {
  SearchSuggestionLayoutVisualRuntime,
  SearchSuggestionLayoutVisualRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

const SUGGESTION_PANEL_FADE_MS = 200;
const SEARCH_SUGGESTION_LAYOUT_PIXEL_SCALE = 1;
const SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP = 1 / SEARCH_SUGGESTION_LAYOUT_PIXEL_SCALE;

const ceilSuggestionLayoutToPixel = (value: number) =>
  Math.ceil(value * SEARCH_SUGGESTION_LAYOUT_PIXEL_SCALE) / SEARCH_SUGGESTION_LAYOUT_PIXEL_SCALE;

export const useSearchSuggestionLayoutVisualRuntime = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  searchLayout,
  suggestionContentHeight,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutLayout,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
}: SearchSuggestionLayoutVisualRuntimeArgs): SearchSuggestionLayoutVisualRuntime => {
  const fallbackHeaderContentBottom = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout || searchLayout.height <= 0) {
      return 0;
    }
    return (
      searchLayout.top +
      searchLayout.height +
      SEARCH_BAR_HOLE_PADDING +
      SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP
    );
  }, [searchLayout.height, searchLayout.top, shouldDriveSuggestionLayout]);
  const searchContainerContentBottom = React.useMemo(() => {
    if (!resolvedSearchContainerFrame) {
      return fallbackHeaderContentBottom;
    }
    return (
      resolvedSearchContainerFrame.y +
      resolvedSearchContainerFrame.height +
      SEARCH_BAR_HOLE_PADDING +
      SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP
    );
  }, [fallbackHeaderContentBottom, resolvedSearchContainerFrame]);
  const suggestionHeaderContentBottomRef = React.useRef(0);
  const frozenSuggestionHeaderContentBottom = suggestionHeaderContentBottomRef.current;
  const suggestionHeaderContentBottom = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (shouldFreezeSuggestionHeader && frozenSuggestionHeaderContentBottom > 0) {
      return frozenSuggestionHeaderContentBottom;
    }
    if (
      shouldIncludeShortcutLayout &&
      !resolvedSearchShortcutsFrame &&
      frozenSuggestionHeaderContentBottom > 0
    ) {
      return frozenSuggestionHeaderContentBottom;
    }
    if (shouldIncludeShortcutLayout && resolvedSearchShortcutsFrame) {
      return (
        resolvedSearchShortcutsFrame.y +
        resolvedSearchShortcutsFrame.height +
        SHORTCUT_CHIP_HOLE_PADDING +
        SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP
      );
    }
    if (shouldIncludeShortcutLayout && !resolvedSearchShortcutsFrame) {
      if (searchContainerContentBottom <= 0) {
        return 0;
      }
      return searchContainerContentBottom + SEARCH_SHORTCUTS_STRIP_FALLBACK_HEIGHT;
    }
    return searchContainerContentBottom;
  }, [
    frozenSuggestionHeaderContentBottom,
    resolvedSearchShortcutsFrame,
    searchContainerContentBottom,
    shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutLayout,
  ]);
  React.useEffect(() => {
    if (!shouldFreezeSuggestionHeader && suggestionHeaderContentBottom > 0) {
      suggestionHeaderContentBottomRef.current = suggestionHeaderContentBottom;
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderContentBottom]);
  const suggestionHeaderContentBottomFallback = suggestionHeaderContentBottomRef.current;
  const suggestionHeaderHeightTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    const contentBottom =
      suggestionHeaderContentBottom > 0
        ? suggestionHeaderContentBottom
        : suggestionHeaderContentBottomFallback;
    if (contentBottom <= 0) {
      return 0;
    }
    return Math.max(
      0,
      ceilSuggestionLayoutToPixel(contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM)
    );
  }, [
    shouldDriveSuggestionLayout,
    suggestionHeaderContentBottom,
    suggestionHeaderContentBottomFallback,
  ]);
  const suggestionScrollTopTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    const fallback = searchLayout.top + searchLayout.height + 8;
    const overlap = suggestionHeaderHeightTarget > 0 ? SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP : 0;
    const headerBottom =
      suggestionHeaderHeightTarget > 0
        ? suggestionHeaderHeightTarget - overlap + SEARCH_SUGGESTION_HEADER_PANEL_GAP
        : fallback;
    return Math.max(0, headerBottom);
  }, [
    searchLayout.height,
    searchLayout.top,
    shouldDriveSuggestionLayout,
    suggestionHeaderHeightTarget,
  ]);
  const suggestionScrollMaxHeightTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return undefined;
    }
    const available =
      SCREEN_HEIGHT - suggestionScrollTopTarget - SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM;
    return available > 0 ? available : undefined;
  }, [shouldDriveSuggestionLayout, suggestionScrollTopTarget]);
  const suggestionTopFillHeight = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout || !shouldShowSuggestionBackground) {
      return 0;
    }
    const fallbackHeight = 16;
    const maxHeight = suggestionScrollMaxHeightTarget ?? fallbackHeight;
    if (maxHeight <= 0) {
      return 0;
    }
    const desiredHeight = suggestionContentHeight > 0 ? suggestionContentHeight : fallbackHeight;
    return Math.min(desiredHeight, maxHeight);
  }, [
    shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground,
    suggestionContentHeight,
    suggestionScrollMaxHeightTarget,
  ]);

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
  const suggestionSpacingEasing = isSuggestionPanelActive
    ? Easing.out(Easing.cubic)
    : Easing.in(Easing.cubic);
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

  return {
    resetSearchHeaderFocusProgress,
    searchHeaderFocusProgress,
    suggestionHeaderHeightAnimatedStyle,
    suggestionScrollTopAnimatedStyle,
    suggestionScrollMaxHeightAnimatedStyle,
    suggestionHeaderDividerAnimatedStyle,
    suggestionScrollHandler,
    suggestionTopFillHeight,
    suggestionScrollMaxHeightTarget,
  };
};
