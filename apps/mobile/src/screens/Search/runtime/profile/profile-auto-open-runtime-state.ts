import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  getLastAutoOpenKeyFromRecord,
  setLastAutoOpenKeyOnRecord,
} from './profile-mutable-state-record';

export type ProfileAutoOpenRuntimeState = {
  getLastAutoOpenKey: () => string | null;
  setLastAutoOpenKey: (key: string | null) => void;
};

type UseProfileAutoOpenRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileAutoOpenRuntimeState = ({
  profileControllerStateRef,
}: UseProfileAutoOpenRuntimeStateArgs): ProfileAutoOpenRuntimeState => {
  const getLastAutoOpenKey = React.useCallback(
    () => getLastAutoOpenKeyFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setLastAutoOpenKey = React.useCallback(
    (key: string | null) => {
      setLastAutoOpenKeyOnRecord(profileControllerStateRef.current, key);
    },
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileAutoOpenRuntimeState>(
    () => ({
      getLastAutoOpenKey,
      setLastAutoOpenKey,
    }),
    [getLastAutoOpenKey, setLastAutoOpenKey]
  );
};
