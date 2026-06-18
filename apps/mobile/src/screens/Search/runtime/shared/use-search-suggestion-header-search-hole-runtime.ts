import React from 'react';
import type { LayoutRectangle } from 'react-native';

import {
  cloneSuggestionMaskedHole,
  createSuggestionHeaderSearchHole,
} from './search-suggestion-header-hole-runtime';
import type { SearchSuggestionMaskedHole } from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHeaderSearchHoleRuntime = ({
  shouldDriveSuggestionLayout,
  shouldFreezeSuggestionHeader,
  resolvedSearchContainerFrame,
}: {
  shouldDriveSuggestionLayout: boolean;
  shouldFreezeSuggestionHeader: boolean;
  resolvedSearchContainerFrame: LayoutRectangle | null;
}): SearchSuggestionMaskedHole | null => {
  const suggestionHeaderSearchHoleRef = React.useRef<SearchSuggestionMaskedHole | null>(null);

  const suggestionHeaderSearchHoleCandidate = React.useMemo<SearchSuggestionMaskedHole | null>(
    () =>
      createSuggestionHeaderSearchHole(resolvedSearchContainerFrame, shouldDriveSuggestionLayout),
    [resolvedSearchContainerFrame, shouldDriveSuggestionLayout]
  );

  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader || !suggestionHeaderSearchHoleCandidate) {
      return;
    }

    suggestionHeaderSearchHoleRef.current = cloneSuggestionMaskedHole(
      suggestionHeaderSearchHoleCandidate
    );
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);

  return React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return suggestionHeaderSearchHoleRef.current;
    }

    return suggestionHeaderSearchHoleCandidate ?? suggestionHeaderSearchHoleRef.current;
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);
};
