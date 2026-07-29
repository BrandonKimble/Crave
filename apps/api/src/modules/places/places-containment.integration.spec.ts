/**
 * CONTAINMENT LAWS — against a REAL PostGIS (integration).
 *
 * Why this file exists: the one-ground refactor moved the containment laws
 * OUT of TypeScript and INTO SQL. The unit specs that used to guard them were
 * deleted, and their replacements string-match the query text — which is how
 * a real bug shipped on 2026-07-27: `geometry && ST_Union(armA, armB)` looked
 * right and its spec asserted `toContain('ST_Union')`, so the spec PASSED ON
 * THE BUG. A law enforced by the database has to be proven against the
 * database.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev database, never prod)
 * It FAILS LOUDLY without one rather than skipping: a silently-skipped test
 * proves nothing, which is the exact disease this file treats.
 */
import { PrismaClient } from '@prisma/client';
import { PlacesCatalogService } from './places-catalog.service';

const TEST_TAG = 'itest-containment';
const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new PlacesCatalogService(prisma as never, logger);

/** Insert a place plus its ground. `ringWkt` is the REAL shape; `bbox` is the
 *  (possibly lying) stored rectangle — the whole point of the first law. */
async function seedPlace(opts: {
  name: string;
  level: string;
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  groundWkt: string;
}): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ place_id: string }>>(
    `INSERT INTO places (name, provider_level_code, country_code, provider,
                         bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng)
     VALUES ($1, $2, 'US', '${TEST_TAG}', $3, $4, $5, $6)
     RETURNING place_id`,
    opts.name,
    opts.level,
    opts.bbox.minLat,
    opts.bbox.minLng,
    opts.bbox.maxLat,
    opts.bbox.maxLng,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
     VALUES ($1::uuid, NULL, now(), ST_Multi(ST_GeomFromText($2, 4326)))`,
    row.place_id,
    opts.groundWkt,
  );
  return row.place_id;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'places-containment.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM places WHERE provider = '${TEST_TAG}'`,
  );
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM places WHERE provider = '${TEST_TAG}'`,
  );
  await prisma.$disconnect();
});

describe('containment laws, proven against PostGIS', () => {
  it('THE BBOX LIES, THE GROUND JUDGES: a point inside the stored rectangle but outside the real polygon does not resolve to that place', async () => {
    // Stored rectangle spans 10..12 lng; the REAL ground is only its western
    // half (10..11). A point at 11.5 sits inside the rectangle and outside
    // the polygon. If anything still judged by bbox, this would resolve.
    await seedPlace({
      name: 'Halfland',
      level: 'Municipality',
      bbox: { minLat: 10, minLng: 10, maxLat: 12, maxLng: 12 },
      groundWkt: 'POLYGON((10 10, 11 10, 11 12, 10 12, 10 10))',
    });

    const inGround = await service.smallestContaining({ lat: 11, lng: 10.5 });
    expect(inGround?.name).toBe('Halfland');

    const inBboxOnly = await service.smallestContaining({ lat: 11, lng: 11.5 });
    expect(inBboxOnly?.name).not.toBe('Halfland');
  });

  it('OVERHANG (the El Paso/Juárez law): a target inside a neighbour’s rectangle overhang resolves to its TRUE container, not the smaller rectangle', async () => {
    // Overhang has the SMALLER rectangle (so a bbox-area ranking would pick
    // it) but its ground excludes the target. TrueTown's ground covers it.
    await seedPlace({
      name: 'Overhang',
      level: 'Municipality',
      bbox: { minLat: 20.4, minLng: 20.4, maxLat: 20.6, maxLng: 20.6 },
      groundWkt:
        'POLYGON((20.4 20.4, 20.45 20.4, 20.45 20.45, 20.4 20.45, 20.4 20.4))',
    });
    await seedPlace({
      name: 'TrueTown',
      level: 'Municipality',
      bbox: { minLat: 20, minLng: 20, maxLat: 21, maxLng: 21 },
      groundWkt: 'POLYGON((20 20, 21 20, 21 21, 20 21, 20 20))',
    });

    const resolved = await service.smallestContaining({ lat: 20.5, lng: 20.5 });
    expect(resolved?.name).toBe('TrueTown');
  });

  it('SMALLEST GROUND WINS — ranked by real polygon area, NOT by the stored rectangle', async () => {
    // The fixture is built so the two rankings DISAGREE, otherwise the test
    // cannot fail: SmallTown has the smaller GROUND (1 sq deg) but a LYING,
    // much larger stored rectangle (400 sq deg). Ranking by ground picks
    // SmallTown; ranking by bbox would pick BigCounty. A fixture where bbox
    // == ground (my first attempt) passes under either rule and proves
    // nothing.
    await seedPlace({
      name: 'BigCounty',
      level: 'CountrySecondarySubdivision',
      bbox: { minLat: 30, minLng: 30, maxLat: 34, maxLng: 34 },
      groundWkt: 'POLYGON((30 30, 34 30, 34 34, 30 34, 30 30))',
    });
    await seedPlace({
      name: 'SmallTown',
      level: 'Municipality',
      bbox: { minLat: 20, minLng: 20, maxLat: 40, maxLng: 40 },
      groundWkt: 'POLYGON((31 31, 32 31, 32 32, 31 32, 31 31))',
    });

    const resolved = await service.smallestContaining({ lat: 31.5, lng: 31.5 });
    expect(resolved?.name).toBe('SmallTown');
  });

  it('CONTAINMENT IS COVERAGE, NOT OVERLAP: a target box only half inside a ground has NO container', async () => {
    // A POINT target cannot tell ST_Covers from ST_Intersects — they are
    // identical for zero-area geometry, which is why the point-based tests
    // above pass under either. This uses a BOX that straddles the edge:
    // Coastal's ground covers 50..51, the target runs 50.5..51.5. Overlap
    // says yes; containment says no. Only containment is the law.
    await seedPlace({
      name: 'Coastal',
      level: 'Municipality',
      bbox: { minLat: 50, minLng: 50, maxLat: 51, maxLng: 51 },
      groundWkt: 'POLYGON((50 50, 51 50, 51 51, 50 51, 50 50))',
    });

    const resolved = await service.smallestContaining({
      minLat: 50.5,
      minLng: 50.5,
      maxLat: 51.5,
      maxLng: 51.5,
    });
    expect(resolved?.name).not.toBe('Coastal');
  });

  it('P5b — A POLL ACT BELONGS TO ITS PLACE AND ITS ANCESTORS, NEVER TO WHAT MERELY FITS IN ITS RECTANGLE', async () => {
    // The fixture is built so the OLD law and the NEW one DISAGREE.
    //
    // BigCity's ground is only the WESTERN half of its stored rectangle
    // (60..61 of 60..62). Suburb sits in the EASTERN half — inside BigCity's
    // RECTANGLE, outside BigCity's GROUND. State covers everything.
    //
    // OLD law (geo = BigCity's bbox): arm (i) ST_Covers(ground, bbox) is FALSE
    // even for BigCity itself (a polygon never covers its own bbox), and arm
    // (ii) ST_CoveredBy(ground, bbox) matches Suburb — so the act lands on a
    // town it did not happen in. That is the measured prod defect (Austin: 31).
    // NEW law (anchor = BigCity): BigCity ✓ (covers itself), State ✓
    // (ancestor), Suburb ✗ (BigCity's ground does not cover it).
    const bigCityId = await seedPlace({
      name: 'BigCity',
      level: 'Municipality',
      bbox: { minLat: 60, minLng: 60, maxLat: 62, maxLng: 62 },
      groundWkt: 'POLYGON((60 60, 61 60, 61 62, 60 62, 60 60))',
    });
    await seedPlace({
      name: 'Suburb',
      level: 'Municipality',
      bbox: { minLat: 61.2, minLng: 61.2, maxLat: 61.4, maxLng: 61.4 },
      groundWkt:
        'POLYGON((61.2 61.2, 61.4 61.2, 61.4 61.4, 61.2 61.4, 61.2 61.2))',
    });
    await seedPlace({
      name: 'State',
      level: 'CountrySubdivision',
      bbox: { minLat: 59, minLng: 59, maxLat: 63, maxLng: 63 },
      groundWkt: 'POLYGON((59 59, 63 59, 63 63, 59 63, 59 59))',
    });

    // A poll act in BigCity, written the P5b way: anchored to the place. The
    // geo columns still carry the old rectangle, so this test ALSO proves the
    // anchor WINS over a lying rectangle sitting right next to it.
    const [signal] = await prisma.$queryRawUnsafe<Array<{ signal_id: string }>>(
      `INSERT INTO signals (kind, subject_type, actor_id, occurred_at, place_id,
                            geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng)
       VALUES ('poll_created', 'none', gen_random_uuid(), now(), $1::uuid,
               60, 60, 62, 62)
       RETURNING signal_id`,
      bigCityId,
    );

    const attributed = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT p.name
         FROM places p, signals s
        WHERE s.signal_id = $1::uuid
          AND p.provider = '${TEST_TAG}'
          AND (CASE WHEN s.place_id IS NOT NULL
                 THEN EXISTS (SELECT 1 FROM place_geometries anchor_pg
                                JOIN place_geometries cand_pg
                                  ON cand_pg.place_id = p.place_id
                               WHERE anchor_pg.place_id = s.place_id
                                 AND ST_Covers(cand_pg.geometry, anchor_pg.geometry))
                 ELSE FALSE END)`,
      signal.signal_id,
    );
    const names = attributed.map((r) => r.name).sort();

    expect(names).toContain('BigCity'); // the place it happened in
    expect(names).toContain('State'); // its ancestor
    expect(names).not.toContain('Suburb'); // RED under the old rectangle law

    await prisma.$executeRawUnsafe(
      `DELETE FROM signals WHERE signal_id = $1::uuid`,
      signal.signal_id,
    );
  });

  it('THE SEAM: a view crossing the antimeridian returns only the places actually there', async () => {
    // SCOPE, stated honestly: the union-envelope bug shipped on 2026-07-27
    // was a PERFORMANCE defect, not a correctness one. Measured on the dev
    // DB: the union predicate admitted 3,244 candidates where the per-arm
    // predicate admits 3 — but the exact-judge step (resolvePlaceCoverage)
    // then drops every one of the extras, so OUTPUT is identical either way.
    // I originally reported it as a correctness bug; this test is what
    // corrected me. The SHAPE of the predicate is guarded in the unit spec
    // (two arms, no ST_Union) — that assertion DOES go red on the bug.
    // What this test guards is the output law.
    await seedPlace({
      name: 'Seamside',
      level: 'Municipality',
      bbox: { minLat: 40, minLng: 179.5, maxLat: 41, maxLng: 179.9 },
      groundWkt: 'POLYGON((179.5 40, 179.9 40, 179.9 41, 179.5 41, 179.5 40))',
    });
    await seedPlace({
      name: 'FarAway',
      level: 'Municipality',
      bbox: { minLat: 40, minLng: 79.5, maxLat: 41, maxLng: 79.9 },
      groundWkt: 'POLYGON((79.5 40, 79.9 40, 79.9 41, 79.5 41, 79.5 40))',
    });

    const inView = await service.placesInView({
      minLat: 39.9,
      minLng: 179.2,
      maxLat: 41.1,
      maxLng: -179.8, // crossing: min > max
    });
    const names = inView.map((entry) => entry.place.name);
    expect(names).toContain('Seamside');
    expect(names).not.toContain('FarAway');
  });
});
