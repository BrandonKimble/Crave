/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
/**
 * §1 identity-law fixtures (plans/geo-demand-foundation-rebuild.md §1, §17,
 * §18 item 8): no silent forks — re-sketching the same placeKey (countryCode,
 * subdivisionCode?, county?, providerLevelCode, normalized name) MERGES (bbox
 * widens to union, providerPlaceId adopted as alias, parent edges union)
 * instead of creating a twin row; chain order supplies the DAG's parent
 * edges. The COUNTY-AXIS decision table (rules c / b′ / a / b / u1–u4) has a
 * dedicated describe block below.
 */
import { Prisma } from '@prisma/client';
import {
  PlacesCatalogService,
  PlaceSketchNode,
  placeParentIds,
} from './places-catalog.service';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

let idCounter = 0;

function makePlaceRow(overrides: Record<string, unknown> = {}) {
  idCounter += 1;
  return {
    placeId: `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`,
    name: 'Austin',
    localScriptAlias: null,
    providerLevelCode: 'municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
    county: null as string | null,
    parentPlaceIds: [],
    centroidLat: null,
    centroidLng: null,
    bboxMinLat: null,
    bboxMinLng: null,
    bboxMaxLat: null,
    bboxMaxLng: null,
    timeZone: null,
    provider: 'tomtom',
    providerPlaceId: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    promotedAt: null,
    ...overrides,
  };
}

function makeHarness(
  // Candidate rows the identity findMany returns, per sketch-node call.
  // A bare row is shorthand for a one-candidate set; null for no candidates.
  existingByCall: Array<
    ReturnType<typeof makePlaceRow> | ReturnType<typeof makePlaceRow>[] | null
  >,
) {
  const findMany = jest.fn();
  for (const entry of existingByCall) {
    const rows = entry === null ? [] : Array.isArray(entry) ? entry : [entry];
    findMany.mockResolvedValueOnce(rows);
  }
  findMany.mockResolvedValue([]);
  const create = jest
    .fn()
    .mockImplementation((args: any) =>
      Promise.resolve(makePlaceRow({ ...args.data })),
    );
  const update = jest
    .fn()
    .mockImplementation((args: any) =>
      Promise.resolve(makePlaceRow(args.data)),
    );
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUniqueOrThrow = jest
    .fn()
    .mockImplementation(() => Promise.resolve(makePlaceRow()));
  const executeRaw = jest.fn().mockResolvedValue(1);
  const queryRaw = jest.fn().mockResolvedValue([]);
  const prisma: any = {
    place: {
      create,
      update,
      updateMany,
      findMany,
      findUniqueOrThrow,
      // Prisma field-reference stub (crossing-row branch of the WHEREs).
      fields: { bboxMaxLng: Symbol('bboxMaxLng') },
    },
    $executeRaw: executeRaw,
    // §2.5 ground hydration read (place_geometries); [] = no polygons yet.
    $queryRaw: queryRaw,
  };
  const birthListener = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new PlacesCatalogService(prisma, logger, birthListener);
  return {
    service,
    prisma,
    create,
    update,
    updateMany,
    findMany,
    findUniqueOrThrow,
    executeRaw,
    queryRaw,
    birthListener,
  };
}

const austinNode: PlaceSketchNode = {
  name: 'Austin',
  providerLevelCode: 'municipality',
  countryCode: 'US',
  subdivisionCode: 'TX',
  bbox: { minLat: 30.1, minLng: -97.95, maxLat: 30.52, maxLng: -97.56 },
  providerPlaceId: 'tomtom-geom-austin',
};

