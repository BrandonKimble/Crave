import {
  EstimatorRegistry,
  EstimatorRegistrationError,
  type EstimatorConfig,
} from './estimator-registry';

const base = (over: Partial<EstimatorConfig> = {}): EstimatorConfig => ({
  name: 'test.mean',
  statistic: 'mean',
  prior: { value: 15, strength: 10 },
  hierarchy: 'none',
  halfLifeDays: 14,
  consumerGatesObservations: false,
  exploration: 'none',
  versionBindings: [],
  reader: { enabled: true },
  ...over,
});

describe('EstimatorRegistry (master plan §21.1)', () => {
  it('enforces the closed-loop measurement law at registration', () => {
    const registry = new EstimatorRegistry();
    expect(() =>
      registry.register(
        base({ consumerGatesObservations: true, exploration: 'none' }),
      ),
    ).toThrow(EstimatorRegistrationError);
    // With an excitation source it registers fine.
    registry.register(
      base({
        name: 'test.gated',
        consumerGatesObservations: true,
        exploration: 'dither',
      }),
    );
  });

  it('rejects deferred readers without a turn-on trigger', () => {
    const registry = new EstimatorRegistry();
    expect(() =>
      registry.register(
        base({ reader: { enabled: false, turnOnTrigger: '  ' } }),
      ),
    ).toThrow(EstimatorRegistrationError);
  });

  it('a deferred reader returns the prior verbatim while observations record', () => {
    const registry = new EstimatorRegistry();
    registry.register(
      base({
        reader: { enabled: false, turnOnTrigger: 'engine #2 attached' },
      }),
    );
    const now = new Date('2026-07-16T00:00:00Z');
    registry.observe('test.mean', {
      subjectKey: 'austin',
      value: 40,
      observedAt: now,
    });
    const reading = registry.read('test.mean', 'austin', now);
    expect(reading.readerDeferred).toBe(true);
    expect(reading.estimate).toBe(15);
    expect(reading.priorWeight).toBe(1);
    // The observation was NOT lost — deferral defers readers, never
    // observations (§22 deferral law).
    expect(reading.nEffective).toBeGreaterThan(0);
  });

  it('the prior self-erases as observations accumulate', () => {
    const registry = new EstimatorRegistry();
    registry.register(base());
    const now = new Date('2026-07-16T00:00:00Z');
    const cold = registry.read('test.mean', 'waco', now);
    expect(cold.estimate).toBe(15);
    expect(cold.priorWeight).toBe(1);
    for (let i = 0; i < 100; i += 1) {
      registry.observe('test.mean', {
        subjectKey: 'waco',
        value: 30,
        observedAt: now,
      });
    }
    const warm = registry.read('test.mean', 'waco', now);
    expect(warm.priorWeight).toBeLessThan(0.15);
    expect(warm.estimate).toBeGreaterThan(27);
  });

  it('observations decay by the half-life (dormancy contracts toward the prior)', () => {
    const registry = new EstimatorRegistry();
    registry.register(base({ halfLifeDays: 14 }));
    const t0 = new Date('2026-07-16T00:00:00Z');
    for (let i = 0; i < 50; i += 1) {
      registry.observe('test.mean', {
        subjectKey: 'seasonal',
        value: 30,
        observedAt: t0,
      });
    }
    const fresh = registry.read('test.mean', 'seasonal', t0);
    const later = registry.read(
      'test.mean',
      'seasonal',
      new Date(t0.getTime() + 70 * 24 * 60 * 60 * 1000), // 5 half-lives
    );
    expect(later.nEffective).toBeLessThan(fresh.nEffective / 20);
    expect(later.priorWeight).toBeGreaterThan(fresh.priorWeight);
  });

  it('timeWidening exploration inflates uncertainty with silence', () => {
    const registry = new EstimatorRegistry();
    registry.register(
      base({
        name: 'test.widening',
        consumerGatesObservations: true,
        exploration: 'timeWidening',
      }),
    );
    const t0 = new Date('2026-07-16T00:00:00Z');
    for (const value of [10, 20, 15, 25, 12]) {
      registry.observe('test.widening', {
        subjectKey: 's',
        value,
        observedAt: t0,
      });
    }
    const fresh = registry.read('test.widening', 's', t0);
    const stale = registry.read(
      'test.widening',
      's',
      new Date(t0.getTime() + 28 * 24 * 60 * 60 * 1000),
    );
    expect(stale.uncertainty).toBeGreaterThan(fresh.uncertainty);
  });

  /**
   * F358/D31. `register()` REFUSES a self-gating estimator that declares no
   * exploration mechanism — so the mechanism it forces you to declare has to
   * actually work. 'optimisticSelection' promises "a starved candidate can
   * always re-demonstrate", which is only true if a never-observed subject
   * carries the WIDEST interval, i.e. wins an upper-confidence comparison.
   *
   * These cases show RED on the pre-D31 registry, which computed uncertainty
   * from observed variance alone: a zero-observation subject had variance 0,
   * hence uncertainty 0, hence a UCB of exactly its prior — BELOW any measured
   * subject's. The starved candidate was ranked LAST, the precise inverse of
   * the mechanism's stated job.
   */
  describe('starved candidates carry maximal uncertainty (F358/D31)', () => {
    const ucb = (r: { estimate: number; uncertainty: number }) =>
      r.estimate + r.uncertainty;

    const seeded = () => {
      const registry = new EstimatorRegistry();
      registry.register(
        base({
          name: 'test.optimistic',
          prior: { value: 0.2, strength: 10 },
          consumerGatesObservations: true,
          exploration: 'optimisticSelection',
        }),
      );
      return registry;
    };
    const at = new Date('2026-07-16T00:00:00Z');

    it('a never-observed subject reads Infinity, not zero', () => {
      const starved = seeded().read('test.optimistic', 'never-seen', at);
      expect(starved.nEffective).toBe(0);
      expect(starved.uncertainty).toBe(Number.POSITIVE_INFINITY);
      // The ESTIMATE is still the prior — this widens the interval, it does
      // not invent a different central value.
      expect(starved.estimate).toBeCloseTo(0.2, 10);
      expect(starved.priorWeight).toBe(1);
    });

    it('the starved candidate is selected FIRST against a measured rival', () => {
      const registry = seeded();
      for (const value of [0.3, 0.1, 0.4, 0.2, 0.35, 0.15]) {
        registry.observe('test.optimistic', {
          subjectKey: 'measured',
          value,
          observedAt: at,
        });
      }
      const measured = registry.read('test.optimistic', 'measured', at);
      const starved = registry.read('test.optimistic', 'never-seen', at);
      expect(Number.isFinite(measured.uncertainty)).toBe(true);
      expect(measured.uncertainty).toBeGreaterThan(0);
      expect(ucb(starved)).toBeGreaterThan(ucb(measured));
      // …and that is what an optimistic selector picks.
      const winner = [
        { key: 'measured', reading: measured },
        { key: 'never-seen', reading: starved },
      ].sort((a, b) => ucb(b.reading) - ucb(a.reading))[0];
      expect(winner.key).toBe('never-seen');
    });

    it('a single observation is still unmeasured dispersion', () => {
      const registry = seeded();
      registry.observe('test.optimistic', {
        subjectKey: 'one-shot',
        value: 0.9,
        observedAt: at,
      });
      // One point has no spread; claiming zero uncertainty from it is the same
      // lie one step later.
      expect(registry.read('test.optimistic', 'one-shot', at).uncertainty).toBe(
        Number.POSITIVE_INFINITY,
      );
    });

    it('uncertainty becomes finite only once dispersion is measurable', () => {
      const registry = seeded();
      for (const value of [0.9, 0.1]) {
        registry.observe('test.optimistic', {
          subjectKey: 'two-shot',
          value,
          observedAt: at,
        });
      }
      const reading = registry.read('test.optimistic', 'two-shot', at);
      expect(reading.nEffective).toBe(2);
      expect(Number.isFinite(reading.uncertainty)).toBe(true);
      expect(reading.uncertainty).toBeGreaterThan(0);
    });
  });
});
