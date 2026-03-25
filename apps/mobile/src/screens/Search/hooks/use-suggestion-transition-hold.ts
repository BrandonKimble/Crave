import React from 'react';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';

type SearchTransitionVariant = 'default' | 'submitting';

export type SuggestionTransitionHold = {
  active: boolean;
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  isRecentlyViewedFoodsLoading: boolean;
  holdSuggestionPanel: boolean;
  holdSuggestionBackground: boolean;
  holdAutocomplete: boolean;
  holdRecent: boolean;
};

type TransitionHoldFlags = {
  holdSuggestionPanel: boolean;
  holdSuggestionBackground: boolean;
  holdAutocomplete: boolean;
  holdRecent: boolean;
};

type TransitionHoldCaptureOptions = {
  enabled: boolean;
  flags: TransitionHoldFlags;
};

type BeginSuggestionCloseHoldOptions = TransitionHoldCaptureOptions & {
  variant?: SearchTransitionVariant;
};

type UseSuggestionTransitionHoldArgs = {
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  isRecentlyViewedFoodsLoading: boolean;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<SearchTransitionVariant>>;
};

type UseSuggestionTransitionHoldResult = {
  submitTransitionHold: SuggestionTransitionHold;
  beginSubmitTransition: (options: TransitionHoldCaptureOptions) => boolean;
  beginSuggestionCloseHold: (options: BeginSuggestionCloseHoldOptions) => boolean;
  resetSubmitTransitionHold: () => void;
  resetSubmitTransitionHoldIfQueryChanged: (nextQuery: string) => boolean;
};

const createEmptySuggestionTransitionHold = (): SuggestionTransitionHold => ({
  active: false,
  query: '',
  suggestions: [],
  recentSearches: [],
  recentlyViewedRestaurants: [],
  recentlyViewedFoods: [],
  isRecentLoading: false,
  isRecentlyViewedLoading: false,
  isRecentlyViewedFoodsLoading: false,
  holdSuggestionPanel: false,
  holdSuggestionBackground: false,
  holdAutocomplete: false,
  holdRecent: false,
});

export const useSuggestionTransitionHold = ({
  query,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
  setSearchTransitionVariant,
}: UseSuggestionTransitionHoldArgs): UseSuggestionTransitionHoldResult => {
  const submitTransitionHoldRef = React.useRef<SuggestionTransitionHold>(
    createEmptySuggestionTransitionHold()
  );

  const resetSubmitTransitionHold = React.useCallback(() => {
    if (!submitTransitionHoldRef.current.active) {
      return;
    }
    submitTransitionHoldRef.current = createEmptySuggestionTransitionHold();
  }, []);

  const resetSubmitTransitionHoldIfQueryChanged = React.useCallback((nextQuery: string) => {
    if (!submitTransitionHoldRef.current.active) {
      return false;
    }
    if (submitTransitionHoldRef.current.query === nextQuery) {
      return false;
    }
    submitTransitionHoldRef.current = createEmptySuggestionTransitionHold();
    return true;
  }, []);

  const captureSuggestionTransitionHold = React.useCallback(
    ({ enabled, flags }: TransitionHoldCaptureOptions) => {
      if (!enabled) {
        return false;
      }
      submitTransitionHoldRef.current = {
        active: true,
        query,
        suggestions: suggestions.slice(),
        recentSearches,
        recentlyViewedRestaurants,
        recentlyViewedFoods,
        isRecentLoading,
        isRecentlyViewedLoading,
        isRecentlyViewedFoodsLoading,
        holdSuggestionPanel: flags.holdSuggestionPanel,
        holdSuggestionBackground: flags.holdSuggestionBackground,
        holdAutocomplete: flags.holdAutocomplete,
        holdRecent: flags.holdRecent,
      };
      return true;
    },
    [
      query,
      suggestions,
      recentSearches,
      recentlyViewedRestaurants,
      recentlyViewedFoods,
      isRecentLoading,
      isRecentlyViewedLoading,
      isRecentlyViewedFoodsLoading,
    ]
  );

  const beginSubmitTransition = React.useCallback(
    (options: TransitionHoldCaptureOptions) => {
      const didHold = captureSuggestionTransitionHold(options);
      if (didHold) {
        setSearchTransitionVariant('submitting');
      }
      return didHold;
    },
    [captureSuggestionTransitionHold, setSearchTransitionVariant]
  );

  const beginSuggestionCloseHold = React.useCallback(
    ({ variant = 'default', ...options }: BeginSuggestionCloseHoldOptions) => {
      const didHold = captureSuggestionTransitionHold(options);
      if (didHold) {
        setSearchTransitionVariant(variant);
      }
      return didHold;
    },
    [captureSuggestionTransitionHold, setSearchTransitionVariant]
  );

  return {
    submitTransitionHold: submitTransitionHoldRef.current,
    beginSubmitTransition,
    beginSuggestionCloseHold,
    resetSubmitTransitionHold,
    resetSubmitTransitionHoldIfQueryChanged,
  };
};
