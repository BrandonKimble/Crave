import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  capturePreparedProfileTransitionSnapshotOnRecord,
  getPreparedProfileSnapshotFromRecord,
  getProfileTransitionStateFromRecord,
  getProfileTransitionStatusFromRecord,
  resetPreparedProfileSavedSheetSnapOnRecord,
} from './profile-transition-state-record';
import type {
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
  ProfileTransitionStatus,
} from './profile-transition-state-contract';

export type ProfileTransitionRuntimeState = {
  getProfileTransitionStatus: () => ProfileTransitionStatus;
  setProfileTransitionStatus: (transitionStatus: ProfileTransitionStatus) => void;
  getProfileTransitionState: () => ProfileTransitionState;
  getPreparedProfileSnapshot: () => ProfileTransitionState['preparedSnapshot'];
  capturePreparedProfileTransitionSnapshot: (
    snapshotCapture: ProfileTransitionSnapshotCapture
  ) => void;
  resetPreparedProfileSavedSheetSnap: () => void;
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

  const getPreparedProfileSnapshot = React.useCallback(
    () => getPreparedProfileSnapshotFromRecord(profileControllerStateRef.current),
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

  const resetPreparedProfileSavedSheetSnap = React.useCallback(() => {
    resetPreparedProfileSavedSheetSnapOnRecord(profileControllerStateRef.current);
  }, [profileControllerStateRef]);

  return React.useMemo<ProfileTransitionRuntimeState>(
    () => ({
      getProfileTransitionStatus,
      setProfileTransitionStatus,
      getProfileTransitionState,
      getPreparedProfileSnapshot,
      capturePreparedProfileTransitionSnapshot,
      resetPreparedProfileSavedSheetSnap,
    }),
    [
      capturePreparedProfileTransitionSnapshot,
      getPreparedProfileSnapshot,
      getProfileTransitionState,
      getProfileTransitionStatus,
      resetPreparedProfileSavedSheetSnap,
      setProfileTransitionStatus,
    ]
  );
};
