import type { MapBounds } from '../../../types';
import { shouldRefetchPollsFeedForSettledBounds } from './polls-feed-refetch-edge';

const bounds = (neLat: number, neLng: number, swLat: number, swLng: number): MapBounds => ({
  northEast: { lat: neLat, lng: neLng },
  southWest: { lat: swLat, lng: swLng },
});

const AUSTIN = bounds(30.4, -97.6, 30.1, -97.9);

/**
 * Leg 3 of the header subject-store design: the polls feed refetches on every
 * SETTLE whose bounds differ from the last-REQUESTED bounds by EXACT value
 * inequality — the settle hysteresis (240ms quiescence) is the rate limiter,
 * and no significance gate exists to eat small pans (the attributed stale-feed
 * bug was exactly the old 0.1mi/8% gate + shouldShowPollsSheet gating).
 */
describe('shouldRefetchPollsFeedForSettledBounds', () => {
  it('never fetches before the first settle (no settled bounds yet)', () => {
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: null,
        lastRequestedBounds: null,
      })
    ).toBe(false);
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: null,
        lastRequestedBounds: AUSTIN,
      })
    ).toBe(false);
  });

  it('fetches the first settled viewport (nothing requested yet)', () => {
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: AUSTIN,
        lastRequestedBounds: null,
      })
    ).toBe(true);
  });

  it('does NOT refetch a settle at byte-identical bounds (different object, same values)', () => {
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: bounds(30.4, -97.6, 30.1, -97.9),
        lastRequestedBounds: AUSTIN,
      })
    ).toBe(false);
  });

  it('refetches on ANY exact bounds change — a small pan is a real edge (no significance gate)', () => {
    // A pan far below the dead 0.1mi/8% gate: one corner nudged in the 4th decimal.
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: bounds(30.4001, -97.6, 30.1001, -97.9),
        lastRequestedBounds: AUSTIN,
      })
    ).toBe(true);
  });

  it('refetches when every corner moved (the sheet-closed Austin→San Antonio repro)', () => {
    expect(
      shouldRefetchPollsFeedForSettledBounds({
        settledBounds: bounds(29.6, -98.3, 29.3, -98.7),
        lastRequestedBounds: AUSTIN,
      })
    ).toBe(true);
  });

  it('detects a change on each corner coordinate independently', () => {
    const cases: MapBounds[] = [
      bounds(30.5, -97.6, 30.1, -97.9),
      bounds(30.4, -97.5, 30.1, -97.9),
      bounds(30.4, -97.6, 30.2, -97.9),
      bounds(30.4, -97.6, 30.1, -97.8),
    ];
    for (const settledBounds of cases) {
      expect(
        shouldRefetchPollsFeedForSettledBounds({
          settledBounds,
          lastRequestedBounds: AUSTIN,
        })
      ).toBe(true);
    }
  });
});
