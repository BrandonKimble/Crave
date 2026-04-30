import React from 'react';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { RestaurantRoutePanelDraft } from './restaurantRoutePanelContract';

type OpenRestaurantRouteArgs = {
  restaurantId: string;
  panel: RestaurantRoutePanelDraft;
};

type RestaurantRouteProducer = {
  openRestaurantRoute: (args: OpenRestaurantRouteArgs) => number;
  updateRestaurantRoutePanel: (sessionToken: number, panel: RestaurantRoutePanelDraft) => boolean;
  closeRestaurantRoute: (sessionToken?: number | null) => void;
  getActiveRestaurantRouteSessionToken: () => number | null;
};

export const useRestaurantRouteProducer = (): RestaurantRouteProducer => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeGlobalRestaurantRouteActions = routeSceneRuntime.routeGlobalRestaurantRouteActions;

  return React.useMemo(
    () => ({
      openRestaurantRoute: routeGlobalRestaurantRouteActions.openRestaurantRoute,
      updateRestaurantRoutePanel: routeGlobalRestaurantRouteActions.updateRestaurantRoutePanel,
      closeRestaurantRoute: routeGlobalRestaurantRouteActions.closeRestaurantRoute,
      getActiveRestaurantRouteSessionToken:
        routeGlobalRestaurantRouteActions.getActiveRestaurantRouteSessionToken,
    }),
    [routeGlobalRestaurantRouteActions]
  );
};
