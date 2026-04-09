import type { ProfileControllerState } from './profile-runtime-state-record';
import type { ProfileTransitionSnapshotCapture } from './profile-transition-state-contract';
import { applyProfileTransitionSnapshotCapture } from './profile-transition-state-mutations';

export const getProfileTransitionStatusFromRecord = (controllerState: ProfileControllerState) =>
  controllerState.runtime.transition.status;

export const setProfileTransitionStatusOnRecord = (
  controllerState: ProfileControllerState,
  transitionStatus: ProfileControllerState['runtime']['transition']['status']
): void => {
  controllerState.runtime.transition.status = transitionStatus;
};

export const getProfileTransitionStateFromRecord = (controllerState: ProfileControllerState) =>
  controllerState.runtime.transition;

export const getPreparedProfileSnapshotFromRecord = (controllerState: ProfileControllerState) =>
  controllerState.runtime.transition.preparedSnapshot;

export const capturePreparedProfileTransitionSnapshotOnRecord = ({
  controllerState,
  snapshotCapture,
}: {
  controllerState: ProfileControllerState;
  snapshotCapture: ProfileTransitionSnapshotCapture;
}): void => {
  applyProfileTransitionSnapshotCapture({
    transition: controllerState.runtime.transition,
    snapshotCapture,
  });
};

export const resetPreparedProfileSavedSheetSnapOnRecord = (
  controllerState: ProfileControllerState
): void => {
  controllerState.runtime.transition.savedSheetSnap = null;
};
