import React from 'react';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../../services/search';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './search-foreground-interaction-runtime-contract';
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
      const placeId =
        entry.selectedEntityType === 'place' ? (entry.selectedEntityId ?? null) : null;
      if (placeId) {
        pendingRestaurantSelectionRef.current = { placeId };
        openRestaurantProfilePreview(placeId, trimmedValue);
        deferRecentSearchUpsert({
          queryText: trimmedValue,
          selectedEntityId: placeId,
          selectedEntityType: 'place',
          statusPreview: entry.statusPreview ?? null,
        });
        void runRestaurantEntitySearch({
          placeId,
          placeName: trimmedValue,
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
      const trimmedValue = item.placeName.trim();
      if (!trimmedValue) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(trimmedValue);
      pendingRestaurantSelectionRef.current = { placeId: item.placeId };
      openRestaurantProfilePreview(item.placeId, trimmedValue);
      deferRecentSearchUpsert({
        queryText: trimmedValue,
        selectedEntityId: item.placeId,
        selectedEntityType: 'place',
        statusPreview: item.statusPreview ?? null,
      });
      void runRestaurantEntitySearch({
        placeId: item.placeId,
        placeName: trimmedValue,
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
      // VIEWED-vs-SEARCHED split (owner-ratified 2026-07-24): a recently-
      // VIEWED dish reproduces the dish-card tap it came from — the dish's
      // search world presents AND this place's profile auto-opens
      // inside it (pendingRestaurantSelection, the same mechanism every
      // world-present selection uses). That contextual open IS today's
      // dish deep-link foundation; when profiles are finished, the
      // dish-anchor scroll rides this same path. Recently-SEARCHED dishes
      // (typed + tapped the autocomplete dish row) live in the recent-
      // searches section and re-run the plain dish search there.
      const itemName = item.itemName.trim();
      if (!itemName) {
        return;
      }
      submitPreparationRuntime.prepareRecentIntentSubmit(itemName);
      pendingRestaurantSelectionRef.current = { placeId: item.placeId };
      void submitSearch(
        {
          selectedEntity: { entityId: item.itemId, entityType: 'item' },
          submission: {
            source: 'recent',
            context: { typedPrefix: itemName, matchType: 'entity' },
          },
        },
        itemName
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
