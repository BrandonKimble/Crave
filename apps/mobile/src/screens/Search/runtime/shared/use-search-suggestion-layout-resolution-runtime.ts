import React from 'react';
import type { LayoutRectangle } from 'react-native';

import { SEARCH_CONTAINER_PADDING_TOP } from '../../constants/search';

type UseSearchSuggestionLayoutResolutionRuntimeArgs = {
  query: string;
  isSuggestionPanelActive: boolean;
  shouldDisableSearchShortcuts: boolean;
  shouldDriveSuggestionLayout: boolean;
  searchContainerFrame: LayoutRectangle | null;
  cachedSearchContainerFrame: LayoutRectangle | null;
  searchShortcutsFrame: LayoutRectangle | null;
  cachedSearchShortcutsFrame: LayoutRectangle | null;
  searchShortcutChipFrames: Record<string, LayoutRectangle>;
  cachedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
  searchShortcutsScrollOffsetX: number;
};

type SearchSuggestionLayoutResolutionRuntime = {
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutHoles: boolean;
  shouldIncludeShortcutLayout: boolean;
  resolvedSearchContainerFrame: LayoutRectangle | null;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  resolvedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
};

export const useSearchSuggestionLayoutResolutionRuntime = ({
  query,
  isSuggestionPanelActive,
  shouldDisableSearchShortcuts,
  shouldDriveSuggestionLayout,
  searchContainerFrame,
  cachedSearchContainerFrame,
  searchShortcutsFrame,
  cachedSearchShortcutsFrame,
  searchShortcutChipFrames,
  cachedSearchShortcutChipFrames,
  searchShortcutsScrollOffsetX,
}: UseSearchSuggestionLayoutResolutionRuntimeArgs): SearchSuggestionLayoutResolutionRuntime => {
  const shouldFreezeSuggestionHeader =
    shouldDriveSuggestionLayout && !isSuggestionPanelActive && query.trim().length > 0;

  const shouldShowSearchShortcutsTarget = isSuggestionPanelActive && !shouldDisableSearchShortcuts;
  const shouldUseSearchShortcutFrames =
    shouldDriveSuggestionLayout || shouldShowSearchShortcutsTarget;
  const resolvedSearchShortcutsFrame = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return null;
    }
    return searchShortcutsFrame ?? cachedSearchShortcutsFrame;
  }, [cachedSearchShortcutsFrame, searchShortcutsFrame, shouldUseSearchShortcutFrames]);

  // R7 groundwork: chip onLayout frames are relative to the shortcut row's SCROLL
  // CONTENT, so the current scroll offset shifts them into the row viewport here —
  // the single place both consumers (native hit-target regions, suggestion-header
  // hole mask) read from. Frames scrolled fully out of the viewport are dropped;
  // partially visible ones are clipped to the row bounds so neither a hit region
  // nor a mask hole can land on a chip pixel that is not on screen.
  const resolvedSearchShortcutChipFrames = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return {};
    }
    const contentFrames = { ...cachedSearchShortcutChipFrames, ...searchShortcutChipFrames };
    if (searchShortcutsScrollOffsetX === 0) {
      return contentFrames;
    }
    const rowFrame = searchShortcutsFrame ?? cachedSearchShortcutsFrame;
    const viewportWidth = rowFrame?.width ?? Number.POSITIVE_INFINITY;
    const viewportFrames: Record<string, LayoutRectangle> = {};
    for (const [chipId, frame] of Object.entries(contentFrames)) {
      const shiftedX = frame.x - searchShortcutsScrollOffsetX;
      const clippedX = Math.max(0, shiftedX);
      const clippedRight = Math.min(shiftedX + frame.width, viewportWidth);
      const clippedWidth = clippedRight - clippedX;
      if (clippedWidth <= 0) {
        continue;
      }
      viewportFrames[chipId] = {
        x: clippedX,
        y: frame.y,
        width: clippedWidth,
        height: frame.height,
      };
    }
    return viewportFrames;
  }, [
    cachedSearchShortcutChipFrames,
    cachedSearchShortcutsFrame,
    searchShortcutChipFrames,
    searchShortcutsFrame,
    searchShortcutsScrollOffsetX,
    shouldUseSearchShortcutFrames,
  ]);

  const hasResolvedSearchShortcutsFrame = Boolean(resolvedSearchShortcutsFrame);
  const shouldIncludeShortcutCutout =
    shouldDriveSuggestionLayout &&
    (shouldShowSearchShortcutsTarget || hasResolvedSearchShortcutsFrame);
  const shouldIncludeShortcutHoles = shouldIncludeShortcutCutout;
  const shouldIncludeShortcutLayout = shouldIncludeShortcutCutout;

  const resolvedSearchContainerFrame = React.useMemo(() => {
    const isUsable = (frame: LayoutRectangle | null) =>
      Boolean(frame && frame.width > 0 && frame.height > SEARCH_CONTAINER_PADDING_TOP + 0.5);

    if (isUsable(searchContainerFrame)) {
      return searchContainerFrame;
    }
    if (isUsable(cachedSearchContainerFrame)) {
      return cachedSearchContainerFrame;
    }
    return null;
  }, [cachedSearchContainerFrame, searchContainerFrame]);

  return React.useMemo(
    () => ({
      shouldFreezeSuggestionHeader,
      shouldIncludeShortcutHoles,
      shouldIncludeShortcutLayout,
      resolvedSearchContainerFrame,
      resolvedSearchShortcutsFrame,
      resolvedSearchShortcutChipFrames,
    }),
    [
      resolvedSearchContainerFrame,
      resolvedSearchShortcutChipFrames,
      resolvedSearchShortcutsFrame,
      shouldFreezeSuggestionHeader,
      shouldIncludeShortcutHoles,
      shouldIncludeShortcutLayout,
    ]
  );
};
