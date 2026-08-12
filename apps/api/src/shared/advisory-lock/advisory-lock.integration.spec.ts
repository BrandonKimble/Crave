import { PrismaClient } from '@prisma/client';
import { AdvisoryLockService } from './advisory-lock.service';

/**
 * THE LOCK IS PROVEN AGAINST A LIVE DATABASE — there is nowhere else it can
 * be proven. Session-scoped advisory locks are a property of the Postgres
 * BACKEND that holds them; a mocked Prisma cannot have the defect, so a unit
 * test of this helper would be green by construction, which is the exact
 * shape of lying instrument this codebase refuses.
 *
 * Three facts, in order:
 *   1. THE DEFECT IS REAL (the RED control): acquiring and releasing across a
 *      POOL — which is what all four call sites did — strands the lock.
 *   2. THE HELPER IS CLEAN: 25 consecutive round-trips under 8-way pool
 *      traffic, every one released, nothing held at exit.
 *   3. THE CRASH PATH RELEASES: a `fn` that throws leaves no lock behind.
 */

/** A key no production lane uses ('test' is 0x74657374). */
const TEST_LOCK_KEY = 0x74657374;

/** How many locked round-trips the clean run must complete. */
const ROUND_TRIPS = 25;

/** Concurrent pool pressure — enough that a checkout rarely returns the
 *  same backend twice in a row, which is what makes the defect fire. */
const POOL_CONCURRENCY = 8;

function locksHeldQuery(client: PrismaClient) {
  return client.$queryRawUnsafe<Array<{ held: bigint }>>(
    `SELECT count(*)::bigint AS held
       FROM pg_locks
      WHERE locktype = 'advisory'
        AND ((classid::bigint << 32) | objid::bigint) = ${TEST_LOCK_KEY}
        AND objsubid = 1`,
  );
}

describe('advisory locks — acquire and release on ONE session', () => {
  /** An independent observer: never takes the lock, only counts it. */
  const observer = new PrismaClient();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required — a skipped lock test proves nothing.',
      );
    }
    await observer.$connect();
  });

  afterAll(async () => {
    await observer.$disconnect();
  });

  async function heldCount(): Promise<number> {
    const rows = await locksHeldQuery(observer);
    return Number(rows[0]?.held ?? 0);
  }

  it('THE MUTATION (RED control): a pooled acquire/release strands the lock', async () => {
    // A pool of 8, kept busy, exactly as the four services' PrismaService is.
    const pooled = new PrismaClient({
      datasources: {
        db: {
          url: `${process.env.DATABASE_URL}${
            process.env.DATABASE_URL?.includes('?') ? '&' : '?'
          }connection_limit=${POOL_CONCURRENCY}`,
        },
      },
    });
    await pooled.$connect();
    const noise = () =>
      Array.from({ length: POOL_CONCURRENCY }, () =>
        pooled.$queryRawUnsafe('SELECT pg_sleep(0.05)::text AS slept'),
      );

    let releasedCleanly = 0;
    try {
      for (let i = 0; i < ROUND_TRIPS; i += 1) {
        const pending = noise();
        const lock = await pooled.$queryRawUnsafe<Array<{ locked: boolean }>>(
          `SELECT pg_try_advisory_lock(${TEST_LOCK_KEY}) AS locked`,
        );
        if (!lock[0]?.locked) {
          // Already stranded by an earlier round-trip: the lane is dead.
          break;
        }
        await Promise.all(pending);
        const unlocked = await pooled.$queryRawUnsafe<
          Array<{ unlocked: boolean }>
        >(`SELECT pg_advisory_unlock(${TEST_LOCK_KEY}) AS unlocked`);
        if (unlocked[0]?.unlocked) releasedCleanly += 1;
      }
      // The defect: not every round-trip released, and the lock is STILL held
      // by some idle pooled backend after the loop — the state that made
      // run() return EMPTY_SUMMARY zeros forever.
      expect(releasedCleanly).toBeLessThan(ROUND_TRIPS);
      expect(await heldCount()).toBeGreaterThan(0);
    } finally {
      // Closing the pool is the only thing that clears a stranded lock.
      await pooled.$disconnect();
    }
    expect(await heldCount()).toBe(0);
  }, 120_000);

  it(`${ROUND_TRIPS}/${ROUND_TRIPS} clean round-trips through the helper, under the same pool pressure`, async () => {
    const service = new AdvisoryLockService();
    // The same 8-way pool traffic runs alongside, so the helper is measured
    // in the conditions that break the pooled version.
    const pooled = new PrismaClient({
      datasources: {
        db: {
          url: `${process.env.DATABASE_URL}${
            process.env.DATABASE_URL?.includes('?') ? '&' : '?'
          }connection_limit=${POOL_CONCURRENCY}`,
        },
      },
    });
    await pooled.$connect();
    try {
      let ran = 0;
      for (let i = 0; i < ROUND_TRIPS; i += 1) {
        const pending = Array.from({ length: POOL_CONCURRENCY }, () =>
          pooled.$queryRawUnsafe('SELECT pg_sleep(0.02)::text AS slept'),
        );
        const outcome = await service.withAdvisoryLock(TEST_LOCK_KEY, () => {
          ran += 1;
          return Promise.resolve('ok' as const);
        });
        expect(outcome).toEqual({ acquired: true, result: 'ok' });
        await Promise.all(pending);
        // Released before the next round-trip begins — every single time.
        expect(await heldCount()).toBe(0);
      }
      expect(ran).toBe(ROUND_TRIPS);
    } finally {
      await pooled.$disconnect();
    }
    expect(await heldCount()).toBe(0);
  }, 120_000);

  it('a second holder loses the try-lock — and the winner still releases', async () => {
    const service = new AdvisoryLockService();
    const other = new PrismaClient();
    await other.$connect();
    try {
      await other.$queryRawUnsafe(
        `SELECT pg_try_advisory_lock(${TEST_LOCK_KEY})::text AS held`,
      );
      let ran = false;
      const outcome = await service.withAdvisoryLock(TEST_LOCK_KEY, () => {
        ran = true;
        return Promise.resolve('should not run');
      });
      expect(outcome).toEqual({ acquired: false });
      expect(ran).toBe(false);
    } finally {
      await other.$queryRawUnsafe(
        `SELECT pg_advisory_unlock(${TEST_LOCK_KEY})::text AS released`,
      );
      await other.$disconnect();
    }
    expect(await heldCount()).toBe(0);
  }, 60_000);

  it('the crash path releases: fn throws, the lock does not survive it', async () => {
    const service = new AdvisoryLockService();
    await expect(
      service.withAdvisoryLock(TEST_LOCK_KEY, () =>
        Promise.reject(new Error('killed mid-flight')),
      ),
    ).rejects.toThrow('killed mid-flight');
    expect(await heldCount()).toBe(0);

    // ...and the lane is immediately usable again, which is the property the
    // stranded version destroyed.
    const next = await service.withAdvisoryLock(TEST_LOCK_KEY, () =>
      Promise.resolve('recovered'),
    );
    expect(next).toEqual({ acquired: true, result: 'recovered' });
    expect(await heldCount()).toBe(0);
  }, 60_000);
});
