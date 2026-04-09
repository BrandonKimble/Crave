import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import { finalizePreparedProfileCloseRecord } from './profile-close-state-record';

export type ProfileCloseFinalizationRuntimeState = {
  finalizePreparedProfileCloseState: () => void;
};

type UseProfileCloseFinalizationRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  clearRestaurantPanelSnapshot: () => void;
  resetRestaurantFocusSession: () => void;
};

export const useProfileCloseFinalizationRuntimeState = ({
  profileControllerStateRef,
  clearRestaurantPanelSnapshot,
  resetRestaurantFocusSession,
}: UseProfileCloseFinalizationRuntimeStateArgs): ProfileCloseFinalizationRuntimeState => {
  const finalizePreparedProfileCloseState = React.useCallback(() => {
    finalizePreparedProfileCloseRecord({
      controllerState: profileControllerStateRef.current,
      clearRestaurantPanelSnapshot,
      resetRestaurantFocusSession,
    });
  }, [clearRestaurantPanelSnapshot, profileControllerStateRef, resetRestaurantFocusSession]);

  return React.useMemo<ProfileCloseFinalizationRuntimeState>(
    () => ({
      finalizePreparedProfileCloseState,
    }),
    [finalizePreparedProfileCloseState]
  );
};
