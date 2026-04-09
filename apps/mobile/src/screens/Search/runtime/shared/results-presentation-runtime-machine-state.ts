import type {
  PreparedResultsPresentationSnapshot,
  ResultsPresentationCoverState,
} from './prepared-presentation-transaction';
import type {
  ResultsPresentationReadModel,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import {
  IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  isResultsPresentationExecutionStageSettled,
} from './results-presentation-runtime-contract';

export type ResultsPresentationRuntimeState = {
  resultsPresentation: ResultsPresentationReadModel;
  resultsPresentationTransport: ResultsPresentationTransportState;
};

export const resolveIdleResultsPresentationTransportState = (options?: {
  coverState?: ResultsPresentationCoverState;
}): ResultsPresentationTransportState => ({
  ...IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  coverState: options?.coverState ?? 'hidden',
});

export const resolveResultsPresentationReadModel = ({
  coverState,
  executionStage,
  snapshotKind,
}: {
  coverState: ResultsPresentationCoverState;
  executionStage: ResultsPresentationTransportState['executionStage'];
  snapshotKind: PreparedResultsPresentationSnapshot['kind'] | null;
}): ResultsPresentationReadModel => {
  const contentVisibility =
    executionStage === 'exit_requested' || executionStage === 'exit_executing'
      ? 'visible'
      : executionStage === 'enter_pending_mount' || executionStage === 'enter_mounted_hidden'
      ? 'frozen'
      : executionStage === 'enter_executing'
      ? 'visible'
      : executionStage === 'settled' && snapshotKind !== 'results_exit'
      ? 'visible'
      : coverState !== 'hidden'
      ? 'frozen'
      : 'hidden';
  const isSettled = isResultsPresentationExecutionStageSettled(executionStage);

  return {
    surfaceMode:
      coverState === 'hidden'
        ? 'none'
        : coverState === 'initial_loading'
        ? 'initial_loading'
        : 'interaction_loading',
    contentVisibility,
    isAwaitingEnterMount: executionStage === 'enter_mounted_hidden',
    isEntering: executionStage === 'enter_executing',
    isClosing: executionStage === 'exit_requested' || executionStage === 'exit_executing',
    isPending: !isSettled,
    isSettled,
  };
};

export const resolveResultsPresentationRuntimeState = (
  resultsPresentationTransport: ResultsPresentationTransportState
): ResultsPresentationRuntimeState => ({
  resultsPresentation: resolveResultsPresentationReadModel({
    coverState: resultsPresentationTransport.coverState,
    executionStage: resultsPresentationTransport.executionStage,
    snapshotKind: resultsPresentationTransport.snapshotKind,
  }),
  resultsPresentationTransport,
});
