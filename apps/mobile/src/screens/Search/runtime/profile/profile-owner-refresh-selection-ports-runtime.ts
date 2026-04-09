import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerRefreshSelectionPortsRuntimeArgs = {
  hydrationRuntime: Pick<ProfileRuntimeStateOwner['hydrationRuntime'], 'seedRestaurantProfile'>;
  hydrateRestaurantProfileById: ProfileRuntimeStateOwner['hydrationRuntime']['hydrateRestaurantProfileById'];
};

export const useProfileOwnerRefreshSelectionPortsRuntime = ({
  hydrationRuntime,
  hydrateRestaurantProfileById,
}: UseProfileOwnerRefreshSelectionPortsRuntimeArgs): CreateProfileActionRuntimeArgs['refreshSelectionExecutionPorts'] =>
  React.useMemo(
    () => ({
      seedRestaurantProfile: hydrationRuntime.seedRestaurantProfile,
      hydrateRestaurantProfileById,
      focusRestaurantProfileCamera: (restaurant, source) => {
        void restaurant;
        void source;
      },
    }),
    [hydrateRestaurantProfileById, hydrationRuntime.seedRestaurantProfile]
  );
