import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import {
  executePreparedProfileCommandPayload,
  type PreparedProfileCommandExecutionRuntime,
} from './profile-prepared-presentation-command-executor';
import type {
  PreparedProfilePresentationTransaction,
  ProfilePresentationPhaseExecutionPayload,
} from './profile-prepared-presentation-transaction-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

export type PreparedProfileStateExecutionRuntime = {
  setProfileTransitionStatus: ProfileRuntimeStateOwner['transitionRuntimeState']['setProfileTransitionStatus'];
  appExecutionRuntime: ProfileAppExecutionRuntime;
};

export const applyPreparedProfileStateExecution = ({
  stateExecution,
  stateExecutionRuntime,
}: {
  stateExecution: ProfilePresentationPhaseExecutionPayload['stateExecution'];
  stateExecutionRuntime: PreparedProfileStateExecutionRuntime;
}): void => {
  if (!stateExecution) {
    return;
  }
  const { transitionStatus, routeIntent, closeFinalization } = stateExecution;
  const {
    appExecutionRuntime: {
      shellExecutionModel: {
        routeExecutionModel: { applyProfileRouteIntent },
        closeExecutionModel: { finalizePreparedProfileClose },
      },
    },
    setProfileTransitionStatus,
  } = stateExecutionRuntime;
  if (transitionStatus) {
    setProfileTransitionStatus(transitionStatus);
  }
  if (routeIntent) {
    applyProfileRouteIntent(routeIntent);
  }
  if (closeFinalization) {
    finalizePreparedProfileClose(closeFinalization);
  }
};

export const executePreparedProfilePhasePayload = ({
  payload,
  commandExecutionRuntime,
  stateExecutionRuntime,
}: {
  payload: ProfilePresentationPhaseExecutionPayload;
  commandExecutionRuntime: PreparedProfileCommandExecutionRuntime;
  stateExecutionRuntime: PreparedProfileStateExecutionRuntime;
}): void => {
  executePreparedProfileCommandPayload({
    payload,
    commandExecutionRuntime,
  });
  applyPreparedProfileStateExecution({
    stateExecution: payload.stateExecution,
    stateExecutionRuntime,
  });
};

export const executePreparedProfilePresentationTransaction = ({
  transaction,
  runBatch,
  commandExecutionRuntime,
  stateExecutionRuntime,
}: {
  transaction: PreparedProfilePresentationTransaction;
  runBatch: (fn: () => void) => void;
  commandExecutionRuntime: PreparedProfileCommandExecutionRuntime;
  stateExecutionRuntime: PreparedProfileStateExecutionRuntime;
}): void => {
  runBatch(() => {
    for (const payload of transaction.phasePayloads) {
      executePreparedProfilePhasePayload({
        payload,
        commandExecutionRuntime,
        stateExecutionRuntime,
      });
    }
  });
};
