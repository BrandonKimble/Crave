import React from 'react';
import { useProfileOwnerExecutionModelsRuntime } from './profile-owner-execution-models-runtime';
import type { ProfileOwner, UseProfileOwnerArgs } from './profile-owner-runtime-contract';
import { useProfileOwnerActionExternalPortsRuntime } from './profile-owner-action-external-ports-runtime';
import { useProfileOwnerActionStatePortsRuntime } from './profile-owner-action-state-ports-runtime';
import { useProfileOwnerActionSurfaceRuntime } from './profile-owner-action-surface-runtime';
import { useProfileOwnerAutoOpenKickoffRuntime } from './profile-owner-auto-open-kickoff-runtime';
import { useProfileOwnerAutoOpenPortsRuntime } from './profile-owner-auto-open-ports-runtime';
import { useProfileOwnerNativeViewRuntime } from './profile-owner-native-view-runtime';
import { useProfileOwnerPresentationViewRuntime } from './profile-owner-presentation-view-runtime';
import { useProfileOwnerQueryActionContextRuntime } from './profile-owner-query-action-context-runtime';
import { useProfileOwnerRefreshSelectionPortsRuntime } from './profile-owner-refresh-selection-ports-runtime';
import { useProfileOwnerRuntimeStateOwner } from './profile-owner-runtime-state-owner';
import { useProfileOwnerRuntimeStateRuntime } from './profile-owner-runtime-state-runtime';
import { useProfileOwnerSelectionActionContextRuntime } from './profile-owner-selection-action-context-runtime';

export type {
  CloseRestaurantProfileOptions,
  ProfileAutoOpenActionModel,
  ProfileCloseActionModel,
  ProfileFocusActionModel,
  ProfileOpenActionModel,
  ProfileOpenActionModelInputs,
  ProfileOpenOptions,
  ProfilePreviewActionModel,
  ProfilePreviewActionModelInputs,
  ProfilePreviewOpenOptions,
  ProfileRefreshSelectionActionModel,
  ProfileRestaurantCameraActionModel,
  ProfileRestaurantCameraActionModelInputs,
  SearchProfileSource,
} from './profile-action-model-contract';
export type {
  CreateProfileActionRuntimeArgs,
  ProfileActionExecutionPorts,
  ProfileActionRuntime,
  ProfileAutoOpenActionExecutionPorts,
  ProfileForegroundUiRestoreState,
  ProfileRefreshSelectionExecutionPorts,
} from './profile-action-runtime-port-contract';
export type {
  ProfileAnalyticsModel,
  ProfileOwner,
  ProfileRuntimeActions,
  ProfileSearchContext,
  ProfileSelectionModel,
  UseProfileOwnerArgs,
} from './profile-owner-runtime-contract';

export const useProfileOwner = ({
  searchContext,
  cameraTransitionPorts,
  selectionModel,
  analyticsModel,
  nativeExecutionArgs,
  appExecutionArgs,
}: UseProfileOwnerArgs): ProfileOwner => {
  const { searchRuntimeBus } = searchContext;
  const runtimeStateOwner = useProfileOwnerRuntimeStateOwner({
    searchRuntimeBus,
    emitRuntimeMechanismEvent: nativeExecutionArgs.emitRuntimeMechanismEvent,
  });
  const {
    nativeExecutionModel,
    appExecutionRuntime: profileAppExecutionRuntime,
    preparedPresentationRuntime,
  } = useProfileOwnerExecutionModelsRuntime({
    searchRuntimeBus,
    runtimeStateOwner,
    nativeExecutionArgs,
    appExecutionArgs,
  });

  const {
    transitionExecutionModel: { getLastVisibleSheetSnap, getLastCameraState },
  } = nativeExecutionModel;
  const { currentMapZoom, presentationModelRuntime } = useProfileOwnerPresentationViewRuntime({
    cameraTransitionPorts,
    runtimeStateOwner,
    getLastVisibleSheetSnap,
    getLastCameraState,
  });
  const { restaurantSheetSnapController } = useProfileOwnerNativeViewRuntime({
    nativeExecutionModel,
  });
  const profileViewState = presentationModelRuntime.profileViewState;

  const queryState = useProfileOwnerQueryActionContextRuntime({
    searchContext,
  });
  const selectionState = useProfileOwnerSelectionActionContextRuntime({
    selectionModel,
  });
  const runtimeState = useProfileOwnerRuntimeStateRuntime({
    searchContext,
    currentMapZoom,
    presentationModelRuntime,
    nativeExecutionModel,
    runtimeStateOwner,
  });
  const { hydrateRestaurantProfileById } = runtimeStateOwner.hydrationRuntime;
  const { resetRestaurantProfileFocusSession } = runtimeStateOwner.focusRuntime;

  const actionStatePorts = useProfileOwnerActionStatePortsRuntime({
    nativeExecutionModel,
    runtimeStateOwner,
    hydrateRestaurantProfileById,
  });
  const actionExternalPorts = useProfileOwnerActionExternalPortsRuntime({
    analyticsModel,
    appExecutionRuntime: profileAppExecutionRuntime,
    preparedPresentationRuntime,
  });
  const actionExecutionPorts = React.useMemo(
    () => ({
      ...actionStatePorts,
      ...actionExternalPorts,
    }),
    [actionExternalPorts, actionStatePorts]
  );

  const refreshSelectionExecutionPorts = useProfileOwnerRefreshSelectionPortsRuntime({
    hydrationRuntime: runtimeStateOwner.hydrationRuntime,
    hydrateRestaurantProfileById,
  });

  const autoOpenActionExecutionPorts = useProfileOwnerAutoOpenPortsRuntime({
    searchContext,
    autoOpenRuntime: runtimeStateOwner.autoOpenRuntime,
  });

  const profileActions = useProfileOwnerActionSurfaceRuntime({
    queryState,
    selectionState,
    runtimeState,
    actionExecutionPorts,
    refreshSelectionExecutionPorts,
    hydrateRestaurantProfileById,
    resetRestaurantProfileFocusSession,
    appExecutionRuntime: profileAppExecutionRuntime,
  });

  useProfileOwnerAutoOpenKickoffRuntime({
    queryState,
    runtimeState,
    autoOpenActionExecutionPorts,
    profileActions,
  });

  return React.useMemo(
    () => ({
      profileViewState,
      restaurantSheetSnapController,
      profileActions,
    }),
    [profileActions, profileViewState, restaurantSheetSnapController]
  );
};
