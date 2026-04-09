import type { ProfileTransitionState } from './profile-transition-state-contract';
import type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfilePresentationSettleEvent,
  PreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-transaction-contract';
import { resolvePreparedProfileOverlayDismissUpdate } from './profile-prepared-presentation-dismiss-runtime';
import { resolvePreparedProfilePresentationSettleUpdate } from './profile-prepared-presentation-settle-runtime';

export type PreparedProfilePresentationCompletionUpdate = {
  nextRequestSeq: number;
  transaction: PreparedProfilePresentationTransaction | null;
};

export type PreparedProfileCompletionExecutionPorts = {
  getRequestSeq: () => number;
  setRequestSeq: (requestSeq: number) => void;
  cancelHydrationIntentOnOverlayDismiss: (nextRequestSeq: number) => void;
  executePreparedProfileTransaction: (transaction: PreparedProfilePresentationTransaction) => void;
};

export const applyPreparedProfileOverlayDismissUpdate = ({
  transition,
  requestSeq,
  eventRequestToken,
}: {
  transition: ProfileTransitionState;
  requestSeq: number;
  eventRequestToken: number | null;
}): PreparedProfilePresentationCompletionUpdate | null => {
  const dismissUpdate = resolvePreparedProfileOverlayDismissUpdate({
    transitionStatus: transition.status,
    preparedCompletionTransaction: transition.completionState.preparedTransaction,
    dismissRequestToken: transition.completionState.dismiss.requestToken,
    dismissHandled: transition.completionState.dismiss.handled,
    requestSeq,
    eventRequestToken,
  });
  if (!dismissUpdate) {
    return null;
  }
  transition.completionState.dismiss.handled = dismissUpdate.nextDismissHandled;
  transition.completionState.dismiss.requestToken = null;
  transition.completionState.preparedTransaction = null;
  return {
    nextRequestSeq: dismissUpdate.nextRequestSeq,
    transaction: dismissUpdate.transaction,
  };
};

export const applyPreparedProfilePresentationSettleEvent = ({
  transition,
  event,
}: {
  transition: ProfileTransitionState;
  event: PreparedProfilePresentationSettleEvent;
}): PreparedProfilePresentationTransaction | null => {
  const settleUpdate = resolvePreparedProfilePresentationSettleUpdate({
    transitionStatus: transition.status,
    snapshot: transition.preparedSnapshot,
    settleState: transition.completionState.openSettle,
    event,
  });
  if (!settleUpdate) {
    return null;
  }
  transition.completionState.openSettle = settleUpdate.nextSettleState;
  if (
    settleUpdate.nextSettleState.cameraSettled &&
    settleUpdate.nextSettleState.sheetSettled &&
    transition.completionState.preparedTransaction
  ) {
    const transaction = transition.completionState.preparedTransaction;
    transition.completionState.preparedTransaction = null;
    return transaction;
  }
  return null;
};

export const applyPreparedProfilePresentationCompletionEvent = ({
  transition,
  requestSeq,
  event,
}: {
  transition: ProfileTransitionState;
  requestSeq: number;
  event: PreparedProfilePresentationCompletionEvent;
}): PreparedProfilePresentationCompletionUpdate | null => {
  if (event.type === 'overlay_dismissed') {
    return applyPreparedProfileOverlayDismissUpdate({
      transition,
      requestSeq,
      eventRequestToken: event.requestToken,
    });
  }

  return {
    nextRequestSeq: requestSeq,
    transaction: applyPreparedProfilePresentationSettleEvent({
      transition,
      event,
    }),
  };
};

export const executePreparedProfileCompletionEvent = ({
  transition,
  event,
  ports,
}: {
  transition: ProfileTransitionState;
  event: PreparedProfilePresentationCompletionEvent;
  ports: PreparedProfileCompletionExecutionPorts;
}): void => {
  const requestSeq = ports.getRequestSeq();
  const completionUpdate = applyPreparedProfilePresentationCompletionEvent({
    transition,
    requestSeq,
    event,
  });
  if (!completionUpdate) {
    return;
  }
  if (completionUpdate.nextRequestSeq !== requestSeq) {
    ports.cancelHydrationIntentOnOverlayDismiss(completionUpdate.nextRequestSeq);
    ports.setRequestSeq(completionUpdate.nextRequestSeq);
  }
  if (completionUpdate.transaction) {
    ports.executePreparedProfileTransaction(completionUpdate.transaction);
  }
};
