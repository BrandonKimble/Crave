import React from 'react';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../../services/search';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundRecentSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'pendingRestaurantSelectionRef'
  | 'deferRecentSearchUpsert'
  | 'openRestaurantProfilePreview'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundRecentSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  | 'handleRecentSearchPress'
  | 'handleRecentlyViewedRestaurantPress'
  | 'handleRecentlyViewedFoodPress'
>;

export const useSearchForegroundRecentSubmitRuntime = ({
  submitRuntime,
  pendingRestaurantSelectionRef,
  deferRecentSearchUpsert,
  openRestaurantProfilePreview,
  submitPreparationRuntime,
}: UseSearchForegroundRecentSubmitRuntimeArgs): SearchForegroundRecentSubmitRuntime => {
  const { submitSearch, runRestaurantEntitySearch } = submitRuntime;

  const handleRecentSearchPress = React.useCallback(
    (entry: RecentSearch) => {
      const trimmedValue = entry.queryText.trim();
      if (!trimmedValue) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(trimmedValue);
      const restaurantId =
        entry.selectedEntityType === 'restaurant' ? (entry.selectedEntityId ?? null) : null;
      if (restaurantId) {
        pendingRestaurantSelectionRef.current = { restaurantId };
        openRestaurantProfilePreview(restaurantId, trimmedValue);
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
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      runRestaurantEntitySearch,
      submitPreparationRuntime,
      submitSearch,
    ]
  );

  const handleRecentlyViewedRestaurantPress = React.useCallback(
    (item: RecentlyViewedRestaurant) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(trimmedValue);
      pendingRestaurantSelectionRef.current = { restaurantId: item.restaurantId };
      openRestaurantProfilePreview(item.restaurantId, trimmedValue);
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
      runRestaurantEntitySearch,
      submitPreparationRuntime,
    ]
  );

  const handleRecentlyViewedFoodPress = React.useCallback(
    (item: RecentlyViewedFood) => {
      // Refit layer 2 correctness item (plans/suggest-ideal-shape.md): a
      // recently-viewed FOOD tap lands on the DISH — a typed selected-entity
      // search for the food (the skip-LLM lane the autocomplete food row already
      // uses) — not the restaurant profile the row used to open. The entity
      // identity write handles the recent-search upsert at world-present.
      const foodName = item.foodName.trim();
      if (!foodName) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(foodName);
      pendingRestaurantSelectionRef.current = null;
      void submitSearch(
        {
          selectedEntity: { entityId: item.foodId, entityType: 'food' },
          submission: {
            source: 'recent',
            context: { typedPrefix: foodName, matchType: 'entity' },
          },
        },
        foodName
      );
    },
    [pendingRestaurantSelectionRef, submitPreparationRuntime, submitSearch]
  );

  return React.useMemo(
    () => ({
      handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress,
    }),
    [handleRecentSearchPress, handleRecentlyViewedFoodPress, handleRecentlyViewedRestaurantPress]
  );
};
