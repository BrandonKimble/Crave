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
  // A useState, not a ref: this value is PUBLISHED to consumers (below), and a ref write
  // does not trigger a re-render — a consumer reading a ref snapshot can observe a stale
  // last-known-good value across the render where the freeze first engages (bedrock: a
  // published value must be able to change its readers). The write is gated exactly like
  // the prior ref write (only while unfrozen and only for a real, positive measurement),
  // so it fires at most once per freeze cycle — the extra render is bounded.
  const [frozenSuggestionHeaderContentBottom, setFrozenSuggestionHeaderContentBottom] =
    React.useState(0);

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
      setFrozenSuggestionHeaderContentBottom((previous) =>
        previous === suggestionHeaderContentBottom ? previous : suggestionHeaderContentBottom
      );
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderContentBottom]);

  return React.useMemo(
    () => ({
      suggestionHeaderContentBottom,
      suggestionHeaderContentBottomFallback: frozenSuggestionHeaderContentBottom,
    }),
    [suggestionHeaderContentBottom, frozenSuggestionHeaderContentBottom]
  );
};
