import { demandMassFromActorActs, recencyWeight } from './demand-mass.reader';
import {
  lngIntervalContains,
  lngIntervalsIntersect,
} from '../../signals/lng-intersect';
import {
  DEMAND_HALF_LIFE_DAYS,
  DEMAND_KERNEL_HORIZON_DAYS,
  NEGLIGIBLE_CONTRIBUTION_EPSILON,
  RECENCY_FLAT_DAYS,
} from './poll-supply.constants';

describe('demand-mass kernel (§4: the curve kernel carried throughout)', () => {
  describe('recency curve — 7d flat then 14d half-life (K1)', () => {
    it('is flat 1.0 across the whole current cycle', () => {
      expect(recencyWeight(0)).toBe(1);
      expect(recencyWeight(RECENCY_FLAT_DAYS)).toBe(1);
      expect(recencyWeight(-1)).toBe(1); // clock skew never boosts
    });

    it('halves every 14 days past the flat week', () => {
      expect(
        recencyWeight(RECENCY_FLAT_DAYS + DEMAND_HALF_LIFE_DAYS),
      ).toBeCloseTo(0.5, 9);
      expect(
        recencyWeight(RECENCY_FLAT_DAYS + 2 * DEMAND_HALF_LIFE_DAYS),
      ).toBeCloseTo(0.25, 9);
    });

    it('is continuous at the flat→decay knee (no cliff)', () => {
      expect(recencyWeight(RECENCY_FLAT_DAYS + 1e-9)).toBeCloseTo(1, 6);
    });

    it('extinguishes old signals without any horizon-cutoff constant', () => {
      expect(recencyWeight(365)).toBeLessThan(1e-7);
      expect(recencyWeight(365)).toBeGreaterThan(0);
    });
  });

  describe('per-actor log2 saturation (R6: no single act is loud)', () => {
    it('one actor with one act contributes exactly 1', () => {
      expect(demandMassFromActorActs([1])).toBe(1);
    });

    it('a single loud actor saturates logarithmically', () => {
      // 100 acts from one person ≈ 6.66 — far less than 100.
      expect(demandMassFromActorActs([100])).toBeCloseTo(Math.log2(101), 9);
    });

    it('influence accumulates across DISTINCT people: 10 people × 1 act ≫ 1 person × 10 acts', () => {
      const tenPeople = demandMassFromActorActs(new Array<number>(10).fill(1));
      const onePerson = demandMassFromActorActs([10]);
      expect(tenPeople).toBe(10);
      expect(onePerson).toBeCloseTo(Math.log2(11), 9);
      expect(tenPeople).toBeGreaterThan(2 * onePerson);
    });

    it('zero acts contribute zero mass', () => {
      expect(demandMassFromActorActs([0, 0])).toBe(0);
      expect(demandMassFromActorActs([])).toBe(0);
    });
  });

  describe('derived kernel horizon (3a: bound scans, never behavior)', () => {
    it('is flat + 10 half-lives, where a signal weighs under epsilon', () => {
      expect(DEMAND_KERNEL_HORIZON_DAYS).toBe(
        RECENCY_FLAT_DAYS + 10 * DEMAND_HALF_LIFE_DAYS,
      );
      expect(recencyWeight(DEMAND_KERNEL_HORIZON_DAYS)).toBeLessThanOrEqual(
        NEGLIGIBLE_CONTRIBUTION_EPSILON,
      );
    });
  });

  describe('wrap-aware longitude intersection (red-team 3c)', () => {
    // Austin place: a plain interval well west of the seam.
    const AUSTIN: [number, number] = [-97.9, -97.6];
    // Fiji viewport: 176°E → 178°W — CROSSES the antimeridian (min > max).
    const FIJI_VIEW: [number, number] = [176, -178];
    // Fiji place row (also crossing).
    const FIJI_PLACE: [number, number] = [175, -179];

    it('a Fiji (crossing) signal does NOT attribute to Austin', () => {
      expect(lngIntervalsIntersect(...FIJI_VIEW, ...AUSTIN)).toBe(false);
      // …which is exactly what min/max normalization broke: the normalized
      // near-world band [-178, 176] would have swallowed Austin.
      expect(
        lngIntervalsIntersect(
          Math.min(...FIJI_VIEW),
          Math.max(...FIJI_VIEW),
          ...AUSTIN,
        ),
      ).toBe(true);
    });

    it('a Fiji signal DOES attribute to a Fiji place (both crossing)', () => {
      expect(lngIntervalsIntersect(...FIJI_VIEW, ...FIJI_PLACE)).toBe(true);
    });

    it('one-sided crossings test both arcs', () => {
      // Crossing signal vs plain place near the east arc.
      expect(lngIntervalsIntersect(...FIJI_VIEW, 177, 179)).toBe(true);
      // Crossing signal vs plain place near the west arc.
      expect(lngIntervalsIntersect(...FIJI_VIEW, -180, -179)).toBe(true);
      // Plain signal vs crossing place (symmetric case).
      expect(lngIntervalsIntersect(177, 179, ...FIJI_PLACE)).toBe(true);
      expect(lngIntervalsIntersect(...AUSTIN, ...FIJI_PLACE)).toBe(false);
    });

    it('plain intervals keep plain range semantics', () => {
      expect(lngIntervalsIntersect(-98, -97, -97.5, -96)).toBe(true);
      expect(lngIntervalsIntersect(-98, -97, -96, -95)).toBe(false);
    });
  });

  describe('wrap-aware longitude CONTAINMENT (§2.5(c) bbox-fallback half)', () => {
    it('plain intervals: nesting, not mere overlap', () => {
      expect(lngIntervalContains(-98, -96, -97.5, -97)).toBe(true);
      expect(lngIntervalContains(-98, -96, -97, -95)).toBe(false); // overlap only
    });

    it('a crossing outer contains an inner that fits either arc', () => {
      expect(lngIntervalContains(176, -178, 177, 179)).toBe(true); // east arc
      expect(lngIntervalContains(176, -178, -180, -179)).toBe(true); // west arc
      expect(lngIntervalContains(176, -178, -97.9, -97.6)).toBe(false); // Austin
    });

    it('crossing-in-crossing nests on the crossed representation; a plain outer never contains a crossing inner', () => {
      expect(lngIntervalContains(175, -178, 176, -179)).toBe(true);
      expect(lngIntervalContains(176, -179, 175, -178)).toBe(false);
      expect(lngIntervalContains(-180, 180, 176, -178)).toBe(false); // plain outer
    });
  });
});
