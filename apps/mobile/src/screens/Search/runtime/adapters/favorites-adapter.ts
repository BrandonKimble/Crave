import type { SearchResponse } from '../../../../types';
import type { FavoriteListType } from '../../../../services/favorite-lists';
import {
  createSearchSessionRuntimeEvent,
  type SearchSessionEventPayload,
  type SearchSessionEventType,
  type SearchSessionRuntimeEvent,
} from '../controller/search-session-events';
import { createSearchResponseEnvelope } from './search-response-envelope';

// A favorites launch is "a natural search whose data SOURCE is the favorites
// endpoint instead of /search". Its shadow events mirror the shortcut adapter
// (an opaque, prefixed operationId the session reducer treats generically); the
// distinct `favorites:` prefix only aids debugging/telemetry attribution.
export const getFavoritesShadowOperationId = (requestId: number): string =>
  `favorites:${requestId}`;
const FAVORITES_SHADOW_OPERATION_ID_PREFIX = 'favorites:';
export const isFavoritesShadowOperationId = (operationId: string): boolean =>
  operationId.startsWith(FAVORITES_SHADOW_OPERATION_ID_PREFIX);

export const createFavoritesSubmitIntentPayload = (input: {
  listId: string;
  listType: FavoriteListType;
  submittedLabel: string;
}): SearchSessionEventPayload => ({
  mode: 'favorites',
  listId: input.listId,
  listType: input.listType,
  submittedLabel: input.submittedLabel,
  targetPage: 1,
  append: false,
});

export const createFavoritesResponseReceivedPayload = (
  response: SearchResponse
): SearchSessionEventPayload => ({
  mode: 'favorites',
  ...createSearchResponseEnvelope(response, 1),
});

export const createFavoritesShadowEvent = (input: {
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
    operationId: getFavoritesShadowOperationId(input.requestId),
    requestId: `favorites:${input.requestId}`,
    seq: input.seq,
    atMs: input.atMs,
    payload: input.payload,
  });
