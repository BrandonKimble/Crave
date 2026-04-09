import React from 'react';

import type {
  SearchSuggestionLayoutWarmthRuntime,
  SearchSuggestionLayoutWarmthRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

const SUGGESTION_PANEL_LAYOUT_HOLD_MS = 200;

export const useSearchSuggestionLayoutWarmthRuntime = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
}: SearchSuggestionLayoutWarmthRuntimeArgs): SearchSuggestionLayoutWarmthRuntime => {
  const [isSuggestionLayoutWarm, setIsSuggestionLayoutWarm] = React.useState(false);
  const suggestionLayoutHoldTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (suggestionLayoutHoldTimeoutRef.current) {
      clearTimeout(suggestionLayoutHoldTimeoutRef.current);
      suggestionLayoutHoldTimeoutRef.current = null;
    }

    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      if (!isSuggestionLayoutWarm) {
        setIsSuggestionLayoutWarm(true);
      }
      return;
    }
    if (!isSuggestionLayoutWarm) {
      return;
    }

    suggestionLayoutHoldTimeoutRef.current = setTimeout(() => {
      setIsSuggestionLayoutWarm(false);
    }, SUGGESTION_PANEL_LAYOUT_HOLD_MS);

    return () => {
      if (suggestionLayoutHoldTimeoutRef.current) {
        clearTimeout(suggestionLayoutHoldTimeoutRef.current);
        suggestionLayoutHoldTimeoutRef.current = null;
      }
    };
  }, [isSuggestionLayoutWarm, isSuggestionPanelActive, isSuggestionPanelVisible]);

  return {
    isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm,
    shouldDriveSuggestionLayout:
      isSuggestionPanelActive || isSuggestionPanelVisible || isSuggestionLayoutWarm,
  };
};
