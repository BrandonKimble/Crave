import React from 'react';

import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type { ProfileOwner } from './profile-owner-runtime-contract';

type UseProfileOwnerNativeViewRuntimeArgs = {
  nativeExecutionModel: Pick<ProfileNativeExecutionModel, 'commandExecutionModel'>;
};

export type ProfileOwnerNativeViewRuntime = {
  restaurantSheetSnapController: ProfileOwner['restaurantSheetSnapController'];
};

export const useProfileOwnerNativeViewRuntime = ({
  nativeExecutionModel,
}: UseProfileOwnerNativeViewRuntimeArgs): ProfileOwnerNativeViewRuntime =>
  React.useMemo(
    () => ({
      restaurantSheetSnapController:
        nativeExecutionModel.commandExecutionModel.restaurantSheetRuntimeModel.snapController,
    }),
    [nativeExecutionModel.commandExecutionModel.restaurantSheetRuntimeModel.snapController]
  );
