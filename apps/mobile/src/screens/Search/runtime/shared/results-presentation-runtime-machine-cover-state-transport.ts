import type { ResultsPresentationCoverState } from './prepared-presentation-transaction';
import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import { resolveIdleResultsPresentationTransportState } from './results-presentation-runtime-machine-state';
import type { ResultsPresentationNamedTransportAttempt } from './results-presentation-runtime-machine-transport-primitives';

const resolveAppliedResultsPresentationCoverStateTransportState = (
  state: ResultsPresentationTransportState,
  nextCoverState: Exclude<ResultsPresentationCoverState, 'hidden'>
): ResultsPresentationTransportState =>
  state.executionStage === 'idle'
    ? {
        ...state,
        coverState: nextCoverState,
      }
    : resolveIdleResultsPresentationTransportState({
        coverState: nextCoverState,
      });

export const resolveNamedAppliedResultsPresentationCoverStateTransportAttempt = (
  state: ResultsPresentationTransportState,
  nextCoverState: Exclude<ResultsPresentationCoverState, 'hidden'>,
  label: 'applyStagingCoverState' | 'applyInteractionFeedbackCoverState'
): ResultsPresentationNamedTransportAttempt => {
  const nextState = resolveAppliedResultsPresentationCoverStateTransportState(
    state,
    nextCoverState
  );

  return {
    nextState,
    appliedLog: {
      label,
      data: {
        nextCoverState,
        prevCoverState: state.coverState,
        hadActiveIntent: state.executionStage !== 'idle',
      },
    },
  };
};

export const resolveClearedResultsPresentationCoverStateTransportAttempt = (
  state: ResultsPresentationTransportState
): ResultsPresentationNamedTransportAttempt => {
  const nextState =
    state.coverState === 'hidden'
      ? null
      : {
          ...state,
          coverState: 'hidden' as const,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'clearCoverState',
            data: {
              prevCoverState: state.coverState,
            },
          },
  };
};
