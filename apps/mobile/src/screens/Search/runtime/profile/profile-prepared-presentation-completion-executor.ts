import type { ProfileTransitionState } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfilePresentationTransaction,
} from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import { applyPreparedProfilePresentationCompletionEvent } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-completion-update';

export type PreparedProfileCompletionExecutionPorts = {
  getRequestSeq: () => number;
  setRequestSeq: (requestSeq: number) => void;
  cancelHydrationIntentOnOverlayDismiss: (nextRequestSeq: number) => void;
  executePreparedProfileTransaction: (transaction: PreparedProfilePresentationTransaction) => void;
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
