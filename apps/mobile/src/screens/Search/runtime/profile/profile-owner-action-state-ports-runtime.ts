import React from 'react';

import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerActionStatePortsRuntimeArgs = {
  nativeExecutionModel: Pick<ProfileNativeExecutionModel, 'transitionExecutionModel'>;
  runtimeStateOwner: Pick<
    ProfileRuntimeStateOwner,
    | 'shellRuntimeState'
    | 'transitionRuntimeState'
    | 'closeRuntimeState'
    | 'hydrationRuntime'
    | 'focusRuntime'
  >;
  hydrateRestaurantProfileById: ProfileRuntimeStateOwner['hydrationRuntime']['hydrateRestaurantProfileById'];
};

export const useProfileOwnerActionStatePortsRuntime = ({
  nativeExecutionModel,
  runtimeStateOwner,
  hydrateRestaurantProfileById,
}: UseProfileOwnerActionStatePortsRuntimeArgs): Pick<
  ProfileActionExecutionPorts,
  | 'setDismissBehavior'
  | 'setShouldClearSearchOnDismiss'
  | 'capturePreviousForegroundUiRestoreStateIfAbsent'
  | 'capturePreparedProfileTransitionSnapshot'
  | 'setNextFocusSession'
  | 'setMultiLocationZoomBaseline'
  | 'setLastCameraState'
  | 'setMapHighlightedRestaurantId'
  | 'seedRestaurantProfile'
  | 'hydrateRestaurantProfileById'
> => {
  const {
    transitionRuntimeState: { capturePreparedProfileTransitionSnapshot },
    shellRuntimeState: { setMapHighlightedRestaurantId },
    closeRuntimeState: {
      policyRuntimeState: {
        setProfileDismissBehavior,
        setProfileShouldClearSearchOnDismiss,
        setProfileMultiLocationZoomBaseline,
      },
      foregroundRuntimeState: { capturePreviousForegroundUiRestoreStateIfAbsent },
    },
    hydrationRuntime: { seedRestaurantProfile },
    focusRuntime: { setRestaurantFocusSession },
  } = runtimeStateOwner;

  return React.useMemo(
    () => ({
      setDismissBehavior: setProfileDismissBehavior,
      setShouldClearSearchOnDismiss: setProfileShouldClearSearchOnDismiss,
      capturePreviousForegroundUiRestoreStateIfAbsent,
      capturePreparedProfileTransitionSnapshot,
      setNextFocusSession: setRestaurantFocusSession,
      setMultiLocationZoomBaseline: setProfileMultiLocationZoomBaseline,
      setLastCameraState: (state) => {
        if (state !== undefined) {
          nativeExecutionModel.transitionExecutionModel.setLastCameraState(state);
        }
      },
      setMapHighlightedRestaurantId,
      seedRestaurantProfile,
      hydrateRestaurantProfileById,
    }),
    [
      capturePreparedProfileTransitionSnapshot,
      capturePreviousForegroundUiRestoreStateIfAbsent,
      hydrateRestaurantProfileById,
      nativeExecutionModel.transitionExecutionModel,
      setMapHighlightedRestaurantId,
      seedRestaurantProfile,
      setProfileDismissBehavior,
      setProfileMultiLocationZoomBaseline,
      setProfileShouldClearSearchOnDismiss,
      setRestaurantFocusSession,
    ]
  );
};
