import type { SearchSessionEventType } from './search-session-events';

export const SEARCH_SESSION_STATES = [
  'idle',
  'submitting',
  'receiving',
  'phase_a_ready',
  'phase_a_committed',
  'visual_released',
  'phase_b_materializing',
  'settled',
  'cancelled',
  'error',
] as const;

export type SearchSessionState = (typeof SEARCH_SESSION_STATES)[number];

const SEARCH_SESSION_ALLOWED_TRANSITIONS: Record<
  SearchSessionState,
  readonly SearchSessionState[]
> = {
  idle: ['submitting'],
  submitting: ['receiving', 'cancelled', 'error'],
  receiving: ['phase_a_ready', 'cancelled', 'error'],
  phase_a_ready: ['phase_a_committed', 'cancelled', 'error'],
  phase_a_committed: ['visual_released', 'cancelled', 'error'],
  visual_released: ['phase_b_materializing', 'settled', 'cancelled', 'error'],
  phase_b_materializing: ['settled', 'cancelled', 'error'],
  settled: ['submitting', 'idle'],
  cancelled: ['submitting', 'idle'],
  error: ['submitting', 'idle'],
};

const SEARCH_SESSION_EVENT_TARGET_STATE: Record<SearchSessionEventType, SearchSessionState> = {
  submit_intent: 'submitting',
  submitting: 'receiving',
  response_received: 'phase_a_ready',
  phase_a_committed: 'phase_a_committed',
  visual_released: 'visual_released',
  phase_b_materializing: 'phase_b_materializing',
  settled: 'settled',
  cancelled: 'cancelled',
  error: 'error',
};

export const resolveSearchSessionStateForEvent = (
  eventType: SearchSessionEventType
): SearchSessionState => SEARCH_SESSION_EVENT_TARGET_STATE[eventType];

export const isLegalSearchSessionTransition = (
  fromState: SearchSessionState,
  toState: SearchSessionState
): boolean => {
  if (fromState === toState) {
    return true;
  }
  return SEARCH_SESSION_ALLOWED_TRANSITIONS[fromState].includes(toState);
};
