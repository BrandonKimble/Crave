import React from 'react';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';
import type { SuggestionTransitionHold } from './use-suggestion-transition-hold';

type UseSuggestionDisplayModelArgs = {
  shouldDriveSuggestionLayout: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  hasSearchChromeRawQuery: boolean;
  isAutocompleteSuppressed: boolean;
  isAutocompleteLoading: boolean;
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  isRecentlyViewedFoodsLoading: boolean;
  submitTransitionHold: SuggestionTransitionHold;
  autocompleteMinChars: number;
};

type UseSuggestionDisplayModelResult = {
  isSuggestionClosing: boolean;
  shouldInstantSuggestionSpacing: boolean;
  isSuggestionHoldActive: boolean;
  suggestionDisplayQuery: string;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
  isRecentLoadingDisplay: boolean;
  isRecentlyViewedLoadingDisplay: boolean;
  isRecentlyViewedFoodsLoadingDisplay: boolean;
  hasRecentSearchesDisplay: boolean;
  hasRecentlyViewedRestaurantsDisplay: boolean;
  hasRecentlyViewedFoodsDisplay: boolean;
  suggestionDisplayTrimmedQuery: string;
  hasTypedQuery: boolean;
  hasRawQuery: boolean;
  shouldHoldAutocomplete: boolean;
  shouldHoldRecent: boolean;
  shouldHoldSuggestionPanel: boolean;
  shouldHoldSuggestionBackground: boolean;
  shouldFreezeSuggestionHeader: boolean;
  baseShouldShowRecentSection: boolean;
  baseShouldRenderRecentSection: boolean;
  baseShouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  shouldSuppressAutocompletePanelWhileLoading: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
  shouldShowSuggestionBackground: boolean;
  shouldShowSuggestionSurface: boolean;
  shouldLockSearchChromeTransform: boolean;
};

export const useSuggestionDisplayModel = ({
  shouldDriveSuggestionLayout,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  hasSearchChromeRawQuery,
  isAutocompleteSuppressed,
  isAutocompleteLoading,
  query,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
  submitTransitionHold,
  autocompleteMinChars,
}: UseSuggestionDisplayModelArgs): UseSuggestionDisplayModelResult => {
  const isSuggestionClosing = isSuggestionPanelVisible && !isSuggestionPanelActive;
  const prevHasSearchChromeRawQueryRef = React.useRef(hasSearchChromeRawQuery);

  const shouldInstantSuggestionSpacing =
    isSuggestionPanelActive &&
    !isSuggestionClosing &&
    prevHasSearchChromeRawQueryRef.current !== hasSearchChromeRawQuery;

  React.useEffect(() => {
    prevHasSearchChromeRawQueryRef.current = hasSearchChromeRawQuery;
  }, [hasSearchChromeRawQuery]);

  const isSuggestionHoldActive = isSuggestionClosing && submitTransitionHold.active;
  const suggestionDisplayQuery = isSuggestionHoldActive ? submitTransitionHold.query : query;
  const suggestionDisplaySuggestions = isSuggestionHoldActive
    ? submitTransitionHold.suggestions
    : suggestions;
  const recentSearchesDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentSearches
    : recentSearches;
  const recentlyViewedRestaurantsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedRestaurants
    : recentlyViewedRestaurants;
  const recentlyViewedFoodsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedFoods
    : recentlyViewedFoods;
  const isRecentLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentLoading
    : isRecentLoading;
  const isRecentlyViewedLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedLoading
    : isRecentlyViewedLoading;
  const isRecentlyViewedFoodsLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedFoodsLoading
    : isRecentlyViewedFoodsLoading;

  const hasRecentSearchesDisplay = recentSearchesDisplay.length > 0;
  const hasRecentlyViewedRestaurantsDisplay = recentlyViewedRestaurantsDisplay.length > 0;
  const hasRecentlyViewedFoodsDisplay = recentlyViewedFoodsDisplay.length > 0;

  const suggestionDisplayTrimmedQuery = suggestionDisplayQuery.trim();
  const hasTypedQuery = suggestionDisplayTrimmedQuery.length > 0;
  const hasRawQuery = suggestionDisplayQuery.length > 0;

  const shouldHoldAutocomplete = isSuggestionHoldActive && submitTransitionHold.holdAutocomplete;
  const shouldHoldRecent = isSuggestionHoldActive && submitTransitionHold.holdRecent;
  const shouldHoldSuggestionPanel =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionPanel;
  const shouldHoldSuggestionBackground =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionBackground;
  const shouldFreezeSuggestionHeader =
    shouldDriveSuggestionLayout && !isSuggestionPanelActive && hasSearchChromeRawQuery;

  const baseShouldShowRecentSection = shouldDriveSuggestionLayout && !hasTypedQuery;
  const baseShouldRenderRecentSection =
    baseShouldShowRecentSection &&
    (hasRecentSearchesDisplay ||
      hasRecentlyViewedRestaurantsDisplay ||
      hasRecentlyViewedFoodsDisplay ||
      isRecentLoadingDisplay ||
      isRecentlyViewedLoadingDisplay ||
      isRecentlyViewedFoodsLoadingDisplay);

  const baseShouldRenderAutocompleteSection =
    shouldDriveSuggestionLayout &&
    !isAutocompleteSuppressed &&
    suggestionDisplayTrimmedQuery.length >= autocompleteMinChars;

  const shouldRenderRecentSection =
    shouldHoldRecent || (!isSuggestionClosing && baseShouldRenderRecentSection);

  const shouldSuppressAutocompletePanelWhileLoading =
    !isSuggestionClosing &&
    baseShouldRenderAutocompleteSection &&
    isAutocompleteLoading &&
    suggestionDisplaySuggestions.length === 0;

  const shouldRenderAutocompleteSection =
    shouldHoldAutocomplete ||
    (!isSuggestionClosing &&
      baseShouldRenderAutocompleteSection &&
      !shouldSuppressAutocompletePanelWhileLoading);

  const shouldRenderSuggestionPanel =
    shouldHoldSuggestionPanel || shouldRenderAutocompleteSection || shouldRenderRecentSection;

  const shouldShowAutocompleteSpinnerInBar =
    baseShouldRenderAutocompleteSection && isAutocompleteLoading;
  const shouldShowSuggestionBackground =
    shouldDriveSuggestionLayout || shouldHoldSuggestionBackground;
  const shouldShowSuggestionSurface = shouldDriveSuggestionLayout;
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionPanelVisible;

  return {
    isSuggestionClosing,
    shouldInstantSuggestionSpacing,
    isSuggestionHoldActive,
    suggestionDisplayQuery,
    suggestionDisplaySuggestions,
    recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay,
    isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay,
    hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay,
    suggestionDisplayTrimmedQuery,
    hasTypedQuery,
    hasRawQuery,
    shouldHoldAutocomplete,
    shouldHoldRecent,
    shouldHoldSuggestionPanel,
    shouldHoldSuggestionBackground,
    shouldFreezeSuggestionHeader,
    baseShouldShowRecentSection,
    baseShouldRenderRecentSection,
    baseShouldRenderAutocompleteSection,
    shouldRenderRecentSection,
    shouldSuppressAutocompletePanelWhileLoading,
    shouldRenderAutocompleteSection,
    shouldRenderSuggestionPanel,
    shouldShowAutocompleteSpinnerInBar,
    shouldShowSuggestionBackground,
    shouldShowSuggestionSurface,
    shouldLockSearchChromeTransform,
  };
};
