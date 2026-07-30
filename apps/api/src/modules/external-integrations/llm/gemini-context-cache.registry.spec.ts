/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access -- jest mock doubles: method references are jest.fn()s (no `this`), and mock.calls access is untyped by nature */
import {
  GeminiContextCacheRegistry,
  type CacheVendorOps,
} from './gemini-context-cache.registry';

/**
 * Pins the lifecycle properties the registry exists to provide. Each spec is
 * RED-able against the pre-registry world: per-process private fields reused
 * nothing across processes, extended nothing, deleted nothing, and served
 * known-bad caches to siblings forever.
 */
describe('GeminiContextCacheRegistry', () => {
  const HOUR = 3_600_000;
  const stubLogger = () => ({
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  });

  const build = (rows: Array<Record<string, unknown>> = []) => {
    const prisma = {
      geminiContextCache: {
        findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
      $executeRaw: jest.fn().mockResolvedValue(0),
      // The mint path runs under an advisory-locked transaction; the double
      // hands the SAME object back as the tx client. The in-lock re-check
      // must see "still nothing", not the pre-lock fixture row (that row
      // represents what the OUTSIDE lookup saw), so findFirst yields its
      // fixture once and null afterwards.
      $transaction: jest.fn(
        (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          fn(prismaProxy),
      ),
    };
    prisma.geminiContextCache.findFirst = jest
      .fn()
      .mockResolvedValueOnce(rows[0] ?? null)
      .mockResolvedValue(null);
    const prismaProxy = prisma;
    const usageLedger = { record: jest.fn() };
    const ops: jest.Mocked<CacheVendorOps> = {
      create: jest
        .fn()
        .mockResolvedValue({ name: 'cachedContents/new', tokenCount: 19_000 }),
      updateTtl: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const registry = new GeminiContextCacheRegistry(
      prisma as never,
      usageLedger as never,
      stubLogger() as never,
    );
    return { registry, prisma, usageLedger, ops };
  };

  const params = {
    model: 'gemini-3-flash-preview',
    systemInstruction: 'the prompt',
    ttlSeconds: 30 * 3600,
    minRemainingMs: 25 * HOUR,
    caller: 'llm.batchSystemCache',
  };

  it('REUSES a live registry row without paying a vendor create', async () => {
    const { registry, usageLedger, ops } = build([
      {
        name: 'cachedContents/live',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() + 29 * HOUR),
      },
    ]);
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/live', reused: true });
    expect(ops.create).not.toHaveBeenCalled();
    // Reuse is free: no creation row, no new storage row.
    expect(usageLedger.record).not.toHaveBeenCalled();
  });

  it('EXTENDS an expiring cache instead of minting a twin, and ledgers only the added hours', async () => {
    const { registry, usageLedger, ops } = build([
      {
        name: 'cachedContents/expiring',
        tokenCount: 18_862,
        // 10h left < 25h floor, but still alive -> extend, not remint.
        expiresAt: new Date(Date.now() + 10 * HOUR),
      },
    ]);
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({
      name: 'cachedContents/expiring',
      reused: true,
    });
    expect(ops.updateTtl).toHaveBeenCalledWith(
      'cachedContents/expiring',
      params.ttlSeconds,
    );
    expect(ops.create).not.toHaveBeenCalled();
    const storage = usageLedger.record.mock.calls
      .map((c) => c[0] as { operation: string; durationHours?: number })
      .filter((e) => e.operation === 'cachedContentStorage');
    expect(storage).toHaveLength(1);
    // Added lifetime is ~(30h - 10h) = 20h, never the full 30h again.
    expect(storage[0].durationHours).toBeGreaterThan(19);
    expect(storage[0].durationHours).toBeLessThan(21);
  });

  it('MINTS when nothing is live, recording creation + full-TTL storage', async () => {
    const { registry, usageLedger, ops } = build([]);
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/new', reused: false });
    const operations = usageLedger.record.mock.calls.map(
      (c) => (c[0] as { operation: string }).operation,
    );
    expect(operations).toEqual(['createCachedContent', 'cachedContentStorage']);
  });

  it('forceRemint SKIPS the lookup entirely (known-bad cache must not be reused)', async () => {
    const { registry, prisma, ops } = build([
      {
        name: 'cachedContents/bad-but-live',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() + 29 * HOUR),
      },
    ]);
    const got = await registry.acquire({ ...params, forceRemint: true }, ops);
    expect(got.reused).toBe(false);
    expect(prisma.geminiContextCache.findFirst).not.toHaveBeenCalled();
  });

  it('retires a superseded cache and DELETES it when no in-flight batch job references it', async () => {
    const { registry, prisma, ops } = build([]);
    prisma.geminiContextCache.findMany.mockResolvedValue([
      {
        name: 'cachedContents/old',
        createdAt: new Date(Date.now() - 2 * HOUR),
      },
    ]);
    await registry.acquire(params, ops);
    expect(ops.delete).toHaveBeenCalledWith('cachedContents/old');
    expect(prisma.geminiContextCache.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'cachedContents/old' } }),
    );
  });

  it('NEVER deletes a cache an in-flight batch job still references (retire only)', async () => {
    const { registry, prisma, ops } = build([]);
    prisma.geminiContextCache.findMany.mockResolvedValue([
      {
        name: 'cachedContents/pinned',
        createdAt: new Date(Date.now() - 2 * HOUR),
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);
    await registry.acquire(params, ops);
    expect(ops.delete).not.toHaveBeenCalled();
    // Still retired in the registry: no process may reuse it.
    expect(prisma.geminiContextCache.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'cachedContents/pinned' } }),
    );
  });

  it('a failed extension falls through to a fresh mint (never returns a dying cache)', async () => {
    const { registry, ops } = build([
      {
        name: 'cachedContents/dying',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() + 1 * HOUR),
      },
    ]);
    ops.updateTtl.mockRejectedValue(new Error('vendor says no'));
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/new', reused: false });
  });

  it('a YOUNG superseded cache is retired but NEVER vendor-deleted (build->submit window)', async () => {
    // Red team F4: a batch builder embeds the cache name before submit
    // persists the job items, so the refcount cannot see the reference yet.
    // Deleting a young cache under that window kills a whole job to save an
    // hour of rent.
    const { registry, prisma, ops } = build([]);
    prisma.geminiContextCache.findMany.mockResolvedValue([
      {
        name: 'cachedContents/young',
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ]);
    await registry.acquire(params, ops);
    expect(ops.delete).not.toHaveBeenCalled();
    expect(prisma.geminiContextCache.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'cachedContents/young' } }),
    );
  });

  it('a RACED in-lock reuse ledgers NOTHING (the minting process alone records)', async () => {
    // Red team gap #1: outside lookup misses, but inside the advisory lock a
    // sibling's fresh row appears. Reusing it must not re-ledger the
    // creation/storage the sibling already recorded.
    const { registry, prisma, usageLedger, ops } = build([]);
    prisma.geminiContextCache.findFirst = jest
      .fn()
      .mockResolvedValueOnce(null) // outside lookup: nothing yet
      .mockResolvedValue({
        // in-lock re-check: sibling minted while we waited on the lock
        name: 'cachedContents/sibling',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() + 29 * HOUR),
      });
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/sibling', reused: true });
    expect(ops.create).not.toHaveBeenCalled();
    expect(usageLedger.record).not.toHaveBeenCalled();
  });

  it('an EXPIRED row is never reused or extended — it falls through to a mint', async () => {
    // Red team gap #2: expired-but-unretired rows exist forever (no GC).
    const { registry, ops } = build([
      {
        name: 'cachedContents/expired',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() - 1 * HOUR),
      },
    ]);
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/new', reused: false });
    expect(ops.updateTtl).not.toHaveBeenCalled();
  });

  it('LOSING the extension CAS ledgers nothing and falls through to the lock path', async () => {
    // Red team F5/F6: concurrent extends must bill once. The CAS loser
    // records no storage hours for the extension and re-resolves under the
    // lock instead of returning a possibly-retired name.
    const { registry, prisma, usageLedger, ops } = build([
      {
        name: 'cachedContents/contended',
        tokenCount: 18_862,
        expiresAt: new Date(Date.now() + 10 * HOUR),
      },
    ]);
    prisma.geminiContextCache.updateMany.mockResolvedValue({ count: 0 });
    const got = await registry.acquire(params, ops);
    expect(got).toMatchObject({ name: 'cachedContents/new', reused: false });
    const extensionRows = usageLedger.record.mock.calls
      .map((c) => c[0] as { operation: string; durationHours?: number })
      .filter(
        (e) =>
          e.operation === 'cachedContentStorage' &&
          (e.durationHours ?? 0) < params.ttlSeconds / 3600,
      );
    expect(extensionRows).toHaveLength(0);
  });

  it('invalidate() retires by name so sibling processes stop reusing a bad cache', async () => {
    const { registry, prisma, ops } = build([]);
    void ops;
    await registry.invalidate('cachedContents/bad');
    expect(prisma.geminiContextCache.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'cachedContents/bad', retiredAt: null },
      }),
    );
  });
});
