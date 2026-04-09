import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  capturePreviousForegroundUiRestoreStateIfAbsentOnRecord,
  getPreviousForegroundUiRestoreStateFromRecord,
} from './profile-close-state-record';
import type { ProfileForegroundUiRestoreState } from './profile-transition-state-contract';

export type ProfileCloseForegroundRuntimeState = {
  getPreviousForegroundUiRestoreState: () => ProfileForegroundUiRestoreState | null;
  capturePreviousForegroundUiRestoreStateIfAbsent: (
    restoreState: ProfileForegroundUiRestoreState | null
  ) => void;
};

type UseProfileCloseForegroundRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileCloseForegroundRuntimeState = ({
  profileControllerStateRef,
}: UseProfileCloseForegroundRuntimeStateArgs): ProfileCloseForegroundRuntimeState => {
  const getPreviousForegroundUiRestoreState = React.useCallback(
    () => getPreviousForegroundUiRestoreStateFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const capturePreviousForegroundUiRestoreStateIfAbsent = React.useCallback(
    (restoreState: ProfileForegroundUiRestoreState | null) => {
      capturePreviousForegroundUiRestoreStateIfAbsentOnRecord(
        profileControllerStateRef.current,
        restoreState
      );
    },
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileCloseForegroundRuntimeState>(
    () => ({
      getPreviousForegroundUiRestoreState,
      capturePreviousForegroundUiRestoreStateIfAbsent,
    }),
    [capturePreviousForegroundUiRestoreStateIfAbsent, getPreviousForegroundUiRestoreState]
  );
};
