/**
 * THE VIEWPORT CAP OBEYS THE LAW IT WAS CHOSEN FOR — against a REAL PostGIS.
 *
 * Why this file exists (F371/D30). `PLACES_IN_VIEW_CANDIDATE_CAP = 400` exists
 * because an unbounded world-span read seq-scanned every ground and serialized
 * 11 MB of GeoJSON per request from an endpoint reachable at 100/min
 * UNAUTHENTICATED. Its unit test asserted `expect(sql).toContain('LIMIT')`.
 * EXECUTED MUTATION: set the cap to 1 — the §2.5 dominator law then sees a
 * single candidate and the header verdict silently changes at every zoom —
 * and places-catalog + places.controller stayed 33/33 GREEN. Any cap value
 * satisfies "contains LIMIT", including one that breaks the law the cap was
 * chosen to protect.
 *
 * The cap's justification is a RELATIONSHIP, not a spelling: ordered by ground
 * area DESC, the cap can never drop a candidate that could have won, because a
 * place holding >= 1/3 of the view (attention) is by definition among the
 * largest present. So that is what is asserted here — seed MORE grounds than
 * the cap, of which a known handful can clear 1/3, and prove every one of them
 * survives the cap. A cap of 1 turns this RED.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import {
  PLACES_IN_VIEW_CANDIDATE_CAP,
  PlacesCatalogService,
} from './places-catalog.service';

const TEST_TAG = 'itest-viewport-cap';
/** A 1°×1° box in the open Pacific — no real place in the corpus reaches it,
 *  so the cap is contested only by this spec's own fixtures. */
const VIEW = { minLat: 0, minLng: -150, maxLat: 1, maxLng: -149 };
/** The attention floor of the §2.5 law: a place below it can change no
 *  verdict, which is the entire argument for dropping the tail. */
const ATTENTION_FRACTION = 1 / 3;

const prisma = new PrismaClient();
const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;
const service = new PlacesCatalogService(prisma as never, logger);

const bigNames: string[] = [];

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM places WHERE provider = '${TEST_TAG}'`,
  );
}

async function seed(name: string, wkt: string): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ place_id: string }>>(
    `INSERT INTO places (name, provider_level_code, country_code, provider,
                         parent_place_ids)
     VALUES ($1, 'locality', 'US', '${TEST_TAG}', ARRAY[]::uuid[])
     RETURNING place_id`,
    name,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
     VALUES ($1::uuid, NULL, now(), ST_Multi(ST_GeomFromText($2, 4326)))`,
    row.place_id,
    wkt,
  );
}

const box = (
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): string =>
  `POLYGON((${minLng} ${minLat},${maxLng} ${minLat},${maxLng} ${maxLat},${minLng} ${maxLat},${minLng} ${minLat}))`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'places-viewport-cap.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await cleanup();

  // Five places that CAN clear 1/3 of the view, at descending sizes so their
  // rank order is deterministic and none of them is the trivial largest.
  for (let i = 0; i < 5; i += 1) {
    const pad = i * 0.05;
    const name = `${TEST_TAG}:attention-${i}`;
    bigNames.push(name);
    await seed(
      name,
      box(-150 - 0.5 + pad, 0 - 0.5 + pad, -149 + 0.5 - pad, 1 + 0.5 - pad),
    );
  }

  // …and MORE tiny places than the cap, all inside the view. Each is far
  // below the attention floor, so the law can never name one — they are
  // exactly the tail the cap exists to drop.
  const tinyCount = PLACES_IN_VIEW_CANDIDATE_CAP + 50;
  await prisma.$executeRawUnsafe(
    `WITH ins AS (
       INSERT INTO places (name, provider_level_code, country_code, provider,
                           parent_place_ids)
       SELECT '${TEST_TAG}:tiny-' || i, 'locality', 'US', '${TEST_TAG}',
              ARRAY[]::uuid[]
         FROM generate_series(1, ${tinyCount}) AS i
       RETURNING place_id
     ), numbered AS (
       SELECT place_id, row_number() OVER () AS n FROM ins
     )
     INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
     SELECT place_id, NULL, now(),
            ST_Multi(ST_MakeEnvelope(
              -149.9 + (n % 100) * 0.001, 0.1,
              -149.9 + (n % 100) * 0.001 + 0.0005, 0.1005, 4326))
       FROM numbered`,
  );
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('the viewport cap cannot drop a place that could have won (§2.5)', () => {
  it('every seeded place that clears the attention floor survives the cap', async () => {
    const results = await service.placesInView(VIEW);
    const mine = results.filter((r) => r.place.provider === TEST_TAG);

    // Premise check: the fixtures really do clear the floor. If this fails the
    // test below proves nothing, so it is asserted, not assumed.
    const attentionCapable = mine.filter(
      (r) => r.coverageOfView >= ATTENTION_FRACTION,
    );
    expect(attentionCapable.map((r) => r.place.name).sort()).toEqual(
      [...bigNames].sort(),
    );

    // Premise check: the tail really does exceed the cap, so the cap is under
    // genuine pressure rather than idle.
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM places WHERE provider = '${TEST_TAG}'`,
    );
    expect(Number(count)).toBeGreaterThan(PLACES_IN_VIEW_CANDIDATE_CAP);

    // THE LAW: the cap dropped only the tail.
    expect(mine.length).toBeLessThanOrEqual(PLACES_IN_VIEW_CANDIDATE_CAP);
  });

  it('the read is bounded — more grounds intersect the view than are returned', async () => {
    const results = await service.placesInView(VIEW);
    expect(results.length).toBeLessThanOrEqual(PLACES_IN_VIEW_CANDIDATE_CAP);
  });
});
