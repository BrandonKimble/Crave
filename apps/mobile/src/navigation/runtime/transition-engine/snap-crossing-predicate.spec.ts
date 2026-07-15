import {
  hasCrossedSnap,
  resolveSnapCrossingEpsilonPx,
  DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX,
  DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX,
} from './snap-crossing-predicate';

const config = {
  targetY: 800,
  baseEpsilonPx: DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX,
  maxEpsilonPx: DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX,
};

describe('snap-crossing predicate (design §4.2, ledger N-3/N-4/O-2)', () => {
  it('does NOT fire mid-travel far from the target (O-2: never during mid-dismiss travel)', () => {
    expect(hasCrossedSnap(config, 400, 12)).toBe(false);
    expect(hasCrossedSnap(config, 700, 12)).toBe(false);
  });

  it('arms within the base tolerance BEFORE the numeric Y (O-2 tolerance band)', () => {
    expect(hasCrossedSnap(config, 800 - DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX, 0)).toBe(true);
    expect(hasCrossedSnap(config, 800 - DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX - 1, 0)).toBe(false);
  });

  it('fires AT and PAST the target (a skipped frame cannot miss the swap)', () => {
    expect(hasCrossedSnap(config, 800, 5)).toBe(true);
    expect(hasCrossedSnap(config, 801, 5)).toBe(true);
  });

  it('velocity-scales the tolerance so a flick swaps on its crossing frame', () => {
    // 20 px/frame flick: 780 is one frame out — must arm.
    expect(hasCrossedSnap(config, 780, 20)).toBe(true);
    // Same position at slow-spring velocity — must NOT arm early.
    expect(hasCrossedSnap(config, 780, 2)).toBe(false);
  });

  it('caps the velocity scaling (a violent flick may not arm half a screen early)', () => {
    expect(resolveSnapCrossingEpsilonPx(config, 500)).toBe(DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX);
    expect(hasCrossedSnap(config, 800 - DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX - 1, 500)).toBe(false);
  });

  it('DEGENERATE RULE (N-4): already-at-target evaluates true at arm time — zero wait', () => {
    expect(hasCrossedSnap(config, 800, 0)).toBe(true);
  });

  it('is direction-agnostic (approach from below crosses too — O-4 reversal safety)', () => {
    expect(hasCrossedSnap(config, 802, -5)).toBe(true);
  });

  // RED backstop (testing methodology: every assertion must be able to fail): a
  // deliberately-wrong predicate (strict below-target-only) fails the at/past case.
  it('RED backstop: a below-only predicate would miss the past-target frame', () => {
    const belowOnly = (positionY: number): boolean => positionY < config.targetY;
    expect(belowOnly(801)).toBe(false); // the wrong shape misses it
    expect(hasCrossedSnap(config, 801, 5)).toBe(true); // ours does not
  });
});
