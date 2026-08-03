/**
 * AN INSTANT MEANS THE SAME THING FROM EVERY CHAIR — against a real Postgres.
 *
 * `signals.occurred_at` was the last `timestamp WITHOUT time zone` column in
 * the database. It survived the 161-column timestamptz migration because it is
 * the RANGE partition key and Postgres refuses to alter one, so it kept a
 * whole bug class alive behind a coercion helper that nobody was forced to
 * use — and one query had already skipped it, reading 601 rows under UTC and
 * 613 under America/Chicago.
 *
 * The table was rebuilt on a timestamptz key (migration
 * 20260803000000_signals_occurred_at_timestamptz). That deleted the helper and
 * its scanner, and it FLIPPED which form is dangerous:
 *
 *   before — a bound Date was the hazard, a bare `::date` literal was safe
 *   after  — a bound Date is safe, a bare `::date` literal is the hazard
 *
 * Measured on the real corpus the moment the column converted, one day-slice
 * of the aggregate returned 9 rows under UTC, 0 under America/Chicago and 12
 * under Asia/Tokyo. So the invariant cannot be "use the helper" — it has to be
 * the property itself: the same question, asked from any chair on earth, gets
 * the same answer.
 *
 * This is a BEHAVIOUR test against a real server, deliberately. Its two
 * predecessors were source scanners, and both shipped false greens.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { utcDayStart } from './occurred-at';

/** UTC-11 to UTC+14, plus a zone whose offset is not a whole hour. */
const ZONES = [
  'UTC',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Kathmandu',
  'Pacific/Kiritimati',
  'Pacific/Niue',
];

const TEST_ACTOR = '00000000-0000-4000-8000-0000000000tz'.replace('tz', '01');
const DAY = '2026-07-15';

const prisma = new PrismaClient();

/** Ask one question with the session pinned to `zone`. */
async function inZone<T>(
  zone: string,
  run: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  let out!: T;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = '${zone}'`);
      out = await run(tx as unknown as PrismaClient);
      throw new Error('ROLLBACK');
    })
    .catch((error: unknown) => {
      if ((error as Error).message !== 'ROLLBACK') throw error;
    });
  return out;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped timezone test proves nothing, ' +
        'which is the disease this file treats.',
    );
  }
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('signals.occurred_at is an instant, not a wall-clock reading', () => {
  it('is stored as timestamptz — the premise every case below rests on', async () => {
    const [row] = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'signals' AND column_name = 'occurred_at'
    `;
    expect(row?.data_type).toBe('timestamp with time zone');
  });

  it('a BOUND INSTANT selects the same rows from every timezone', async () => {
    const since = new Date('2026-07-01T00:00:00Z');
    const counts = await Promise.all(
      ZONES.map((zone) =>
        inZone(zone, async (tx) => {
          const [row] = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM signals WHERE occurred_at >= ${since}
          `;
          return `${zone}=${Number(row.n)}`;
        }),
      ),
    );
    expect(new Set(counts.map((c) => c.split('=')[1])).size).toBe(1);
  });

  it('a UTC DAY WINDOW selects the same rows from every timezone', async () => {
    // The shape that became dangerous when the column converted. utcDayStart
    // is what makes it safe; a bare `${DAY}::date` here is the RED case.
    const counts = await Promise.all(
      ZONES.map((zone) =>
        inZone(zone, async (tx) => {
          const [row] = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM signals
            WHERE occurred_at >= ${utcDayStart(DAY)}
              AND occurred_at < ${utcDayStart('2026-07-16')}
          `;
          return Number(row.n);
        }),
      ),
    );
    expect(new Set(counts).size).toBe(1);
  });

  it('THE RED CASE: a bare ::date literal still disagrees — which is why utcDayStart exists', async () => {
    // Not a regression: a demonstration that the property under test is real
    // and this file can see it. If a future Postgres made bare date literals
    // zone-independent, this would fail and utcDayStart could be deleted.
    const counts = await Promise.all(
      ['UTC', 'Pacific/Kiritimati'].map((zone) =>
        inZone(zone, async (tx) => {
          const [row] = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM signals
            WHERE occurred_at >= ${DAY}::date
              AND occurred_at < '2026-07-16'::date
          `;
          return Number(row.n);
        }),
      ),
    );
    expect(counts[0]).not.toBe(counts[1]);
  });

  it('a row lands in the same PARTITION whichever timezone wrote it', async () => {
    // The partition router reads the same key the WHERE clauses do, so a
    // bound-in-the-wrong-zone insert would silently file a row under the
    // neighbouring month — invisible until a month-scoped read came up short.
    const boundary = new Date('2026-08-01T00:30:00Z');
    const parts = await Promise.all(
      ZONES.map((zone) =>
        inZone(zone, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO signals (signal_id, kind, subject_type, actor_id,
                                 occurred_at, place_id)
            VALUES (gen_random_uuid(), 'search', 'none', ${TEST_ACTOR}::uuid,
                    ${boundary}, gen_random_uuid())
          `;
          const [row] = await tx.$queryRaw<{ part: string }[]>`
            SELECT c.relname AS part FROM signals s
            JOIN pg_class c ON c.oid = s.tableoid
            WHERE s.actor_id = ${TEST_ACTOR}::uuid LIMIT 1
          `;
          return row.part;
        }),
      ),
    );
    expect(new Set(parts)).toEqual(new Set(['signals_p2026_08']));
  });
});
