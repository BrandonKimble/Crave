import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import { finalizePreparedProfileCloseRecord } from './profile-close-state-record';

export type ProfileCloseFinalizationRuntimeState = {
  finalizePreparedProfileCloseState: () => void;
};

type UseProfileCloseFinalizationRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  clearRestaurantPanelSnapshot: () => void;
  clearMapHighlightedRestaurantId: () => void;
  resetRestaurantFocusSession: () => void;
};

export const useProfileCloseFinalizationRuntimeState = ({
  profileControllerStateRef,
  clearRestaurantPanelSnapshot,
  clearMapHighlightedRestaurantId,
  resetRestaurantFocusSession,
}: UseProfileCloseFinalizationRuntimeStateArgs): ProfileCloseFinalizationRuntimeState => {
  const finalizePreparedProfileCloseState = React.useCallback(() => {
    clearMapHighlightedRestaurantId();
    finalizePreparedProfileCloseRecord({
      controllerState: profileControllerStateRef.current,
      clearRestaurantPanelSnapshot,
      resetRestaurantFocusSession,
    });
  }, [
    clearMapHighlightedRestaurantId,
    clearRestaurantPanelSnapshot,
    profileControllerStateRef,
    resetRestaurantFocusSession,
  ]);

  return React.useMemo<ProfileCloseFinalizationRuntimeState>(
    () => ({
      finalizePreparedProfileCloseState,
    }),
    [finalizePreparedProfileCloseState]
  );
};
