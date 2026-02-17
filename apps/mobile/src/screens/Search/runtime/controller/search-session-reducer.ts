import type { SearchSessionRuntimeEvent } from './search-session-events';
import {
  isLegalSearchSessionTransition,
  resolveSearchSessionStateForEvent,
  type SearchSessionState,
} from './search-session-state-machine';

export type SearchSessionTuple = {
  sessionId: string;
  operationId: string;
  seq: number;
  atMs: number;
};

export type SearchSessionTransitionViolation = {
  fromState: SearchSessionState;
  toState: SearchSessionState;
  eventType: SearchSessionRuntimeEvent['type'];
  operationId: string;
  seq: number;
  atMs: number;
};

export type SearchSessionShadowState = {
  mode: 'shadow';
  phase: SearchSessionState;
  tuple: SearchSessionTuple | null;
  lastEventType: SearchSessionRuntimeEvent['type'] | null;
  staleEventDropCount: number;
  transitionViolationCount: number;
  lastTransitionViolation: SearchSessionTransitionViolation | null;
};

export type SearchSessionReduceReason = 'accepted' | 'stale_event' | 'transition_violation';

export type SearchSessionReduceResult = {
  accepted: boolean;
  reason: SearchSessionReduceReason;
  state: SearchSessionShadowState;
};

export const createInitialSearchSessionShadowState = (): SearchSessionShadowState => ({
  mode: 'shadow',
  phase: 'idle',
  tuple: null,
  lastEventType: null,
  staleEventDropCount: 0,
  transitionViolationCount: 0,
  lastTransitionViolation: null,
});

const isSameOperationLane = (
  state: SearchSessionShadowState,
  event: SearchSessionRuntimeEvent
): boolean =>
  state.tuple != null &&
  state.tuple.sessionId === event.sessionId &&
  state.tuple.operationId === event.operationId;

const isSubmitStartEvent = (event: SearchSessionRuntimeEvent) => event.type === 'submit_intent';

export const reduceSearchSessionShadowState = (
  state: SearchSessionShadowState,
  event: SearchSessionRuntimeEvent
): SearchSessionReduceResult => {
  const sameOperationLane = isSameOperationLane(state, event);

  if (sameOperationLane && state.tuple != null) {
    if (event.seq <= state.tuple.seq || event.atMs < state.tuple.atMs) {
      return {
        accepted: false,
        reason: 'stale_event',
        state: {
          ...state,
          staleEventDropCount: state.staleEventDropCount + 1,
        },
      };
    }
  } else if (!isSubmitStartEvent(event)) {
    // Ignore orphan events when a new lane appears without an explicit submit intent.
    return {
      accepted: false,
      reason: 'stale_event',
      state: {
        ...state,
        staleEventDropCount: state.staleEventDropCount + 1,
      },
    };
  }

  const fromState: SearchSessionState = sameOperationLane ? state.phase : 'idle';
  const toState = resolveSearchSessionStateForEvent(event.type);
  if (!isLegalSearchSessionTransition(fromState, toState)) {
    return {
      accepted: false,
      reason: 'transition_violation',
      state: {
        ...state,
        transitionViolationCount: state.transitionViolationCount + 1,
        lastTransitionViolation: {
          fromState,
          toState,
          eventType: event.type,
          operationId: event.operationId,
          seq: event.seq,
          atMs: event.atMs,
        },
      },
    };
  }

  return {
    accepted: true,
    reason: 'accepted',
    state: {
      ...state,
      phase: toState,
      tuple: {
        sessionId: event.sessionId,
        operationId: event.operationId,
        seq: event.seq,
        atMs: event.atMs,
      },
      lastEventType: event.type,
      lastTransitionViolation: null,
    },
  };
};
