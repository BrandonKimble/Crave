import type { Coordinate, RestaurantResult } from '../../../../types';
import type { ProfileFocusActionModel, SearchProfileSource } from './profile-action-model-contract';
import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import { resolveProfileFocusCameraPlan } from './profile-focus-camera-plan-runtime';

export const executeProfileFocusCameraPlan = ({
  plan,
  ports,
}: {
  plan: ReturnType<typeof resolveProfileFocusCameraPlan>;
  ports: ProfileActionExecutionPorts;
}): void => {
  if (plan.nextFocusSession) {
    ports.setNextFocusSession(plan.nextFocusSession);
  }
  ports.setMultiLocationZoomBaseline(plan.nextMultiLocationZoomBaseline);
  if (plan.updatedLastCameraState !== undefined) {
    ports.setLastCameraState(plan.updatedLastCameraState);
  }
  if (plan.targetCamera) {
    ports.focusPreparedProfileCamera(plan.targetCamera);
  }
};

export const executeProfileFocusCameraAction = ({
  restaurant,
  source,
  pressedCoordinate,
  preferPressedCoordinate,
  actionModel,
  ports,
}: {
  restaurant: RestaurantResult;
  source: SearchProfileSource;
  pressedCoordinate?: Coordinate | null;
  preferPressedCoordinate?: boolean;
  actionModel: ProfileFocusActionModel;
  ports: ProfileActionExecutionPorts;
}): void => {
  executeProfileFocusCameraPlan({
    plan: resolveProfileFocusCameraPlan({
      restaurant,
      source,
      pressedCoordinate,
      preferPressedCoordinate,
      actionModel,
    }),
    ports,
  });
};
