import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerAutoOpenPortsRuntimeArgs = {
  searchContext: ProfileSearchContext;
  autoOpenRuntime: Pick<ProfileRuntimeStateOwner['autoOpenRuntime'], 'setLastAutoOpenKey'>;
};

export const useProfileOwnerAutoOpenPortsRuntime = ({
  searchContext,
  autoOpenRuntime,
}: UseProfileOwnerAutoOpenPortsRuntimeArgs): CreateProfileActionRuntimeArgs['autoOpenActionExecutionPorts'] =>
  React.useMemo(
    () => ({
      clearPendingSelection: searchContext.clearPendingRestaurantSelection,
      setLastAutoOpenKey: autoOpenRuntime.setLastAutoOpenKey,
      refreshOpenRestaurantProfileSelection: (restaurant, queryLabel) => {
        void restaurant;
        void queryLabel;
      },
      openRestaurantProfile: (restaurant, options) => {
        void restaurant;
        void options;
      },
    }),
    [autoOpenRuntime.setLastAutoOpenKey, searchContext.clearPendingRestaurantSelection]
  );
