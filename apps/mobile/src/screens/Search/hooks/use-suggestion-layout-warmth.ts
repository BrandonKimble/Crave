import React from 'react';

type UseSuggestionLayoutWarmthArgs = {
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  holdMs: number;
};

type UseSuggestionLayoutWarmthResult = {
  isSuggestionLayoutWarm: boolean;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
};

export const useSuggestionLayoutWarmth = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  holdMs,
}: UseSuggestionLayoutWarmthArgs): UseSuggestionLayoutWarmthResult => {
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
    }, holdMs);

    return () => {
      if (suggestionLayoutHoldTimeoutRef.current) {
        clearTimeout(suggestionLayoutHoldTimeoutRef.current);
        suggestionLayoutHoldTimeoutRef.current = null;
      }
    };
  }, [holdMs, isSuggestionLayoutWarm, isSuggestionPanelActive, isSuggestionPanelVisible]);

  return {
    isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm,
  };
};
