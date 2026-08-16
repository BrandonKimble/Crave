/**
 * COVERAGE DOTS HAVE A TOTAL ORDER (F3802/F1902) — against a REAL Postgres
 * (integration).
 *
 * THE CATCH THIS SPEC EXISTS FOR: the coverage ORDER BY ended
 * `... e.entity_id ASC`, which LOOKS like the unique tail the determinism law
 * asks for. It is not. `selected_locations` emits one row PER LOCATION and the
 * join is `pl.restaurant_id = e.entity_id`, so a multi-location restaurant
 * yields N rows sharing entity_id AND every score value — fully tied, ordered
 * by nothing. `rank: index + 1` is assigned off that order and the mobile LOD
 * group budget consumes it (pin-vs-dot promotion), so the arbitrary choice is
 * user-visible on the map.
 *
 * THE SEED IS ADVERSARIAL: one restaurant, two in-view locations, explicit
 * location_ids chosen so their UUID order is the REVERSE of insertion order.
 * A spec that happened to insert in id order would pass vacuously.
 *
 * MUTATION: drop `pl.location_id ASC` from `locationTiebreakSql` in
 * search-coverage.service.ts — this spec is then free to go RED (nothing else
 * in the query constrains the tied pair). Verified in both directions.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { SearchCoverageService } from './search-coverage.service';
import { DietaryConstraintRegistry } from './dietary-constraints';

const TEST_TAG = 'itest-coverage-loc-tiebreak';

// A viewport nobody's real data occupies, distinct from the archived-leak
// spec's, so the two never see each other's seeds.
const LNG = -31.75;
const LAT = 13.5;
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
  logger,
);

type Feature = { properties: Record<string, unknown> };

// LOW sorts before HIGH under `location_id ASC`; HIGH is inserted FIRST.
const LOW_LOCATION_ID = '00000000-0000-4000-8000-0000000000a1';
const HIGH_LOCATION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffa1';

let scoreRunId: string;
let placeId: string;
const seeded: string[] = [];

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

  const entity = await prisma.entity.create({
    data: { name: `${TEST_TAG}-restaurant`, type: 'place' },
  });
  placeId = entity.entityId;
  seeded.push(placeId);

  // Insertion order is the REVERSE of the required output order.
  for (const [index, locationId] of [
    HIGH_LOCATION_ID,
    LOW_LOCATION_ID,
  ].entries()) {
    await prisma.placeLocation.create({
      data: {
        locationId,
        placeId,
        googlePlaceId: `${TEST_TAG}-place-${index}`,
        address: `${index} Test Way`,
        longitude: LNG + index * 0.001,
        latitude: LAT + index * 0.001,
      },
    });
  }

  const item = await prisma.entity.create({
    data: { name: `${TEST_TAG}-food`, type: 'item' },
  });
  seeded.push(item.entityId);
  await prisma.connection.create({
    data: { placeId, itemId: item.entityId },
  });
  await prisma.publicEntityScore.create({
    data: {
      subjectType: 'restaurant',
      subjectId: placeId,
      scoreRunId,
      endorsementRaw: 1,
      // Both location rows read THIS one score row, so they are tied on every
      // ranking key the ORDER BY consults before the tiebreak.
      percentileRank: 0.5,
      displayScore: 8,
      scoreVersion: TEST_TAG,
      displayCurveVersion: TEST_TAG,
    },
  });
});

afterAll(async () => {
  await prisma.publicEntityScore.deleteMany({
    where: { scoreVersion: TEST_TAG },
  });
  await prisma.connection.deleteMany({ where: { placeId } });
  await prisma.placeLocation.deleteMany({ where: { placeId } });
  await prisma.entity.deleteMany({ where: { entityId: { in: seeded } } });
  await prisma.craveScoreRun.deleteMany({ where: { scoreRunId } });
  await prisma.$disconnect();
});

describe('shortcut coverage: fully-tied locations of one restaurant get a total order (F3802)', () => {
  async function coverageLocationIds(): Promise<unknown[]> {
    const geojson = (await service.buildShortcutCoverageGeoJson({
      bounds: BOUNDS,
    } as never)) as { features: Feature[] };
    return geojson.features
      .filter((f) => f.properties.placeId === placeId)
      .map((f) => f.properties.locationId);
  }

  it('orders the tied pair by location_id ASC, independent of insertion order', async () => {
    const ids = await coverageLocationIds();
    expect(ids).toEqual([LOW_LOCATION_ID, HIGH_LOCATION_ID]);
  });

  it('assigns rank off that order, so the LOD pin-vs-dot budget is reproducible', async () => {
    const first = await coverageLocationIds();
    const second = await coverageLocationIds();
    expect(second).toEqual(first);
  });
});
