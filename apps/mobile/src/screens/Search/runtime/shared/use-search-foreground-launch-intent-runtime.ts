import React from 'react';

import { openSearchRoutePollsHome } from '../../../../overlays/searchRouteOverlayCommandStore';
import { useAppOverlayRouteController } from '../../../../overlays/useAppOverlayRouteController';
import { searchService } from '../../../../services/search';
import { logger } from '../../../../utils';

import type { SearchForegroundLaunchIntentRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

export const useSearchForegroundLaunchIntentRuntime = ({
  navigation,
  activeMainIntent,
  consumeActiveMainIntent,
  openRestaurantProfilePreview,
  currentMarketKey,
}: SearchForegroundLaunchIntentRuntimeArgs): void => {
  const overlayRouteController = useAppOverlayRouteController();

  React.useEffect(() => {
    if (activeMainIntent.type === 'none') {
      return;
    }

    if (activeMainIntent.type === 'polls') {
      openSearchRoutePollsHome({
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
    navigation,
    openRestaurantProfilePreview,
    overlayRouteController,
  ]);
};
