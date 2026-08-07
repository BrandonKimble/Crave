import { HttpException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { SpendBudgetClosedError } from '../external-integrations/governance/governance.service';

/**
 * THREE TIMEOUTS USED TO ARCHIVE A REAL RESTAURANT — FOREVER.
 *
 * `enrichmentFailureCount` is a real counter now, and the janitor archives a
 * placeholder PERMANENTLY at three (restaurant-janitor.service.ts §1); an
 * archived entity is excluded from every future enrichment pass. But the two
 * writers incremented it on EVERY failed outcome — a 429 from Google, a socket
 * timeout, a Places budget refusal, and a real "there is no such restaurant"
 * all counted the same. So three transient vendor hiccups on three weekly
 * passes buried a grounded, real restaurant with no way back.
 *
 * A count that decides a permanent verdict may only count evidence ABOUT THE
 * RESTAURANT. That is the whole distinction:
 *
 *   DEFINITIVE — Google (or our own data) gave a real answer, and the same
 *     attempt tomorrow returns the same answer. No candidates; nothing
 *     acceptable among them; the place is permanently closed; the request
 *     itself is malformed; we have no location context to search with. This
 *     is evidence, and it counts.
 *
 *   TRANSIENT — nobody answered. Rate limit, quota, budget gate, upstream 5xx,
 *     socket error, our own datastore. The attempt says nothing at all about
 *     the restaurant, so it must not push it toward the grave. The count is
 *     left untouched and the entity stays retry-eligible — retry is free
 *     precisely because no vendor call succeeded.
 *
 * THE DEFAULT IS TRANSIENT. An error shape nobody has classified yet is, by
 * construction, not evidence about a restaurant. The failure mode of guessing
 * transient is a placeholder retried longer than needed; the failure mode of
 * guessing definitive is the permanent deletion of a real business. Unclassified
 * shapes carry the `unclassified` code so their population is queryable rather
 * than invisible.
 */
export type EnrichmentFailureClass = 'transient' | 'definitive';

export interface EnrichmentFailureVerdict {
  failureClass: EnrichmentFailureClass;
  /** Stable, low-cardinality code — the queryable half of the breadcrumb. */
  failureReasonCode: string;
}

/**
 * The DEFINITIVE no-match reasons, keyed by the exact string the enrichment
 * service passes to `recordNoMatchCandidates` / `recordEnrichmentFailure`.
 * Every one of them is Google or our own row answering the question.
 */
const DEFINITIVE_REASON_CODES: ReadonlyMap<string, string> = new Map([
  ['no prediction matched preferred place types', 'no_acceptable_candidate'],
  ['place details missing', 'place_details_missing'],
  ['place permanently closed', 'place_permanently_closed'],
  ['moved place details missing', 'moved_place_details_missing'],
  [
    'insufficient location context for enrichment query',
    'insufficient_location_context',
  ],
]);

/**
 * A no-match outcome: the pipeline reached a verdict, so it is definitive by
 * construction. The map exists to give the breadcrumb a stable CODE — the
 * reason strings are prose and one of them (`rejectionReason`) is composed
 * elsewhere, so an unrecognized one still classifies definitive, just under a
 * generic code.
 */
export function classifyNoMatchReason(
  reason: string,
): EnrichmentFailureVerdict {
  return {
    failureClass: 'definitive',
    failureReasonCode: DEFINITIVE_REASON_CODES.get(reason) ?? 'no_match_other',
  };
}

/** Node/axios transport failures arrive as an error with a `code`, no response. */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'EPROTO',
  'ERR_NETWORK',
  'ERR_BAD_RESPONSE',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
]);

function readHttpStatus(error: unknown): number | null {
  if (error instanceof HttpException) {
    return error.getStatus();
  }
  const response = (error as { response?: { status?: unknown } } | null)
    ?.response;
  if (response && typeof response.status === 'number') {
    return response.status;
  }
  return null;
}

function readErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Classify a thrown enrichment error. The shapes that actually arrive here —
 * every one traced to its throw site, not guessed:
 *
 *   `SpendBudgetClosedError` .......... governance.service.ts assertSpendOpen,
 *                                       ahead of every Places call. The budget
 *                                       reopens; work is meant to stay queued.
 *   HttpException 429 ................. google-places.service buildTooManyRequestsError,
 *                                       thrown BOTH pre-flight (rate-limit
 *                                       coordinator denial) and on Google's own
 *                                       429/error.code 429.
 *   HttpException 503 ................. ServiceUnavailableException — API key not
 *                                       configured. Config, not restaurant.
 *   HttpException 500 ................. InternalServerErrorException — 'Failed to
 *                                       fetch Google Place', 'Google Places
 *                                       response invalid'; this is where a bare
 *                                       axios/network failure lands after the
 *                                       vendor client's catch re-wraps it.
 *   HttpException 400 ................. BadRequestException carrying Google's own
 *                                       message. A malformed request fails
 *                                       identically forever → DEFINITIVE.
 *   HttpException 404 ................. NotFoundException 'Place not found'.
 *                                       Google answered → DEFINITIVE.
 *   PrismaClientKnownRequestError ..... our datastore, inside the same try.
 *   raw axios/undici error ............ `code` in TRANSIENT_NETWORK_CODES, or a
 *                                       `response.status` when it escapes
 *                                       unwrapped (the LLM selection flow and
 *                                       the alias/score writers share this try).
 *   anything else ..................... unclassified → TRANSIENT (see the
 *                                       module comment; a permanent archive is
 *                                       not a guess we get to make).
 */
export function classifyEnrichmentError(
  error: unknown,
): EnrichmentFailureVerdict {
  if (error instanceof SpendBudgetClosedError) {
    return {
      failureClass: 'transient',
      failureReasonCode: `places_budget_${error.reason}`,
    };
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return { failureClass: 'transient', failureReasonCode: 'datastore_error' };
  }

  const status = readHttpStatus(error);
  if (status !== null) {
    if (status === 429) {
      return { failureClass: 'transient', failureReasonCode: 'rate_limited' };
    }
    if (status === 404) {
      return {
        failureClass: 'definitive',
        failureReasonCode: 'place_not_found',
      };
    }
    if (status === 400) {
      return {
        failureClass: 'definitive',
        failureReasonCode: 'bad_request',
      };
    }
    if (status >= 500) {
      return {
        failureClass: 'transient',
        failureReasonCode:
          status === 503 ? 'service_unavailable' : 'upstream_server_error',
      };
    }
    // 401/403 — a revoked or unbilled key. Systemic, and emphatically not
    // evidence that this restaurant does not exist.
    if (status === 401 || status === 403) {
      return {
        failureClass: 'transient',
        failureReasonCode: 'vendor_auth_error',
      };
    }
  }

  const code = readErrorCode(error);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) {
    return { failureClass: 'transient', failureReasonCode: 'network_error' };
  }

  return { failureClass: 'transient', failureReasonCode: 'unclassified' };
}
