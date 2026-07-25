import {
  CollectorSourceRegistryService,
  evaluateCostBreach,
  normalizedLateness,
} from './collector-source-registry.service';

/**
 * §10 source-model + §12.4 heartbeat specs: normalized lateness is the
 * universal severity scale ((now − dueAt) ÷ tolerance); the per-(source,
 * lane) heartbeat CAN SHOW RED two independent ways — lateness > 1 and
 * output collapse vs the lane's own baseline — and cannot false-RED before
 * a baseline exists.
 */

const NOW = new Date('2026-07-19T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('normalizedLateness', () => {
  it('is (now − dueAt) ÷ tolerance: a day overdue on a 1d tolerance = 1', () => {
    expect(
      normalizedLateness(
        {
          dueAt: new Date(NOW.getTime() - DAY_MS),
          latenessToleranceDays: 1,
        },
        NOW,
      ),
    ).toBeCloseTo(1);
  });

  it('months-tolerance work yields structurally to days-tolerance work', () => {
    const dueAt = new Date(NOW.getTime() - 3 * DAY_MS);
    const liveLane = normalizedLateness(
      { dueAt, latenessToleranceDays: 1 },
      NOW,
    );
    const seedingLane = normalizedLateness(
      { dueAt, latenessToleranceDays: 90 },
      NOW,
    );
    expect(liveLane).toBeGreaterThan(seedingLane);
  });

  it('not-yet-due lanes are negative (never preempt overdue work)', () => {
    expect(
      normalizedLateness(
        {
          dueAt: new Date(NOW.getTime() + DAY_MS),
          latenessToleranceDays: 1,
        },
        NOW,
      ),
    ).toBeLessThan(0);
  });
});

