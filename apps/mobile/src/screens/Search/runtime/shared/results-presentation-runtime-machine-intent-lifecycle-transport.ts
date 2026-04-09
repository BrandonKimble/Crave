import type { PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';
import { resolveCommittedPreparedResultsCoverState } from './prepared-presentation-transaction';
import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import { resolveIdleResultsPresentationTransportState } from './results-presentation-runtime-machine-state';
import type { ResultsPresentationNamedTransportAttempt } from './results-presentation-runtime-machine-transport-primitives';
import {
  resolveClearedResultsPresentationCoverStateTransportAttempt,
  resolveNamedAppliedResultsPresentationCoverStateTransportAttempt,
} from './results-presentation-runtime-machine-cover-state-transport';

const resolveCancelledResultsPresentationTransportState = (
  state: ResultsPresentationTransportState,
  intentId?: string
): ResultsPresentationTransportState | null => {
  if (state.executionStage === 'idle' || state.executionStage === 'settled') {
    return null;
  }

  if (intentId != null && state.transactionId !== intentId) {
    return null;
  }

  return resolveIdleResultsPresentationTransportState({
    coverState: state.coverState,
  });
};

export const resolveCancelledResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  intentId?: string
): ResultsPresentationNamedTransportAttempt => {
  const nextState = resolveCancelledResultsPresentationTransportState(state, intentId);
  const appliedLogFields =
    nextState == null
      ? null
      : {
          intentId: state.transactionId,
        };

  return {
    nextState,
    appliedLog:
      appliedLogFields == null
        ? null
        : {
            label: 'cancelPresentationIntent',
            data: appliedLogFields,
          },
  };
};

export const resolveAbortedResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState
): ResultsPresentationNamedTransportAttempt => {
  if (state.executionStage === 'idle' || state.executionStage === 'settled') {
    return resolveClearedResultsPresentationCoverStateTransportAttempt(state);
  }

  return {
    nextState: resolveCancelledResultsPresentationTransportState(
      state,
      state.transactionId ?? undefined
    ),
    appliedLog: {
      label: 'cancelPresentationIntent',
      data: {
        intentId: state.transactionId,
      },
    },
  };
};

export const resolveCommittedResultsPresentationTransportAttempt = (
  snapshot: PreparedResultsPresentationSnapshot
): ResultsPresentationNamedTransportAttempt => {
  const nextState: ResultsPresentationTransportState = {
    transactionId: snapshot.transactionId,
    snapshotKind: snapshot.kind,
    executionBatch: null,
    executionStage: snapshot.kind === 'results_exit' ? 'exit_requested' : 'enter_pending_mount',
    startToken: null,
    coverState: resolveCommittedPreparedResultsCoverState(snapshot),
  };

  return {
    nextState,
    appliedLog: {
      label: 'commitPreparedResultsSnapshot',
      data: {
        transactionId: snapshot.transactionId,
        kind: snapshot.kind,
        mutationKind: snapshot.kind === 'results_enter' ? snapshot.mutationKind : null,
        committedCoverState: nextState.coverState,
      },
    },
  };
};

export const resolveToggleInteractionLifecycleTransportAttempt = (
  state: ResultsPresentationTransportState,
  event: ToggleInteractionLifecycleEvent
): ResultsPresentationNamedTransportAttempt => {
  if (event.type === 'started') {
    return resolveNamedAppliedResultsPresentationCoverStateTransportAttempt(
      state,
      'interaction_loading',
      'applyInteractionFeedbackCoverState'
    );
  }

  if (event.type === 'settled') {
    return {
      nextState: null,
      appliedLog: null,
    };
  }

  if (event.type === 'cancelled') {
    return resolveClearedResultsPresentationCoverStateTransportAttempt(state);
  }

  if (event.awaitedVisualSync) {
    return {
      nextState: null,
      appliedLog: null,
    };
  }

  return resolveCancelledResultsPresentationTransportAttempt(state, event.intentId);
};
