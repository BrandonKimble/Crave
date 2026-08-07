/**
 * TWO KINDS ON ONE DAY ARE TWO ACTS — asked of Postgres.
 *
 * F3500 / D76. act-identity.ts's header records the disease it was written to
 * cure: two readers of signal_demand_daily implemented the §4 daily-acts law
 * differently, so the same table answered the same question two ways. The cure
 * was a BUILDER "that cannot be half-adopted" — kind IN the grain, echo kinds
 * excluded, entity-subject filter applied. `territoryEntityDemand` calls it and
 * carries the war story in a comment. Twenty lines below, `territoryEntityTrend`
 * hand-rolled the law a THIRD time and got all three legs wrong.
 *
 * The trend feeds explore's surge factor, so an entity could read flat here
 * while demand mass said it had doubled — the exact same-table-different-answer
 * defect. These two assertions are the finding's proving mutations, in order.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { SignalDemandReadService } from './signal-demand-read.service';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

const ENTITY = '00000000-0000-4000-8000-000000f35000';
const ACTOR = '00000000-0000-4000-8000-000000f35001';
const PLACE = '00000000-0000-4000-8000-000000f35002';

const prisma = new PrismaClient();
const reads = new SignalDemandReadService(prisma as never, LOG);

/** Today in UTC — the trend's current window is anchored on the UTC day. */
const TODAY = new Date().toISOString().slice(0, 10);

async function addRow(kind: string, signalCount: number) {
  await prisma.$executeRaw`
    INSERT INTO signal_demand_daily
      (row_id, day, place_id, actor_id, kind, subject_type, subject_id,
       signal_count, last_occurred_at)
    VALUES (gen_random_uuid(), ${TODAY}::date, ${PLACE}::uuid, ${ACTOR}::uuid,
            ${kind}, 'entity', ${ENTITY}::uuid, ${signalCount}, now())
  `;
}

async function cleanup() {
  await prisma.$executeRaw`DELETE FROM signal_demand_daily WHERE actor_id = ${ACTOR}::uuid`;
}

const trend = async () =>
  (
    await reads.territoryEntityTrend({
      placeIds: [PLACE],
      entityIds: [ENTITY],
      trendWindowDays: 7,
    })
  ).get(ENTITY);

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped daily-acts test proves nothing.',
    );
  }
  await prisma.$connect();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('territoryEntityTrend speaks the §4 daily-acts law', () => {
  it('SUMS two kinds by one actor on one day instead of taking the larger', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);

    // 3 + 5. Without kind in the grain this is MAX(3,5) = 5 — the exact
    // under-count act-identity.ts's builder exists to make unspellable.
    expect((await trend())?.currentActs).toBe(8);
  });

  it('does not move when an ECHO of an act it already counted arrives', async () => {
    // on_demand_ask is by construction an echo of a parent 'search' act; the
    // parent already carries the act's weight-1. Counting it again would
    // inflate the surge factor by up to 6x on exactly the failing searches
    // that mint the most echo rows.
    await addRow('on_demand_ask', 40);

    expect((await trend())?.currentActs).toBe(8);
  });
});
