/**
 * F5806 discriminator. The defect this file exists to keep dead: the momentum-rebound impulse
 * used to be `-arrivalDeltaPt * 60` with the gate in pt/FRAME, so a ProMotion (120Hz) device —
 * half the delta per event, twice the events — got HALF the impulse for the same physical
 * arrival speed, and real arrivals fell under the gate entirely.
 *
 * PROVING MUTATION: replace the measured interval with the old constant (multiply the delta by
 * a hard-coded 60 instead of dividing by `intervalMs`) and the refresh-rate-parity cases below
 * go RED — the 120Hz reading comes back exactly half the 60Hz one.
 */
import {
  MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC,
  MOMENTUM_FALLBACK_INTERVAL_MS,
  deriveMomentumArrivalSpeedsPtPerSec,
} from './bottomSheetMomentumReboundMath';

/** One physical arrival speed, sampled by two displays. 600 pt/s is a brisk flick. */
const PHYSICAL_SPEED_PT_PER_SEC = 600;
const INTERVAL_60HZ_MS = 1000 / 60;
const INTERVAL_120HZ_MS = 1000 / 120;

const sampleAtCadence = (speedPtPerSec: number, intervalMs: number) =>
  deriveMomentumArrivalSpeedsPtPerSec({
    deltaPt: (speedPtPerSec * intervalMs) / 1000,
    intervalMs,
    previousSpeedPtPerSec: 0,
  }).arrivalSpeedPtPerSec;

describe('momentum rebound arrival speed', () => {
  it('reads the SAME speed at 120Hz as at 60Hz for one physical velocity', () => {
    const at60 = sampleAtCadence(PHYSICAL_SPEED_PT_PER_SEC, INTERVAL_60HZ_MS);
    const at120 = sampleAtCadence(PHYSICAL_SPEED_PT_PER_SEC, INTERVAL_120HZ_MS);

    expect(at60).toBeCloseTo(PHYSICAL_SPEED_PT_PER_SEC, 6);
    expect(at120).toBeCloseTo(PHYSICAL_SPEED_PT_PER_SEC, 6);
    expect(at120).toBeCloseTo(at60, 6);
  });

  it('gates on a physical speed, so a 120Hz sample of a passing arrival still passes', () => {
    // Exactly at the old 60Hz gate: 4pt per 60Hz frame == 240 pt/s.
    const passing = MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC;
    expect(sampleAtCadence(passing, INTERVAL_60HZ_MS)).toBeGreaterThanOrEqual(
      MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC
    );
    // The 120Hz sample of the SAME arrival is only 2pt — under the old pt/frame gate of 4.
    expect(sampleAtCadence(passing, INTERVAL_120HZ_MS)).toBeGreaterThanOrEqual(
      MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC
    );
  });

  it('rejects a genuinely slow arrival at either cadence', () => {
    const slow = MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC / 2;
    expect(sampleAtCadence(slow, INTERVAL_60HZ_MS)).toBeLessThan(
      MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC
    );
    expect(sampleAtCadence(slow, INTERVAL_120HZ_MS)).toBeLessThan(
      MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC
    );
  });

  it('carries the previous sample forward as the arrival speed when it was faster', () => {
    const { arrivalSpeedPtPerSec, stepSpeedPtPerSec } = deriveMomentumArrivalSpeedsPtPerSec({
      deltaPt: 1,
      intervalMs: INTERVAL_120HZ_MS,
      previousSpeedPtPerSec: 900,
    });
    expect(arrivalSpeedPtPerSec).toBe(900);
    // ...but the step speed it carries forward is THIS event's own, not the max.
    expect(stepSpeedPtPerSec).toBeCloseTo(120, 6);
  });

  it('falls back to a 60Hz frame for the first sample, which has no measured interval', () => {
    expect(
      deriveMomentumArrivalSpeedsPtPerSec({
        deltaPt: 4,
        intervalMs: 0,
        previousSpeedPtPerSec: 0,
      }).arrivalSpeedPtPerSec
    ).toBeCloseTo((4 / MOMENTUM_FALLBACK_INTERVAL_MS) * 1000, 6);
  });

  it('is sign-blind: a delta is a distance, the direction is the caller-s', () => {
    expect(
      deriveMomentumArrivalSpeedsPtPerSec({
        deltaPt: -12,
        intervalMs: INTERVAL_60HZ_MS,
        previousSpeedPtPerSec: 0,
      }).arrivalSpeedPtPerSec
    ).toBeCloseTo(
      deriveMomentumArrivalSpeedsPtPerSec({
        deltaPt: 12,
        intervalMs: INTERVAL_60HZ_MS,
        previousSpeedPtPerSec: 0,
      }).arrivalSpeedPtPerSec,
      6
    );
  });
});
