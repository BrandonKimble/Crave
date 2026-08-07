/**
 * THE FOURTH READER OF signal_demand_daily SPEAKS THE §4 LAW — asked of Postgres.
 *
 * F4000 / D76's precedent. act-identity.ts's header records the disease: several
 * readers of the daily aggregate implemented the daily-acts law differently, so
 * the same table answered the same question different ways. The cure was a
 * BUILDER "that cannot be half-adopted" — kind IN the grain, echo kinds
 * excluded, entity-subject filter applied. `territoryEntityDemand`,
 * `territoryEntityTrend` (F3500) and the demand-mass arm all call it.
 * `globalEntityDemand` hand-rolled `SUM(a.signal_count)` straight against the
 * table twenty lines below the builder.
 *
 * The deciding measurement (F4000's NEEDS-TRIAGE question) is the two
 * assertions below, and they split:
 *
 *  - The KIND-GRAIN leg was already correct here. A flat `SUM` over the daily
 *    rows sums the per-kind rows, so two kinds by one actor on one day were
 *    always two acts. This is why the raw SUM survived three audits.
 *  - The ECHO leg was NOT. `ECHO_SIGNAL_KINDS` are excluded by every other
 *    reader and were included by this one, so an echo row moved the
 *    local-specialization factor that this map feeds. Measured before the fix:
 *    an on_demand_ask row of 40 took the score from 3.1699 to 5.6147.
 *
 * The second assertion is therefore the finding; the first is the control that
 * proves the routing did not change the answer it already got right.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { SignalDemandReadService } from './signal-demand-read.service';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

const ENTITY = '00000000-0000-4000-8000-000000f40000';
const ACTOR = '00000000-0000-4000-8000-000000f40001';

const prisma = new PrismaClient();
const reads = new SignalDemandReadService(prisma as never, LOG);

/** Today in UTC — the window and the recency weight are anchored on the UTC day. */
const TODAY = new Date().toISOString().slice(0, 10);

/** place_id NULL is what makes a row GLOBAL — every signal counted once. */
async function addRow(kind: string, signalCount: number) {
  await prisma.$executeRaw`
    INSERT INTO signal_demand_daily
      (row_id, day, place_id, actor_id, kind, subject_type, subject_id,
       signal_count, last_occurred_at)
    VALUES (gen_random_uuid(), ${TODAY}::date, NULL, ${ACTOR}::uuid,
            ${kind}, 'entity', ${ENTITY}::uuid, ${signalCount}, now())
  `;
}

async function cleanup() {
  await prisma.$executeRaw`DELETE FROM signal_demand_daily WHERE actor_id = ${ACTOR}::uuid`;
}

const score = async () =>
  (
    await reads.globalEntityDemand({
      entityIds: [ENTITY],
      windowDays: 7,
    })
  ).get(ENTITY);

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped daily-acts test proves nothing.',
    );
  }
  await prisma.$connect();
});

// Per-case, not per-file: the two cases seed the same (entity, actor, day) and
// a shared corpus makes each case's arithmetic depend on the one before it.
beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('globalEntityDemand speaks the §4 daily-acts law', () => {
  it('SUMS two kinds by one actor on one day (the leg the raw SUM already had right)', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);

    // 3 + 5 acts on day 0 (recency weight 1), scored LN(1+acts)/LN(2) = log2(9).
    expect(await score()).toBeCloseTo(Math.log2(9), 6);
  });

  it('does not let an ECHO kind move the score', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);
    const before = await score();

    await addRow('on_demand_ask', 40);

    // Before the builder routing this read log2(49) = 5.6147 — an echo of the
    // system's own asking, inflating the local-specialization factor by 77%.
    expect(await score()).toBeCloseTo(before as number, 6);
  });
});
