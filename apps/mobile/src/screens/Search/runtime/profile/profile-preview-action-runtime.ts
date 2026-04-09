import type {
  CreateProfileActionRuntimeArgs,
  ProfileActionRuntime,
} from './profile-action-runtime-port-contract';
import { createProfilePreviewActionModel } from './profile-action-models';
import { executeProfilePreviewAction } from './profile-preview-action-execution';

export type ProfilePreviewActionRuntime = Pick<
  ProfileActionRuntime,
  'openRestaurantProfilePreview'
>;

export const createProfilePreviewActionRuntime = ({
  runtimeState: {
    getProfileTransitionStatus,
    getCurrentLastCameraState,
    getCurrentMapZoom,
    resolveProfileCameraPadding,
    getProfileTransitionSnapshotCapture,
  },
  actionExecutionPorts,
}: CreateProfileActionRuntimeArgs): ProfilePreviewActionRuntime => ({
  openRestaurantProfilePreview: (restaurantId, restaurantName, options) => {
    const forceMiddleSnap = options?.forceMiddleSnap === true;
    executeProfilePreviewAction({
      restaurantId,
      restaurantName,
      pressedCoordinate: options?.pressedCoordinate ?? null,
      forceMiddleSnap,
      previewModel: createProfilePreviewActionModel({
        transitionStatus: getProfileTransitionStatus(),
        currentZoom: getCurrentLastCameraState()?.zoom ?? getCurrentMapZoom(),
        currentLastCameraState: getCurrentLastCameraState(),
        profilePadding: resolveProfileCameraPadding(),
      }),
      transitionSnapshotCapture: getProfileTransitionSnapshotCapture(),
      ports: actionExecutionPorts,
    });
  },
});
