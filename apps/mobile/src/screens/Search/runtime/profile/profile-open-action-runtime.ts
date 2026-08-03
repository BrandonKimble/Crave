import type {
  CreateProfilePresentationActionRuntimeArgs,
  ProfileActionRuntime,
} from './profile-action-runtime-port-contract';
import type { ProfileRestaurantActionModelRuntime } from './profile-restaurant-action-model-runtime';
import { executeProfileOpenAction } from './profile-open-action-execution';

export type ProfileOpenActionRuntime = Pick<
  ProfileActionRuntime,
  'openRestaurantProfile' | 'openRestaurantProfileFromResults'
>;

export const createProfileOpenActionRuntime = (
  { actionExecutionPorts }: CreateProfilePresentationActionRuntimeArgs,
  { createOpenActionModel }: Pick<ProfileRestaurantActionModelRuntime, 'createOpenActionModel'>
): ProfileOpenActionRuntime => {
  const openRestaurantProfile: ProfileActionRuntime['openRestaurantProfile'] = (
    restaurant,
    options
  ) => {
    const pressedCoordinate = options?.pressedCoordinate ?? null;
    const source = options?.source ?? 'results_sheet';
    executeProfileOpenAction({
      restaurant,
      source,
      pressedCoordinate,
      actionModel: createOpenActionModel(restaurant),
      ports: actionExecutionPorts,
    });
  };

  const openRestaurantProfileFromResults: ProfileActionRuntime['openRestaurantProfileFromResults'] =
    (restaurant, source) => {
      openRestaurantProfile(restaurant, {
        source: source ?? 'results_sheet',
      });
    };

  return {
    openRestaurantProfile,
    openRestaurantProfileFromResults,
  };
};
