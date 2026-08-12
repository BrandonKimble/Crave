import { PrismaClient } from '@prisma/client';
import { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';
import { PlacesPromotionService } from './places-promotion.service';

/**
 * WHAT THE GROUND WRITE ACTUALLY DOES — against real PostGIS.
 *
 * WHAT THIS REPLACED. The promotion unit spec asserted the persist SQL
 * CONTAINED the strings 'ST_GeomFromGeoJSON', 'ST_UnaryUnion', 'ST_Multi' and
 * 'ON CONFLICT (place_id) DO UPDATE'. That is the shape of the pipeline, not
 * its effect, and this repository has the receipt for why that is not enough:
 * a containment spec once asserted `toContain('ST_Union')` and PASSED ON THE
 * BUG. A semantically wrong query containing the right tokens is green.
 *
 * The properties below are the ones the token list could not see, and each is
 * a real incident in this module's history:
 *
 *   - THE UNION IS OF ALL FEATURES. The wrong-entity guard once judged
 *     `features->0` while the persist stored the union of all of them, so a
 *     multi-part entity whose FIRST feature missed the anchor was terminally
 *     refused. Tokens cannot tell "unions everything" from "unions the first".
 *   - AN INVALID RING IS MADE VALID, not rejected and not stored broken.
 *   - THE CENTROID IS COUPLED to the ground at the ground's write — the P4
 *     law. A token match proves the UPDATE exists, not that it moved a point.
 *   - THE WRITE IS AN UPSERT: re-persisting replaces, never duplicates.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
const TEST_TAG = 'itest-ground-persist';
const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/** persistPolygon is private by design — the ground write has one owner. The
 *  test reaches it deliberately: what is under test is the SQL's EFFECT, and
 *  driving the whole drain would require the vendor, the pools and the queue. */
function persist(
  service: PlacesPromotionService,
  placeId: string,
  geometryId: string,
  geojson: unknown,
): Promise<boolean> {
  return (
    service as unknown as {
      persistPolygon: (
        p: string,
        g: string,
        j: unknown,
        n: Date,
      ) => Promise<boolean>;
    }
  ).persistPolygon(
    placeId,
    geometryId,
    geojson,
    new Date('2026-07-20T00:00:00Z'),
  );
}

function square(minLng: number, minLat: number, size: number) {
  const maxLng = minLng + size;
  const maxLat = minLat + size;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

async function seedPlace(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ place_id: string }>>(
    `INSERT INTO places (name, provider_level_code, country_code, provider)
     VALUES ($1, 'Municipality', 'US', '${TEST_TAG}')
     RETURNING place_id`,
    name,
  );
  return row.place_id;
}

async function groundOf(placeId: string) {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{ valid: boolean; parts: number; area: number; type: string }>
  >(
    `SELECT ST_IsValid(geometry) AS valid, ST_NumGeometries(geometry) AS parts,
            ST_Area(geometry) AS area, ST_GeometryType(geometry) AS type
     FROM place_geometries WHERE place_id = $1::uuid`,
    placeId,
  );
  return row;
}

async function covers(placeId: string, lng: number, lat: number) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT ST_Covers(geometry, ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)) AS ok
     FROM place_geometries WHERE place_id = $1::uuid`,
    placeId,
    lng,
    lat,
  );
  return row?.ok ?? false;
}

let service: PlacesPromotionService;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped ground test proves nothing.',
    );
  }
  await prisma.$connect();
  service = new PlacesPromotionService(
    prisma as never,
    {
      probe: jest.fn(),
      fetchPolygon: jest.fn(),
      lookupLevelEntity: jest.fn(),
    } as never,
    new AdvisoryLockService(),
    logger,
    undefined as never,
  );
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM place_geometries WHERE place_id IN
       (SELECT place_id FROM places WHERE provider = '${TEST_TAG}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM places WHERE provider = '${TEST_TAG}'`,
  );
  await prisma.$disconnect();
});

