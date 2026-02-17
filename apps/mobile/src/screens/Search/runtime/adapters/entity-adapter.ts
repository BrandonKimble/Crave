import type { SearchResponse } from '../../../../types';
import {
  createSearchSessionRuntimeEvent,
  type SearchSessionEventPayload,
  type SearchSessionEventType,
  type SearchSessionRuntimeEvent,
} from '../controller/search-session-events';
import { createSearchResponseEnvelope } from './search-response-envelope';

export const getEntityShadowOperationId = (requestId: number): string => `entity:${requestId}`;

export const createEntitySubmitIntentPayload = (input: {
  restaurantId: string;
  restaurantName: string;
  preserveSheetState: boolean;
}): SearchSessionEventPayload => ({
  mode: 'entity',
  restaurantId: input.restaurantId,
  restaurantName: input.restaurantName,
  preserveSheetState: input.preserveSheetState,
});

export const createEntityResponseReceivedPayload = (
  response: SearchResponse
): SearchSessionEventPayload => ({
  mode: 'entity',
  ...createSearchResponseEnvelope(response, 1),
});

export const createEntityShadowEvent = (input: {
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
    operationId: getEntityShadowOperationId(input.requestId),
    requestId: `entity:${input.requestId}`,
    seq: input.seq,
    atMs: input.atMs,
    payload: input.payload,
  });
