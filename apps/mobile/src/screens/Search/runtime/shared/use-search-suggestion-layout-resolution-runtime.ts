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

  const resolvedSearchShortcutChipFrames = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return {};
    }
    return { ...cachedSearchShortcutChipFrames, ...searchShortcutChipFrames };
  }, [cachedSearchShortcutChipFrames, searchShortcutChipFrames, shouldUseSearchShortcutFrames]);

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
