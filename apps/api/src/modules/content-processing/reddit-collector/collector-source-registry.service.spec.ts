import {
  CollectorSourceRegistryService,
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
  function buildWithRows(rows: unknown[]) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    return {
      service: new CollectorSourceRegistryService(prisma as never),
      prisma,
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
  });
});
