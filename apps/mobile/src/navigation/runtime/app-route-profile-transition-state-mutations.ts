import type {
  ProfileDismissCompletionState,
  ProfileOpenSettleState,
  ProfilePresentationCompletionState,
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
} from './app-route-profile-transition-state-contract';

export const createIdleProfileOpenSettleState = (): ProfileOpenSettleState => ({
  transactionId: null,
  requestToken: null,
  cameraRequestToken: null,
  sheetRequestToken: null,
  cameraSettled: true,
  sheetSettled: true,
});

export const createInitialProfileDismissCompletionState = (): ProfileDismissCompletionState => ({
  requestToken: null,
  handled: false,
});

export const createInitialProfilePresentationCompletionState =
  (): ProfilePresentationCompletionState => ({
    preparedTransaction: null,
    dismiss: createInitialProfileDismissCompletionState(),
    openSettle: createIdleProfileOpenSettleState(),
  });

export const createInitialProfileTransitionState = (): ProfileTransitionState => ({
  status: 'idle',
  preparedSnapshot: null,
  completionState: createInitialProfilePresentationCompletionState(),
  savedCamera: null,
  savedResultsScrollOffset: null,
});

export const resetPreparedProfileDismissHandling = (transition: ProfileTransitionState): void => {
  transition.completionState.dismiss.handled = false;
};

export const resetProfileTransitionState = (transition: ProfileTransitionState): void => {
  Object.assign(transition, createInitialProfileTransitionState());
};

export const applyProfileTransitionSnapshotCapture = ({
  transition,
  snapshotCapture,
}: {
  transition: ProfileTransitionState;
  snapshotCapture: ProfileTransitionSnapshotCapture;
}): void => {
  if (!transition.savedCamera && snapshotCapture.savedCamera) {
    transition.savedCamera = snapshotCapture.savedCamera;
  }
  if (transition.savedResultsScrollOffset === null) {
    transition.savedResultsScrollOffset = snapshotCapture.savedResultsScrollOffset;
  }
};