describe('PlacesCatalogService.sketchChain — §1 identity law', () => {
  it('creates every chain node broadest-first with parent edges from chain order', async () => {
    const { service, create } = makeHarness([null, null, null]);
    const chain: PlaceSketchNode[] = [
      {
        name: 'Hyde Park',
        providerLevelCode: 'neighbourhood',
        countryCode: 'US',
        subdivisionCode: 'TX',
      },
      austinNode,
      {
        name: 'Texas',
        providerLevelCode: 'subdivision',
        countryCode: 'US',
        subdivisionCode: 'TX',
      },
    ];
    const places = await service.sketchChain(chain);

    expect(create).toHaveBeenCalledTimes(3);
    // Broadest first: Texas created before Austin before Hyde Park.
    expect(create.mock.calls.map((call: any) => call[0].data.name)).toEqual([
      'Texas',
      'Austin',
      'Hyde Park',
    ]);
    // Parent edges come from the chain order, not geometry (§1).
    const texasCreate = create.mock.calls[0][0].data;
    const austinCreate = create.mock.calls[1][0].data;
    const hydeParkCreate = create.mock.calls[2][0].data;
    expect(texasCreate.parentPlaceIds).toEqual([]);
    expect(austinCreate.parentPlaceIds).toEqual([places[2].placeId]);
    expect(hydeParkCreate.parentPlaceIds).toEqual([places[1].placeId]);
    // Results come back in input (most-specific-first) order.
    expect(places.map((place) => place.name)).toEqual([
      'Hyde Park',
      'Austin',
      'Texas',
    ]);
  });

  it('no silent forks: case/whitespace variants of the same placeKey merge, never create', async () => {
    const existing = makePlaceRow({
      bboxMinLat: 30.1,
      bboxMinLng: -97.95,
      bboxMaxLat: 30.52,
      bboxMaxLng: -97.56,
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, create, update, findMany } = makeHarness([existing]);

    await service.sketchChain([
      { ...austinNode, name: '  AUSTIN  ' }, // trim/collapse + case-insensitive match
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled(); // identical observation → idempotent no-op
    // The identity lookup normalized the name and compared case-insensitively.
    expect(findMany.mock.calls[0][0].where.name).toEqual({
      equals: 'AUSTIN',
      mode: 'insensitive',
    });
  });

  it('bbox MERGES on conflict: ATOMIC LEAST/GREATEST widen against the live row, never shrinks (finding 1c)', async () => {
    const existing = makePlaceRow({
      bboxMinLat: 30.2,
      bboxMinLng: -97.9,
      bboxMaxLat: 30.4,
      bboxMaxLng: -97.6,
    });
    const { service, update, create, executeRaw, findUniqueOrThrow } =
      makeHarness([existing]);

    await service.sketchChain([
      {
        ...austinNode,
        providerPlaceId: null,
        bbox: { minLat: 30.1, minLng: -97.95, maxLat: 30.3, maxLng: -97.7 },
      },
    ]);

    expect(create).not.toHaveBeenCalled();
    // The widen is raw SQL (LEAST/GREATEST composes concurrent widenings —
    // a plain read-modify-write update would let one merge shrink another's)
    // PLUS the §2.6 sketch-ground refresh (the envelope row derives from the
    // post-widen bbox in the same call flow).
    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const [template, ...values] = executeRaw.mock.calls[0];
    const sql = (template as string[]).join('?');
    expect(sql).toContain('LEAST(COALESCE(bbox_min_lat');
    expect(sql).toContain('LEAST(COALESCE(bbox_min_lng');
    expect(sql).toContain('GREATEST(COALESCE(bbox_max_lat');
    expect(sql).toContain('GREATEST(COALESCE(bbox_max_lng');
    // The OBSERVED bounds ride into LEAST/GREATEST (each appears twice:
    // once inside COALESCE, once as the comparand), plus the row id.
    expect(values).toEqual([
      30.1,
      30.1,
      -97.95,
      -97.95,
      30.3,
      30.3,
      -97.7,
      -97.7,
      existing.placeId,
    ]);
    // §2.6 derivation invariant: the second statement upserts the sketch
    // envelope FROM the live places row, guarded to sketch-grade only.
    const sketchSql = (executeRaw.mock.calls[1][0] as string[]).join('?');
    expect(sketchSql).toContain('INSERT INTO place_geometries');
    expect(sketchSql).toContain('ST_MakeEnvelope');
    expect(sketchSql).toContain('ON CONFLICT (place_id) DO UPDATE');
    expect(sketchSql).toContain(
      'WHERE place_geometries.provider_boundary_id IS NULL',
    );
    // Bbox-only merge re-reads the row for the post-widen truth.
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { placeId: existing.placeId },
    });
  });

  it('an observation already inside the stored bbox writes nothing (contained ⇒ no-op, race-safe)', async () => {
    const existing = makePlaceRow({
      bboxMinLat: 30.1,
      bboxMinLng: -97.95,
      bboxMaxLat: 30.52,
      bboxMaxLng: -97.56,
    });
    const { service, update, executeRaw } = makeHarness([existing]);

    await service.sketchChain([
      {
        ...austinNode,
        providerPlaceId: null,
        bbox: { minLat: 30.2, minLng: -97.9, maxLat: 30.4, maxLng: -97.6 },
      },
    ]);

    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('adopts providerPlaceId as an alias when the stored row has none', async () => {
    const existing = makePlaceRow({ providerPlaceId: null });
    const { service, update } = makeHarness([existing]);

    await service.sketchChain([{ ...austinNode, bbox: null }]);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.providerPlaceId).toBe(
      'tomtom-geom-austin',
    );
  });

  it('appends a new parent edge ATOMICALLY (Prisma push — concurrent merges cannot drop each other, finding 1c)', async () => {
    const priorParent = '11111111-1111-4111-8111-111111111111';
    const texasRow = makePlaceRow({
      name: 'Texas',
      providerLevelCode: 'subdivision',
    });
    const existingAustin = makePlaceRow({ parentPlaceIds: [priorParent] });
    const { service, update } = makeHarness([texasRow, existingAustin]);

    await service.sketchChain([
      { ...austinNode, bbox: null, providerPlaceId: null },
      {
        name: 'Texas',
        providerLevelCode: 'subdivision',
        countryCode: 'US',
        subdivisionCode: 'TX',
      },
    ]);

    expect(update).toHaveBeenCalledTimes(1);
    // Atomic append, NOT a read-modify-write array replace: a stale-read
    // rewrite silently drops edges pushed by a concurrent merge.
    expect(update.mock.calls[0][0].data.parentPlaceIds).toEqual({
      push: texasRow.placeId,
    });
  });

  it('duplicate edges from concurrent pushes collapse at the read chokepoint (placeParentIds)', () => {
    const parent = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const row = makePlaceRow({ parentPlaceIds: [parent, other, parent] });
    expect(placeParentIds(row as any)).toEqual([parent, other]);
  });
});

describe('PlacesCatalogService — §1 COUNTY-AXIS decision table (§18 item 8)', () => {
  // The real Lakeside-TX pair: same name, same subdivision, 4.7° apart.
  const tarrantLakeside = () =>
    makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: 'Tarrant',
      bboxMinLat: 32.8,
      bboxMinLng: -97.53,
      bboxMaxLat: 32.85,
      bboxMaxLng: -97.46,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
  const sanPatricioLakeside = () =>
    makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: 'San Patricio',
      bboxMinLat: 28.08,
      bboxMinLng: -97.89,
      bboxMaxLat: 28.13,
      bboxMaxLng: -97.83,
      createdAt: new Date('2026-07-02T00:00:00Z'),
    });
  const nearSanPatricio = {
    minLat: 28.09,
    minLng: -97.88,
    maxLat: 28.12,
    maxLng: -97.84,
  };
  const lakesideNode = (
    county: string | null,
    bbox: typeof nearSanPatricio | null,
  ): PlaceSketchNode => ({
    name: 'Lakeside',
    providerLevelCode: 'Municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
    county,
    bbox,
  });

  it('(c) both counties known and SAME → identity match, merges (case-insensitive county)', async () => {
    const existing = tarrantLakeside();
    const { service, create, executeRaw } = makeHarness([[existing]]);

    const [place] = await service.sketchChain([
      lakesideNode('TARRANT', {
        minLat: 32.81,
        minLng: -97.52,
        maxLat: 32.84,
        maxLng: -97.47,
      }),
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled(); // contained bbox → no widen
    expect(place.placeId).toBe(existing.placeId);
  });

  it('(b) both counties known and DIFFERENT with no bbox overlap → distinct place, sibling row created', async () => {
    const existing = tarrantLakeside();
    const { service, create, update, updateMany } = makeHarness([[existing]]);

    await service.sketchChain([lakesideNode('San Patricio', nearSanPatricio)]);

    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.county).toBe('San Patricio');
    expect(create.mock.calls[0][0].data.name).toBe('Lakeside');
  });

  it('Lakeside-TX fixture: with both siblings stored, an observation resolves to the NEAR (same-county) one', async () => {
    const tarrant = tarrantLakeside();
    const sanPatricio = sanPatricioLakeside();
    const { service, create } = makeHarness([[tarrant, sanPatricio]]);

    const [place] = await service.sketchChain([
      lakesideNode('San Patricio', nearSanPatricio),
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(place.placeId).toBe(sanPatricio.placeId);
  });

  it('(a) stored county UNKNOWN, observed county, overlapping bbox → row ADOPTS the county (gap-fill, no fork)', async () => {
    const existing = makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: null,
      bboxMinLat: 28.08,
      bboxMinLng: -97.89,
      bboxMaxLat: 28.13,
      bboxMaxLng: -97.83,
    });
    const { service, create, updateMany } = makeHarness([[existing]]);

    const [place] = await service.sketchChain([
      lakesideNode('San Patricio', nearSanPatricio),
    ]);

    expect(create).not.toHaveBeenCalled();
    // Race-safe conditional adoption: only a STILL-county-unknown row adopts.
    expect(updateMany).toHaveBeenCalledWith({
      where: { placeId: existing.placeId, county: null },
      data: { county: 'San Patricio' },
    });
    expect(place.placeId).toBe(existing.placeId);
  });

  it('(a-veto) stored county UNKNOWN but bboxes DISJOINT → no adoption, distinct sibling created', async () => {
    const existing = makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: null, // pre-amendment organic row of the OTHER Lakeside
      bboxMinLat: 32.8,
      bboxMinLng: -97.53,
      bboxMaxLat: 32.85,
      bboxMaxLng: -97.46,
    });
    const { service, create, updateMany } = makeHarness([[existing]]);

    await service.sketchChain([lakesideNode('San Patricio', nearSanPatricio)]);

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.county).toBe('San Patricio');
  });

  it('(b′) different county but OVERLAPPING bbox → multi-county ground: merges, stored county WINS, disagreement logged', async () => {
    // Houston law: probes from different parts of one city report different
    // counties — geometry overrides the county mismatch.
    const existing = makePlaceRow({
      name: 'Houston',
      providerLevelCode: 'Municipality',
      county: 'Harris',
      bboxMinLat: 29.5,
      bboxMinLng: -95.8,
      bboxMaxLat: 30.1,
      bboxMaxLng: -95.0,
    });
    const { service, create, update, updateMany } = makeHarness([[existing]]);
    logger.warn.mockClear();

    const [place] = await service.sketchChain([
      {
        name: 'Houston',
        providerLevelCode: 'Municipality',
        countryCode: 'US',
        subdivisionCode: 'TX',
        county: 'Fort Bend',
        bbox: { minLat: 29.55, minLng: -95.75, maxLat: 29.7, maxLng: -95.6 },
      },
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled(); // stored county untouched
    expect(place.placeId).toBe(existing.placeId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('county disagreement'),
      expect.objectContaining({ stored: 'Harris', observed: 'Fort Bend' }),
    );
  });

  it("(b′ beats a) NULL-county row present but a DIFFERENT-county sibling sits on the observation's ground → sibling absorbs, no adoption", async () => {
    const nullRow = makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: null,
      bboxMinLat: null,
      bboxMinLng: null,
      bboxMaxLat: null,
      bboxMaxLng: null,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });
    const sanPatricio = sanPatricioLakeside();
    const { service, create, updateMany } = makeHarness([
      [nullRow, sanPatricio],
    ]);

    const [place] = await service.sketchChain([
      lakesideNode('Nueces', nearSanPatricio), // disagreeing county, same ground
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(place.placeId).toBe(sanPatricio.placeId);
  });

  it('(gap-fill race) losing the conditional adoption re-resolves against the settled truth', async () => {
    const nullRow = makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: null,
      bboxMinLat: 28.08,
      bboxMinLng: -97.89,
      bboxMaxLat: 28.13,
      bboxMaxLng: -97.83,
    });
    // A concurrent observer adopted 'San Patricio' into the same row first.
    const settled = { ...nullRow, county: 'San Patricio' };
    const { service, create, updateMany, findMany } = makeHarness([
      [nullRow],
      [settled],
    ]);
    updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

    const [place] = await service.sketchChain([
      lakesideNode('San Patricio', nearSanPatricio),
    ]);

    expect(findMany).toHaveBeenCalledTimes(2); // re-resolved
    expect(create).not.toHaveBeenCalled(); // rule (c) on the settled row
    expect(place.placeId).toBe(nullRow.placeId);
  });

  it('(create race) P2002 on the county-shaped index re-resolves and merges with the winner', async () => {
    const winner = sanPatricioLakeside();
    const { service, create, findMany } = makeHarness([null, [winner]]);
    const p2002 = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: 'P2002', message: 'unique violation' },
    );
    create.mockRejectedValueOnce(p2002);

    const [place] = await service.sketchChain([
      lakesideNode('San Patricio', nearSanPatricio),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(place.placeId).toBe(winner.placeId);
  });

  it('(u1) county-less observation prefers the county-unknown row over county-carrying siblings', async () => {
    const nullRow = makePlaceRow({
      name: 'Lakeside',
      providerLevelCode: 'Municipality',
      county: null,
      createdAt: new Date('2026-07-03T00:00:00Z'),
    });
    const { service, create } = makeHarness([[tarrantLakeside(), nullRow]]);

    const [place] = await service.sketchChain([lakesideNode(null, null)]);

    expect(create).not.toHaveBeenCalled();
    expect(place.placeId).toBe(nullRow.placeId);
  });

  it('(u2) county-less observation with only county-carrying siblings: geometry picks; county untouched', async () => {
    const tarrant = tarrantLakeside();
    const sanPatricio = sanPatricioLakeside();
    const { service, create, updateMany } = makeHarness([
      [tarrant, sanPatricio],
    ]);

    const [place] = await service.sketchChain([
      lakesideNode(null, nearSanPatricio),
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(place.placeId).toBe(sanPatricio.placeId);
  });

  it('(u4) county-less, several county-carrying siblings, no geometry → deterministic oldest, loudly, NEVER a new row', async () => {
    const tarrant = tarrantLakeside(); // oldest (2026-07-01)
    const sanPatricio = sanPatricioLakeside();
    const { service, create } = makeHarness([[tarrant, sanPatricio]]);
    logger.warn.mockClear();

    const [place] = await service.sketchChain([lakesideNode(null, null)]);

    expect(create).not.toHaveBeenCalled();
    expect(place.placeId).toBe(tarrant.placeId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ambiguous county-less observation'),
      expect.objectContaining({ siblingCount: 2 }),
    );
  });

  it('county is stored NORMALIZED on create (whitespace collapsed)', async () => {
    const { service, create } = makeHarness([null]);

    await service.sketchChain([
      lakesideNode('  San   Patricio ', nearSanPatricio),
    ]);

    expect(create.mock.calls[0][0].data.county).toBe('San Patricio');
  });

  it('(c + disjoint) same county but disjoint bboxes → merge refused the widen (defense-in-depth guard stays)', async () => {
    const existing = tarrantLakeside();
    const { service, create, executeRaw } = makeHarness([[existing]]);
    logger.warn.mockClear();

    const [place] = await service.sketchChain([
      lakesideNode('Tarrant', nearSanPatricio), // same-county homonym defect
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled(); // no phantom union
    expect(place.placeId).toBe(existing.placeId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('distinct-place suspect'),
      expect.anything(),
    );
  });
});

describe('PlacesCatalogService.placesInView — §2.5 coverage', () => {
  it('§2.6 envelope degradation: hydration returns nothing → the envelope RING judges (bbox-equal numbers, same representation) + deduped parent edges', async () => {
    const half = makePlaceRow({
      name: 'West Town',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
      parentPlaceIds: ['p-1', 'p-1', 'p-2'],
    });
    const { service, findMany } = makeHarness([]);
    findMany.mockResolvedValue([half]);

    const view = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const results = await service.placesInView(view);

    expect(results).toHaveLength(1);
    expect(results[0].coverageOfView).toBeCloseTo(0.5, 9);
    // Cos-weighted area (place-geo): 1° × 1° × cos(midLat 0.5°).
    expect(results[0].placeArea).toBeCloseTo(
      Math.cos((0.5 * Math.PI) / 180),
      9,
    );
    expect(results[0].parentPlaceIds).toEqual(['p-1', 'p-2']);
    // §2.6: ground is ALWAYS present — here the envelope ring derived from
    // the bbox (sketch-grade representation), never undefined.
    expect(results[0].ground).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ]);
  });

  it('polygon = truth (§2.5(c)): a landed geometry judges coverage; the lying index bbox is demoted to candidate-finding', async () => {
    const liar = makePlaceRow({
      name: 'Mexico-ish',
      bboxMinLat: -10,
      bboxMinLng: -10,
      bboxMaxLat: 10,
      bboxMaxLng: 10, // bbox CONTAINS the view (coverage would be 1)
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([liar]);
    // Real ground: only the view's west half.
    queryRaw.mockResolvedValue([
      {
        placeId: liar.placeId,
        geojson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [-10, -10],
              [0.5, -10],
              [0.5, 10],
              [-10, 10],
              [-10, -10],
            ],
          ],
        }),
      },
    ]);

    const view = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const results = await service.placesInView(view);
    expect(results).toHaveLength(1);
    expect(results[0].coverageOfView).toBeCloseTo(0.5, 6);
    expect(results[0].ground).toBeDefined();
    // The simplification tolerance is derived from the VIEW span (§16):
    // span 1° / 512.
    const [query] = queryRaw.mock.calls[queryRaw.mock.calls.length - 1];
    expect(query.values).toContain(1 / 512);
  });

  it('ground hydration failure degrades to the bbox fallback (legal §2.5(f) degradation, never an error)', async () => {
    const row = makePlaceRow({
      name: 'Town',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([row]);
    queryRaw.mockRejectedValue(new Error('postgis down'));

    const view = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const results = await service.placesInView(view);
    expect(results).toHaveLength(1);
    expect(results[0].coverageOfView).toBeCloseTo(1, 6);
  });
});

