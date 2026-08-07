/**
 * THE VIEWPORT CAP OBEYS THE LAW IT WAS CHOSEN FOR — against a REAL PostGIS.
 *
 * Why this file exists (F371/D30). `PLACES_IN_VIEW_CANDIDATE_CAP = 400` exists
 * because an unbounded world-span read seq-scanned every ground and serialized
 * 11 MB of GeoJSON per request from an endpoint reachable at 100/min
 * UNAUTHENTICATED. Its unit test asserted `expect(sql).toContain('LIMIT')`.
 * EXECUTED MUTATION: set the cap to 1 and every consumer suite stayed GREEN —
 * so the relationship, not the spelling, is what this file asserts.
 *
 * REDERIVED 2026-08-07 for the center-anchored header law. The old assertion
 * proved area-DESC ordering could never drop a place holding >= 1/3 of the
 * view — the winning class of the DOMINATOR law. That law is dead, and its
 * guarantee INVERTED: the new header names the FINEST place containing the
 * view's centre, i.e. potentially the SMALLEST row in the read, which
 * area-DESC truncation drops FIRST. The read now ranks centre-containing
 * grounds ahead of the cut, so the assertion here is the new relationship:
 *
 *   a fine place containing the view's centre survives the cap even when the
 *   read is over capacity and every other row is coarser.
 *
 * Flipping the ORDER BY back to bare area-DESC turns this RED (the sentinel
 * fixture is deliberately the smallest ground in the read). The old
 * attention-floor assertion survives below as the membership half: the cap
 * still drops only sub-attention tail.
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
/** The §4 attention floor: the feed-membership half of the assertion —
 *  places above it must survive the cap for the FEED even though the header
 *  no longer ranks on it. */
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

  // THE SENTINEL: a fine place CONTAINING THE VIEW'S CENTRE (-149.5, 0.5),
  // deliberately the SMALLEST ground in the whole read — the row bare
  // area-DESC truncation drops first, and the row the center-anchored
  // header may need most.
  await seed(
    `${TEST_TAG}:centered-fine`,
    box(-149.50005, 0.49995, -149.49995, 0.50005),
  );

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

    // THE NEW LAW'S HALF: the centre-chain sentinel — the smallest ground
    // in an over-capacity read — survived, because centre-containment
    // outranks the cut. Bare area-DESC ordering turns exactly this RED.
    const sentinel = mine.find(
      (r) => r.place.name === `${TEST_TAG}:centered-fine`,
    );
    expect(sentinel).toBeDefined();
    expect(sentinel?.containsViewCenter).toBe(true);

    // THE LAW: the cap dropped only the tail.
    expect(mine.length).toBeLessThanOrEqual(PLACES_IN_VIEW_CANDIDATE_CAP);
  });

  it('the read is bounded — more grounds intersect the view than are returned', async () => {
    const results = await service.placesInView(VIEW);
    expect(results.length).toBeLessThanOrEqual(PLACES_IN_VIEW_CANDIDATE_CAP);
  });
});
