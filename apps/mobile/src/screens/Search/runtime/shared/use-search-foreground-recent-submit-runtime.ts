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
import { resolveForegroundSearchSubmitEntrySurface } from './search-submit-entry-surface-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundRecentSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'isSuggestionPanelActive'
  | 'pendingRestaurantSelectionRef'
  | 'setRestaurantOnlyIntent'
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
  isSuggestionPanelActive,
  pendingRestaurantSelectionRef,
  setRestaurantOnlyIntent,
  deferRecentSearchUpsert,
  openRestaurantProfilePreview,
  submitPreparationRuntime,
}: UseSearchForegroundRecentSubmitRuntimeArgs): SearchForegroundRecentSubmitRuntime => {
  const { submitSearch, runRestaurantEntitySearch } = submitRuntime;
  const entrySurface = resolveForegroundSearchSubmitEntrySurface({ isSuggestionPanelActive });

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
          entrySurface,
        });
        return;
      }
      deferRecentSearchUpsert(trimmedValue);
      setRestaurantOnlyIntent(null);
      void submitSearch({ submission: { source: 'recent' }, entrySurface }, trimmedValue);
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      runRestaurantEntitySearch,
      entrySurface,
      setRestaurantOnlyIntent,
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
        entrySurface,
      });
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      runRestaurantEntitySearch,
      entrySurface,
      setRestaurantOnlyIntent,
      submitPreparationRuntime,
    ]
  );

  const handleRecentlyViewedFoodPress = React.useCallback(
    (item: RecentlyViewedFood) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(trimmedValue);
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
        entrySurface,
      });
    },
    [
      deferRecentSearchUpsert,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      runRestaurantEntitySearch,
      entrySurface,
      setRestaurantOnlyIntent,
      submitPreparationRuntime,
    ]
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
