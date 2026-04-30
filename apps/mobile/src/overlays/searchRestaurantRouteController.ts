import React from 'react';

import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { AppOverlayRouteCommandRuntime } from '../navigation/runtime/app-overlay-route-command-runtime';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { RouteOverlayNavigationSnapshot } from '../navigation/runtime/route-overlay-navigation-snapshot-contract';

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

export const useActiveSearchRestaurantRouteRestaurantId = (): string | null => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const selectRestaurantId = React.useCallback(
    (state: RouteOverlayNavigationSnapshot): string | null => {
      const activeOverlayRoute = state.activeOverlayRoute;
      if (!isSearchRestaurantRouteEntry(activeOverlayRoute)) {
        return null;
      }
      return activeOverlayRoute.params?.restaurantId ?? null;
    },
    []
  );
  const [restaurantId, setRestaurantId] = React.useState<string | null>(() =>
    selectRestaurantId(routeSceneRuntime.routeSheetHostNavigationAuthority.getSnapshot())
  );

  React.useEffect(
    () =>
      routeSceneRuntime.routeSheetHostNavigationAuthority.registerTarget({
        selector: selectRestaurantId,
        syncNavigationSnapshot: (_snapshot, selectedRestaurantId) => {
          setRestaurantId(selectedRestaurantId);
        },
        attributionLabel: 'SearchRestaurantRouteController',
      }),
    [routeSceneRuntime, selectRestaurantId]
  );

  return restaurantId;
};
