import type {
  CameraSnapshot,
  ProfileTransitionSnapshotCapture,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export const resolveProfileTransitionSnapshotCapture = ({
  cameraSnapshot,
  sheetScrollOffset,
}: {
  cameraSnapshot: CameraSnapshot | null;
  sheetScrollOffset: number;
}): ProfileTransitionSnapshotCapture => {
  return {
    savedCamera: cameraSnapshot,
    savedResultsScrollOffset: sheetScrollOffset,
  };
};
