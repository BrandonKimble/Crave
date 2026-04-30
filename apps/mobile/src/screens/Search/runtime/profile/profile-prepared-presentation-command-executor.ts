import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import type { ProfilePresentationPhaseExecutionPayload } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';

export type PreparedProfileCommandExecutionRuntime = {
  nativeCommandExecutionModel: Pick<
    ProfileNativeExecutionModel['commandExecutionModel'],
    'executeAndStripNativeSheetCommands' | 'commitProfileCameraTargetCommand'
  >;
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
  if (commandSet.profileCameraPadding !== undefined) {
    void executionContext;
    setProfileCameraPadding(commandSet.profileCameraPadding);
  }
  if (commandSet.clearProfileCameraPadding) {
    void executionContext;
    setProfileCameraPadding(null);
  }
  if (commandSet.forceSharedMiddleSnap) {
    void executionContext;
    forceSharedMiddleSnap();
  }

  const resultsSheetCommand = commandSet.resultsSheetCommand;
  if (resultsSheetCommand?.type === 'request') {
    requestResultsSheetSnap(resultsSheetCommand.snap, executionContext.requestToken);
  } else if (resultsSheetCommand?.type === 'hide') {
    hideResultsSheet(executionContext.requestToken);
  }
};
