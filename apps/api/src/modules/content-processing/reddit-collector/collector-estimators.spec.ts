import {
  CollectorEstimators,
  COLLECTOR_ESTIMATOR_NAMES,
  termKey,
  sourceKey,
} from './collector-estimators';

/**
 * §11-at-priors estimator specs (§22 deferral law): observations ALWAYS
 * record; the deferred termHitRate reader returns its prior verbatim while
 * nEffective grows underneath; the arrival-rate reader (ON) self-erases its
 * prior as unbiased-lane output accrues; error/deferred outcomes never brand
 * a term (§12.3).
 */

const NOW = new Date('2026-07-19T12:00:00Z');

function build(attemptRows: unknown[] = []) {
  const prisma = {
    keywordAttemptHistory: {
      findMany: jest.fn().mockResolvedValue(attemptRows),
    },
  };
  return { estimators: new CollectorEstimators(prisma as never), prisma };
}

describe('CollectorEstimators (§22 priors edition)', () => {
  it('termHitRate reader is DEFERRED with a named turn-on trigger; reads return the prior while observations accrue', async () => {
    const h = build([
      {
        normalizedTerm: 'brisket',
        lastOutcome: 'success',
        lastAttemptAt: NOW,
      },
    ]);
    const registry = h.estimators.buildRegistry();
    await h.estimators.replayEngineAttempts(registry, 'engine-1');

    const reading = registry.read(
      COLLECTOR_ESTIMATOR_NAMES.termHitRate,
      termKey('brisket'),
      NOW,
    );
    expect(reading.readerDeferred).toBe(true);
    expect(reading.estimate).toBe(0.5); // the prior, verbatim
    expect(reading.nEffective).toBeGreaterThan(0); // observation RECORDED
    const config = registry.getConfig(COLLECTOR_ESTIMATOR_NAMES.termHitRate)!;
    expect(
      config.reader.enabled === false && config.reader.turnOnTrigger,
    ).toContain('§22');
  });

  it('error and governance-deferred outcomes record NOTHING (§12.3: a rate limit never brands a term)', async () => {
    const h = build([
      { normalizedTerm: 'errored', lastOutcome: 'error', lastAttemptAt: NOW },
      {
        normalizedTerm: 'deferred',
        lastOutcome: 'deferred',
        lastAttemptAt: NOW,
      },
    ]);
    const registry = h.estimators.buildRegistry();
    await h.estimators.replayEngineAttempts(registry, 'engine-1');
    for (const term of ['errored', 'deferred']) {
      expect(
        registry.read(COLLECTOR_ESTIMATOR_NAMES.termHitRate, termKey(term), NOW)
          .nEffective,
      ).toBe(0);
    }
  });

  it('arrival rate (reader ON) self-erases its prior toward measured docs/day from the unbiased lane', () => {
    const h = build();
    const registry = h.estimators.buildRegistry();
    const before = registry.read(
      COLLECTOR_ESTIMATOR_NAMES.sourceArrivalRate,
      sourceKey('src-1'),
      NOW,
    );
    expect(before.estimate).toBe(10); // prior docs/day
    expect(before.priorWeight).toBe(1);

    for (let day = 0; day < 30; day += 1) {
      h.estimators.observeArrival(registry, {
        sourceId: 'src-1',
        outputDocs: 40,
        coveredDays: 1,
        observedAt: new Date(NOW.getTime() - (30 - day) * 86400000),
      });
    }
    const after = registry.read(
      COLLECTOR_ESTIMATOR_NAMES.sourceArrivalRate,
      sourceKey('src-1'),
      NOW,
    );
    expect(after.estimate).toBeGreaterThan(25); // pulled hard toward 40
    expect(after.priorWeight).toBeLessThan(before.priorWeight);
  });

  it('zero covered days records nothing (a dead lane cannot read as a quiet room — §10 sampling law)', () => {
    const h = build();
    const registry = h.estimators.buildRegistry();
    h.estimators.observeArrival(registry, {
      sourceId: 'src-1',
      outputDocs: 0,
      coveredDays: 0,
      observedAt: NOW,
    });
    expect(
      registry.read(
        COLLECTOR_ESTIMATOR_NAMES.sourceArrivalRate,
        sourceKey('src-1'),
        NOW,
      ).nEffective,
    ).toBe(0);
  });

  it('termHitRate declares optimisticSelection (closed-loop law: selection gates its own observations)', () => {
    const h = build();
    const registry = h.estimators.buildRegistry();
    const config = registry.getConfig(COLLECTOR_ESTIMATOR_NAMES.termHitRate)!;
    expect(config.consumerGatesObservations).toBe(true);
    expect(config.exploration).toBe('optimisticSelection');
  });
});
