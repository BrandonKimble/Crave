import {
  executePreparedProfileCompletionEvent,
  type PreparedProfileCompletionExecutionPorts,
} from './profile-prepared-presentation-completion-executor';
import type { PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';
import type {
  CreateProfilePreparedPresentationRuntimeArgs,
  ExecutePreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-runtime-contract';

export const createPreparedProfileCompletionEventHandler = ({
  completionExecution,
  executePreparedProfileTransaction,
}: {
  completionExecution: CreateProfilePreparedPresentationRuntimeArgs['completionExecution'];
  executePreparedProfileTransaction: ExecutePreparedProfilePresentationTransaction;
}) => {
  const completionExecutionPorts: PreparedProfileCompletionExecutionPorts = {
    getRequestSeq: completionExecution.getRequestSeq,
    setRequestSeq: completionExecution.setRequestSeq,
    cancelHydrationIntentOnOverlayDismiss:
      completionExecution.cancelHydrationIntentOnOverlayDismiss,
    executePreparedProfileTransaction,
  };

  return (event: PreparedProfilePresentationCompletionEvent) => {
    executePreparedProfileCompletionEvent({
      transition: completionExecution.getProfileTransitionState(),
      event,
      ports: completionExecutionPorts,
    });
  };
};
