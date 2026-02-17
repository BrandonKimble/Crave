export type RuntimeDomain =
  | 'search_session'
  | 'map_presentation'
  | 'overlay_shell'
  | 'list_sheet'
  | 'polls_runtime'
  | 'onboarding_runtime'
  | 'navigation_runtime';

export type RuntimeEvent<TType extends string = string, TPayload = unknown> = {
  domain: RuntimeDomain;
  type: TType;
  sessionId: string;
  operationId: string;
  seq: number;
  requestId?: string;
  atMs: number;
  payload: TPayload;
};

export const SEARCH_SESSION_EVENT_TYPES = [
  'submit_intent',
  'submitting',
  'response_received',
  'phase_a_committed',
  'visual_released',
  'phase_b_materializing',
  'settled',
  'cancelled',
  'error',
] as const;

export type SearchSessionEventType = (typeof SEARCH_SESSION_EVENT_TYPES)[number];

export type SearchSessionEventPayload = Record<string, unknown>;

export type SearchSessionRuntimeEvent = RuntimeEvent<
  SearchSessionEventType,
  SearchSessionEventPayload
>;

export const createSearchSessionRuntimeEvent = (input: {
  type: SearchSessionEventType;
  sessionId: string;
  operationId: string;
  seq: number;
  atMs: number;
  payload?: SearchSessionEventPayload;
  requestId?: string;
}): SearchSessionRuntimeEvent => ({
  domain: 'search_session',
  type: input.type,
  sessionId: input.sessionId,
  operationId: input.operationId,
  seq: input.seq,
  requestId: input.requestId,
  atMs: input.atMs,
  payload: input.payload ?? {},
});
