import { OnDemandCleanupService } from './on-demand-cleanup.service';

/**
 * THE MERGE'S ONE REAL RISK (owner-approved merge 2026-08-11).
 *
 * Two @Crons were independent by accident of being two crons. Folding them
 * into one method makes it possible — and, written the obvious way, LIKELY —
 * for step 1 throwing to silently skip step 2 forever: a retention pass that
 * stops running without ever failing loudly. So the isolation is the thing
 * under test, from both sides: every step runs, and the failure still surfaces.
 */
describe('OnDemandCleanupService — two steps, one job', () => {
  const build = () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      onDemandRequestUser: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
    };
    const service = new OnDemandCleanupService(
      prisma as never,
      logger as never,
    );
    return { service, prisma, logger };
  };

  it('runs BOTH steps in one pass', async () => {
    const { service, prisma } = build();
    await service.runCleanup();
    // Step 1 is the placeholder archive (raw SQL); step 2 opens with the
    // request-user delete.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.onDemandRequestUser.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('a failing FIRST step does not skip the second — and still surfaces', async () => {
    const { service, prisma, logger } = build();
    prisma.$executeRaw.mockRejectedValueOnce(
      new Error('placeholder step boom'),
    );

    await expect(service.runCleanup()).rejects.toThrow('placeholder step boom');
    // The whole point: step 2 ran anyway.
    expect(prisma.onDemandRequestUser.deleteMany).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('a failing SECOND step does not un-run the first, and surfaces too', async () => {
    const { service, prisma } = build();
    prisma.onDemandRequestUser.deleteMany.mockRejectedValueOnce(
      new Error('request-user step boom'),
    );

    await expect(service.runCleanup()).rejects.toThrow(
      'request-user step boom',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('the two retention windows stay DIFFERENT numbers (30d / 90d)', async () => {
    // They govern different things under different owner sentences. A merge
    // that quietly collapsed them into one window would pass every test above.
    const { service, prisma } = build();
    const now = Date.now();
    prisma.onDemandRequestUser.deleteMany.mockResolvedValue({ count: 0 });
    await service.runCleanup();

    const placeholderCall = prisma.$executeRaw.mock.calls[0] as [
      { values: Date[] },
    ];
    const placeholderCutoff = placeholderCall[0].values[0];
    const deleteCall = prisma.onDemandRequestUser.deleteMany.mock.calls[0] as [
      { where: { lastSeenAt: { lt: Date } } },
    ];
    const requestUserCutoff = deleteCall[0].where.lastSeenAt.lt;

    const days = (cutoff: Date) =>
      Math.round((now - cutoff.getTime()) / 86_400_000);
    expect(days(placeholderCutoff)).toBe(30);
    expect(days(requestUserCutoff)).toBe(90);
  });
});
