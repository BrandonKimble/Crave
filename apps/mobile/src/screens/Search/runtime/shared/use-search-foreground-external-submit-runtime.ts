import React from 'react';
import { Keyboard } from 'react-native';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundOverlayRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundExternalSubmitRuntimeArgs = SearchForegroundOverlayRuntimeArgs & {
  submitHandlers: Pick<
    SearchForegroundInteractionSubmitHandlers,
    | 'handleRecentSearchPress'
    | 'handleRecentlyViewedRestaurantPress'
    | 'handleRecentlyViewedFoodPress'
  >;
};

export const useSearchForegroundExternalSubmitRuntime = ({
  navigation,
  routeSearchIntent,
  inputRef,
  ignoreNextSearchBlurRef,
  resetSearchHeaderFocusProgress,
  resetSubmitTransitionHold,
  setSearchTransitionVariant,
  setIsAutocompleteSuppressed,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsSuggestionLayoutWarm,
  setShowSuggestions,
  setSuggestions,
  cancelAutocomplete,
  submitHandlers,
}: UseSearchForegroundExternalSubmitRuntimeArgs) => {
  const resetSuggestionUiForExternalSubmit = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    resetSearchHeaderFocusProgress();
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      input.blur();
    }
    Keyboard.dismiss();
    resetSubmitTransitionHold();
    setSearchTransitionVariant('default');
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setIsSuggestionLayoutWarm(false);
    setShowSuggestions(false);
    setSuggestions([]);
    cancelAutocomplete();
  }, [
    cancelAutocomplete,
    ignoreNextSearchBlurRef,
    inputRef,
    resetSearchHeaderFocusProgress,
    resetSubmitTransitionHold,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionLayoutWarm,
    setIsSuggestionPanelActive,
    setSearchTransitionVariant,
    setShowSuggestions,
    setSuggestions,
  ]);

  const runViewMoreIntent = React.useCallback(
    (intent: NonNullable<SearchForegroundOverlayRuntimeArgs['routeSearchIntent']>) => {
      if (intent.type === 'recentSearch') {
        submitHandlers.handleRecentSearchPress(intent.entry);
        return;
      }
      if (intent.type === 'recentlyViewed') {
        submitHandlers.handleRecentlyViewedRestaurantPress(intent.restaurant);
        return;
      }
      submitHandlers.handleRecentlyViewedFoodPress(intent.food);
    },
    [submitHandlers]
  );

  React.useLayoutEffect(() => {
    if (!routeSearchIntent) {
      return;
    }
    resetSuggestionUiForExternalSubmit();
    navigation.setParams({ searchIntent: undefined });
    runViewMoreIntent(routeSearchIntent);
  }, [navigation, resetSuggestionUiForExternalSubmit, routeSearchIntent, runViewMoreIntent]);
};
