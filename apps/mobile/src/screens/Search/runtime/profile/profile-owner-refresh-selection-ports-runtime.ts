import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
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
}: UseProfileOwnerRefreshSelectionPortsRuntimeArgs): CreateProfileActionRuntimeArgs['refreshSelectionExecutionPorts'] =>
  React.useMemo(
    () => ({
      setMapHighlightedRestaurantId,
      seedRestaurantProfile: hydrationRuntime.seedRestaurantProfile,
      hydrateRestaurantProfileById,
      focusRestaurantProfileCamera: (restaurant, source) => {
        void restaurant;
        void source;
      },
    }),
    [
      hydrateRestaurantProfileById,
      hydrationRuntime.seedRestaurantProfile,
      setMapHighlightedRestaurantId,
    ]
  );
