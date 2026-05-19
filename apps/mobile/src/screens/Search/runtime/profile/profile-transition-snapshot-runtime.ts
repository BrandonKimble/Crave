import type {
  CameraSnapshot,
  ProfileTransitionSnapshotCapture,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export const resolveProfileTransitionSnapshotCapture = ({
  cameraSnapshot,
  resultsScrollOffset,
}: {
  cameraSnapshot: CameraSnapshot | null;
  resultsScrollOffset: number;
}): ProfileTransitionSnapshotCapture => {
  return {
    savedCamera: cameraSnapshot,
    savedResultsScrollOffset: resultsScrollOffset,
  };
};
