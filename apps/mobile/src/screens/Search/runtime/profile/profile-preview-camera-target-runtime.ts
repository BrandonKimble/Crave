import type { Coordinate } from '../../../../types';
import type { CameraSnapshot } from './profile-transition-state-contract';
import type { ProfilePreviewActionModel } from './profile-action-model-contract';

export type ProfilePreviewCameraTargetResolution = {
  targetCamera: CameraSnapshot | null;
  updatedLastCameraState: { center: [number, number]; zoom: number } | null | undefined;
};

export const resolveProfilePreviewCameraTarget = ({
  pressedCoordinate,
  previewModel: { currentZoom, currentLastCameraState, profilePadding },
}: {
  pressedCoordinate: Coordinate | null;
  previewModel: ProfilePreviewActionModel;
}): ProfilePreviewCameraTargetResolution => {
  if (!pressedCoordinate) {
    return {
      targetCamera: null,
      updatedLastCameraState: undefined,
    };
  }
  const nextCenter: [number, number] = [pressedCoordinate.lng, pressedCoordinate.lat];
  if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
    return {
      targetCamera: {
        center: nextCenter,
        zoom: currentZoom,
        padding: profilePadding,
      },
      updatedLastCameraState: undefined,
    };
  }
  if (currentLastCameraState) {
    return {
      targetCamera: null,
      updatedLastCameraState: {
        ...currentLastCameraState,
        center: nextCenter,
      },
    };
  }
  return {
    targetCamera: null,
    updatedLastCameraState: undefined,
  };
};
