import React from 'react';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';

type RecentSearchUpsertPayload = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: 'restaurant' | 'query' | null;
  statusPreview?: unknown;
};

type RestaurantEntitySearchPayload = {
  restaurantId: string;
  restaurantName: string;
  submissionSource: 'recent';
  typedPrefix: string;
};

type UseRecentSearchActionsArgs<TSuggestion> = {
  isSearchEditingRef: React.MutableRefObject<boolean>;
  pendingResultsSheetRevealRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  pendingRestaurantSelectionRef: React.MutableRefObject<{ restaurantId: string } | null>;
  openRestaurantProfilePreviewRef: React.MutableRefObject<
    ((restaurantId: string, restaurantName: string) => void) | null
  >;
  beginSubmitTransition: () => boolean;
  captureSearchSessionOrigin: () => void;
  ensureSearchOverlay: () => void;
  suppressAutocompleteResults: () => void;
  cancelAutocomplete: () => void;
  dismissSearchKeyboard: () => void;
  resetFocusedMapState: () => void;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<TSuggestion[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  deferRecentSearchUpsert: (payload: string | RecentSearchUpsertPayload) => void;
  runRestaurantEntitySearch: (payload: RestaurantEntitySearchPayload) => Promise<unknown> | void;
  submitSearch: (
    options: { submission: { source: 'recent'; context?: Record<string, unknown> } },
    explicitQuery?: string
  ) => Promise<unknown> | void;
};

type UseRecentSearchActionsResult = {
  handleRecentSearchPress: (entry: RecentSearch) => void;
  handleRecentlyViewedRestaurantPress: (item: RecentlyViewedRestaurant) => void;
  handleRecentlyViewedFoodPress: (item: RecentlyViewedFood) => void;
};

export const useRecentSearchActions = <TSuggestion>({
  isSearchEditingRef,
  pendingResultsSheetRevealRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  pendingRestaurantSelectionRef,
  openRestaurantProfilePreviewRef,
  beginSubmitTransition,
  captureSearchSessionOrigin,
  ensureSearchOverlay,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  resetFocusedMapState,
  setRestaurantOnlyIntent,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  deferRecentSearchUpsert,
  runRestaurantEntitySearch,
  submitSearch,
}: UseRecentSearchActionsArgs<TSuggestion>): UseRecentSearchActionsResult => {
  const prepareRecentIntentSubmit = React.useCallback(
    (queryValue: string) => {
      captureSearchSessionOrigin();
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      pendingResultsSheetRevealRef.current = false;
      allowSearchBlurExitRef.current = true;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      cancelAutocomplete();
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(queryValue);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      resetFocusedMapState();
      return shouldDeferSuggestionClear;
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      cancelAutocomplete,
      captureSearchSessionOrigin,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      pendingResultsSheetRevealRef,
      resetFocusedMapState,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setShowSuggestions,
      setSuggestions,
      suppressAutocompleteResults,
    ]
  );

  const handleRecentSearchPress = React.useCallback(
    (entry: RecentSearch) => {
      const trimmedValue = entry.queryText.trim();
      if (!trimmedValue) {
        return;
      }

      prepareRecentIntentSubmit(trimmedValue);
      const restaurantId =
        entry.selectedEntityType === 'restaurant' ? entry.selectedEntityId ?? null : null;
      if (restaurantId) {
        pendingRestaurantSelectionRef.current = { restaurantId };
        openRestaurantProfilePreviewRef.current?.(restaurantId, trimmedValue);
        setRestaurantOnlyIntent(restaurantId);
        deferRecentSearchUpsert({
          queryText: trimmedValue,
          selectedEntityId: restaurantId,
          selectedEntityType: 'restaurant',
          statusPreview: entry.statusPreview ?? null,
        });
        void runRestaurantEntitySearch({
          restaurantId,
          restaurantName: trimmedValue,
          submissionSource: 'recent',
          typedPrefix: trimmedValue,
        });
        return;
      }
      deferRecentSearchUpsert(trimmedValue);
      setRestaurantOnlyIntent(null);
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreviewRef,
      pendingRestaurantSelectionRef,
      prepareRecentIntentSubmit,
      runRestaurantEntitySearch,
      setRestaurantOnlyIntent,
      submitSearch,
    ]
  );

  const handleRecentlyViewedRestaurantPress = React.useCallback(
    (item: RecentlyViewedRestaurant) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }

      prepareRecentIntentSubmit(trimmedValue);
      pendingRestaurantSelectionRef.current = { restaurantId: item.restaurantId };
      openRestaurantProfilePreviewRef.current?.(item.restaurantId, trimmedValue);
      setRestaurantOnlyIntent(item.restaurantId);
      deferRecentSearchUpsert({
        queryText: trimmedValue,
        selectedEntityId: item.restaurantId,
        selectedEntityType: 'restaurant',
        statusPreview: item.statusPreview ?? null,
      });
      void runRestaurantEntitySearch({
        restaurantId: item.restaurantId,
        restaurantName: trimmedValue,
        submissionSource: 'recent',
        typedPrefix: trimmedValue,
      });
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreviewRef,
      pendingRestaurantSelectionRef,
      prepareRecentIntentSubmit,
      runRestaurantEntitySearch,
      setRestaurantOnlyIntent,
    ]
  );

  const handleRecentlyViewedFoodPress = React.useCallback(
    (item: RecentlyViewedFood) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }

      prepareRecentIntentSubmit(trimmedValue);
      pendingRestaurantSelectionRef.current = { restaurantId: item.restaurantId };
      openRestaurantProfilePreviewRef.current?.(item.restaurantId, trimmedValue);
      setRestaurantOnlyIntent(item.restaurantId);
      deferRecentSearchUpsert({
        queryText: trimmedValue,
        selectedEntityId: item.restaurantId,
        selectedEntityType: 'restaurant',
        statusPreview: item.statusPreview ?? null,
      });
      void runRestaurantEntitySearch({
        restaurantId: item.restaurantId,
        restaurantName: trimmedValue,
        submissionSource: 'recent',
        typedPrefix: item.foodName,
      });
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreviewRef,
      pendingRestaurantSelectionRef,
      prepareRecentIntentSubmit,
      runRestaurantEntitySearch,
      setRestaurantOnlyIntent,
    ]
  );

  return {
    handleRecentSearchPress,
    handleRecentlyViewedRestaurantPress,
    handleRecentlyViewedFoodPress,
  };
};
