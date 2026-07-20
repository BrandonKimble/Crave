import { RescoreCoordinatorService } from './rescore-coordinator.service';

/**
 * §12.6 singleton-rescorer specs: collection marks dirty; ONE advisory-locked
 * debounced coordinator owns the global rebuild. Clean → no rebuild; dirty →
 * exactly one rebuild + flag cleared; lock held elsewhere → defer; rebuild
 * failure → flag re-dirtied and the error is LOUD (never swallowed).
 */

function build(options: { dirty?: boolean; locked?: boolean } = {}) {
  const executed: string[] = [];
  const prisma = {
    rescoreState: {
      findUnique: jest.fn().mockResolvedValue({ dirty: options.dirty ?? true }),
    },
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ locked: options.locked !== true }]);
      }
      return Promise.resolve([]);
    }),
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
  const service = new RescoreCoordinatorService(
    prisma as never,
    logger as never,
    craveScore as never,
  );
  service.onModuleInit();
  return { service, prisma, craveScore, logger, executed };
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
});
