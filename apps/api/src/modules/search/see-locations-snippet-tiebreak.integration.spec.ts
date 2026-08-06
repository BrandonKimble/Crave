/**
 * `executeSeeLocations` TOP-SNIPPET ORDER IS DETERMINISTIC ON A TIE (F3102) —
 * against a REAL Postgres (integration).
 *
 * Why a DB spec: the defect is the ABSENCE of a final tiebreak key in a raw
 * `$queryRaw` `ORDER BY pcs.display_score DESC LIMIT 3`. Two dishes tied on
 * display_score resolve by physical row order, which Postgres does not
 * guarantee stable across requests/replans — a mock can't demonstrate that,
 * only a real planner deciding real row order can. Same law as F1902
 * (list-restaurant-dishes-tiebreak.integration.spec.ts), same shape.
 *
 * Two connections are seeded tied on display_score, with explicit
 * connection_ids chosen so their UUID ordering is the OPPOSITE of their
 * insertion order (insert the lexicographically-larger id first). With the
 * `c.connection_id ASC` tiebreak, topFood MUST come back in connection_id
 * ASC order regardless of insertion order.
 *
 * MUTATION-CAPABLE: delete the trailing `, c.connection_id ASC` from the
 * snippet `ORDER BY` in `executeSeeLocations` (search-query.executor.ts) and
 * this spec is free to go RED — nothing else in the query constrains the
 * tied pair's relative order.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { SearchQueryExecutor } from './search-query.executor';

const TEST_TAG = 'itest-see-locations-tiebreak';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

// executeSeeLocations only touches `this.prisma` (two raw reads) and the
// pure mapping helpers — the query builder is never consulted on this path.
const executor = new SearchQueryExecutor(logger, prisma as never, {} as never);

let scoreRunId: string;
const seeded: string[] = [];

// Explicit ids: LOW sorts before HIGH under `connection_id ASC`. We insert
// HIGH first so insertion order is the reverse of the required output order
// — a spec that happened to insert in id order would pass vacuously even
// without the fix.
const LOW_ID = '00000000-0000-4000-8000-00000000f102';
const HIGH_ID = 'ffffffff-ffff-4fff-8fff-fffffffff102';

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

  const restaurant = await prisma.entity.create({
    data: { name: `${TEST_TAG}-restaurant`, type: 'restaurant' },
  });
  seeded.push(restaurant.entityId);

  for (const [connectionId, label] of [
    [HIGH_ID, 'high-inserted-first'],
    [LOW_ID, 'low-inserted-second'],
  ] as const) {
    const food = await prisma.entity.create({
      data: { name: `${TEST_TAG}-food-${label}`, type: 'food' },
    });
    seeded.push(food.entityId);
    await prisma.connection.create({
      data: {
        connectionId,
        restaurantId: restaurant.entityId,
        foodId: food.entityId,
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
        // Identical display_score — the ONLY ranking key before the tiebreak.
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

describe('executeSeeLocations: tied top snippets get a deterministic order (F3102)', () => {
  it('orders the tied pair by connection_id ASC, independent of insertion order, across repeated runs', async () => {
    const restaurantId = seeded[0];

    // Run several times: a physical-row-order defect is a Postgres planning
    // decision, not guaranteed to flip on every single execution. Every run
    // must agree with the specified order for this to count as determinism.
    for (let i = 0; i < 5; i++) {
      const { restaurant } = await executor.executeSeeLocations({
        restaurantId,
        bounds: null,
      });
      const ids = (restaurant?.topFood ?? []).map((s) => s.connectionId);
      expect(ids).toEqual([LOW_ID, HIGH_ID]);
    }
  });
});
