import {
  clamp01,
  gaussianDecay,
  gaussianRamp,
  halfLifeDecay,
  inverseCoverage,
  logGrowth,
  robustScale,
  saturating,
  surgeUnits,
} from './curves';

// Deterministic sample of the positive domain for monotonicity/bounds checks.
const samples = Array.from({ length: 200 }, (_unused, index) => index * 0.5);

const isMonotonicIncreasing = (values: number[]): boolean =>
  values.every(
    (value, index) => index === 0 || value >= values[index - 1] - 1e-9,
  );
const isMonotonicDecreasing = (values: number[]): boolean =>
  values.every(
    (value, index) => index === 0 || value <= values[index - 1] + 1e-9,
  );

describe('demand-scoring curves', () => {
  describe('clamp01', () => {
    it('clamps to [0,1]', () => {
      expect(clamp01(-3)).toBe(0);
      expect(clamp01(0.4)).toBe(0.4);
      expect(clamp01(5)).toBe(1);
    });
  });

  describe('saturating', () => {
    it('is 0 at x=0, bounded in [0,1), and monotonically increasing', () => {
      expect(saturating(0, 0.5)).toBe(0);
      const ys = samples.map((x) => saturating(x, 0.5));
      expect(isMonotonicIncreasing(ys)).toBe(true);
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
      expect(saturating(1000, 0.5)).toBeGreaterThan(0.99);
    });
    it('treats negative input as 0', () => {
      expect(saturating(-10, 0.5)).toBe(0);
    });
    it('higher rate saturates faster', () => {
      expect(saturating(2, 1)).toBeGreaterThan(saturating(2, 0.3));
    });
  });

  describe('gaussianDecay', () => {
    it('is 1 at x=0, bounded in (0,1], and monotonically decreasing', () => {
      expect(gaussianDecay(0, 30)).toBe(1);
      const ys = samples.map((x) => gaussianDecay(x, 30));
      expect(isMonotonicDecreasing(ys)).toBe(true);
      for (const y of ys) {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('gaussianRamp', () => {
    it('is the complement of gaussianDecay: 0 at x=0, rising in [0,1)', () => {
      expect(gaussianRamp(0, 30)).toBe(0);
      const ys = samples.map((x) => gaussianRamp(x, 30));
      expect(isMonotonicIncreasing(ys)).toBe(true);
      for (const x of samples) {
        expect(gaussianRamp(x, 30) + gaussianDecay(x, 30)).toBeCloseTo(1, 9);
      }
    });
  });

  describe('halfLifeDecay', () => {
    it('is 1 at x=0 and exactly 0.5 at the half-life', () => {
      expect(halfLifeDecay(0, 14)).toBe(1);
      expect(halfLifeDecay(14, 14)).toBeCloseTo(0.5, 9);
      expect(halfLifeDecay(28, 14)).toBeCloseTo(0.25, 9);
      expect(
        isMonotonicDecreasing(samples.map((x) => halfLifeDecay(x, 14))),
      ).toBe(true);
    });
  });

  describe('surgeUnits', () => {
    it('is 0 until current exceeds baseline * 2^knee (knee=1 => 2x)', () => {
      expect(surgeUnits(10, 10, 1)).toBe(0); // 1x
      expect(surgeUnits(19, 10, 1)).toBe(0); // <2x
      expect(surgeUnits(20, 10, 1)).toBeCloseTo(0, 9); // exactly 2x => knee
      expect(surgeUnits(40, 10, 1)).toBeCloseTo(1, 9); // 4x => 1 unit past knee
      expect(surgeUnits(80, 10, 1)).toBeCloseTo(2, 9); // 8x => 2 units
    });
    it('is 0 for zero/negative baseline or current', () => {
      expect(surgeUnits(50, 0)).toBe(0);
      expect(surgeUnits(0, 10)).toBe(0);
    });
    it('increases with current', () => {
      expect(surgeUnits(100, 10)).toBeGreaterThan(surgeUnits(50, 10));
    });
  });

  describe('logGrowth', () => {
    it('is 0 at 0, monotonic, with diminishing returns', () => {
      expect(logGrowth(0)).toBe(0);
      expect(logGrowth(1)).toBeCloseTo(1, 9);
      expect(isMonotonicIncreasing(samples.map((x) => logGrowth(x)))).toBe(
        true,
      );
      // diminishing returns: each equal-size step adds less than the previous one.
      expect(logGrowth(2) - logGrowth(1)).toBeLessThan(
        logGrowth(1) - logGrowth(0),
      );
    });
  });

  describe('robustScale', () => {
    it('scales MAD by 1.4826 and floors at epsilon', () => {
      expect(robustScale(2)).toBeCloseTo(2.9652, 4);
      expect(robustScale(0)).toBe(Number.EPSILON);
      expect(robustScale(-5)).toBe(Number.EPSILON);
    });
  });

  describe('inverseCoverage', () => {
    it('is highest at zero coverage and floors at 0.25 when fully covered', () => {
      expect(inverseCoverage(0)).toBeCloseTo(1, 9);
      expect(inverseCoverage(1)).toBeCloseTo(0.25, 9);
      const ys = [0, 0.25, 0.5, 0.75, 1].map((c) => inverseCoverage(c));
      expect(isMonotonicDecreasing(ys)).toBe(true);
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(0.25 - 1e-9);
        expect(y).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  });
});
