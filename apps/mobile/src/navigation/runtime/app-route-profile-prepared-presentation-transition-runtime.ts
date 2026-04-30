import type { PreparedProfilePresentationSnapshot } from './app-route-profile-prepared-presentation-snapshot-contract';
import type {
  ProfileOpenSettleState,
  ProfileTransitionState,
} from './app-route-profile-transition-state-contract';
import {
  createIdleProfileOpenSettleState,
  createInitialProfileDismissCompletionState,
} from './app-route-profile-transition-state-mutations';
import {
  createPreparedProfilePresentationTransaction,
  resolveProfilePresentationExecutionRequestToken,
  type PreparedProfilePresentationTransaction,
} from './app-route-profile-prepared-presentation-transaction-contract';

export const createPreparedProfileOpenSettleState = ({
  snapshot,
  status,
}: {
  snapshot: PreparedProfilePresentationSnapshot;
  status: 'opening' | 'open';
}): ProfileOpenSettleState => ({
  transactionId: snapshot.transactionId,
  requestToken: resolveProfilePresentationExecutionRequestToken(
    snapshot.transactionId,
    'pre_shell'
  ),
  cameraSettled: !snapshot.targetCamera,
  sheetSettled: status === 'open',
});

export const applyPreparedProfileOpenSnapshot = ({
  transition,
  snapshot,
  status,
}: {
  transition: ProfileTransitionState;
  snapshot: PreparedProfilePresentationSnapshot;
  status: 'opening' | 'open';
}): void => {
  transition.preparedSnapshot = snapshot;
  transition.completionState.preparedTransaction =
    status === 'opening'
      ? createPreparedProfilePresentationTransaction({
          transactionId: snapshot.transactionId,
          shellStateExecution: {
            transitionStatus: 'open',
          },
        })
      : null;
  transition.completionState.dismiss = createInitialProfileDismissCompletionState();
  transition.completionState.openSettle = createPreparedProfileOpenSettleState({
    snapshot,
    status,
  });
};

export const resolvePreparedProfileCloseFinalizationTransaction = (
  snapshot: PreparedProfilePresentationSnapshot
): PreparedProfilePresentationTransaction =>
  createPreparedProfilePresentationTransaction({
    transactionId: snapshot.transactionId,
    shellStateExecution: {
      transitionStatus: 'idle',
    },
    postShellCommands: {
      ...(snapshot.restoreCamera
        ? snapshot.restoreCamera.padding != null
          ? {
              profileCameraPadding: snapshot.restoreCamera.padding,
            }
          : {
              clearProfileCameraPadding: true,
            }
        : {
            clearProfileCameraPadding: true,
          }),
      ...(snapshot.shellTarget !== 'default' && snapshot.restoreResultsSheetSnap != null
        ? {
            resultsSheetCommand: {
              type: 'request' as const,
              snap: snapshot.restoreResultsSheetSnap,
            },
          }
        : {}),
    },
    postShellStateExecution: {
      closeFinalization: {
        shouldClearSearch: snapshot.shouldClearSearchOnClose,
      },
    },
  });

export const applyPreparedProfileCloseSnapshot = ({
  transition,
  snapshot,
}: {
  transition: ProfileTransitionState;
  snapshot: PreparedProfilePresentationSnapshot;
}): void => {
  transition.preparedSnapshot = snapshot;
  transition.completionState.preparedTransaction =
    snapshot.kind === 'profile_close'
      ? resolvePreparedProfileCloseFinalizationTransaction(snapshot)
      : null;
  transition.completionState.dismiss = {
    requestToken:
      snapshot.kind === 'profile_close'
        ? resolveProfilePresentationExecutionRequestToken(snapshot.transactionId, 'shell')
        : null,
    handled: false,
  };
  transition.completionState.openSettle = createIdleProfileOpenSettleState();
};
