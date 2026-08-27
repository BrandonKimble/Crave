/**
 * THE COVERAGE/DOTS LAYER NEVER PAINTS AN ARCHIVED RESTAURANT (F510) — against
 * a REAL Postgres (integration).
 *
 * Why a DB spec: `buildShortcutCoverageGeoJson` is raw SQL. The leak it closed
 * is a MISSING PREDICATE (`e.status <> 'archived'`) inside a `$queryRaw`, and a
 * source-text scan of a WHERE clause proves spelling, not behaviour. The
 * condition is LATENT in prod (an archived restaurant that still holds a
 * public score row is possible but not currently common), so this spec CREATES
 * it: two identical, in-view, scored, dish-bearing restaurants that differ only
 * in `status`.
 *
 * MUTATION-CAPABLE (the whole point): delete the `e.status <> 'archived'`
 * condition from search-coverage.service.ts and case 1 goes RED — the archived
 * twin appears in the feature collection. Verified by running exactly that.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { SearchCoverageService } from './search-coverage.service';
import { DietaryConstraintRegistry } from './dietary-constraints';

const TEST_TAG = 'itest-coverage-archived';

// A deliberately absurd viewport nobody's real data occupies (null island,
// mid-Atlantic) so this spec sees ONLY its own seeds.
const LNG = -30.5;
const LAT = 12.25;
const BOUNDS = {
  northEast: { lng: LNG + 0.05, lat: LAT + 0.05 },
  southWest: { lng: LNG - 0.05, lat: LAT - 0.05 },
};

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

// The REAL DietaryConstraintRegistry, not a stub: a hand-shaped stub went
// stale the moment the registry's method was renamed and this spec broke on
// a TypeError instead of the behaviour it exists to prove.
const service = new SearchCoverageService(
  prisma as never,
  new DietaryConstraintRegistry(prisma as never, logger),
  { getCuisineIds: () => Promise.resolve(new Set()) } as never,
  logger,
);

type Feature = { properties: Record<string, unknown> };

let scoreRunId: string;
const seeded: string[] = [];

async function seedPlace(opts: {
  label: string;
  status: 'active' | 'archived';
  offset: number;
}): Promise<string> {
  const name = `${TEST_TAG}-${opts.label}`;
  const entity = await prisma.entity.create({
    data: { name, type: 'place', status: opts.status },
  });
  seeded.push(entity.entityId);
  await prisma.placeLocation.create({
    data: {
      placeId: entity.entityId,
      googlePlaceId: `${TEST_TAG}-place-${opts.label}`,
      address: '1 Test Way',
      longitude: LNG + opts.offset,
      latitude: LAT + opts.offset,
    },
  });
  // Eligibility floor: a catalogued dish. The food entity is shared-safe (its
  // own row, tagged and cleaned up with the rest).
  const item = await prisma.entity.create({
    data: { name: `${TEST_TAG}-food-${opts.label}`, type: 'item' },
  });
  seeded.push(item.entityId);
  await prisma.connection.create({
    data: { placeId: entity.entityId, itemId: item.entityId },
  });
  // A public score row — the coverage query INNER JOINs it, and its presence on
  // an archived entity is precisely the state that makes the leak observable.
  await prisma.publicEntityScore.create({
    data: {
      subjectType: 'restaurant',
      subjectId: entity.entityId,
      scoreRunId,
      endorsementRaw: 1,
      percentileRank: 0.5,
      displayScore: 8,
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
    },
  });
  return entity.entityId;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL predicate and must not be skipped',
    );
  }
  const run = await prisma.craveScoreRun.create({
    data: {
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
      displayMin: 0,
      displayMax: 10,
      recencyReferenceDate: new Date('2026-08-02'),
    },
  });
  scoreRunId = run.scoreRunId;
});

afterAll(async () => {
  await prisma.publicEntityScore.deleteMany({
    where: { scoreVersion: TEST_TAG },
  });
  await prisma.connection.deleteMany({
    where: { placeId: { in: seeded } },
  });
  await prisma.placeLocation.deleteMany({
    where: { placeId: { in: seeded } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: seeded } } });
  await prisma.craveScoreRun.deleteMany({ where: { scoreRunId } });
  await prisma.$disconnect();
});

describe('shortcut coverage: archived restaurants are never painted (F510)', () => {
  it('paints the active restaurant and DROPS its archived twin', async () => {
    const activeId = await seedPlace({
      label: 'active',
      status: 'active',
      offset: 0,
    });
    const archivedId = await seedPlace({
      label: 'archived',
      status: 'archived',
      offset: 0.01,
    });

    const geojson = (await service.buildShortcutCoverageGeoJson({
      bounds: BOUNDS,
    } as never)) as { features: Feature[] };

    const paintedIds = geojson.features.map((f) => f.properties.placeId);
    // Both twins are in view, scored and dish-bearing — the ONLY difference is
    // status, so this pair isolates the predicate.
    expect(paintedIds).toContain(activeId);
    expect(paintedIds).not.toContain(archivedId);
  });
});
