import React from 'react';

import type { SearchInteractionRef } from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionContentHeightRuntimeArgs = {
  searchInteractionRef: SearchInteractionRef;
  shouldDriveSuggestionLayout: boolean;
  shouldRenderSuggestionPanel: boolean;
};

type SearchSuggestionContentHeightRuntime = {
  suggestionContentHeight: number;
  handleSuggestionContentSizeChange: (_width: number, height: number) => void;
};

export const useSearchSuggestionContentHeightRuntime = ({
  searchInteractionRef,
  shouldDriveSuggestionLayout,
  shouldRenderSuggestionPanel,
}: UseSearchSuggestionContentHeightRuntimeArgs): SearchSuggestionContentHeightRuntime => {
  const [suggestionContentHeight, setSuggestionContentHeight] = React.useState(0);
  const suggestionContentHeightRef = React.useRef(0);

  const handleSuggestionContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      if (!shouldDriveSuggestionLayout || !shouldRenderSuggestionPanel) {
        return;
      }
      if (searchInteractionRef.current.isInteracting) {
        return;
      }
      const nextHeight = Math.max(0, height);
      if (Math.abs(nextHeight - suggestionContentHeightRef.current) < 1) {
        return;
      }
      suggestionContentHeightRef.current = nextHeight;
      setSuggestionContentHeight(nextHeight);
    },
    [searchInteractionRef, shouldDriveSuggestionLayout, shouldRenderSuggestionPanel]
  );

  return React.useMemo(
    () => ({
      suggestionContentHeight,
      handleSuggestionContentSizeChange,
    }),
    [handleSuggestionContentSizeChange, suggestionContentHeight]
  );
};
