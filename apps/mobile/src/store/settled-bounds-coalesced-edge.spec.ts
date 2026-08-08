// Falsifiers for THE COALESCED SETTLE EDGE (F-429-storm). The measured defect:
// 817 feed fetches from one zooming session (1,058 settle ticks), amplified to
// 3,387 requests by the retry ladder, tripping the API's 429 limiter — whose
// responses the ladder then retried on its 2s rung, keeping the limiter
// tripped until an app restart. Both bounds-scoped feeds (polls AND home)
// subscribe through THIS seam, so these falsifiers cover both: a mutation
// that re-opens the storm here re-opens it for every subscriber.
import {
  decideCoalescedDelivery,
  FEED_REFETCH_MIN_INTERVAL_MS,
  subscribeSettledBoundsCoalesced,
} from './settled-bounds-coalesced-edge';
import {
  getViewportSubjectState,
  resetViewportSubjectStore,
  setViewportSubjectState,
} from './viewport-subject-store';
import type { MapBounds } from '../types';

const boundsAt = (lat: number): MapBounds => ({
  northEast: { lat: lat + 1, lng: 1 },
  southWest: { lat, lng: 0 },
});

describe('decideCoalescedDelivery', () => {
  it('a first settle (no history) delivers immediately — coalescing never delays a cold feed', () => {
    expect(
      decideCoalescedDelivery({ nowMs: 1000, lastDeliveredAtMs: null, trailingScheduled: false })
    ).toEqual({ action: 'deliver-now' });
  });

  it('a settle after the interval delivers immediately — a slow pan is never punished', () => {
    expect(
      decideCoalescedDelivery({
        nowMs: 10_000 + FEED_REFETCH_MIN_INTERVAL_MS,
        lastDeliveredAtMs: 10_000,
        trailingScheduled: false,
      })
    ).toEqual({ action: 'deliver-now' });
  });

  it('THE STORM CASE: a settle inside the interval schedules ONE trailing tick, never delivers now', () => {
    const decision = decideCoalescedDelivery({
      nowMs: 10_500,
      lastDeliveredAtMs: 10_000,
      trailingScheduled: false,
    });
    expect(decision.action).toBe('schedule-trailing');
    if (decision.action === 'schedule-trailing') {
      // The trailing tick lands exactly at the interval boundary — the final
      // camera position is never missed, just deferred.
      expect(decision.delayMs).toBe(FEED_REFETCH_MIN_INTERVAL_MS - 500);
    }
  });

  it('further settles while a trailing tick is pending are ABSORBED (the 817-fetch mutation)', () => {
    // Mutation target: making this return 'schedule-trailing' or 'deliver-now'
    // re-creates the storm — every settle in a pinch would fetch again.
    expect(
      decideCoalescedDelivery({ nowMs: 11_000, lastDeliveredAtMs: 10_000, trailingScheduled: true })
    ).toEqual({ action: 'already-scheduled' });
  });
});

describe('subscribeSettledBoundsCoalesced (the live seam)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetViewportSubjectStore();
  });
  afterEach(() => {
    jest.useRealTimers();
    resetViewportSubjectStore();
  });

  it('a storm of settle turnovers inside one interval delivers exactly TWICE: leading + trailing', () => {
    const ticks: number[] = [];
    const unsubscribe = subscribeSettledBoundsCoalesced(() => ticks.push(Date.now()));
    // 20 rapid settles (a pinch-zoom's micro-pauses), 100ms apart.
    for (let i = 0; i < 20; i += 1) {
      setViewportSubjectState({ settledBounds: boundsAt(i) });
      jest.advanceTimersByTime(100);
    }
    // Leading delivery on the first settle; every later settle absorbed into
    // ONE armed trailing tick that fires at the interval boundary.
    jest.advanceTimersByTime(FEED_REFETCH_MIN_INTERVAL_MS);
    expect(ticks).toHaveLength(2);
    unsubscribe();
  });

  it('the trailing tick never misses the final camera position — the consumer reads LATEST bounds at fire time', () => {
    let seenAtTick: MapBounds | null = null;
    const unsubscribe = subscribeSettledBoundsCoalesced(() => {
      seenAtTick = getViewportSubjectState().settledBounds;
    });
    const final = boundsAt(99);
    setViewportSubjectState({ settledBounds: boundsAt(1) }); // leading
    jest.advanceTimersByTime(200);
    setViewportSubjectState({ settledBounds: boundsAt(2) }); // arms trailing
    jest.advanceTimersByTime(200);
    setViewportSubjectState({ settledBounds: final }); // absorbed — but MUST still be seen
    jest.advanceTimersByTime(FEED_REFETCH_MIN_INTERVAL_MS);
    expect(seenAtTick).toBe(final);
    unsubscribe();
  });

  it('non-settle store commits (verdict / watermark) never tick the edge', () => {
    const ticks: unknown[] = [];
    const unsubscribe = subscribeSettledBoundsCoalesced(() => ticks.push(1));
    setViewportSubjectState({ catalogWatermarkSeen: 'rev-1' });
    setViewportSubjectState({ verdict: { kind: 'this-area' } });
    jest.advanceTimersByTime(FEED_REFETCH_MIN_INTERVAL_MS * 2);
    expect(ticks).toHaveLength(0);
    unsubscribe();
  });

  it('unsubscribe disarms a pending trailing tick — no delivery against a hidden surface', () => {
    const ticks: unknown[] = [];
    const unsubscribe = subscribeSettledBoundsCoalesced(() => ticks.push(1));
    setViewportSubjectState({ settledBounds: boundsAt(1) }); // leading
    jest.advanceTimersByTime(100);
    setViewportSubjectState({ settledBounds: boundsAt(2) }); // arms trailing
    unsubscribe();
    jest.advanceTimersByTime(FEED_REFETCH_MIN_INTERVAL_MS * 2);
    expect(ticks).toHaveLength(1);
  });
});
