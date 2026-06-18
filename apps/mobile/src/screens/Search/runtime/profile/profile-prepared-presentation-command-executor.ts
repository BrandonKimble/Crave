import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import type {
  PreparedProfilePresentationCompletionEvent,
  ProfilePresentationPhaseExecutionPayload,
} from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';

export type PreparedProfileCommandExecutionRuntime = {
  nativeCommandExecutionModel: Pick<
    ProfileNativeExecutionModel['commandExecutionModel'],
    'commitProfileCameraTargetCommand'
  >;
  appExecutionRuntime: ProfileAppExecutionRuntime;
  setProfileCameraPadding: (padding: CameraSnapshot['padding']) => void;
  setMapHighlightedRestaurantId: (restaurantId: string | null) => void;
  handleCommandCompletionEvent: (event: PreparedProfilePresentationCompletionEvent) => void;
};

export const executePreparedProfileCommandPayload = ({
  payload,
  commandExecutionRuntime,
}: {
  payload: ProfilePresentationPhaseExecutionPayload;
  commandExecutionRuntime: PreparedProfileCommandExecutionRuntime;
}): void => {
  const {
    nativeCommandExecutionModel: { commitProfileCameraTargetCommand },
    setProfileCameraPadding,
    setMapHighlightedRestaurantId,
    handleCommandCompletionEvent,
  } = commandExecutionRuntime;
  const commandSet = payload.commandSet;
  const executionContext = payload.executionContext;
  if (!commandSet) {
    return;
  }
  if (commandSet.targetCamera) {
    const didAcceptProfileCameraTargetCommand = commitProfileCameraTargetCommand(
      commandSet.targetCamera,
      executionContext
    );
    if (!didAcceptProfileCameraTargetCommand) {
      handleCommandCompletionEvent({
        type: 'camera_settled',
        requestToken: executionContext.requestToken,
      });
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
  if (commandSet.highlightedRestaurantId !== undefined) {
    void executionContext;
    setMapHighlightedRestaurantId(commandSet.highlightedRestaurantId);
  }
  if (commandSet.clearHighlightedRestaurantId) {
    void executionContext;
    setMapHighlightedRestaurantId(null);
  }
};
