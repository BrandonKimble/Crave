import React from 'react';

import type {
  SearchSuggestionHoldActionRuntime,
  SearchSuggestionHoldActionRuntimeArgs,
  SearchSuggestionTransitionHoldCapture,
} from './search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldActionsRuntime = ({
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

  // F1311: both verbs used to follow a successful hold with a write to the write-only
  // `searchTransitionVariant` state ('submitting' here, the caller's variant below). With that
  // state deleted the `if (didHold)` arms were empty — the HOLD itself is the whole effect,
  // and it is what the return value reports.
  const beginSubmitTransition = React.useCallback(() => {
    return captureSuggestionTransitionHold(buildSuggestionTransitionHoldCapture());
  }, [buildSuggestionTransitionHoldCapture, captureSuggestionTransitionHold]);

  const beginSuggestionCloseHold = React.useCallback(
    () => captureSuggestionTransitionHold(buildSuggestionTransitionHoldCapture()),
    [buildSuggestionTransitionHoldCapture, captureSuggestionTransitionHold]
  );

  return {
    beginSubmitTransition,
    beginSuggestionCloseHold,
  };
};
