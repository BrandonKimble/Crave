import type {
  CreateProfileActionRuntimeArgs,
  ProfileActionRuntime,
} from './profile-action-runtime-port-contract';
import type { ProfileRestaurantActionModelRuntime } from './profile-restaurant-action-model-runtime';
import { executeProfileFocusCameraAction } from './profile-focus-action-execution';

export type ProfileFocusActionRuntime = Pick<ProfileActionRuntime, 'focusRestaurantProfileCamera'>;

export const createProfileFocusActionRuntime = (
  { actionExecutionPorts }: CreateProfileActionRuntimeArgs,
  { createFocusActionModel }: Pick<ProfileRestaurantActionModelRuntime, 'createFocusActionModel'>
): ProfileFocusActionRuntime => ({
  focusRestaurantProfileCamera: (restaurant, source, options) => {
    executeProfileFocusCameraAction({
      restaurant,
      source,
      pressedCoordinate: options?.pressedCoordinate,
      preferPressedCoordinate: options?.preferPressedCoordinate,
      actionModel: createFocusActionModel(restaurant),
      ports: actionExecutionPorts,
    });
  },
});
