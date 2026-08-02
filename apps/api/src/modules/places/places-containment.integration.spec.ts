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
import { Prisma, PrismaClient } from '@prisma/client';
import { PlacesCatalogService } from './places-catalog.service';
import { freshSignalAttributionSql } from '../signals/ground-containment';

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
  /** DAG edges, as sketchChain would have written them. The real system
   *  ALWAYS has these (every place is born from a reverse-geocode chain);
   *  a fixture without them models a state that cannot occur. */
  parents?: string[];
}): Promise<string> {
  // P4: there are no bbox columns — the `bbox` option survives only as
  // documentation of what the old stored rectangle WOULD have said (several
  // tests' premises are "the rectangle lied"); nothing can read it now.
  const [row] = await prisma.$queryRawUnsafe<Array<{ place_id: string }>>(
    `INSERT INTO places (name, provider_level_code, country_code, provider,
                         parent_place_ids)
     VALUES ($1, $2, 'US', '${TEST_TAG}', $3::uuid[])
     RETURNING place_id`,
    opts.name,
    opts.level,
    opts.parents ?? [],
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
     VALUES ($1::uuid, NULL, now(), ST_Multi(ST_GeomFromText($2, 4326)))`,
    row.place_id,
    opts.groundWkt,
  );
  return row.place_id;
}

/**
 * Insert an ANCHORED signal (P5b: place_id set, geo = whatever rectangle/point
 * the caller wants on the NOT NULL columns), attribute it with the REAL
 * exported law — freshSignalAttributionSql, the exact Prisma.Sql the runtime
 * call sites execute — and return the attributed names. The signal is cleaned
 * up even when an expectation later throws.
 */
async function attributeAnchoredSignal(
  anchorPlaceId: string,
  geo: { minLat: number; minLng: number; maxLat: number; maxLng: number },
): Promise<string[]> {
  const [signal] = await prisma.$queryRawUnsafe<Array<{ signal_id: string }>>(
    `INSERT INTO signals (kind, subject_type, actor_id, occurred_at, place_id,
                          geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng)
     VALUES ('poll_created', 'none', gen_random_uuid(),
             -- naive-UTC, the ledger convention (signals.service writes JS
             -- Date via Prisma = UTC wall-clock). A bare now() is SESSION-tz
             -- naive and made this test a time-of-day flake: after ~17:00
             -- PDT the UTC day has rolled over, the stamp lands "yesterday",
             -- and the fresh arm (occurred_at >= todayStart) rightly drops it.
             (now() AT TIME ZONE 'utc'), $1::uuid,
             $2, $3, $4, $5)
     RETURNING signal_id`,
    anchorPlaceId,
    geo.minLat,
    geo.minLng,
    geo.maxLat,
    geo.maxLng,
  );
  try {
    const attributed = await prisma.$queryRaw<Array<{ name: string }>>(
      Prisma.sql`SELECT p.name
         FROM places p, signals s
        WHERE s.signal_id = ${signal.signal_id}::uuid
          AND p.provider = ${TEST_TAG}
          AND (${freshSignalAttributionSql('p')})`,
    );
    return attributed.map((r) => r.name).sort();
  } finally {
    await prisma.$executeRawUnsafe(
      `DELETE FROM signals WHERE signal_id = $1::uuid`,
      signal.signal_id,
    );
  }
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
  // The FK (ON DELETE CASCADE, migration 20260730070000) removes the grounds
  // with the places — this teardown used to leak orphan geometries into the
  // dev DB on every run, and red-team F1 found an orphan could WIN the
  // aggregate's smallest-containing pick as a ghost.
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
    // RECTANGLE, outside BigCity's GROUND. State covers everything, and the
    // DAG records BigCity → State exactly as sketchChain would have.
    //
    // OLD law (geo = BigCity's bbox): arm (i) ST_Covers(ground, bbox) is FALSE
    // even for BigCity itself (a polygon never covers its own bbox), and arm
    // (ii) ST_CoveredBy(ground, bbox) matches Suburb — so the act lands on a
    // town it did not happen in. That is the measured prod defect (Austin: 31).
    // NEW law (anchor = BigCity): BigCity ✓ (itself), State ✓ (DAG ancestor),
    // Suburb ✗ (not the anchor, not an ancestor of it).
    //
    // This runs the REAL exported predicate — the earlier version of this test
    // inlined a COPY of the SQL, which is the string-match disease this file
    // exists to cure (a fix to the law would have left the copy asserting the
    // old one).
    const stateId = await seedPlace({
      name: 'State',
      level: 'CountrySubdivision',
      bbox: { minLat: 59, minLng: 59, maxLat: 63, maxLng: 63 },
      groundWkt: 'POLYGON((59 59, 63 59, 63 63, 59 63, 59 59))',
    });
    const bigCityId = await seedPlace({
      name: 'BigCity',
      level: 'Municipality',
      bbox: { minLat: 60, minLng: 60, maxLat: 62, maxLng: 62 },
      groundWkt: 'POLYGON((60 60, 61 60, 61 62, 60 62, 60 60))',
      parents: [stateId],
    });
    await seedPlace({
      name: 'Suburb',
      level: 'Municipality',
      bbox: { minLat: 61.2, minLng: 61.2, maxLat: 61.4, maxLng: 61.4 },
      groundWkt:
        'POLYGON((61.2 61.2, 61.4 61.2, 61.4 61.4, 61.2 61.4, 61.2 61.2))',
      parents: [stateId],
    });

    // A poll act in BigCity, written the P5b way: anchored to the place. The
    // geo columns still carry the old rectangle, so this test ALSO proves the
    // anchor WINS over a lying rectangle sitting right next to it.
    const names = await attributeAnchoredSignal(bigCityId, {
      minLat: 60,
      minLng: 60,
      maxLat: 62,
      maxLng: 62,
    });

    expect(names).toContain('BigCity'); // the place it happened in
    expect(names).toContain('State'); // its ancestor
    expect(names).not.toContain('Suburb'); // RED under the old rectangle law
  });

  it('P5b ANCESTRY IS THE VENDOR CHAIN, NOT POLYGON NESTING — the Washington case', async () => {
    // Measured on prod 2026-07-29: TomTom's Washington Municipality is 159.5
    // sq mi with only 42.8% inside the District (the metro agglomeration, not
    // the city), and 2,111 of 19,452 US municipality→state DAG links (10.85%)
    // are NOT geometric containments — municipal outlines include bays and
    // barrier islands the state outline generalises away. ST_Covers is
    // all-or-nothing, so ONE sliver outside the parent breaks the link.
    //
    // The fixture reproduces the shape: Metropolis's ground SPILLS west of its
    // DAG parent District (69.5..70.6 vs the District's 70..71), so
    // ST_Covers(District.ground, Metropolis.ground) is FALSE while the DAG —
    // the vendor's own stated chain — says District IS the parent. The law
    // must follow the DAG: the vendor's stated hierarchy is a fact, polygon
    // nesting is an approximation (the same principle as P3 identity).
    //
    // Innocent sits INSIDE Metropolis's polygon but is NOT in its ancestor
    // chain — geometric thinking in either direction would drag it in.
    const districtId = await seedPlace({
      name: 'District',
      level: 'CountrySubdivision',
      bbox: { minLat: 70, minLng: 70, maxLat: 71, maxLng: 71 },
      groundWkt: 'POLYGON((70 70, 71 70, 71 71, 70 71, 70 70))',
    });
    const metropolisId = await seedPlace({
      name: 'Metropolis',
      level: 'Municipality',
      bbox: { minLat: 70.2, minLng: 69.5, maxLat: 70.8, maxLng: 70.6 },
      groundWkt:
        'POLYGON((69.5 70.2, 70.6 70.2, 70.6 70.8, 69.5 70.8, 69.5 70.2))',
      parents: [districtId],
    });
    await seedPlace({
      name: 'Innocent',
      level: 'Municipality',
      bbox: { minLat: 70.3, minLng: 70.1, maxLat: 70.4, maxLng: 70.2 },
      groundWkt:
        'POLYGON((70.1 70.3, 70.2 70.3, 70.2 70.4, 70.1 70.4, 70.1 70.3))',
      parents: [districtId],
    });

    // The anchored act's geo is the CENTROID POINT, placed here IN THE SPILL
    // (70.5, 69.7 — west of the District's bbox), modelling Washington's
    // representative point sitting on the Maryland side. The law must ignore
    // it entirely. NOTE the runtime call sites additionally wrap the law in a
    // bbox PREFILTER that anchored signals must bypass (they do — the
    // `s.place_id IS NOT NULL OR (...)` arm at each site); this harness runs
    // the law alone, so that bypass is asserted at the site level, not here.
    const names = await attributeAnchoredSignal(metropolisId, {
      minLat: 70.5,
      minLng: 69.7,
      maxLat: 70.5,
      maxLng: 69.7,
    });

    expect(names).toContain('Metropolis'); // the place it happened in
    expect(names).toContain('District'); // DAG ancestor — RED under ST_Covers ancestry
    expect(names).not.toContain('Innocent'); // inside the polygon, not in the chain

    // THE DOWNWARD DIRECTION (the fresh arm speaks the aggregate's lineage
    // law — red-team 2026-07-29): a poll anchored to the DISTRICT reaches its
    // DAG descendants, exactly as the closed-day read would serve it to them
    // through the anchor tile. Without this the same act flipped verdict at
    // the midnight boundary. Both children are in the chain; a sibling of the
    // anchor would not be.
    const fromDistrict = await attributeAnchoredSignal(districtId, {
      minLat: 70.5,
      minLng: 70.5,
      maxLat: 70.5,
      maxLng: 70.5,
    });
    expect(fromDistrict).toContain('District');
    expect(fromDistrict).toContain('Metropolis'); // descendant
    expect(fromDistrict).toContain('Innocent'); // also a child of District
  });

  it('P5b AT THE REAL CALL SITE: placeDemandMass sees an anchored act whose point lies OUTSIDE the reading place bbox', async () => {
    // Both red-team reviewers (2026-07-29) landed on the same residual: the
    // predicate-level tests above cannot detect a missing PREFILTER BYPASS at
    // the call sites — the runtime queries AND a bbox/lng prefilter around the
    // law, and an anchored act's centroid point can sit outside an ancestor's
    // bbox (Washington's point on the Maryland side). This test runs the REAL
    // runtime SQL — DemandMassReader.placeDemandMass, the exact statement the
    // poll-supply engine executes — over the Washington fixture. Remove the
    // `s.place_id IS NOT NULL OR (...)` arm at the site and this goes RED
    // (the prefilter drops the row before the law runs; District reads zero).
    const districtId = await seedPlace({
      name: 'SiteDistrict',
      level: 'CountrySubdivision',
      bbox: { minLat: 80, minLng: 20, maxLat: 81, maxLng: 21 },
      groundWkt: 'POLYGON((20 80, 21 80, 21 81, 20 81, 20 80))',
    });
    const metroId = await seedPlace({
      name: 'SiteMetropolis',
      level: 'Municipality',
      bbox: { minLat: 80.2, minLng: 19.5, maxLat: 80.8, maxLng: 20.6 },
      groundWkt:
        'POLYGON((19.5 80.2, 20.6 80.2, 20.6 80.8, 19.5 80.8, 19.5 80.2))',
      parents: [districtId],
    });

    // Anchored poll act, occurred NOW (the fresh arm reads today), centroid
    // point at (80.5, 19.7) — WEST of SiteDistrict's bbox (lng 20..21).
    const [signal] = await prisma.$queryRawUnsafe<Array<{ signal_id: string }>>(
      `INSERT INTO signals (kind, subject_type, actor_id, occurred_at, place_id,
                            geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng)
       VALUES ('poll_created', 'none', gen_random_uuid(),
             -- naive-UTC, the ledger convention (signals.service writes JS
             -- Date via Prisma = UTC wall-clock). A bare now() is SESSION-tz
             -- naive and made this test a time-of-day flake: after ~17:00
             -- PDT the UTC day has rolled over, the stamp lands "yesterday",
             -- and the fresh arm (occurred_at >= todayStart) rightly drops it.
             (now() AT TIME ZONE 'utc'), $1::uuid,
               80.5, 19.7, 80.5, 19.7)
       RETURNING signal_id`,
      metroId,
    );
    try {
      // Docket #6: ONE arm — today flows through the AGGREGATE (the fresh
      // ledger arm is deleted), so the honest pipeline is rebuild-then-read.
      // This also proves the aggregate's anchored branch end to end: the act
      // lands at the anchor tile and the lineage walk serves the ancestor.
      const { SignalDemandAggregateService } = await import(
        '../signals/signal-demand-aggregate.service'
      );
      const aggLogger = {
        setContext: () => aggLogger,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      } as never;
      const agg = new SignalDemandAggregateService(prisma as never, aggLogger);
      await agg.rebuildDay(new Date());
      const { DemandMassReader } = await import(
        '../polls/supply/demand-mass.reader'
      );
      const reader = new DemandMassReader(prisma as never);
      const masses = await reader.placeDemandMass([districtId, metroId]);
      const byId = new Map(masses.map((m) => [m.placeId, m.mass]));
      expect(byId.get(metroId) ?? 0).toBeGreaterThan(0); // the anchor itself
      expect(byId.get(districtId) ?? 0).toBeGreaterThan(0); // ancestor, despite the point outside its bbox
    } finally {
      await prisma.$executeRawUnsafe(
        `DELETE FROM signals WHERE signal_id = $1::uuid`,
        signal.signal_id,
      );
      // Re-rebuild today so the dev aggregate does not keep the test act.
      const { SignalDemandAggregateService: Agg2 } = await import(
        '../signals/signal-demand-aggregate.service'
      );
      const aggLogger2 = {
        setContext: () => aggLogger2,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      } as never;
      await new Agg2(prisma as never, aggLogger2).rebuildDay(new Date());
    }
  });

  it('P4 DERIVED BBOX AT THE SEAM: a two-arm crossing ground derives the wrap convention (min > max)', async () => {
    // The one genuinely new geometry logic in P4 — and both red teams found
    // it had ZERO coverage that could go RED. A crossing ground is stored as
    // two arms hugging ±180; the derived camera envelope must reconstruct
    // the wrap convention, not the planar envelope (which would span the
    // world).
    await seedPlace({
      name: 'SeamNation',
      level: 'Country',
      bbox: { minLat: 40, minLng: 175, maxLat: 41, maxLng: -178 },
      groundWkt:
        'MULTIPOLYGON(((175 40, 180 40, 180 41, 175 41, 175 40)),' +
        '((-180 40, -178 40, -178 41, -180 41, -180 40)))',
    });
    const inView = await service.placesInView({
      minLat: 39.9,
      minLng: 176,
      maxLat: 41.1,
      maxLng: 179,
    });
    const row = inView.find((r) => r.place.name === 'SeamNation');
    expect(row).toBeDefined();
    expect(row!.bbox.minLng).toBeCloseTo(175, 5);
    expect(row!.bbox.maxLng).toBeCloseTo(-178, 5); // min > max = wrap
    expect(row!.bbox.minLat).toBeCloseTo(40, 5);
    expect(row!.bbox.maxLat).toBeCloseTo(41, 5);
  });

  it('P4 DERIVED BBOX, THE UK CLASS: wide BOTH-HEMISPHERE parts that never touch the seam derive the PLANAR envelope, never a wrap', async () => {
    // Red-team convergent finding (both reviewers, independently): the first
    // cut keyed "crossing" on planar span >= 180 and bucketed parts by
    // CENTROID SIGN. A UK-with-territories-class geometry (parts at -128 and
    // +72 — planar span 200, seam never touched) then derived 72 -> 1.8, a
    // wrap bbox covering the PACIFIC — excluding its own territory and
    // claiming half the planet (which the reconciler would remember as an
    // answered region for 30 days). Crossing must mean REACHING ±180, not
    // being wide.
    await seedPlace({
      name: 'ScatterKingdom',
      level: 'Country',
      bbox: { minLat: 45, minLng: -128, maxLat: 47, maxLng: 72 },
      groundWkt:
        'MULTIPOLYGON(((-128 45, -127 45, -127 46, -128 46, -128 45)),' +
        '((-3 45, 1.8 45, 1.8 47, -3 47, -3 45)),' +
        '((71 45, 72 45, 72 46, 71 46, 71 45)))',
    });
    const inView = await service.placesInView({
      minLat: 44.9,
      minLng: -4,
      maxLat: 47.1,
      maxLng: 2,
    });
    const row = inView.find((r) => r.place.name === 'ScatterKingdom');
    expect(row).toBeDefined();
    expect(row!.bbox.minLng).toBeCloseTo(-128, 5); // planar, the true extent
    expect(row!.bbox.maxLng).toBeCloseTo(72, 5); // NOT a wrap
  });

  it('P4 DERIVED BBOX, THE ALEUTIAN CLASS: seam-straddling parts that never TOUCH ±180 derive the WRAP bbox, never a world band', async () => {
    // Empirical red-team 2026-08-01, measured on PROD: the real US geometry's
    // seam parts stop at 179.778 and -179.147 — the vendor does NOT split
    // arms exactly at ±180, so the "reaching ±179.999 on both sides" gate
    // never fires and the US bbox derived as the planar band
    // [-179.147, 179.778] — a 359-degree world band. The honest law is the
    // LARGEST LONGITUDINAL GAP: the bbox is the complement of the biggest
    // empty arc between the geometry's parts (US: the empty Pacific/Atlantic
    // arc from -66.9 east to 172.5 is ~239 degrees, so the bbox wraps
    // 172.5 -> -66.9). The UK class stays planar under the same law (its
    // largest gap contains the seam).
    await seedPlace({
      name: 'AleutiaLand',
      level: 'Country',
      bbox: { minLat: 20, minLng: 172.5, maxLat: 65, maxLng: -66.9 },
      groundWkt:
        'MULTIPOLYGON(((172.5 50, 179.778 50, 179.778 52, 172.5 52, 172.5 50)),' +
        '((-179.147 50, -170 50, -170 52, -179.147 52, -179.147 50)),' +
        '((-125 25, -66.9 25, -66.9 49, -125 49, -125 25)))',
    });
    const inView = await service.placesInView({
      minLat: 24,
      minLng: -126,
      maxLat: 50,
      maxLng: -60,
    });
    const row = inView.find((r) => r.place.name === 'AleutiaLand');
    expect(row).toBeDefined();
    // WRAP convention: min > max, spanning the seam — never a world band.
    expect(row!.bbox.minLng).toBeCloseTo(172.5, 3);
    expect(row!.bbox.maxLng).toBeCloseTo(-66.9, 3);
  });

  it('THE ASKED-REGION READ: the view-scoped predicate keeps every region that can answer an anchor — including a high-latitude disc and a stored WRAP box', async () => {
    // The instrument that can show RED. A unit mock cannot execute a spatial
    // predicate, so both defects found on 2026-08-01 were invisible to a
    // green suite: (1) one pad for both axes dropped a disc 66.7m outside a
    // lat-60 view but INSIDE its 100m reach; (2) a stored seam-crossing box
    // (min_lng > max_lng, written verbatim from a crossing view) failed the
    // plain lng test. A false EXCLUSION means the anchor reads unanswered
    // and the cell re-probes forever — spend.
    const PROBE_METERS = 100;
    const METERS_PER_DEG_LAT = 111_320;
    await prisma.$executeRawUnsafe('DELETE FROM probed_regions');
    await prisma.$executeRawUnsafe(
      `INSERT INTO probed_regions (region_id, kind, center_lat, center_lng, radius_meters, observed_at)
       VALUES (gen_random_uuid(), 'disc', 60.0, 10.0012, 100, now()),
              (gen_random_uuid(), 'disc', 0.0, 10.0012, 100, now())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO probed_regions (region_id, kind, min_lat, min_lng, max_lat, max_lng, observed_at)
       VALUES (gen_random_uuid(), 'box', 59.9, 172.0, 60.1, -66.0, now()),
              (gen_random_uuid(), 'box', 70.0, 20.0, 71.0, 21.0, now())`,
    );

    const view = { minLat: 59.99, minLng: 9.99, maxLat: 60.01, maxLng: 10.0 };
    const padLat = PROBE_METERS / METERS_PER_DEG_LAT;
    const padLng = padLat / Math.max(Math.cos((60.01 * Math.PI) / 180), 0.01);
    const rows = await prisma.$queryRawUnsafe<Array<{ kind: string }>>(
      `SELECT kind FROM probed_regions
       WHERE observed_at >= now() - interval '30 days'
         AND (
           (kind = 'disc'
             AND center_lat BETWEEN ${view.minLat - padLat} AND ${view.maxLat + padLat}
             AND center_lng BETWEEN ${view.minLng - padLng} AND ${view.maxLng + padLng})
           OR
           (kind = 'box'
             AND max_lat >= ${view.minLat} AND min_lat <= ${view.maxLat}
             AND (min_lng > max_lng
                  OR (max_lng >= ${view.minLng} AND min_lng <= ${view.maxLng})))
         )`,
    );

    // KEPT: the high-lat disc (reaches in) and the stored wrap box (answers
    // any longitude). DROPPED: the equatorial disc (134m away, out of reach)
    // and the far box.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.kind === 'disc')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'box')).toHaveLength(1);
    await prisma.$executeRawUnsafe('DELETE FROM probed_regions');
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
