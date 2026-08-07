/**
 * matched_tags LIMIT 5 CUT IS DETERMINISTIC ON A FULL TIE (F7602) — against a
 * REAL Postgres (integration).
 *
 * THE DEFECT: the matched-tags subquery (search-query.builder.ts) cuts a
 * restaurant's matched signal rows with
 *   `ORDER BY res.mention_count DESC, e.name ASC LIMIT 5`.
 * The final key is a NAME, and the subquery does not restrict entity type, so
 * two DIFFERENT entities of different types sharing a name AND a mention_count
 * are fully tied — the LIMIT admits or drops them arbitrarily (physical row
 * order, which Postgres does not guarantee stable). Measured on the local
 * corpus: 510 (restaurant_id, name, mention_count) groups hold more than one
 * distinct signal entity. The fix adds `res.entity_id ASC` as the unique tail.
 *
 * THE SEED IS ADVERSARIAL: four un-tied tags fill ranks 1-4; two entities of
 * DIFFERENT types share the same name and mention_count and straddle the
 * LIMIT 5 / rank 6 boundary. Their entity_ids are chosen so the required
 * survivor (LOW id) is inserted SECOND — a spec that happened to insert in id
 * order would pass vacuously even without the fix.
 *
 * MUTATION-CAPABLE: delete the trailing `, res.entity_id ASC` from the
 * subquery ORDER BY and the first test (rendered-SQL structure) goes RED
 * deterministically. The matched_tags subquery is NOT reproduced in the
 * builder's `preview` string (unlike the sibling ORDER BYs asserted by
 * search-selected-location-order.spec.ts), so this reads the rendered SQL of
 * the built query directly — the same module idiom, applied to the SQL that
 * carries this clause. The second test is a real-DB correctness proof that
 * the cut runs and keeps the entity_id-ASC survivor (behavioural, but Postgres
 * happens to sort this small tie stably, so it is a smoke check, not the
 * mutation gate).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { SearchQueryBuilder } from './search-query.builder';
import type { QueryPlan } from './dto/search-query.dto';

const TEST_TAG = 'itest-matched-tags-tiebreak';

const prisma = new PrismaClient();

const RESTAURANT_ID = '77777777-7777-4777-8777-777777776020';
const FOOD_ID = '77777777-7777-4777-8777-777777776021';

// The four un-tied tags (distinct mention_counts → ranks 1-4).
const HIGH_TAGS = [
  { id: '77777777-7777-4777-8777-77777777601a', name: `${TEST_TAG}-a`, mc: 10 },
  { id: '77777777-7777-4777-8777-77777777601b', name: `${TEST_TAG}-b`, mc: 9 },
  { id: '77777777-7777-4777-8777-77777777601c', name: `${TEST_TAG}-c`, mc: 8 },
  { id: '77777777-7777-4777-8777-77777777601d', name: `${TEST_TAG}-d`, mc: 7 },
];

// The fully-tied cross-type pair (same name, same mention_count 5 → ranks 5/6).
// LOW sorts before HIGH under entity_id ASC and MUST be the survivor. HIGH is
// inserted first so insertion order is the reverse of the required output.
const TIE_NAME = `${TEST_TAG}-tie`;
const TIE_MC = 5;
const TIE_LOW_ID = '77777777-7777-4777-8777-7777777760a1';
const TIE_HIGH_ID = 'ffffffff-ffff-4fff-8fff-fffffffff602';

const allTagIds = [...HIGH_TAGS.map((t) => t.id), TIE_HIGH_ID, TIE_LOW_ID];

let scoreRunId: string;

function buildPlan(): QueryPlan {
  return {
    format: 'dual_list',
    restaurantFilters: [],
    // FOOD_ATTRIBUTE-scoped filter → signalMatch = res.entity_id = ANY(ids).
    // collectEntityIds keys off the filter scope, not the entities' true
    // types, so the cross-type pair both land in the match set.
    connectionFilters: [
      {
        scope: 'connection',
        description: 'test tags',
        entityType: 'food_attribute',
        entityIds: allTagIds,
      },
    ],
    ranking: {
      foodOrder: 'crave_score DESC',
      restaurantOrder: 'crave_score DESC',
    },
    diagnostics: { missingEntities: [], notes: [] },
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL ORDER BY and must not be skipped',
    );
  }

  const run = await prisma.craveScoreRun.create({
    data: {
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
      displayMin: 0,
      displayMax: 10,
      recencyReferenceDate: new Date('2026-08-06'),
    },
  });
  scoreRunId = run.scoreRunId;

  await prisma.entity.create({
    data: {
      entityId: RESTAURANT_ID,
      name: `${TEST_TAG}-restaurant`,
      type: 'restaurant',
    },
  });
  await prisma.publicEntityScore.create({
    data: {
      subjectType: 'restaurant',
      subjectId: RESTAURANT_ID,
      scoreRunId,
      endorsementRaw: 1,
      percentileRank: 0.5,
      displayScore: 5,
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
    },
  });
  await prisma.restaurantLocation.create({
    data: {
      restaurantId: RESTAURANT_ID,
      // filtered_locations requires google_place_id AND address non-null.
      googlePlaceId: `${TEST_TAG}-place`,
      address: '1 Test St, Austin, TX',
      latitude: 30.27,
      longitude: -97.74,
      isPrimary: true,
    },
  });

  // Inventory floor: EXISTS a core_restaurant_items row for the restaurant.
  await prisma.entity.create({
    data: { entityId: FOOD_ID, name: `${TEST_TAG}-food`, type: 'food' },
  });
  await prisma.connection.create({
    data: { restaurantId: RESTAURANT_ID, foodId: FOOD_ID, mentionCount: 1 },
  });

  // Un-tied tags.
  for (const t of HIGH_TAGS) {
    await prisma.entity.create({
      data: { entityId: t.id, name: t.name, type: 'food_attribute' },
    });
    await prisma.restaurantEntitySignal.create({
      data: {
        restaurantId: RESTAURANT_ID,
        entityId: t.id,
        entityType: 'food_attribute',
        mentionCount: t.mc,
      },
    });
  }

  // The tied cross-type pair — HIGH id inserted FIRST, different types, same
  // name and mention_count.
  await prisma.entity.create({
    data: {
      entityId: TIE_HIGH_ID,
      name: TIE_NAME,
      type: 'restaurant_attribute',
    },
  });
  await prisma.restaurantEntitySignal.create({
    data: {
      restaurantId: RESTAURANT_ID,
      entityId: TIE_HIGH_ID,
      entityType: 'restaurant_attribute',
      mentionCount: TIE_MC,
    },
  });
  await prisma.entity.create({
    data: { entityId: TIE_LOW_ID, name: TIE_NAME, type: 'food_attribute' },
  });
  await prisma.restaurantEntitySignal.create({
    data: {
      restaurantId: RESTAURANT_ID,
      entityId: TIE_LOW_ID,
      entityType: 'food_attribute',
      mentionCount: TIE_MC,
    },
  });
});

afterAll(async () => {
  await prisma.restaurantEntitySignal.deleteMany({
    where: { restaurantId: RESTAURANT_ID },
  });
  await prisma.connection.deleteMany({
    where: { restaurantId: RESTAURANT_ID },
  });
  await prisma.restaurantLocation.deleteMany({
    where: { restaurantId: RESTAURANT_ID },
  });
  await prisma.publicEntityScore.deleteMany({
    where: { scoreVersion: TEST_TAG },
  });
  await prisma.entity.deleteMany({
    where: { entityId: { in: [RESTAURANT_ID, FOOD_ID, ...allTagIds] } },
  });
  await prisma.craveScoreRun.deleteMany({ where: { scoreRunId } });
  await prisma.$disconnect();
});

// Re-seed the tied cross-type pair in a chosen PHYSICAL insertion order. The
// tail's whole job is to make the LIMIT 5 cut independent of physical/heap
// order; a query WITHOUT it resolves the tie by heap order, so the two
// insertion orders can disagree on the survivor. With the tail both agree.
async function reseedTiedPair(
  firstId: string,
  secondId: string,
): Promise<void> {
  await prisma.restaurantEntitySignal.deleteMany({
    where: {
      restaurantId: RESTAURANT_ID,
      entityId: { in: [TIE_LOW_ID, TIE_HIGH_ID] },
    },
  });
  for (const id of [firstId, secondId]) {
    await prisma.restaurantEntitySignal.create({
      data: {
        restaurantId: RESTAURANT_ID,
        entityId: id,
        entityType:
          id === TIE_LOW_ID ? 'food_attribute' : 'restaurant_attribute',
        mentionCount: TIE_MC,
      },
    });
  }
}

async function survivorOfTie(): Promise<string[]> {
  const { dataSql } = new SearchQueryBuilder().buildRestaurantQuery({
    plan: buildPlan(),
    pagination: { skip: 0, take: 5 },
    searchCenter: { lat: 30.27, lng: -97.74 },
  });
  const rows =
    await prisma.$queryRaw<
      Array<{ restaurant_id: string; matched_tags: unknown }>
    >(dataSql);
  const row = rows.find((r) => r.restaurant_id === RESTAURANT_ID);
  expect(row).toBeDefined();
  const tags = row!.matched_tags as Array<{ entityId: string }>;
  expect(tags).toHaveLength(5); // the cut kept 5 tags total
  return tags
    .map((t) => t.entityId)
    .filter((id) => id === TIE_LOW_ID || id === TIE_HIGH_ID);
}

describe('matched_tags: the fully-tied cross-type pair straddling LIMIT 5 is cut deterministically (F7602)', () => {
  it('THE MUTATION GATE: the matched_tags subquery ORDER BY carries the res.entity_id ASC unique tail', () => {
    const { dataSql } = new SearchQueryBuilder().buildRestaurantQuery({
      plan: buildPlan(),
      pagination: { skip: 0, take: 5 },
      searchCenter: { lat: 30.27, lng: -97.74 },
    });
    // Rendered SQL, comments stripped, whitespace collapsed.
    const rendered = (dataSql as unknown as { sql: string }).sql
      .replace(/--[^\n]*/g, ' ')
      .replace(/\s+/g, ' ');
    expect(rendered).toContain(
      'ORDER BY res.mention_count DESC, e.name ASC, res.entity_id ASC LIMIT 5',
    );
  });

  it('keeps the SAME (entity_id-ASC) survivor regardless of physical insertion order', async () => {
    // HIGH inserted first, then LOW.
    await reseedTiedPair(TIE_HIGH_ID, TIE_LOW_ID);
    const withHighFirst = await survivorOfTie();

    // LOW inserted first, then HIGH — the opposite heap order.
    await reseedTiedPair(TIE_LOW_ID, TIE_HIGH_ID);
    const withLowFirst = await survivorOfTie();

    // The tail forces the entity_id-ASC winner in BOTH orders. Without it, the
    // heap-order tie makes these two disagree (RED).
    expect(withHighFirst).toEqual([TIE_LOW_ID]);
    expect(withLowFirst).toEqual([TIE_LOW_ID]);
  });
});
