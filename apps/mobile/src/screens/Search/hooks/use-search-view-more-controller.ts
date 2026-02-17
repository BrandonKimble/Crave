import React from 'react';
import { Keyboard } from 'react-native';
import type { TextInput } from 'react-native';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';
import type { MainSearchIntent } from '../../../types/navigation';

type UseSearchViewMoreControllerArgs<TSuggestion> = {
  inputRef: React.RefObject<TextInput | null>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  cancelAutocomplete: () => void;
  resetSubmitTransitionHold: () => void;
  resetSearchHeaderFocusProgress: () => void;
  searchIntentFromParams: MainSearchIntent | null;
  clearSearchIntentParam: () => void;
  openRecentSearches: () => void;
  openRecentlyViewed: () => void;
  onRecentSearchPress: (entry: RecentSearch) => void;
  onRecentlyViewedRestaurantPress: (item: RecentlyViewedRestaurant) => void;
  onRecentlyViewedFoodPress: (item: RecentlyViewedFood) => void;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<TSuggestion[]>>;
};

type UseSearchViewMoreControllerResult = {
  handleRecentViewMorePress: () => void;
  handleRecentlyViewedMorePress: () => void;
};

export const useSearchViewMoreController = <TSuggestion>({
  inputRef,
  ignoreNextSearchBlurRef,
  allowSearchBlurExitRef,
  cancelAutocomplete,
  resetSubmitTransitionHold,
  resetSearchHeaderFocusProgress,
  searchIntentFromParams,
  clearSearchIntentParam,
  openRecentSearches,
  openRecentlyViewed,
  onRecentSearchPress,
  onRecentlyViewedRestaurantPress,
  onRecentlyViewedFoodPress,
  setSearchTransitionVariant,
  setIsAutocompleteSuppressed,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsSuggestionLayoutWarm,
  setShowSuggestions,
  setSuggestions,
}: UseSearchViewMoreControllerArgs<TSuggestion>): UseSearchViewMoreControllerResult => {
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
    (intent: MainSearchIntent) => {
      if (intent.type === 'recentSearch') {
        onRecentSearchPress(intent.entry);
        return;
      }
      if (intent.type === 'recentlyViewed') {
        onRecentlyViewedRestaurantPress(intent.restaurant);
        return;
      }
      onRecentlyViewedFoodPress(intent.food);
    },
    [onRecentSearchPress, onRecentlyViewedFoodPress, onRecentlyViewedRestaurantPress]
  );

  React.useLayoutEffect(() => {
    if (!searchIntentFromParams) {
      return;
    }

    resetSuggestionUiForExternalSubmit();
    clearSearchIntentParam();
    runViewMoreIntent(searchIntentFromParams);
  }, [
    clearSearchIntentParam,
    resetSuggestionUiForExternalSubmit,
    runViewMoreIntent,
    searchIntentFromParams,
  ]);

  const prepareForViewMoreNavigation = React.useCallback(() => {
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      ignoreNextSearchBlurRef.current = true;
      allowSearchBlurExitRef.current = true;
      input.blur();
    }
    Keyboard.dismiss();
  }, [allowSearchBlurExitRef, ignoreNextSearchBlurRef, inputRef]);

  const handleRecentViewMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    openRecentSearches();
  }, [openRecentSearches, prepareForViewMoreNavigation]);

  const handleRecentlyViewedMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    openRecentlyViewed();
  }, [openRecentlyViewed, prepareForViewMoreNavigation]);

  return {
    handleRecentViewMorePress,
    handleRecentlyViewedMorePress,
  };
};
