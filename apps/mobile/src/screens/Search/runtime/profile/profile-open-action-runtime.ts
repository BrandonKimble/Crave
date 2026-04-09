import type {
  CreateProfileActionRuntimeArgs,
  ProfileActionRuntime,
} from './profile-action-runtime-port-contract';
import type { ProfileRestaurantActionModelRuntime } from './profile-restaurant-action-model-runtime';
import { executeProfileOpenAction } from './profile-open-action-execution';

export type ProfileOpenActionRuntime = Pick<
  ProfileActionRuntime,
  'openRestaurantProfile' | 'openRestaurantProfileFromResults'
>;

export const createProfileOpenActionRuntime = (
  { actionExecutionPorts }: CreateProfileActionRuntimeArgs,
  { createOpenActionModel }: Pick<ProfileRestaurantActionModelRuntime, 'createOpenActionModel'>
): ProfileOpenActionRuntime => {
  const openRestaurantProfile: ProfileActionRuntime['openRestaurantProfile'] = (
    restaurant,
    options
  ) => {
    const pressedCoordinate = options?.pressedCoordinate ?? null;
    const source = options?.source ?? 'results_sheet';
    const forceMiddleSnap = options?.forceMiddleSnap === true;
    executeProfileOpenAction({
      restaurant,
      source,
      pressedCoordinate,
      forceMiddleSnap,
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
