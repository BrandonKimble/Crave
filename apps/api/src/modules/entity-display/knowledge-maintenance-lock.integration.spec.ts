import { PrismaClient } from '@prisma/client';
import { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';
import { KnowledgeMaintenanceService } from './knowledge-maintenance.service';

/**
 * ONE RUNNER OF THE KNOWLEDGE RAIL, ACROSS PROCESSES — proven against a real
 * database.
 *
 * The re-entrancy guard used to be a per-process boolean, which stops the
 * worker re-entering itself and stops nothing else: a second replica (or a
 * hand-run script) would run the whole rail concurrently and pay the LLM bill
 * twice for the same concepts. The lock is a Postgres advisory lock, so the
 * fact it is cross-process is a property of the mechanism, not of deployment.
 */
describe('knowledge maintenance advisory lock — proven against a live database', () => {
  const prisma = new PrismaClient();
  /** Stands in for the OTHER process holding the rail. */
  const otherProcess = new PrismaClient();
  const LOCK_KEY = 0x6b6e6f77;

  const sweep = {
    sweepLocales: jest.fn().mockReturnValue([]),
    sweep: jest.fn(),
  };
  const satisfies = { run: jest.fn().mockResolvedValue({}) };

  const service = new KnowledgeMaintenanceService(
    sweep as never,
    {} as never,
    satisfies as never,
    // THE REAL LOCK SERVICE — the whole point of this spec is that the lock
    // is a real cross-process fact, so it must be the real mechanism.
    new AdvisoryLockService(),
  );

  afterAll(async () => {
    // `pg_advisory_unlock_all()` returns void, which Prisma cannot
    // deserialize — cast it to text so the teardown is a real query.
    await otherProcess.$queryRawUnsafe(
      `SELECT pg_advisory_unlock_all()::text AS released`,
    );
    await otherProcess.$disconnect();
    await prisma.$disconnect();
  });

  it('a second runner SKIPS the pass while another process holds the rail', async () => {
    const held = await otherProcess.$queryRawUnsafe<
      Array<{ pg_try_advisory_lock: boolean }>
    >(`SELECT pg_try_advisory_lock(${LOCK_KEY})`);
    expect(held[0].pg_try_advisory_lock).toBe(true);

    await service.runOnce('manual');
    // Not one pass ran — no locales enumerated, no satisfies spend.
    expect(sweep.sweepLocales).not.toHaveBeenCalled();
    expect(satisfies.run).not.toHaveBeenCalled();

    await otherProcess.$queryRawUnsafe(
      `SELECT pg_advisory_unlock(${LOCK_KEY})`,
    );

    // ...and with the rail free the same call runs it.
    await service.runOnce('manual');
    expect(sweep.sweepLocales).toHaveBeenCalled();
    expect(satisfies.run).toHaveBeenCalled();
  });
});