describe('PlacesCatalogService — §2.5(d) polygon at birth', () => {
  it('a CREATED place fires the birth enqueue (fire-and-forget)', async () => {
    const { service, birthListener, create } = makeHarness([null]);
    const [created] = await service.sketchChain([austinNode]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(birthListener.enqueue).toHaveBeenCalledWith(
      created.placeId,
      'birth',
    );
  });

  it('§2.6 birth = ground immediately: the CREATE path writes the sketch envelope synchronously with the place row (never waiting for the drain)', async () => {
    const { service, create, executeRaw } = makeHarness([null]);
    const [created] = await service.sketchChain([austinNode]);
    expect(create).toHaveBeenCalledTimes(1);
    // The sketch-ground upsert ran in the same call flow, keyed to the new
    // row, guarded to sketch grade (outline rows can never be clobbered).
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [template, ...values] = executeRaw.mock.calls[0];
    const sql = (template as string[]).join('?');
    expect(sql).toContain('INSERT INTO place_geometries');
    expect(sql).toContain('ST_MakeEnvelope');
    expect(sql).toContain('ON CONFLICT (place_id) DO UPDATE');
    expect(sql).toContain(
      'WHERE place_geometries.provider_boundary_id IS NULL',
    );
    expect(values).toContain(created.placeId);
  });

  it('a MERGED re-sketch never re-fires birth (the queue is for new ground)', async () => {
    const existing = makePlaceRow({
      bboxMinLat: 30.1,
      bboxMinLng: -97.95,
      bboxMaxLat: 30.52,
      bboxMaxLng: -97.56,
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, birthListener, create } = makeHarness([existing]);
    await service.sketchChain([austinNode]);
    expect(create).not.toHaveBeenCalled();
    expect(birthListener.enqueue).not.toHaveBeenCalled();
  });
});

describe('PlacesCatalogService.smallestContaining — §2/§3 containment read', () => {
  it('picks the smallest-GROUND-area containing place (point = zero-area bbox; §2.6 every candidate is ground-judged)', async () => {
    const city = makePlaceRow({
      name: 'City',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
    });
    const county = makePlaceRow({
      name: 'County',
      bboxMinLat: -1,
      bboxMinLng: -1,
      bboxMaxLat: 2,
      bboxMaxLng: 2,
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([county, city]);
    queryRaw.mockResolvedValue([
      { placeId: city.placeId, covers: true, groundArea: 1 },
      { placeId: county.placeId, covers: true, groundArea: 9 },
    ]);

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    expect(smallest?.name).toBe('City');
  });

  it('§2.5(c) C2 cut: real ground JUDGES — a target inside a neighbor bbox overhang but outside its ground resolves to the true container', async () => {
    // The border case (El Paso / Juárez class): Overhang's bbox contains the
    // target, but its GROUND (polygon) refuses it; True Town's ground covers
    // it. Bbox-smallest would pick Overhang (smaller rectangle) — the
    // polygon law must refuse it.
    const overhang = makePlaceRow({
      name: 'Overhang',
      bboxMinLat: 0.4,
      bboxMinLng: 0.4,
      bboxMaxLat: 0.6,
      bboxMaxLng: 0.6,
    });
    const trueTown = makePlaceRow({
      name: 'TrueTown',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([overhang, trueTown]);
    queryRaw.mockResolvedValue([
      { placeId: overhang.placeId, covers: false, groundArea: 0.01 },
      { placeId: trueTown.placeId, covers: true, groundArea: 0.8 },
    ]);

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    expect(smallest?.name).toBe('TrueTown');
  });

  it('§2.6 single-arm rank: a verdict-less candidate (no ground row — bbox-less birth) is EXCLUDED, never bbox-judged, even with the smaller bbox', async () => {
    const covered = makePlaceRow({
      name: 'CoveredCounty',
      bboxMinLat: -1,
      bboxMinLng: -1,
      bboxMaxLat: 2,
      bboxMaxLng: 2,
    });
    const groundless = makePlaceRow({
      name: 'GroundlessTown',
      bboxMinLat: 0.45,
      bboxMinLng: 0.45,
      bboxMaxLat: 0.55,
      bboxMaxLng: 0.55,
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([covered, groundless]);
    // Only the county has a place_geometries row (§2.6: a candidate with no
    // verdict row has no ground knowledge at all).
    queryRaw.mockResolvedValue([
      { placeId: covered.placeId, covers: true, groundArea: 6 },
    ]);

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    // The ground-judged candidate wins; the groundless one is invisible.
    expect(smallest?.name).toBe('CoveredCounty');
  });

  it('ground-verdict failure degrades THIS read to NO CONTAINER (§2.6 posture: never bbox-judged, never an error)', async () => {
    const city = makePlaceRow({
      name: 'City',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    findMany.mockResolvedValue([city]);
    queryRaw.mockRejectedValue(new Error('postgis down'));

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    expect(smallest).toBeNull();
  });
});
