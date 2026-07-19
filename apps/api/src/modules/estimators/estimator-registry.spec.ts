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
});
