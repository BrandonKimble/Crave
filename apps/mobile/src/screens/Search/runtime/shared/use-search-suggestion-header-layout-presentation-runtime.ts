import React from 'react';
import type { LayoutRectangle } from 'react-native';

import {
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_SHORTCUTS_STRIP_FALLBACK_HEIGHT,
} from '../../constants/search';

type UseSearchSuggestionHeaderLayoutPresentationRuntimeArgs = {
  shouldDriveSuggestionLayout: boolean;
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutLayout: boolean;
  searchContainerContentBottom: number;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  frozenCutoutEdgeSlop: number;
};

export const useSearchSuggestionHeaderLayoutPresentationRuntime = ({
  shouldDriveSuggestionLayout,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutLayout,
  searchContainerContentBottom,
  resolvedSearchShortcutsFrame,
  frozenCutoutEdgeSlop,
}: UseSearchSuggestionHeaderLayoutPresentationRuntimeArgs) => {
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
        SEARCH_BAR_HOLE_PADDING +
        frozenCutoutEdgeSlop
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
    frozenCutoutEdgeSlop,
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

  return React.useMemo(
    () => ({
      suggestionHeaderContentBottom,
      suggestionHeaderContentBottomFallback: suggestionHeaderContentBottomRef.current,
    }),
    [suggestionHeaderContentBottom]
  );
};
