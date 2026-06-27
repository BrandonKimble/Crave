import React from 'react';

import { searchService } from '../../../../services/search';
import { logger } from '../../../../utils';

import type { SearchForegroundLaunchIntentRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

export const useSearchForegroundLaunchIntentRuntime = ({
  routeSearchCommandActions,
  navigation,
  activeMainIntent,
  consumeActiveMainIntent,
  openRestaurantProfilePreview,
  launchFavoritesListResults,
  prepareSearchSessionEntry,
  currentMarketKey,
}: SearchForegroundLaunchIntentRuntimeArgs): void => {
  React.useEffect(() => {
    if (activeMainIntent.type === 'none') {
      return;
    }

    if (activeMainIntent.type === 'favorites') {
      // Capture the launch ORIGIN (the bookmarks/profile root) BEFORE entering
      // the search session so the existing SearchSessionOriginContext dismisses
      // back to favorites. Then run the favorites attempt through the same
      // search response lifecycle a natural search uses.
      prepareSearchSessionEntry({ captureOrigin: true });
      void launchFavoritesListResults({
        listId: activeMainIntent.listId,
        listType: activeMainIntent.listType,
        submittedLabel: activeMainIntent.submittedLabel,
      });
      consumeActiveMainIntent();
      return;
    }

    if (activeMainIntent.type === 'polls') {
      routeSearchCommandActions.openAppSearchRoutePollsHome({
        params: {
          marketKey: activeMainIntent.marketKey,
          pollId: activeMainIntent.pollId,
          pinnedMarket: Boolean(activeMainIntent.marketKey || activeMainIntent.pollId),
        },
        snap: 'expanded',
      });
      consumeActiveMainIntent();
      return;
    }

    if (activeMainIntent.type === 'search') {
      navigation.setParams({ searchIntent: activeMainIntent.searchIntent });
      consumeActiveMainIntent();
      return;
    }

    if (activeMainIntent.type === 'restaurant') {
      let cancelled = false;
      void searchService
        .restaurantProfile(activeMainIntent.restaurantId, {
          marketKey: currentMarketKey ?? null,
        })
        .then((profile) => {
          if (cancelled) {
            return;
          }
          const restaurant = profile?.restaurant;
          if (!restaurant?.restaurantId || !restaurant.restaurantName) {
            return;
          }
          openRestaurantProfilePreview(restaurant.restaurantId, restaurant.restaurantName);
        })
        .catch((error) => {
          logger.warn('Failed to open restaurant launch intent', {
            message: error instanceof Error ? error.message : 'unknown error',
            restaurantId: activeMainIntent.restaurantId,
          });
        })
        .finally(() => {
          if (!cancelled) {
            consumeActiveMainIntent();
          }
        });

      return () => {
        cancelled = true;
      };
    }

    consumeActiveMainIntent();
    return undefined;
  }, [
    activeMainIntent,
    consumeActiveMainIntent,
    currentMarketKey,
    launchFavoritesListResults,
    navigation,
    openRestaurantProfilePreview,
    prepareSearchSessionEntry,
    routeSearchCommandActions,
  ]);
};
