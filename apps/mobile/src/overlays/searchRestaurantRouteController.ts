import { useOverlayStore, type OverlayRouteEntry } from '../store/overlayStore';
import { appOverlayRouteController } from './useAppOverlayRouteController';

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
  route.key === 'restaurant' && route.params?.source === 'search';

export const getActiveSearchRestaurantRouteRestaurantId = (): string | null => {
  const activeOverlayRoute = useOverlayStore.getState().activeOverlayRoute;
  if (!isSearchRestaurantRouteEntry(activeOverlayRoute)) {
    return null;
  }
  return activeOverlayRoute.params?.restaurantId ?? null;
};

export const applySearchRestaurantRouteCommand = (
  command: SearchRestaurantRouteCommand | undefined
) => {
  if (!command) {
    return;
  }

  const activeOverlayRoute = useOverlayStore.getState().activeOverlayRoute;
  const isSearchRestaurantRouteActive = isSearchRestaurantRouteEntry(activeOverlayRoute);

  switch (command.type) {
    case 'show_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        appOverlayRouteController.updateRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
        return;
      }
      if (activeOverlayRoute.key !== 'restaurant') {
        appOverlayRouteController.pushRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
      }
      return;
    }
    case 'hide_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        appOverlayRouteController.closeActiveRoute();
      }
      return;
    }
    case 'update_search_restaurant_route': {
      if (isSearchRestaurantRouteActive) {
        appOverlayRouteController.updateRoute('restaurant', {
          restaurantId: command.restaurantId,
          source: 'search',
        });
      }
      return;
    }
  }
};

export const useActiveSearchRestaurantRouteRestaurantId = (): string | null =>
  useOverlayStore((state) => {
    const activeOverlayRoute = state.activeOverlayRoute;
    if (!isSearchRestaurantRouteEntry(activeOverlayRoute)) {
      return null;
    }
    return activeOverlayRoute.params?.restaurantId ?? null;
  });
