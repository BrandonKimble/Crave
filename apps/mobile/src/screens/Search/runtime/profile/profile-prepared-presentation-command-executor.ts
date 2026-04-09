import type { BottomSheetProgrammaticRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import type { CameraSnapshot } from './profile-transition-state-contract';
import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import type { ProfilePresentationPhaseExecutionPayload } from './profile-prepared-presentation-transaction-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';

export type PreparedProfileCommandExecutionRuntime = {
  restaurantSheetRuntimeModel: BottomSheetProgrammaticRuntimeModel;
  nativeCommandExecutionModel: ProfileNativeExecutionModel['commandExecutionModel'];
  appExecutionRuntime: ProfileAppExecutionRuntime;
  setProfileCameraPadding: (padding: CameraSnapshot['padding']) => void;
};

export const executePreparedProfileCommandPayload = ({
  payload,
  commandExecutionRuntime,
}: {
  payload: ProfilePresentationPhaseExecutionPayload;
  commandExecutionRuntime: PreparedProfileCommandExecutionRuntime;
}): void => {
  const {
    restaurantSheetRuntimeModel,
    nativeCommandExecutionModel: {
      executeAndStripNativeSheetCommands,
      commitProfileCameraTargetCommand,
    },
    appExecutionRuntime: {
      commandExecutionModel: { requestResultsSheetSnap, hideResultsSheet, forceSharedMiddleSnap },
    },
    setProfileCameraPadding,
  } = commandExecutionRuntime;
  const nativeHandledPayload = executeAndStripNativeSheetCommands({
    commandSet: payload.commandSet,
    executionContext: payload.executionContext,
  });
  const commandSet = nativeHandledPayload.commandSet;
  const executionContext = nativeHandledPayload.executionContext;
  if (!commandSet) {
    return;
  }
  if (commandSet.targetCamera) {
    const didCommit = commitProfileCameraTargetCommand(commandSet.targetCamera, executionContext);
    if (didCommit) {
      setProfileCameraPadding(commandSet.targetCamera.padding ?? null);
    }
  }
  if (commandSet.clearProfileCameraPadding) {
    void executionContext;
    setProfileCameraPadding(null);
  }
  if (commandSet.forceSharedMiddleSnap) {
    void executionContext;
    forceSharedMiddleSnap();
  }

  const restaurantSheetCommand = commandSet.restaurantSheetCommand;
  if (restaurantSheetCommand?.type === 'request') {
    restaurantSheetRuntimeModel.snapController.requestSnap(
      restaurantSheetCommand.snap,
      undefined,
      executionContext.requestToken
    );
  } else if (restaurantSheetCommand?.type === 'clear') {
    restaurantSheetRuntimeModel.snapController.clearCommand();
  }

  const resultsSheetCommand = commandSet.resultsSheetCommand;
  if (resultsSheetCommand?.type === 'request') {
    requestResultsSheetSnap(resultsSheetCommand.snap, executionContext.requestToken);
  } else if (resultsSheetCommand?.type === 'hide') {
    hideResultsSheet(executionContext.requestToken);
  }
};
