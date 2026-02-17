import type { SearchResponse } from '../../../../types';
import type { SegmentValue } from '../../constants/search';
import {
  createSearchSessionRuntimeEvent,
  type SearchSessionEventPayload,
  type SearchSessionEventType,
  type SearchSessionRuntimeEvent,
} from '../controller/search-session-events';
import { createSearchResponseEnvelope } from './search-response-envelope';

export const getShortcutShadowOperationId = (requestId: number): string => `shortcut:${requestId}`;
const SHORTCUT_SHADOW_OPERATION_ID_PREFIX = 'shortcut:';
export const isShortcutShadowOperationId = (operationId: string): boolean =>
  operationId.startsWith(SHORTCUT_SHADOW_OPERATION_ID_PREFIX);

export const createShortcutSubmitIntentPayload = (input: {
  targetTab: SegmentValue;
  submittedLabel: string;
  preserveSheetState: boolean;
}): SearchSessionEventPayload => ({
  mode: 'shortcut',
  targetTab: input.targetTab,
  submittedLabel: input.submittedLabel,
  preserveSheetState: input.preserveSheetState,
});

export const createShortcutResponseReceivedPayload = (
  response: SearchResponse
): SearchSessionEventPayload => ({
  mode: 'shortcut',
  ...createSearchResponseEnvelope(response, 1),
});

export const createShortcutShadowEvent = (input: {
  sessionId: string;
  requestId: number;
  seq: number;
  atMs: number;
  type: SearchSessionEventType;
  payload?: SearchSessionEventPayload;
}): SearchSessionRuntimeEvent =>
  createSearchSessionRuntimeEvent({
    type: input.type,
    sessionId: input.sessionId,
    operationId: getShortcutShadowOperationId(input.requestId),
    requestId: `shortcut:${input.requestId}`,
    seq: input.seq,
    atMs: input.atMs,
    payload: input.payload,
  });
