/**
 * `listRestaurantDishes` ORDER BY IS DETERMINISTIC ON A FULL TIE (F1902) —
 * against a REAL Postgres (integration).
 *
 * Why a DB spec: the defect is the ABSENCE of a final tiebreak key in a raw
 * `$queryRaw` `ORDER BY`. Ties on `display_score`, `mention_count`,
 * `total_upvotes` resolve by physical row order, which Postgres does not
 * guarantee stable across requests/replans — a mock can't demonstrate that,
 * only a real planner deciding real row order can.
 *
 * Two connections are seeded tied on all three ranking keys, with explicit
 * connection_ids chosen so their UUID ordering is the OPPOSITE of their
 * insertion order (insert the lexicographically-larger id first). Without
 * the `c.connection_id ASC` tiebreak, nothing in the query forces the
 * lexicographically-smaller id to sort first — the result can come back in
 * insertion order. With the tiebreak, the result MUST come back in
 * connection_id ASC order regardless of insertion order, which is exactly
 * what this spec asserts.
 *
 * MUTATION-CAPABLE: delete the trailing `c.connection_id ASC` from the
 * `ORDER BY` in `listRestaurantDishes` (search.service.ts) and this spec is
 * free to go RED — nothing else in the query constrains the tied pair's
 * relative order. Verified by running exactly that (see report).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { SearchService } from './search.service';
import { judgedVocabularyDouble } from '../../shared/testing/judged-vocabulary-double';

const TEST_TAG = 'itest-dish-tiebreak';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

// listRestaurantDishes only touches `this.prisma` and `this.logger`; every
// other constructor param is a parameter-property assignment the constructor
// never calls a method on (its body only calls its own env-reading
// `resolve*` helpers), so stubs are safe here.
const service = new SearchService(
  logger,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  prisma as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  judgedVocabularyDouble(),
);

let scoreRunId: string;
const seeded: string[] = [];

// Explicit ids: LOW sorts before HIGH under `connection_id ASC`. We insert
// HIGH first so insertion order is the reverse of the required output order
// — a spec that happened to insert in id order would pass vacuously even
// without the fix.
const LOW_ID = '00000000-0000-4000-8000-000000000001';
const HIGH_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
      recencyReferenceDate: new Date('2026-08-05'),
    },
  });
  scoreRunId = run.scoreRunId;

  const place = await prisma.entity.create({
    data: { name: `${TEST_TAG}-restaurant`, type: 'place' },
  });
  seeded.push(place.entityId);
  await prisma.publicEntityScore.create({
    data: {
      subjectType: 'restaurant',
      subjectId: place.entityId,
      scoreRunId,
      endorsementRaw: 1,
      percentileRank: 0.5,
      displayScore: 5,
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
    },
  });

  for (const [connectionId, label] of [
    [HIGH_ID, 'high-inserted-first'],
    [LOW_ID, 'low-inserted-second'],
  ] as const) {
    const item = await prisma.entity.create({
      data: { name: `${TEST_TAG}-food-${label}`, type: 'item' },
    });
    seeded.push(item.entityId);
    await prisma.connection.create({
      data: {
        connectionId,
        placeId: place.entityId,
        itemId: item.entityId,
        // Tied on every key the ORDER BY reads before the tiebreak.
        mentionCount: 3,
        totalUpvotes: 3,
      },
    });
    await prisma.publicEntityScore.create({
      data: {
        subjectType: 'connection',
        subjectId: connectionId,
        scoreRunId,
        endorsementRaw: 1,
        percentileRank: 0.5,
        // Identical display_score — the first (and coarsest) ranking key.
        displayScore: 7,
        scoreVersion: TEST_TAG,
        displayCurveVersion: TEST_TAG,
      },
    });
  }

  seeded.push(HIGH_ID, LOW_ID);
});

afterAll(async () => {
  await prisma.publicEntityScore.deleteMany({
    where: { scoreVersion: TEST_TAG },
  });
  await prisma.connection.deleteMany({
    where: { connectionId: { in: [HIGH_ID, LOW_ID] } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: seeded } } });
  await prisma.craveScoreRun.deleteMany({ where: { scoreRunId } });
  await prisma.$disconnect();
});

describe('listRestaurantDishes: fully-tied dishes get a deterministic final order (F1902)', () => {
  it('orders the tied pair by connection_id ASC, independent of insertion order, across repeated runs', async () => {
    const placeId = seeded[0];

    // Run several times: a physical-row-order defect is a Postgres planning
    // decision, not guaranteed to flip on every single execution, so a
    // single passing run would not be a reliable RED/GREEN signal either
    // way. Every run must agree with the specified order for this to count
    // as proof of determinism.
    for (let i = 0; i < 5; i++) {
      const dishes = await service.listPlaceDishes(placeId);
      const ids = dishes.map((d) => d.connectionId);
      expect(ids).toEqual([LOW_ID, HIGH_ID]);
    }
  });
});
