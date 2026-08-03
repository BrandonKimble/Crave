import React from 'react';

import type { ProfileAutoOpenOwnedPorts } from './profile-action-runtime-port-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerAutoOpenPortsRuntimeArgs = {
  searchContext: ProfileSearchContext;
  autoOpenRuntime: Pick<ProfileRuntimeStateOwner['autoOpenRuntime'], 'setLastAutoOpenKey'>;
};

export const useProfileOwnerAutoOpenPortsRuntime = ({
  searchContext,
  autoOpenRuntime,
}: UseProfileOwnerAutoOpenPortsRuntimeArgs): ProfileAutoOpenOwnedPorts =>
  React.useMemo(
    () => ({
      clearPendingSelection: searchContext.clearPendingRestaurantSelection,
      setLastAutoOpenKey: autoOpenRuntime.setLastAutoOpenKey,
      // F1064: `refreshOpenRestaurantProfileSelection` + `openRestaurantProfile` are profile
      // ACTIONS that do not exist yet here (construction-order cycle) — this builder no
      // longer pretends to own them with no-ops. The kickoff runtime supplies the real ones.
    }),
    [autoOpenRuntime.setLastAutoOpenKey, searchContext.clearPendingRestaurantSelection]
  );
