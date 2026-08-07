/**
 * THE FIFTH READER OF signal_demand_daily SPEAKS THE §4 LAW — asked of Postgres.
 *
 * F6800 / D113. `entityDemandScores` is the general per-entity demand read —
 * the one the F4000 row's subject was named after — and it hand-rolled
 * `SUM(a.signal_count * recency)` straight against the daily table two screens
 * above the sibling F4000 had just routed. Same two missing legs: no
 * ECHO_SIGNAL_KINDS exclusion, no entity-subject filter. Its kind arithmetic
 * was right for the same reason globalEntityDemand's was — a flat SUM over the
 * per-kind rows already sums them.
 *
 * What made this a ROW and not a copy of the F4000 commit: this reader takes an
 * optional `kinds` lane filter, and a LIVE caller asks for an echo kind on
 * purpose — autocomplete.service.ts calls loadAttributeDemandSupport with
 * `['autocomplete_selection']`, which IS an echo kind. D113 ruled it by the
 * doctrine's own text (signals.service.ts, ECHO_SIGNAL_KINDS): "Kind-FILTERED
 * readers ... keep reading echo rows directly — there the echo IS the act being
 * asked about." `kinds` is a lane selector WITHIN the law. So the exclusion
 * binds the UNFILTERED read only, and the last case here is that ruling made
 * executable: pasting the exclusion in unconditionally would silently zero
 * autocomplete's attribute-selection support, and this test goes RED if anyone
 * ever does.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { SignalDemandReadService } from './signal-demand-read.service';
import type { SignalKind } from './signals.service';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

const ENTITY = '00000000-0000-4000-8000-000000680000';
const ACTOR = '00000000-0000-4000-8000-000000680001';

const prisma = new PrismaClient();
const reads = new SignalDemandReadService(prisma as never, LOG);

/** Today in UTC — the window and the recency weight are anchored on the UTC day. */
const TODAY = new Date().toISOString().slice(0, 10);

/** place_id NULL is what makes a row GLOBAL — every signal counted once. */
async function addRow(
  kind: string,
  signalCount: number,
  subjectType: 'entity' | 'term' = 'entity',
) {
  await prisma.$executeRaw`
    INSERT INTO signal_demand_daily
      (row_id, day, place_id, actor_id, kind, subject_type, subject_id,
       signal_count, last_occurred_at)
    VALUES (gen_random_uuid(), ${TODAY}::date, NULL, ${ACTOR}::uuid,
            ${kind}, ${subjectType}, ${ENTITY}::uuid, ${signalCount}, now())
  `;
}

async function cleanup() {
  await prisma.$executeRaw`DELETE FROM signal_demand_daily WHERE actor_id = ${ACTOR}::uuid`;
}

const score = async (kinds?: SignalKind[]) =>
  (
    await reads.entityDemandScores({
      entityIds: [ENTITY],
      windowDays: 7,
      ...(kinds ? { kinds } : {}),
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

// Per-case, not per-file: the cases seed the same (entity, actor, day) and a
// shared corpus makes each case's arithmetic depend on the one before it.
beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('entityDemandScores speaks the §4 daily-acts law', () => {
  it('SUMS two kinds by one actor on one day (the leg the raw SUM already had right)', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);

    // 3 + 5 acts on day 0 (recency weight 1), scored LN(1+acts)/LN(2) = log2(9).
    expect(await score()).toBeCloseTo(Math.log2(9), 6);
  });

  it('does not let an ECHO kind move the UNFILTERED score', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);
    const before = await score();

    await addRow('on_demand_ask', 40);

    expect(await score()).toBeCloseTo(before as number, 6);
  });

  it('does not count a NON-entity-subject row', async () => {
    await addRow('search', 3);
    await addRow('entity_view', 5);
    const before = await score();

    await addRow('search', 40, 'term');

    expect(await score()).toBeCloseTo(before as number, 6);
  });

  it('STILL returns the echo lane when a caller selects it explicitly', async () => {
    // Autocomplete's attribute-selection support, exactly as it asks for it.
    await addRow('autocomplete_selection', 7);

    // RED if the echo exclusion is applied unconditionally: the lane zeroes and
    // the map comes back empty.
    expect(await score(['autocomplete_selection'])).toBeCloseTo(
      Math.log2(8),
      6,
    );
  });
});
