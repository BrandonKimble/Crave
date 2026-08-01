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
  const findUnique = jest.fn().mockImplementation((args: any) => {
    if (args?.where?.providerPlaceId !== undefined) {
      return findUniqueVendorId(args);
    }
    return Promise.resolve(makePlaceRow());
  });
  // P3 vendor-id-first identity lookup; null = no stored row carries this id.
  const findFirst = jest.fn().mockResolvedValue(null);
  const findUniqueVendorId = jest.fn().mockResolvedValue(null);
  const executeRaw = jest.fn().mockResolvedValue(1);
  // P4: the service derives extents FROM THE GROUND via $queryRaw (the
  // derived-bbox SELECT). The harness answers those reads from the fixture
  // rows' legacy bbox fields — the fixture bbox IS the sketch ground's
  // envelope, exactly the production invariant (writeSketchGround writes the
  // observed envelope as the ground). Everything else on $queryRaw still
  // returns [] (no polygons hydrated).
  const knownRows: any[] = [];
  for (const entry of existingByCall) {
    if (entry === null) continue;
    for (const r of Array.isArray(entry) ? entry : [entry]) knownRows.push(r);
  }
  const derivedRowsFor = (ids: string[]) =>
    knownRows
      .filter(
        (r) =>
          ids.includes(r.placeId) &&
          r.bboxMinLat !== null &&
          r.bboxMinLng !== null &&
          r.bboxMaxLat !== null &&
          r.bboxMaxLng !== null,
      )
      .map((r) => ({
        place_id: r.placeId,
        bbox_min_lat: Number(r.bboxMinLat),
        bbox_min_lng: Number(r.bboxMinLng),
        bbox_max_lat: Number(r.bboxMaxLat),
        bbox_max_lng: Number(r.bboxMaxLng),
      }));
  const queryRaw = jest
    .fn()
    .mockImplementation((query: any, ...rest: any[]) => {
      const text = typeof query === 'string' ? query : (query?.sql ?? '');
      const values: any[] =
        typeof query === 'string' ? rest : (query?.values ?? []);
      if (text.includes('AS bbox_min_lat')) {
        const ids = values.flat().filter((v: any) => typeof v === 'string');
        return Promise.resolve(derivedRowsFor(ids));
      }
      return Promise.resolve([]);
    });
  const prisma: any = {
    place: {
      create,
      update,
      updateMany,
      findMany,
      findUniqueOrThrow,
      findUnique,
      findFirst,
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
    findUnique,
    findUniqueVendorId,
    findFirst,
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
    // P4 (2026-07-30): the widen GROWS THE SKETCH GROUND ITSELF — there is no
    // second stored shape. ST_Envelope(ST_Collect(live geometry, hull env))
    // composes concurrent widenings exactly like the old LEAST/GREATEST on
    // columns (each update unions against the LIVE row), and the
    // provider_boundary_id guard means a landed vendor OUTLINE is never
    // widened — a real outline is a fact, not an accretion.
    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [template, ...values] = executeRaw.mock.calls[0];
    const sql = (template as string[]).join('?');
    expect(sql).toContain('UPDATE place_geometries');
    expect(sql).toContain('ST_Envelope(ST_Collect(');
    expect(sql).toContain('ST_MakeEnvelope(');
    expect(sql).toContain('provider_boundary_id IS NULL');
    // The HULL of known∪observed rides in (minLng, minLat, maxLng, maxLat)
    // plus the row id: known 30.2..30.4 × -97.9..-97.6 ∪ observed
    // 30.1..30.3 × -97.95..-97.7 = 30.1..30.4 × -97.95..-97.6.
    expect(values).toEqual([
      expect.closeTo(-97.95, 6),
      expect.closeTo(30.1, 6),
      expect.closeTo(-97.6, 6),
      expect.closeTo(30.4, 6),
      existing.placeId,
    ]);
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

  // ── VENDOR ID IS THE IDENTITY (one-ground charter P3) ────────────────────
  it('a matching vendor geometry id IS the identity — matched directly, no name/county rules consulted', async () => {
    const stored = makePlaceRow({
      name: 'Totally Different Name',
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, findUniqueVendorId, findMany, create } = makeHarness([]);
    findUniqueVendorId.mockResolvedValue(stored);

    const [resolved] = await service.sketchChain([
      { ...austinNode, bbox: null },
    ]);

    expect(findUniqueVendorId).toHaveBeenCalledWith({
      where: { providerPlaceId: 'tomtom-geom-austin' },
    });
    // Resolved to the id-matched row despite the name disagreeing entirely.
    expect(resolved.placeId).toBe(stored.placeId);
    // The name-candidate lookup never ran, and nothing was forked.
    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('the SAME vendor id at a DIFFERENT level is not this place (coincident boundary)', async () => {
    // A city-state or consolidated city-county can share one boundary across
    // two rungs, so the vendor may hand back the same geometry id for both.
    // Merging a Municipality observation into a CountrySubdivision row would
    // silently mislabel the level — mergeSketch never corrects it.
    const stateRow = makePlaceRow({
      providerLevelCode: 'CountrySubdivision',
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, findUniqueVendorId, create, update } = makeHarness([]);
    findUniqueVendorId.mockResolvedValue(stateRow);

    // austinNode is a Municipality carrying that same id.
    await service.sketchChain([{ ...austinNode, bbox: null }]);

    // Not merged into the state row; minted as its own place.
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a same-name homonym with a DIFFERENT vendor id is a different entity — minted, never merged (the San Juan class)', async () => {
    // The defect this closes: "Scotland" the Georgia town and "Scotland"
    // elsewhere share a name, so the name/county rules merged them and the
    // widen-only bbox union destroyed both extents.
    const otherEntity = makePlaceRow({
      name: 'Austin',
      providerPlaceId: 'tomtom-geom-SOMEWHERE-ELSE',
    });
    const { service, findUniqueVendorId, create, update } = makeHarness([
      otherEntity,
    ]);
    findUniqueVendorId.mockResolvedValue(null); // no row carries OUR id yet

    await service.sketchChain([{ ...austinNode, bbox: null }]);

    // Minted as its own place; the homonym is untouched.
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('an id-less stored row is still eligible (no vendor opinion yet) — it merges and adopts the id', async () => {
    const idLess = makePlaceRow({ providerPlaceId: null });
    const { service, findUniqueVendorId, create, update } = makeHarness([
      idLess,
    ]);
    findUniqueVendorId.mockResolvedValue(null);

    await service.sketchChain([{ ...austinNode, bbox: null }]);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.providerPlaceId).toBe(
      'tomtom-geom-austin',
    );
  });

  it('COUNTY GAP-FILL survives the id-first path (RED: P3 silently stopped the county axis accruing)', async () => {
    // The regression this pins: P3's vendor-id match jumps straight to
    // mergeSketch, bypassing resolveIdentity where county adoption used to
    // live — so a county-carrying observation against a county-less row left
    // the county NULL forever, for essentially every observation.
    const countyLess = makePlaceRow({ county: null });
    const { service, findUniqueVendorId, update } = makeHarness([]);
    findUniqueVendorId.mockResolvedValue(countyLess);

    await service.sketchChain([
      { ...austinNode, bbox: null, county: 'Travis' },
    ]);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.county).toBe('Travis');
  });

  it('a stored county is NEVER overwritten by a differing observation', async () => {
    const stored = makePlaceRow({ county: 'Hunt' });
    const { service, findUniqueVendorId, update } = makeHarness([]);
    findUniqueVendorId.mockResolvedValue(stored);

    await service.sketchChain([
      { ...austinNode, bbox: null, county: 'Travis' },
    ]);

    const wrote = update.mock.calls[0]?.[0]?.data ?? {};
    expect(wrote.county).toBeUndefined();
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
  // ONE GROUND FINDS AND JUDGES (one-ground charter P2/P4): candidates come
  // from ST_Intersects on the GiST index and arrive WITH their view-simplified
  // ground. A place with no ground is not a candidate at all — there is no
  // envelope-degradation arm any more, which is the §2.6 law stated plainly
  // ("never bbox-judged") rather than an exception to it.
  const RING_0_1 = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ];

  it('finds candidates by INTERSECTING GROUND and judges coverage on it (+ deduped parent edges)', async () => {
    const town = makePlaceRow({
      name: 'West Town',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
      parentPlaceIds: ['p-1', 'p-1', 'p-2'],
    });
    const { service, findMany, queryRaw } = makeHarness([]);
    queryRaw.mockResolvedValue([
      {
        placeId: town.placeId,
        geojson: JSON.stringify({ type: 'Polygon', coordinates: RING_0_1 }),
      },
    ]);
    findMany.mockResolvedValue([town]);

    const view = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const results = await service.placesInView(view);

    const sql = queryRaw.mock.calls[0][0].sql as string;
    expect(sql).toContain('/*places:grounds_in_view*/');
    expect(sql).toContain('geometry && ');
    expect(results).toHaveLength(1);
    expect(results[0].coverageOfView).toBeCloseTo(0.5, 9);
    expect(results[0].placeArea).toBeCloseTo(
      Math.cos((0.5 * Math.PI) / 180),
      9,
    );
    expect(results[0].parentPlaceIds).toEqual(['p-1', 'p-2']);
  });

  it('a ground read failure yields NO candidates for this read — never a weaker judgment', async () => {
    const { service, findMany, queryRaw } = makeHarness([]);
    queryRaw.mockRejectedValue(new Error('postgis down'));

    expect(
      await service.placesInView({
        minLat: 0,
        minLng: 0,
        maxLat: 1,
        maxLng: 1,
      }),
    ).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('a CROSSING view is TWO separate index operands, never a union (RED: a union bbox is the whole world)', async () => {
    // The bug this pins: `geometry && ST_Union(armA, armB)`. `&&` compares
    // BOUNDING BOXES, and two arms at ±180 have a WHOLE-WORLD bbox, so the
    // predicate matched every place in the latitude band and could not use
    // the index. Measured live (22.8k grounds): union form 693 rows via seq
    // scan; per-arm 1 row in 0.18ms.
    const { service, queryRaw } = makeHarness([]);
    queryRaw.mockResolvedValue([]);
    await service.placesInView({
      minLat: 0,
      minLng: 179,
      maxLat: 1,
      maxLng: -179,
    });
    const sql = queryRaw.mock.calls[0][0].sql as string;
    expect(sql).not.toContain('ST_Union');
    expect((sql.match(/geometry && /g) ?? []).length).toBe(2);
    expect(sql).toContain(' OR ');

    const plain = makeHarness([]);
    plain.queryRaw.mockResolvedValue([]);
    await plain.service.placesInView({
      minLat: 0,
      minLng: -1,
      maxLat: 1,
      maxLng: 1,
    });
    const plainSql = plain.queryRaw.mock.calls[0][0].sql as string;
    expect((plainSql.match(/geometry && /g) ?? []).length).toBe(1);
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
    expect(sql).toContain('ON CONFLICT (place_id) DO UPDATE');
    expect(sql).toContain(
      'WHERE place_geometries.provider_boundary_id IS NULL',
    );
    expect(values).toContain(created.placeId);
    // P4: the envelope is a NESTED fragment built from the OBSERVED bbox
    // values (never a read of stored columns — there are none).
    const envelopeFragment = values.find(
      (v: any) => v && typeof v === 'object' && 'sql' in v,
    ) as { sql: string; values: unknown[] } | undefined;
    expect(envelopeFragment?.sql).toContain('ST_MakeEnvelope');
    expect(envelopeFragment?.values).toEqual(
      expect.arrayContaining([
        austinNode.bbox!.minLng,
        austinNode.bbox!.minLat,
        austinNode.bbox!.maxLng,
        austinNode.bbox!.maxLat,
      ]),
    );
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
  // ONE GROUND, ONE QUERY (one-ground charter P2): the containment LAW now
  // lives in SQL — `ST_Covers(geometry, envelope)` selects, `ORDER BY
  // ST_Area(geometry) ASC` ranks, and a place absent from place_geometries is
  // simply not a row. Those three facts are proven against the REAL database
  // (verified 2026-07-26: a downtown-Austin point ranks Downtown Austin <
  // Austin < Travis < Texas; a point in Austin's bbox corner but outside its
  // polygon resolves to its true container, NOT Austin). What this unit layer
  // can still prove honestly is the SHAPE of the read: the wrap-aware
  // envelope, the single ordered query, and the failure posture.
  it('issues ONE ordered ground query and hydrates the winner (no bbox prefilter, no crossing catch-all)', async () => {
    const { service, queryRaw, findMany, findUnique } = makeHarness([]);
    const winner = makePlaceRow({ name: 'Downtown' });
    queryRaw.mockResolvedValue([{ placeId: winner.placeId }]);
    findUnique.mockResolvedValue(winner);

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    expect(smallest?.name).toBe('Downtown');
    // The bbox range prefilter is GONE — no place.findMany in this read.
    expect(findMany).not.toHaveBeenCalled();
    const sql = queryRaw.mock.calls[0][0].sql as string;
    expect(sql).toContain('/*places:smallest_containing*/');
    expect(sql).toContain('ST_Covers');
    expect(sql).toContain('ORDER BY ST_Area(pg.geometry) ASC');
    expect(findUnique).toHaveBeenCalledWith({
      where: { placeId: winner.placeId },
    });
  });

  it('no covering ground = no container (a place with no ground row is simply not a row)', async () => {
    const { service, queryRaw, findUnique } = makeHarness([]);
    queryRaw.mockResolvedValue([]);
    expect(await service.smallestContaining({ lat: 0.5, lng: 0.5 })).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('a CROSSING target must be covered on BOTH arms — AND-ed, never unioned', async () => {
    const { service, queryRaw } = makeHarness([]);
    queryRaw.mockResolvedValue([]);
    await service.smallestContaining({
      minLat: 0,
      minLng: 179,
      maxLat: 1,
      maxLng: -179,
    });
    const sql = queryRaw.mock.calls[0][0].sql as string;
    // Union would make the index operand the whole world (see placesInView).
    expect(sql).not.toContain('ST_Union');
    // Containment of a split target means covering EVERY half.
    expect((sql.match(/ST_Covers\(pg\.geometry, /g) ?? []).length).toBe(2);
    expect(sql).toContain(' AND ');

    const plain = makeHarness([]);
    plain.queryRaw.mockResolvedValue([]);
    await plain.service.smallestContaining({
      minLat: 0,
      minLng: -1,
      maxLat: 1,
      maxLng: 1,
    });
    const plainSql = plain.queryRaw.mock.calls[0][0].sql as string;
    expect((plainSql.match(/ST_Covers\(pg\.geometry, /g) ?? []).length).toBe(1);
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
