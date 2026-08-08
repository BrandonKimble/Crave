import { getViewportSubjectState, subscribeViewportSubjectState } from './viewport-subject-store';

/**
 * THE COALESCED SETTLE EDGE (F-429-storm, 2026-08-07 — re-homed from a
 * polls-controller-local wiring the day it was written, before the home feed
 * could re-invent it).
 *
 * The store's settledBounds is honest for what it names: one turnover per
 * 240ms-quiescent camera rest, written by exactly one writer (the subject
 * controller's settle tick). The header's enter-eager commit WANTS that fast
 * beat. But a bounds-scoped FEED does not: a pinch-zoom is many ≥240ms
 * micro-pauses, and an uncoalesced feed edge fired 817 fetches in one measured
 * session (1,058 settle ticks) — amplified by the retry ladder to 3,387
 * requests, tripping the API's 429 limiter. The limiter was right; the trigger
 * was wrong.
 *
 * The law: during continuous settles, deliver at most one tick per interval,
 * with a TRAILING tick so the final camera position is never missed. The
 * consumer reads the store's LATEST settledBounds at delivery time, so a
 * deferred tick always describes where the camera actually is. Per-SUBSCRIBER
 * clock (each feed pays for its own fetches); one shared constant.
 */
export const FEED_REFETCH_MIN_INTERVAL_MS = 2_500;

export type FeedRefetchDecision =
  | { action: 'deliver-now' }
  | { action: 'schedule-trailing'; delayMs: number }
  | { action: 'already-scheduled' };

/** Pure decision — the subscription below owns the clock and the timer. */
export const decideCoalescedDelivery = (args: {
  nowMs: number;
  lastDeliveredAtMs: number | null;
  trailingScheduled: boolean;
}): FeedRefetchDecision => {
  const { nowMs, lastDeliveredAtMs, trailingScheduled } = args;
  if (lastDeliveredAtMs == null || nowMs - lastDeliveredAtMs >= FEED_REFETCH_MIN_INTERVAL_MS) {
    return { action: 'deliver-now' };
  }
  if (trailingScheduled) {
    // The pending trailing tick reads the LATEST bounds when it fires —
    // superseding it would only reset the clock, never change the data.
    return { action: 'already-scheduled' };
  }
  return {
    action: 'schedule-trailing',
    delayMs: FEED_REFETCH_MIN_INTERVAL_MS - (nowMs - lastDeliveredAtMs),
  };
};

/**
 * Subscribe to the settle edge, coalesced. `onSettleTick` fires at most once
 * per FEED_REFETCH_MIN_INTERVAL_MS during continuous settles, and a trailing
 * tick covers the final rest position; the consumer re-reads settledBounds
 * (and re-applies its own should-refetch diff) inside the tick. Unsubscribing
 * clears any armed trailing tick — a deferred tick must never fire against a
 * hidden or unmounted surface, so consumers tear this down with visibility
 * exactly as they would a raw subscription.
 */
export const subscribeSettledBoundsCoalesced = (onSettleTick: () => void): (() => void) => {
  let lastDeliveredAtMs: number | null = null;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeenSettledBounds = getViewportSubjectState().settledBounds;

  const deliver = () => {
    lastDeliveredAtMs = Date.now();
    onSettleTick();
  };

  const handleSettleEdge = () => {
    const decision = decideCoalescedDelivery({
      nowMs: Date.now(),
      lastDeliveredAtMs,
      trailingScheduled: trailingTimer != null,
    });
    if (decision.action === 'already-scheduled') {
      return;
    }
    if (decision.action === 'schedule-trailing') {
      trailingTimer = setTimeout(() => {
        trailingTimer = null;
        deliver();
      }, decision.delayMs);
      return;
    }
    deliver();
  };

  const unsubscribe = subscribeViewportSubjectState(() => {
    const settledBounds = getViewportSubjectState().settledBounds;
    if (settledBounds === lastSeenSettledBounds) {
      // A verdict/slice/watermark commit, not a settle tick — not this edge.
      return;
    }
    lastSeenSettledBounds = settledBounds;
    handleSettleEdge();
  });

  return () => {
    unsubscribe();
    if (trailingTimer != null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
  };
};
