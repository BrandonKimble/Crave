import type {
  ProfileDismissCompletionState,
  ProfileOpenSettleState,
  ProfilePresentationCompletionState,
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
} from './profile-transition-state-contract';

export const createIdleProfileOpenSettleState = (): ProfileOpenSettleState => ({
  transactionId: null,
  requestToken: null,
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
  savedSheetSnap: null,
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
  if (!transition.savedSheetSnap) {
    transition.savedSheetSnap = snapshotCapture.savedSheetSnap;
  }
  if (!transition.savedCamera && snapshotCapture.savedCamera) {
    transition.savedCamera = snapshotCapture.savedCamera;
  }
  if (transition.savedResultsScrollOffset === null) {
    transition.savedResultsScrollOffset = snapshotCapture.savedResultsScrollOffset;
  }
};
