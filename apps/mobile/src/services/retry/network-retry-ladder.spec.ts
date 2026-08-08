// Falsifiers for THE RETRY LAW, including its 429 clause (F-429-storm). The
// measured defect the 429 clause exists for: a zooming session's feed fetches
// tripped the API's rate limiter, the ladder retried the 429s on its 2s rung,
// and the limiter stayed tripped until an app restart. The clause lives in the
// LADDER so every consumer (polls feed, home feed, catalog slice) inherits it.
import {
  isRateLimitError,
  NETWORK_RETRY_BACKOFF_MS,
  NETWORK_RETRY_MAX_ATTEMPTS,
  nextRetryDelayMs,
  RATE_LIMIT_RETRY_DELAY_MS,
  rateLimitRetryAfterMs,
  resolveRetryDelayMs,
} from './network-retry-ladder';

const LONGEST_RUNG_MS = NETWORK_RETRY_BACKOFF_MS[NETWORK_RETRY_BACKOFF_MS.length - 1];

const rateLimit429 = (headers?: Record<string, unknown>) => ({
  response: { status: 429, ...(headers ? { headers } : {}) },
});

describe('nextRetryDelayMs (the plain rungs)', () => {
  it('walks the rungs then exhausts to null — never a zero-delay retry', () => {
    expect(nextRetryDelayMs(0)).toBe(2_000);
    expect(nextRetryDelayMs(1)).toBe(5_000);
    expect(nextRetryDelayMs(2)).toBe(10_000);
    expect(nextRetryDelayMs(NETWORK_RETRY_MAX_ATTEMPTS)).toBeNull();
  });
});

describe('isRateLimitError', () => {
  it('recognizes an axios 429 and nothing else', () => {
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(isRateLimitError({ response: { status: 500 } })).toBe(false);
    expect(isRateLimitError(new Error('network down'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe('rateLimitRetryAfterMs', () => {
  it('reads the NAMED-throttler header form the API actually sends (retry-after-short, seconds)', () => {
    expect(rateLimitRetryAfterMs(rateLimit429({ 'retry-after-short': '30' }))).toBe(30_000);
  });

  it('takes the LARGEST wait when several windows tripped — the caller must outwait all of them', () => {
    expect(
      rateLimitRetryAfterMs(
        rateLimit429({ 'retry-after-short': '5', 'retry-after-long': 45, 'x-other': '999' })
      )
    ).toBe(45_000);
  });

  it('reads a bare Retry-After too, case-insensitively', () => {
    expect(rateLimitRetryAfterMs(rateLimit429({ 'Retry-After': '20' }))).toBe(20_000);
  });

  it('returns null for absent headers or non-numeric (HTTP-date) values — the fallback covers them', () => {
    expect(rateLimitRetryAfterMs(rateLimit429())).toBeNull();
    expect(
      rateLimitRetryAfterMs(rateLimit429({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }))
    ).toBeNull();
    expect(rateLimitRetryAfterMs(new Error('network down'))).toBeNull();
  });
});

describe('resolveRetryDelayMs (THE consumer entry point)', () => {
  it('a plain failure walks the plain rungs', () => {
    expect(resolveRetryDelayMs(0, new Error('network down'))).toBe(2_000);
    expect(resolveRetryDelayMs(1, { response: { status: 500 } })).toBe(5_000);
    expect(resolveRetryDelayMs(0)).toBe(2_000);
  });

  it('THE STORM CASE: a 429 with no Retry-After waits the long fallback at EVERY rung — never the 2s rung', () => {
    // Mutation target: collapsing the 429 arm back to the plain rung re-creates
    // the self-sustaining limiter trip (the 2s rung retrying the limiter's own
    // 429s). This must be RED if resolveRetryDelayMs(0, 429) ever returns 2s.
    expect(resolveRetryDelayMs(0, rateLimit429())).toBe(RATE_LIMIT_RETRY_DELAY_MS);
    expect(resolveRetryDelayMs(1, rateLimit429())).toBe(RATE_LIMIT_RETRY_DELAY_MS);
    expect(resolveRetryDelayMs(2, rateLimit429())).toBe(RATE_LIMIT_RETRY_DELAY_MS);
    expect(RATE_LIMIT_RETRY_DELAY_MS).toBeGreaterThan(LONGEST_RUNG_MS);
  });

  it('honors the server-declared Retry-After when present — RED if the header is dropped', () => {
    // 60s > the 15s fallback: an implementation that ignores the header would
    // return 15_000 and fail here.
    expect(resolveRetryDelayMs(0, rateLimit429({ 'retry-after-long': '60' }))).toBe(60_000);
  });

  it('a short server wait is clamped: a 429 never retries faster than the longest rung', () => {
    expect(resolveRetryDelayMs(0, rateLimit429({ 'retry-after-short': '1' }))).toBe(
      LONGEST_RUNG_MS
    );
  });

  it('a 429 does not buy extra attempts — exhaustion is still exhaustion', () => {
    expect(resolveRetryDelayMs(NETWORK_RETRY_MAX_ATTEMPTS, rateLimit429())).toBeNull();
  });
});
