import { RescoreCoordinatorService } from './rescore-coordinator.service';
import {
  grantingAdvisoryLock,
  heldAdvisoryLock,
} from '../../../shared/testing/advisory-lock-doubles';

/**
 * §12.6 singleton-rescorer specs: collection marks dirty; ONE advisory-locked
 * debounced coordinator owns the global rebuild. Clean → no rebuild; dirty →
 * exactly one rebuild + flag cleared; lock held elsewhere → defer; rebuild
 * failure → flag re-dirtied and the error is LOUD (never swallowed).
 */

function build(
  options: {
    dirty?: boolean;
    locked?: boolean;
    /** Rows the score-parity audit sees; default = parity holds. */
    parity?: { items: number; scores: number };
  } = {},
) {
  const executed: string[] = [];
  const prisma = {
    rescoreState: {
      findUnique: jest.fn().mockResolvedValue({ dirty: options.dirty ?? true }),
    },
    // The coordinator issues NO lock SQL of its own any more — the shared
    // helper owns the lock, on its own dedicated session. The only
    // $queryRaw left is the score-parity audit.
    $queryRaw: jest.fn(() =>
      Promise.resolve([options.parity ?? { items: 0, scores: 0 }]),
    ),
    $executeRaw: jest.fn((strings: TemplateStringsArray) => {
      executed.push(strings.join('?'));
      return Promise.resolve(1);
    }),
  };
  const craveScore = {
    rebuildAllScores: jest
      .fn()
      .mockResolvedValue({ scoreRunId: 'run-1', scoredCount: 42 }),
  };
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const opsAlerts = { emit: jest.fn() };
  const service = new RescoreCoordinatorService(
    prisma as never,
    logger as never,
    craveScore as never,
    options.locked === true ? heldAdvisoryLock() : grantingAdvisoryLock(),
    opsAlerts as never,
  );
  service.onModuleInit();
  return { service, prisma, craveScore, logger, executed, opsAlerts };
}

describe('RescoreCoordinatorService (§12.6)', () => {
  it('clean state → no rebuild at all', async () => {
    const h = build({ dirty: false });
    expect(await h.service.tick()).toBe('clean');
    expect(h.craveScore.rebuildAllScores).not.toHaveBeenCalled();
  });

  it('dirty → one rebuild, flag cleared BEFORE the rebuild (marks during rebuild survive)', async () => {
    const h = build({ dirty: true });
    expect(await h.service.tick()).toBe('rebuilt');
    expect(h.craveScore.rebuildAllScores).toHaveBeenCalledTimes(1);
    expect(h.executed.some((sql) => sql.includes('SET dirty = false'))).toBe(
      true,
    );
  });

  it('advisory lock held elsewhere → defer (no second concurrent rebuild)', async () => {
    const h = build({ dirty: true, locked: true });
    expect(await h.service.tick()).toBe('locked');
    expect(h.craveScore.rebuildAllScores).not.toHaveBeenCalled();
  });

  it('rebuild failure re-dirties the flag and logs LOUDLY (no swallowed rescore errors)', async () => {
    const h = build({ dirty: true });
    h.craveScore.rebuildAllScores.mockRejectedValue(new Error('boom'));
    expect(await h.service.tick()).toBe('failed');
    // Re-dirty write happened after the clear.
    const dirtyWrites = h.executed.filter((sql) =>
      sql.includes('SET dirty = true'),
    );
    expect(dirtyWrites.length).toBeGreaterThanOrEqual(1);
    expect(h.logger.error).toHaveBeenCalledWith(
      'Global rescore FAILED (flag re-dirtied; will retry)',
      expect.anything(),
    );
  });

  it('markDirty is a durable flag write, never a rebuild', async () => {
    const h = build();
    await h.service.markDirty('collection batch b-1');
    expect(h.craveScore.rebuildAllScores).not.toHaveBeenCalled();
    expect(h.executed.some((sql) => sql.includes('SET dirty = true'))).toBe(
      true,
    );
  });

  // ── score-layer emptiness self-heal (lens-2 residual, 2026-08-17) ──────
  // The invariant is count parity: every core_restaurant_items row has a
  // connection score. A short table with a clean flag is the incident's
  // silent state; the audit must mark dirty AND scream.

  it('score parity holds → no dirty mark, no alert', async () => {
    const h = build({ parity: { items: 100, scores: 100 } });
    await h.service.healIfScoresShort('tick');
    expect(h.executed.some((sql) => sql.includes('SET dirty = true'))).toBe(
      false,
    );
    expect(h.opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('score table SHORT of the connection count → marks dirty and alerts critically', async () => {
    const h = build({ parity: { items: 100, scores: 50 } });
    await h.service.healIfScoresShort('tick');
    expect(h.executed.some((sql) => sql.includes('SET dirty = true'))).toBe(
      true,
    );
    expect(h.opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        kind: 'rescore-score-layer-short',
      }),
    );
  });

  it('score table EMPTY (the incident arm) → marks dirty and alerts', async () => {
    const h = build({ parity: { items: 14980, scores: 0 } });
    await h.service.healIfScoresShort('boot');
    expect(h.executed.some((sql) => sql.includes('SET dirty = true'))).toBe(
      true,
    );
    // Boot arm (onModuleInit) + the explicit call both see the shortfall;
    // real-world dedupe lives in OpsAlertsService via dedupeKey.
    expect(h.opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'rescore-score-layer-short' }),
    );
  });

  it('kill-switch honesty: on a cron-free runtime the alert says NOBODY will rebuild', async () => {
    const prev = process.env.CRONS_ENABLED;
    process.env.CRONS_ENABLED = 'false';
    try {
      const h = build({ parity: { items: 10, scores: 0 } });
      await h.service.healIfScoresShort('boot');
      const calls = h.opsAlerts.emit.mock.calls as Array<[{ body: string }]>;
      expect(calls[0][0].body).toContain('NOBODY will rebuild');
    } finally {
      if (prev === undefined) delete process.env.CRONS_ENABLED;
      else process.env.CRONS_ENABLED = prev;
    }
  });

  it('a tick runs the parity audit before reading the flag (the shortfall rebuilds SAME tick)', async () => {
    const h = build({ dirty: false, parity: { items: 5, scores: 0 } });
    // The audit marks dirty via $executeRaw; the mocked findUnique still says
    // clean, so assert the audit ran and marked, which is the seam that makes
    // the same tick rebuild against a real database.
    await h.service.tick();
    expect(h.executed.some((sql) => sql.includes('SET dirty = true'))).toBe(
      true,
    );
  });
});
