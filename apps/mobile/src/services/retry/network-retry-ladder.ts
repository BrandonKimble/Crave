/**
 * THE RETRY LAW, stated once (disease C — abstraction re-derivation
 * 2026-08-01).
 *
 * Three consumers had invented three policies for the same question ("a
 * network read for the current viewport failed — now what?"), and they
 * disagreed in ways that were defects rather than differences: the home and
 * polls feeds capped at three rungs with visibility gating and a reconnect
 * edge; the catalog-slice fetch retried FOREVER at a flat 5s with neither.
 * Offline, that last one was a network call every five seconds for as long
 * as the app stayed open.
 *
 * The rungs are the same K3 operational shape everywhere: back off fast
 * enough that a blip recovers invisibly, give up soon enough that a real
 * outage stops costing radio. What legitimately DIFFERS per consumer is
 * only the gate (is this surface still being looked at?) — so that is the
 * parameter, and nothing else is.
 */
export const NETWORK_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000] as const;

/** How many rungs the ladder has before it gives up. */
export const NETWORK_RETRY_MAX_ATTEMPTS = NETWORK_RETRY_BACKOFF_MS.length;

/**
 * The delay for the NEXT attempt, or null when the ladder is exhausted.
 * `attempt` is the number of failures so far (0 = the first failure).
 *
 * This is the plain-rung primitive; consumers call resolveRetryDelayMs below,
 * which is the SAME ladder made aware of what actually failed.
 */
export const nextRetryDelayMs = (attempt: number): number | null =>
  attempt < NETWORK_RETRY_MAX_ATTEMPTS ? NETWORK_RETRY_BACKOFF_MS[attempt] : null;

/**
 * THE 429 CLAUSE OF THE RETRY LAW (F-429-storm, 2026-08-07 — re-homed from a
 * polls-local module the day it was written, before a second consumer could
 * invent a second policy).
 *
 * A 429 is not a network blip: the server said SLOW DOWN, and the 2s rung
 * answers by speeding the storm back up. Measured: one zooming session's
 * fetches tripped the API limiter, the ladder retried the 429s on its fast
 * rung, and the limiter stayed tripped until an app restart. So a rate-limited
 * failure waits at least the ladder's LONGEST rung regardless of attempt
 * number, and when the server names its own wait (Retry-After) that wait wins
 * over our fallback.
 */
export const isRateLimitError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 429;
};

/**
 * Fallback wait when a 429 carries no readable Retry-After — longer than every
 * rung by construction.
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 15_000;

const LONGEST_RUNG_MS = NETWORK_RETRY_BACKOFF_MS[NETWORK_RETRY_BACKOFF_MS.length - 1];

/**
 * The server-declared wait, in ms, or null when none is readable. The API's
 * NestJS throttler names its windows (short/medium/long), and a named
 * throttler suffixes the header — `retry-after-short`, never bare
 * `Retry-After` — with a value in SECONDS (verified against
 * @nestjs/throttler v6's guard). So this scans every response header whose
 * lowercased name starts with 'retry-after' and takes the LARGEST numeric
 * value (the caller must outwait every tripped window). Non-numeric values
 * (HTTP-date form) are ignored — the fallback covers them.
 */
export const rateLimitRetryAfterMs = (error: unknown): number | null => {
  const headers = (error as { response?: { headers?: Record<string, unknown> } } | null)?.response
    ?.headers;
  if (headers == null || typeof headers !== 'object') {
    return null;
  }
  let maxSeconds: number | null = null;
  for (const [name, value] of Object.entries(headers)) {
    if (!name.toLowerCase().startsWith('retry-after')) {
      continue;
    }
    const seconds = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) {
      continue;
    }
    maxSeconds = maxSeconds == null ? seconds : Math.max(maxSeconds, seconds);
  }
  return maxSeconds == null ? null : maxSeconds * 1_000;
};

/**
 * THE consumer entry point: the delay for the NEXT attempt given what failed,
 * or null when the ladder is exhausted. Every ladder consumer calls THIS —
 * calling nextRetryDelayMs directly at a fetch site would re-open the 429
 * fast-rung hole per consumer, which is exactly the disease-C shape this
 * module exists to prevent.
 *
 * Exhaustion is still exhaustion: a 429 does not buy extra attempts, it only
 * slows the ones the ladder already grants.
 */
export const resolveRetryDelayMs = (attempt: number, error?: unknown): number | null => {
  const rungDelayMs = nextRetryDelayMs(attempt);
  if (rungDelayMs == null) {
    return null;
  }
  if (!isRateLimitError(error)) {
    return rungDelayMs;
  }
  const serverWaitMs = rateLimitRetryAfterMs(error);
  // Never faster than the longest rung, even if the server names a short wait.
  return Math.max(serverWaitMs ?? RATE_LIMIT_RETRY_DELAY_MS, LONGEST_RUNG_MS);
};
