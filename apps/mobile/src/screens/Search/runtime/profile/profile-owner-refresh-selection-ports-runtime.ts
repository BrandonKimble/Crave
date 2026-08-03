import React from 'react';

import type { ProfileRefreshSelectionOwnedPorts } from './profile-action-runtime-port-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerRefreshSelectionPortsRuntimeArgs = {
  setMapHighlightedRestaurantId: (restaurantId: string | null) => void;
  hydrationRuntime: Pick<ProfileRuntimeStateOwner['hydrationRuntime'], 'seedRestaurantProfile'>;
  hydrateRestaurantProfileById: ProfileRuntimeStateOwner['hydrationRuntime']['hydrateRestaurantProfileById'];
};

export const useProfileOwnerRefreshSelectionPortsRuntime = ({
  setMapHighlightedRestaurantId,
  hydrationRuntime,
  hydrateRestaurantProfileById,
}: UseProfileOwnerRefreshSelectionPortsRuntimeArgs): ProfileRefreshSelectionOwnedPorts =>
  React.useMemo(
    () => ({
      setMapHighlightedRestaurantId,
      seedRestaurantProfile: hydrationRuntime.seedRestaurantProfile,
      hydrateRestaurantProfileById,
      // F1064: `focusRestaurantProfileCamera` is a profile ACTION built after these ports
      // (construction-order cycle) — not owned here, so not declared here.
    }),
    [
      hydrateRestaurantProfileById,
      hydrationRuntime.seedRestaurantProfile,
      setMapHighlightedRestaurantId,
    ]
  );