describe('collectorHeartbeats (§12.4 — must be able to show RED)', () => {
  function stubLogger() {
    return {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  function buildWithRows(rows: unknown[]) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const logger = stubLogger();
    return {
      service: new CollectorSourceRegistryService(
        prisma as never,
        logger as never,
      ),
      prisma,
      logger,
    };
  }

  const baseRow = {
    source_id: 'src-1',
    handle: 'austinfood',
    lane: 'chronological',
    due_at: NOW,
    lateness_tolerance_days: 1,
    last_output_docs: null as number | null,
    output_docs_baseline: null as number | null,
    last_cost_micros: null as bigint | null,
    cost_baseline_micros: null as number | null,
    cost_paused: false,
  };

  it('shows RED on lateness: a lane overdue past its tolerance reads > 1', async () => {
    const h = buildWithRows([
      { ...baseRow, due_at: new Date(NOW.getTime() - 3 * DAY_MS) },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.normalizedLateness).toBeGreaterThan(1);
  });

  it('shows RED on output collapse vs the lane`s OWN baseline (broken-zero)', async () => {
    const h = buildWithRows([
      { ...baseRow, last_output_docs: 0, output_docs_baseline: 40 },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.outputCollapsed).toBe(true);
  });

  it('legit-zero on a no-baseline lane is NOT red (first ticks cannot false-RED)', async () => {
    const h = buildWithRows([
      { ...baseRow, last_output_docs: 0, output_docs_baseline: null },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.outputCollapsed).toBe(false);
  });

  it('healthy output near baseline is green', async () => {
    const h = buildWithRows([
      { ...baseRow, last_output_docs: 35, output_docs_baseline: 40 },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.outputCollapsed).toBe(false);
    expect(beat.normalizedLateness).toBeLessThanOrEqual(0);
    expect(beat.pendingWindowStale).toBe(false);
    expect(beat.expectedBatchesShortfall).toBeNull();
    expect(beat.coverageGapDetected).toBe(false);
  });

  it('shows RED on a stale pending window (§10: fetched but no run committed)', async () => {
    const h = buildWithRows([
      {
        ...baseRow,
        state: {
          pendingWindow: {
            parentJobId: 'job-1',
            coveredThrough: NOW.toISOString(),
            expectedBatches: 4,
            stagedAt: new Date(
              NOW.getTime() - 3 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
      },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.pendingWindowStale).toBe(true);
  });

  it('a freshly staged window (inside the grace) is NOT red', async () => {
    const h = buildWithRows([
      {
        ...baseRow,
        state: {
          pendingWindow: {
            parentJobId: 'job-1',
            coveredThrough: NOW.toISOString(),
            expectedBatches: 4,
            stagedAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
          },
        },
      },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.pendingWindowStale).toBe(false);
  });

  it('surfaces the reconciler shortfall verdict (§10 expectedBatches RED)', async () => {
    const h = buildWithRows([
      { ...baseRow, state: { reconciler: { shortfall: 3 } } },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.expectedBatchesShortfall).toBe(3);
  });

  it('shows RED on an uncleared coverage gap (§10 saturation miss fact)', async () => {
    const h = buildWithRows([
      {
        ...baseRow,
        state: {
          coverageGap: { detectedAt: NOW.toISOString(), windowStart: null },
        },
      },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.coverageGapDetected).toBe(true);
  });

  it('surfaces a cost breach (§24.5 Leg B) exactly like output collapse', async () => {
    const h = buildWithRows([
      {
        ...baseRow,
        last_cost_micros: 900_000n,
        cost_baseline_micros: 100_000,
        cost_paused: true,
      },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.costBreached).toBe(true);
    expect(beat.lastCostMicros).toBe(900_000);
    expect(beat.costBaselineMicros).toBe(100_000);
  });

  it('a lane with an established baseline that is NOT breached reads green', async () => {
    const h = buildWithRows([
      {
        ...baseRow,
        last_cost_micros: 105_000n,
        cost_baseline_micros: 100_000,
        cost_paused: false,
      },
    ]);
    const [beat] = await h.service.collectorHeartbeats(NOW);
    expect(beat.costBreached).toBe(false);
  });
});

/**
 * §24.1 Tier 2 breach law, tested against the PURE mirror of the
 * recordLaneCost SQL (evaluateCostBreach — see the function's doc comment:
 * the two copies are one piece of logic transcribed twice). This is the
 * RED-proof for the cost band: mutate COST_BREACH_K to e.g. 30 (or drop the
 * `>` breach comparison to always-false) in
 * collector-source-registry.service.ts and every "spike breaches" case
 * below fails — the band is provably capable of firing, not a metric that
 * can only ever read green.
 */
describe('evaluateCostBreach (§24.1 Tier 2 — the band must be able to fire)', () => {
  it('first tick (no baseline) NEVER breaches, even at an extreme cost', () => {
    const result = evaluateCostBreach(1_000_000_000, null, null);
    expect(result.paused).toBe(false);
    // Bootstrap: the baseline becomes exactly this tick's cost, dev starts 0
    // — the next tick has a real (if narrow) band to compare against.
    expect(result.nextBaselineMicros).toBe(1_000_000_000);
    expect(result.nextDevMicros).toBe(0);
  });

  it('an established, low-variance baseline BREACHES on an injected spike', () => {
    // Establish a settled baseline via several near-identical ticks (dev
    // converges near 0), then inject a spike far past baseline + 3*dev.
    let state: { baseline: number | null; dev: number | null } = {
      baseline: null,
      dev: null,
    };
    for (const tick of [100_000, 102_000, 98_000, 101_000, 99_000]) {
      const step = evaluateCostBreach(tick, state.baseline, state.dev);
      state = { baseline: step.nextBaselineMicros, dev: step.nextDevMicros };
    }
    expect(state.dev).toBeLessThan(2_000); // settled, low-variance baseline

    const spike = evaluateCostBreach(2_000_000, state.baseline, state.dev);
    expect(spike.paused).toBe(true);
  });

  it('a tick within the band (baseline ± K*dev) does NOT breach', () => {
    let state: { baseline: number | null; dev: number | null } = {
      baseline: null,
      dev: null,
    };
    for (const tick of [100_000, 110_000, 90_000, 105_000, 95_000]) {
      const step = evaluateCostBreach(tick, state.baseline, state.dev);
      state = { baseline: step.nextBaselineMicros, dev: step.nextDevMicros };
    }
    // A tick close to the settled baseline (normal noise, not a spike).
    const normal = evaluateCostBreach(101_000, state.baseline, state.dev);
    expect(normal.paused).toBe(false);
  });
});

describe('recordLaneCost (§24.5 Leg B write path)', () => {
  function buildForRecord(returning: {
    paused: boolean;
    baseline: number;
    dev: number;
    breached: boolean;
  }) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([returning]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    return {
      service: new CollectorSourceRegistryService(
        prisma as never,
        logger as never,
      ),
      logger,
    };
  }

  it('a breach on an ELASTIC lane (keyword) LOUDLY logs and pauses', async () => {
    const { service, logger } = buildForRecord({
      paused: true,
      baseline: 100_000,
      dev: 1_000,
      breached: true,
    });
    await service.recordLaneCost('src-1', 'keyword', 900_000);
    expect(logger.error).toHaveBeenCalledWith(
      'LANE COST BREACH — paused pending owner eyes',
      expect.objectContaining({
        sourceId: 'src-1',
        lane: 'keyword',
        costMicros: 900_000,
      }),
    );
  });

  it('a non-breaching tick logs nothing', async () => {
    const { service, logger } = buildForRecord({
      paused: false,
      baseline: 100_000,
      dev: 1_000,
      breached: false,
    });
    await service.recordLaneCost('src-1', 'keyword', 101_000);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a breach on the LOSS-HORIZON lane (chronological) escalates instead of pausing (red team 2026-07-24)', async () => {
    const { service, logger } = buildForRecord({
      paused: false, // SQL never sets cost_paused for chronological
      baseline: 100_000,
      dev: 1_000,
      breached: true,
    });
    await service.recordLaneCost('src-1', 'chronological', 900_000);
    expect(logger.error).toHaveBeenCalledWith(
      'LANE COST BREACH (ESCALATED — loss-horizon lane keeps running)',
      expect.objectContaining({
        sourceId: 'src-1',
        lane: 'chronological',
        costMicros: 900_000,
      }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      'LANE COST BREACH — paused pending owner eyes',
      expect.anything(),
    );
  });

  it('a non-breaching chronological tick logs nothing', async () => {
    const { service, logger } = buildForRecord({
      paused: false,
      baseline: 100_000,
      dev: 1_000,
      breached: false,
    });
    await service.recordLaneCost('src-1', 'chronological', 101_000);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
