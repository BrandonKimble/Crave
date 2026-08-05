import React from 'react';

import {
  SCREEN_HEIGHT,
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM,
  SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP,
  SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
} from '../../constants/search';
import { useSearchSuggestionHeaderLayoutPresentationRuntime } from './use-search-suggestion-header-layout-presentation-runtime';
import type { SearchSuggestionLayoutVisualRuntimeArgs } from './use-search-suggestion-surface-runtime-contract';

type SearchSuggestionLayoutGeometryRuntime = {
  suggestionHeaderHeightTarget: number;
  suggestionScrollTopTarget: number;
  suggestionScrollMaxHeightTarget: number | undefined;
  suggestionTopFillHeight: number;
};

// F1338: this was expressed as a fictional "pixel scale" hardcoded to 1 (never true on a
// shipping @2x/@3x iPhone) wrapped around a hand-tuned 1pt slop. Named honestly instead —
// this is the tuned point value, not a device-pixel scale, so `PixelRatio.roundToNearestPixel`
// is not the right substitute here without re-tuning the cutout edge by eye in the sim
// (CLAUDE.md: the eye is the oracle for feel surfaces). No visual change from this rename.
const SEARCH_SUGGESTION_CUTOUT_EDGE_SLOP_PT = 1;
const SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP = SEARCH_SUGGESTION_CUTOUT_EDGE_SLOP_PT;

const ceilSuggestionLayoutToPixel = (value: number) => Math.ceil(value);

export const useSearchSuggestionLayoutGeometryRuntime = ({
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  searchLayout,
  suggestionContentHeight,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutLayout,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
}: SearchSuggestionLayoutVisualRuntimeArgs): SearchSuggestionLayoutGeometryRuntime => {
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

  const suggestionHeaderLayoutPresentationRuntime =
    useSearchSuggestionHeaderLayoutPresentationRuntime({
      shouldDriveSuggestionLayout,
      shouldFreezeSuggestionHeader,
      shouldIncludeShortcutLayout,
      searchContainerContentBottom,
      resolvedSearchShortcutsFrame,
      frozenCutoutEdgeSlop: SEARCH_SUGGESTION_LAYOUT_CUTOUT_EDGE_SLOP,
    });

  const suggestionHeaderHeightTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    const contentBottom =
      suggestionHeaderLayoutPresentationRuntime.suggestionHeaderContentBottom > 0
        ? suggestionHeaderLayoutPresentationRuntime.suggestionHeaderContentBottom
        : suggestionHeaderLayoutPresentationRuntime.suggestionHeaderContentBottomFallback;
    if (contentBottom <= 0) {
      return 0;
    }
    return Math.max(
      0,
      ceilSuggestionLayoutToPixel(contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM)
    );
  }, [
    shouldDriveSuggestionLayout,
    suggestionHeaderLayoutPresentationRuntime.suggestionHeaderContentBottom,
    suggestionHeaderLayoutPresentationRuntime.suggestionHeaderContentBottomFallback,
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

  return React.useMemo(
    () => ({
      suggestionHeaderHeightTarget,
      suggestionScrollTopTarget,
      suggestionScrollMaxHeightTarget,
      suggestionTopFillHeight,
    }),
    [
      suggestionHeaderHeightTarget,
      suggestionScrollMaxHeightTarget,
      suggestionScrollTopTarget,
      suggestionTopFillHeight,
    ]
  );
};
