import React from 'react';

import type { RestaurantFocusSession } from './profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  getRestaurantFocusSessionFromRecord,
  resetRestaurantFocusSessionOnRecord,
  setRestaurantFocusSessionOnRecord,
} from './profile-mutable-state-record';

export type ProfileFocusRuntimeState = {
  getRestaurantFocusSession: () => RestaurantFocusSession;
  setRestaurantFocusSession: (session: RestaurantFocusSession) => void;
  resetRestaurantProfileFocusSession: () => void;
};

type UseProfileFocusRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileFocusRuntimeState = ({
  profileControllerStateRef,
}: UseProfileFocusRuntimeStateArgs): ProfileFocusRuntimeState => {
  const getRestaurantFocusSession = React.useCallback(
    () => getRestaurantFocusSessionFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setRestaurantFocusSession = React.useCallback(
    (session: RestaurantFocusSession) => {
      setRestaurantFocusSessionOnRecord(profileControllerStateRef.current, session);
    },
    [profileControllerStateRef]
  );

  const resetRestaurantProfileFocusSession = React.useCallback(() => {
    resetRestaurantFocusSessionOnRecord(profileControllerStateRef.current);
  }, [profileControllerStateRef]);

  return React.useMemo<ProfileFocusRuntimeState>(
    () => ({
      getRestaurantFocusSession,
      setRestaurantFocusSession,
      resetRestaurantProfileFocusSession,
    }),
    [getRestaurantFocusSession, resetRestaurantProfileFocusSession, setRestaurantFocusSession]
  );
};
