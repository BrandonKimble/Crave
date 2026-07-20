/**
 * §8 calibration kernel specs: A per observed day, per-lane derived
 * constants (measured, never invented — §16), and the g clamp
 * ("refuse amplification of unmeasurable rooms," never a boost).
 */
import {
  buildCalibrationIndex,
  calibrationG,
  calibrationInfluence,
  deriveLaneConstants,
  gFor,
  laneActivity,
  neutralCalibrationIndex,
  observedDays,
} from './score-calibration';

const NOW = new Date('2026-07-19T00:00:00Z');
const daysAgo = (days: number): Date =>
  new Date(NOW.getTime() - days * 86_400_000);

describe('observedDays (§8/§10 coverage-normalized denominator)', () => {
  it('caps at the lane window τ for a long-covered source', () => {
    expect(
      observedDays({ from: daysAgo(1000), through: NOW }, 365, NOW),
    ).toBeCloseTo(365, 6);
  });

  it('a young room observes only its own existence days (cadence variability cannot masquerade as room size)', () => {
    expect(
      observedDays({ from: daysAgo(10), through: NOW }, 365, NOW),
    ).toBeCloseTo(10, 6);
  });

  it('push-complete watermark semantics: coverage stops at coveredThrough, not now', () => {
    // A poll_surface room whose closed-poll watermark stalled 300 days into a
    // 365d window: observed days = watermarked existence days inside τ.
    expect(
      observedDays({ from: daysAgo(365), through: daysAgo(65) }, 365, NOW),
    ).toBeCloseTo(300, 6);
  });

  it('never returns below 1 (a brand-new room cannot divide by zero)', () => {
    expect(observedDays({ from: NOW, through: NOW }, 365, NOW)).toBe(1);
    expect(observedDays({ from: null, through: null }, 365, NOW)).toBe(1);
  });

  it('a future-dated through is clamped to now', () => {
    expect(
      observedDays({ from: daysAgo(50), through: daysAgo(-10) }, 365, NOW),
    ).toBeCloseTo(50, 6);
  });
});

describe('laneActivity (A = decayed gate-passing doc mass ÷ observed days)', () => {
  it('normalizes mass per observed day', () => {
    expect(laneActivity(730, 365)).toBeCloseTo(2, 6);
  });

  it('two cadences, one room size: same daily mass over different coverage → same A', () => {
    // The two-cadence coverage-normalization condition (§8): a source
    // observed 30 days with 60 mass reads the SAME room as one observed
    // 300 days with 600 mass.
    expect(laneActivity(60, 30)).toBeCloseTo(laneActivity(600, 300), 10);
  });

  it('zero / non-finite mass reads as zero activity', () => {
    expect(laneActivity(0, 100)).toBe(0);
    expect(laneActivity(Number.NaN, 100)).toBe(0);
  });
});

describe('deriveLaneConstants (§16: measured pins, birth-certificate derivation)', () => {
  it('aRef = median of measured A, aFloor = p10, with the derivation recorded', () => {
    const activities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { constants, derivation } = deriveLaneConstants(activities);
    expect(constants.aRef).toBeCloseTo(5.5, 6);
    expect(constants.aFloor).toBeCloseTo(1.9, 6); // p10 with linear interpolation
    expect(derivation.sampleSize).toBe(10);
    expect(String(derivation.statistic)).toContain('median');
  });

  it('ignores zero/unmeasured rooms in the derivation', () => {
    const { constants } = deriveLaneConstants([0, 0, 4, 0]);
    expect(constants.aRef).toBeCloseTo(4, 6);
    expect(constants.aFloor).toBeCloseTo(4, 6);
  });

  it('empty corpus → neutral pins (g = 1 everywhere until rooms exist)', () => {
    const { constants, derivation } = deriveLaneConstants([]);
    expect(constants).toEqual({ aRef: 1, aFloor: 1 });
    expect(derivation.statistic).toBe('empty-corpus-neutral');
  });

  it('floor never exceeds ref', () => {
    const { constants } = deriveLaneConstants([7]);
    expect(constants.aFloor).toBeLessThanOrEqual(constants.aRef);
  });
});

describe('gFor (the g primitive: max(A, floor) / ref)', () => {
  const constants = { aRef: 10, aFloor: 2 };

  it('an ordinary room (A = ref) is neutral: g = 1', () => {
    expect(gFor(10, constants)).toBeCloseTo(1, 10);
  });

  it('a big room dampens its mentions: g > 1', () => {
    expect(gFor(40, constants)).toBeCloseTo(4, 10);
  });

  it('a quiet room amplifies, but the floor caps the amplification', () => {
    expect(gFor(4, constants)).toBeCloseTo(0.4, 10);
    // Below the floor the clamp holds: refuse amplification beyond floor/ref.
    expect(gFor(0.001, constants)).toBeCloseTo(0.2, 10);
    expect(gFor(0, constants)).toBeCloseTo(0.2, 10);
  });

  it('an unattributable room (null A) is neutral — never amplified', () => {
    expect(gFor(null, constants)).toBe(1);
  });
});

describe('calibration index', () => {
  const sources = [
    {
      sourceId: 'src-big',
      platform: 'reddit',
      anchorPlaceId: null,
      engineId: 'eng-1',
      activity: { stable: 40, fast: 40 },
    },
    {
      sourceId: 'src-poll',
      platform: 'poll_surface',
      anchorPlaceId: 'place-1',
      engineId: null,
      activity: { stable: 10, fast: 10 },
    },
  ];

  it('resolves g per source and defaults unknown/null sources to 1', () => {
    const index = buildCalibrationIndex(
      'stable',
      { aRef: 10, aFloor: 2 },
      sources,
    );
    expect(calibrationG(index, 'src-big')).toBeCloseTo(4, 10);
    expect(calibrationG(index, 'src-poll')).toBeCloseTo(1, 10);
    expect(calibrationG(index, 'src-unknown')).toBe(1);
    expect(calibrationG(index, null)).toBe(1);
  });

  it('sourceClassInfluence defaults to 1.0 per platform class (§8)', () => {
    const index = buildCalibrationIndex(
      'stable',
      { aRef: 10, aFloor: 2 },
      sources,
    );
    expect(calibrationInfluence(index, 'reddit')).toBe(1);
    expect(calibrationInfluence(index, 'poll_surface')).toBe(1);
    expect(calibrationInfluence(index, null)).toBe(1);
    const weighted = buildCalibrationIndex(
      'stable',
      { aRef: 10, aFloor: 2 },
      sources,
      { poll_surface: 0.5 },
    );
    expect(calibrationInfluence(weighted, 'poll_surface')).toBe(0.5);
    expect(calibrationInfluence(weighted, 'reddit')).toBe(1);
  });

  it('neutral index reproduces raw v3 weights exactly', () => {
    const index = neutralCalibrationIndex('stable');
    expect(calibrationG(index, 'anything')).toBe(1);
    expect(calibrationInfluence(index, 'reddit')).toBe(1);
  });
});
