import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { AppOverlayRouteCommandRuntime } from '../navigation/runtime/app-overlay-route-command-runtime';

export type SearchRestaurantRouteCommand =
  | {
      type: 'show_search_restaurant_route';
      restaurantId: string | null;
    }
  | {
      type: 'hide_search_restaurant_route';
    }
  | {
      type: 'update_search_restaurant_route';
      restaurantId: string | null;
    };

const isSearchRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'search';

export const applySearchRestaurantRouteCommand = (
  command: SearchRestaurantRouteCommand | undefined,
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime
) => {
  if (!command) {
    return;
  }

  const activeOverlayRoute = routeOverlayRouteCommandRuntime.getRouteState().activeOverlayRoute;
  const isSearchRestaurantRouteActive = isSearchRestaurantRouteEntry(activeOverlayRoute);

  switch (command.type) {
    case 'show_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        routeOverlayRouteCommandRuntime.updateRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
        return;
      }
      if (activeOverlayRoute.key !== 'restaurant') {
        routeOverlayRouteCommandRuntime.pushRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
      }
      return;
    }
    case 'hide_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        routeOverlayRouteCommandRuntime.closeActiveRoute();
      }
      return;
    }
    case 'update_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        routeOverlayRouteCommandRuntime.updateRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
      }
      return;
    }
  }
};
