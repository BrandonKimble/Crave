import type { NaturalSearchRequest, SearchResponse } from '../../../../types';
import {
  createSearchSessionRuntimeEvent,
  type SearchSessionEventPayload,
  type SearchSessionEventType,
  type SearchSessionRuntimeEvent,
} from '../controller/search-session-events';
import { createSearchResponseEnvelope } from './search-response-envelope';

export const getNaturalShadowOperationId = (requestId: number): string => `natural:${requestId}`;

export const createNaturalSubmitIntentPayload = (input: {
  query: string;
  targetPage: number;
  append: boolean;
  submissionSource: NaturalSearchRequest['submissionSource'];
}): SearchSessionEventPayload => ({
  mode: 'natural',
  query: input.query,
  targetPage: input.targetPage,
  append: input.append,
  submissionSource: input.submissionSource,
});

export const createNaturalResponseReceivedPayload = (
  response: SearchResponse,
  targetPage: number
): SearchSessionEventPayload => ({
  mode: 'natural',
  ...createSearchResponseEnvelope(response, targetPage),
});

export const createNaturalShadowEvent = (input: {
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
    operationId: getNaturalShadowOperationId(input.requestId),
    requestId: `natural:${input.requestId}`,
    seq: input.seq,
    atMs: input.atMs,
    payload: input.payload,
  });
