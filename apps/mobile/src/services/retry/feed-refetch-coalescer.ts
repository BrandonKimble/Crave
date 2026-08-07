/**
 * THE REFETCH COALESCER (F-429-storm, 2026-08-07).
 *
 * A bounds-scoped feed refetches when the camera settles. During continuous
 * interaction (a pinch-zoom is many small settles) that turned every pause
 * into a full feed fetch: one measured session fired 817 fetches and, with
 * the retry ladder stacked on top, 3,387 requests — tripping the API's rate
 * limiter, whose 429s the ladder then retried, keeping the limiter tripped
 * until an app restart. The limiter was right; the trigger was wrong.
 *
 * The law: during continuous settles, fetch at most once per interval, always
 * for the LATEST bounds, with a TRAILING fetch so the final camera position is
 * never missed. Pure decision — the caller owns the clock and the timer.
 */
export const FEED_REFETCH_MIN_INTERVAL_MS = 2_500;

export type FeedRefetchDecision =
  | { action: 'fetch-now' }
  | { action: 'schedule-trailing'; delayMs: number }
  | { action: 'already-scheduled' };

export const decideFeedRefetch = (args: {
  nowMs: number;
  lastFetchStartedAtMs: number | null;
  trailingScheduled: boolean;
}): FeedRefetchDecision => {
  const { nowMs, lastFetchStartedAtMs, trailingScheduled } = args;
  if (
    lastFetchStartedAtMs == null ||
    nowMs - lastFetchStartedAtMs >= FEED_REFETCH_MIN_INTERVAL_MS
  ) {
    return { action: 'fetch-now' };
  }
  if (trailingScheduled) {
    // The pending trailing fetch reads the LATEST bounds when it fires —
    // superseding it would only reset the clock, never change the data.
    return { action: 'already-scheduled' };
  }
  return {
    action: 'schedule-trailing',
    delayMs: FEED_REFETCH_MIN_INTERVAL_MS - (nowMs - lastFetchStartedAtMs),
  };
};

/**
 * A 429 is not a network blip: the server said SLOW DOWN, and the ladder's
 * 2s rung answers by speeding the storm back up. Rate-limit failures wait the
 * ladder's LONGEST rung regardless of attempt number.
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 15_000;

export const isRateLimitError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 429;
};
