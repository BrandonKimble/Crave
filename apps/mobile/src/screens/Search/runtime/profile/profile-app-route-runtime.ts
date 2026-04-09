import React from 'react';

import {
  applySearchRestaurantRouteCommand,
  type SearchRestaurantRouteCommand,
} from '../../../../overlays/searchRestaurantRouteController';

export type ProfileAppRouteExecutionRuntime = {
  applyProfileRouteIntent: (routeIntent: SearchRestaurantRouteCommand) => void;
};

export const useProfileAppRouteExecutionRuntime = (): ProfileAppRouteExecutionRuntime => {
  const applyProfileRouteIntent = React.useCallback((routeIntent: SearchRestaurantRouteCommand) => {
    applySearchRestaurantRouteCommand(routeIntent);
  }, []);

  return React.useMemo<ProfileAppRouteExecutionRuntime>(
    () => ({
      applyProfileRouteIntent,
    }),
    [applyProfileRouteIntent]
  );
};
