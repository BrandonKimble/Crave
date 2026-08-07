// Falsifiers for THE REFETCH COALESCER (F-429-storm). The measured defect:
// 817 feed fetches from one zooming session (1,058 settle edges), amplified to
// 3,387 requests by the retry ladder, tripping the API's 429 limiter — whose
// responses the ladder then retried on its 2s rung, keeping the limiter
// tripped until an app restart.
import {
  decideFeedRefetch,
  FEED_REFETCH_MIN_INTERVAL_MS,
  isRateLimitError,
  RATE_LIMIT_RETRY_DELAY_MS,
} from './feed-refetch-coalescer';

describe('decideFeedRefetch', () => {
  it('a first fetch (no history) fires immediately — coalescing never delays a cold feed', () => {
    expect(
      decideFeedRefetch({ nowMs: 1000, lastFetchStartedAtMs: null, trailingScheduled: false })
    ).toEqual({ action: 'fetch-now' });
  });

  it('a settle after the interval fires immediately — a slow pan is never punished', () => {
    expect(
      decideFeedRefetch({
        nowMs: 10_000 + FEED_REFETCH_MIN_INTERVAL_MS,
        lastFetchStartedAtMs: 10_000,
        trailingScheduled: false,
      })
    ).toEqual({ action: 'fetch-now' });
  });

  it('THE STORM CASE: a settle inside the interval schedules ONE trailing fetch, never fires now', () => {
    const decision = decideFeedRefetch({
      nowMs: 10_500,
      lastFetchStartedAtMs: 10_000,
      trailingScheduled: false,
    });
    expect(decision.action).toBe('schedule-trailing');
    if (decision.action === 'schedule-trailing') {
      // The trailing fetch lands exactly at the interval boundary — the final
      // camera position is never missed, just deferred.
      expect(decision.delayMs).toBe(FEED_REFETCH_MIN_INTERVAL_MS - 500);
    }
  });

  it('further settles while a trailing fetch is pending are ABSORBED (the 817-fetch mutation)', () => {
    // Mutation target: making this return 'schedule-trailing' or 'fetch-now'
    // re-creates the storm — every settle in a pinch would fetch again.
    expect(
      decideFeedRefetch({ nowMs: 11_000, lastFetchStartedAtMs: 10_000, trailingScheduled: true })
    ).toEqual({ action: 'already-scheduled' });
  });
});

describe('isRateLimitError / RATE_LIMIT_RETRY_DELAY_MS', () => {
  it('recognizes an axios 429 and nothing else', () => {
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(isRateLimitError({ response: { status: 500 } })).toBe(false);
    expect(isRateLimitError(new Error('network down'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });

  it('the rate-limit delay is LONGER than every ladder rung — 429 must never retry faster than a blip', () => {
    // Mutation target: shrinking the delay below the ladder re-creates the
    // self-sustaining limiter trip.
    expect(RATE_LIMIT_RETRY_DELAY_MS).toBeGreaterThan(10_000);
  });
});
