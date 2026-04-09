import React from 'react';

import { useAppOverlayRouteController } from '../../../../overlays/useAppOverlayRouteController';
import { searchService } from '../../../../services/search';
import { logger } from '../../../../utils';

import type { UseSearchForegroundInteractionRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundLaunchIntentRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  'navigation' | 'activeMainIntent' | 'consumeActiveMainIntent' | 'openRestaurantProfilePreview'
>;

export const useSearchForegroundLaunchIntentRuntime = ({
  navigation,
  activeMainIntent,
  consumeActiveMainIntent,
  openRestaurantProfilePreview,
}: UseSearchForegroundLaunchIntentRuntimeArgs): void => {
  const overlayRouteController = useAppOverlayRouteController();

  React.useEffect(() => {
    if (activeMainIntent.type === 'none') {
      return;
    }

    if (activeMainIntent.type === 'polls') {
      overlayRouteController.setRootRoute('polls', {
        coverageKey: activeMainIntent.coverageKey,
        pollId: activeMainIntent.pollId,
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
        .restaurantProfile(activeMainIntent.restaurantId)
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
    navigation,
    openRestaurantProfilePreview,
    overlayRouteController,
  ]);
};
