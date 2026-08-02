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
 */
export const nextRetryDelayMs = (attempt: number): number | null =>
  attempt < NETWORK_RETRY_MAX_ATTEMPTS ? NETWORK_RETRY_BACKOFF_MS[attempt] : null;