describe('the ground write', () => {
  it('unions EVERY feature — not the first one', async () => {
    // Two disjoint squares. The stored ground must cover a point in the
    // SECOND, which is precisely what `features->0` could not do.
    const placeId = await seedPlace(`${TEST_TAG}-union`);
    const landed = await persist(service, placeId, 'geo-union', {
      type: 'FeatureCollection',
      features: [square(10, 10, 1), square(20, 20, 1)],
    });
    expect(landed).toBe(true);

    expect(await covers(placeId, 10.5, 10.5)).toBe(true);
    expect(await covers(placeId, 20.5, 20.5)).toBe(true);
    const ground = await groundOf(placeId);
    expect(ground.parts).toBe(2);
    expect(ground.type).toBe('ST_MultiPolygon');
  });

  it('makes an INVALID ring valid rather than storing it broken', async () => {
    // A bowtie: self-intersecting, ST_IsValid false as written.
    const placeId = await seedPlace(`${TEST_TAG}-bowtie`);
    const landed = await persist(service, placeId, 'geo-bowtie', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [30, 30],
                [31, 31],
                [31, 30],
                [30, 31],
                [30, 30],
              ],
            ],
          },
        },
      ],
    });
    expect(landed).toBe(true);
    const ground = await groundOf(placeId);
    expect(ground.valid).toBe(true);
    expect(ground.area).toBeGreaterThan(0);
  });

  it('COUPLES the representative point to the ground it just wrote (P4)', async () => {
    const placeId = await seedPlace(`${TEST_TAG}-centroid`);
    await persist(service, placeId, 'geo-c1', {
      type: 'FeatureCollection',
      features: [square(40, 40, 1)],
    });
    const [first] = await prisma.$queryRawUnsafe<
      Array<{ lat: number | null; lng: number | null }>
    >(
      `SELECT centroid_lat::float8 AS lat, centroid_lng::float8 AS lng
       FROM places WHERE place_id = $1::uuid`,
      placeId,
    );
    expect(first.lat).not.toBeNull();
    expect(Number(first.lat)).toBeGreaterThan(40);
    expect(Number(first.lat)).toBeLessThan(41);

    // Move the ground somewhere else entirely: the point must follow, because
    // a point outside its own ground is the class the coupling exists to kill.
    await persist(service, placeId, 'geo-c2', {
      type: 'FeatureCollection',
      features: [square(-70, -20, 1)],
    });
    const [second] = await prisma.$queryRawUnsafe<
      Array<{ lat: number; lng: number }>
    >(
      `SELECT centroid_lat::float8 AS lat, centroid_lng::float8 AS lng
       FROM places WHERE place_id = $1::uuid`,
      placeId,
    );
    expect(Number(second.lat)).toBeLessThan(-19);
    expect(Number(second.lng)).toBeLessThan(-69);
    expect(await covers(placeId, Number(second.lng), Number(second.lat))).toBe(
      true,
    );
  });

  it('is an UPSERT — one ground per place, replaced not duplicated', async () => {
    const placeId = await seedPlace(`${TEST_TAG}-upsert`);
    await persist(service, placeId, 'geo-u1', {
      type: 'FeatureCollection',
      features: [square(50, 50, 1)],
    });
    await persist(service, placeId, 'geo-u2', {
      type: 'FeatureCollection',
      features: [square(50, 50, 2)],
    });
    const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM place_geometries WHERE place_id = $1::uuid`,
      placeId,
    );
    expect(Number(n)).toBe(1);
    // The SECOND write is what stands.
    expect(await covers(placeId, 51.5, 51.5)).toBe(true);
  });

  it('a MALFORMED geometry lands nothing and does not crash the pass', async () => {
    // ST_GeomFromGeoJSON raises on this. Before 2026-08-04 the raise escaped
    // persistPolygon, which sits outside the drain's transport catch — so one
    // bad vendor payload ended the whole pass and every place queued behind it
    // waited for the next tick.
    const placeId = await seedPlace(`${TEST_TAG}-malformed`);
    const landed = await persist(service, placeId, 'geo-bad', {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon' } }],
    });
    expect(landed).toBe(false);
  });

  it('refuses a collection with no polygon rings (a draw that lands nothing)', async () => {
    const placeId = await seedPlace(`${TEST_TAG}-empty`);
    const landed = await persist(service, placeId, 'geo-none', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 1] },
        },
      ],
    });
    expect(landed).toBe(false);
  });
});
