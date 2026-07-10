import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  capturePreparedProfileTransitionSnapshotOnRecord,
  getProfileTransitionStateFromRecord,
  getProfileTransitionStatusFromRecord,
} from './profile-transition-state-record';
import type {
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
  ProfileTransitionStatus,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export type ProfileTransitionRuntimeState = {
  getProfileTransitionStatus: () => ProfileTransitionStatus;
  setProfileTransitionStatus: (transitionStatus: ProfileTransitionStatus) => void;
  getProfileTransitionState: () => ProfileTransitionState;
  capturePreparedProfileTransitionSnapshot: (
    snapshotCapture: ProfileTransitionSnapshotCapture
  ) => void;
};

type UseProfileTransitionRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  setProfileTransitionStatus: (transitionStatus: ProfileTransitionStatus) => void;
};

export const useProfileTransitionRuntimeState = ({
  profileControllerStateRef,
  setProfileTransitionStatus,
}: UseProfileTransitionRuntimeStateArgs): ProfileTransitionRuntimeState => {
  const getProfileTransitionStatus = React.useCallback(
    () => getProfileTransitionStatusFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const getProfileTransitionState = React.useCallback(
    () => getProfileTransitionStateFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const capturePreparedProfileTransitionSnapshot = React.useCallback(
    (snapshotCapture: ProfileTransitionSnapshotCapture) => {
      capturePreparedProfileTransitionSnapshotOnRecord({
        controllerState: profileControllerStateRef.current,
        snapshotCapture,
      });
    },
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileTransitionRuntimeState>(
    () => ({
      getProfileTransitionStatus,
      setProfileTransitionStatus,
      getProfileTransitionState,
      capturePreparedProfileTransitionSnapshot,
    }),
    [
      capturePreparedProfileTransitionSnapshot,
      getProfileTransitionState,
      getProfileTransitionStatus,
      setProfileTransitionStatus,
    ]
  );
};
