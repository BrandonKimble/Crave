import React from 'react';

import type {
  SearchSuggestionHoldActionRuntime,
  SearchSuggestionHoldActionRuntimeArgs,
  SearchSuggestionTransitionHoldCapture,
  SuggestionTransitionVariant,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldActionsRuntime = ({
  setSearchTransitionVariant,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  liveShouldRenderAutocompleteSection,
  liveShouldRenderRecentSection,
  captureSuggestionTransitionHold,
}: SearchSuggestionHoldActionRuntimeArgs): SearchSuggestionHoldActionRuntime => {
  const buildSuggestionTransitionHoldCapture = React.useCallback(
    (): SearchSuggestionTransitionHoldCapture => ({
      enabled: shouldDriveSuggestionLayout,
      flags: {
        holdAutocomplete: liveShouldRenderAutocompleteSection,
        holdRecent: liveShouldRenderRecentSection,
        holdSuggestionPanel: liveShouldRenderAutocompleteSection || liveShouldRenderRecentSection,
        holdSuggestionBackground: shouldShowSuggestionBackground,
      },
    }),
    [
      liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection,
      shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground,
    ]
  );

  const beginSubmitTransition = React.useCallback(() => {
    const didHold = captureSuggestionTransitionHold(buildSuggestionTransitionHoldCapture());
    if (didHold) {
      setSearchTransitionVariant('submitting');
    }
    return didHold;
  }, [
    buildSuggestionTransitionHoldCapture,
    captureSuggestionTransitionHold,
    setSearchTransitionVariant,
  ]);

  const beginSuggestionCloseHold = React.useCallback(
    (variant: SuggestionTransitionVariant = 'default') => {
      const didHold = captureSuggestionTransitionHold(buildSuggestionTransitionHoldCapture());
      if (didHold) {
        setSearchTransitionVariant(variant);
      }
      return didHold;
    },
    [
      buildSuggestionTransitionHoldCapture,
      captureSuggestionTransitionHold,
      setSearchTransitionVariant,
    ]
  );

  return {
    beginSubmitTransition,
    beginSuggestionCloseHold,
  };
};
