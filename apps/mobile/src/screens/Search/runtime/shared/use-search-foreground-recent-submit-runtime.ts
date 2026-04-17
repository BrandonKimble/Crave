import React from 'react';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../../services/search';

import type {
  SearchForegroundSubmitRuntimeArgs,
  SearchForegroundInteractionSubmitHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import type { SearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundRecentSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'setRestaurantOnlyIntent'
  | 'pendingRestaurantSelectionRef'
  | 'deferRecentSearchUpsert'
  | 'openRestaurantProfilePreview'
> & {
  preparationRuntime: Pick<SearchForegroundSubmitPreparationRuntime, 'prepareRecentIntentSubmit'>;
};

export type SearchForegroundRecentSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  | 'handleRecentSearchPress'
  | 'handleRecentlyViewedRestaurantPress'
  | 'handleRecentlyViewedFoodPress'
>;

export const useSearchForegroundRecentSubmitRuntime = ({
  submitRuntime,
  setRestaurantOnlyIntent,
  pendingRestaurantSelectionRef,
  deferRecentSearchUpsert,
  openRestaurantProfilePreview,
  preparationRuntime,
}: UseSearchForegroundRecentSubmitRuntimeArgs): SearchForegroundRecentSubmitRuntime => {
  const { submitSearch, runRestaurantEntitySearch } = submitRuntime;
  const { prepareRecentIntentSubmit } = preparationRuntime;

  const handleRecentSearchPress = React.useCallback(
    (entry: RecentSearch) => {
      const trimmedValue = entry.queryText.trim();
      if (!trimmedValue) {
        return;
      }
      prepareRecentIntentSubmit(trimmedValue);
      const restaurantId =
        entry.selectedEntityType === 'restaurant' ? (entry.selectedEntityId ?? null) : null;
      if (restaurantId) {
        pendingRestaurantSelectionRef.current = { restaurantId };
        openRestaurantProfilePreview(restaurantId, trimmedValue);
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
      openRestaurantProfilePreview,
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
      openRestaurantProfilePreview(item.restaurantId, trimmedValue);
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
      openRestaurantProfilePreview,
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
      openRestaurantProfilePreview(item.restaurantId, trimmedValue);
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
      openRestaurantProfilePreview,
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
