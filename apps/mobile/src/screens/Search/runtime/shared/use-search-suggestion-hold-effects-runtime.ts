import { useSearchSuggestionHoldActionsRuntime } from './use-search-suggestion-hold-actions-runtime';
import { useSearchSuggestionHoldSyncRuntime } from './use-search-suggestion-hold-sync-runtime';

import type {
  SearchSuggestionHoldActionRuntime,
  SearchSuggestionHoldEffectsRuntime,
  SearchSuggestionHoldEffectsRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldEffectsRuntime = ({
  query,
  isSuggestionPanelActive,
  setSuggestions,
  setShowSuggestions,
  setBeginSuggestionCloseHold,
  setSearchTransitionVariant,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  liveShouldRenderAutocompleteSection,
  liveShouldRenderRecentSection,
  resetSubmitTransitionHold,
  resetSubmitTransitionHoldIfQueryChanged,
  captureSuggestionTransitionHold,
}: SearchSuggestionHoldEffectsRuntimeArgs): SearchSuggestionHoldEffectsRuntime => {
  const holdActionRuntime: SearchSuggestionHoldActionRuntime =
    useSearchSuggestionHoldActionsRuntime({
      setSearchTransitionVariant,
      shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection,
      captureSuggestionTransitionHold,
    });

  useSearchSuggestionHoldSyncRuntime({
    query,
    isSuggestionPanelActive,
    setSuggestions,
    setShowSuggestions,
    setBeginSuggestionCloseHold,
    setSearchTransitionVariant,
    shouldDriveSuggestionLayout,
    resetSubmitTransitionHold,
    resetSubmitTransitionHoldIfQueryChanged,
    beginSuggestionCloseHold: holdActionRuntime.beginSuggestionCloseHold,
  });

  return {
    beginSubmitTransition: holdActionRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdActionRuntime.beginSuggestionCloseHold,
  };
};
