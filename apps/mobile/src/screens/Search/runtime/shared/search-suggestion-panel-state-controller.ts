import type React from 'react';

export type SearchSuggestionPanelStateSnapshot = {
  isSuggestionPanelActive: boolean;
};

export type SearchSuggestionPanelStateController = {
  getSnapshot: () => SearchSuggestionPanelStateSnapshot;
  setIsSuggestionPanelActive: (
    nextValue: React.SetStateAction<boolean>
  ) => SearchSuggestionPanelStateSnapshot | null;
  reset: () => SearchSuggestionPanelStateSnapshot | null;
};

export const createSearchSuggestionPanelStateController = (
  initialSnapshot: SearchSuggestionPanelStateSnapshot = {
    isSuggestionPanelActive: false,
  }
): SearchSuggestionPanelStateController => {
  let snapshot = initialSnapshot;

  const setIsSuggestionPanelActive = (
    nextValue: React.SetStateAction<boolean>
  ): SearchSuggestionPanelStateSnapshot | null => {
    const resolvedValue =
      typeof nextValue === 'function'
        ? (nextValue as (previous: boolean) => boolean)(snapshot.isSuggestionPanelActive)
        : nextValue;

    if (snapshot.isSuggestionPanelActive === resolvedValue) {
      return null;
    }

    snapshot = {
      isSuggestionPanelActive: resolvedValue,
    };
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,
    setIsSuggestionPanelActive,
    reset: () => setIsSuggestionPanelActive(false),
  };
};
