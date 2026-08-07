/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
/**
 * §1 identity-law fixtures (plans/geo-demand-foundation-rebuild.md §1, §17,
 * §18 item 8): no silent forks — re-sketching the same placeKey (countryCode,
 * subdivisionCode?, county?, providerLevelCode, normalized name) MERGES (bbox
 * widens to union, providerPlaceId adopted as alias, parent edges union)
 * instead of creating a twin row; chain order supplies the DAG's parent
 * edges. (THE FINAL DISSOLUTION, 2026-07-30: identity is now the vendor's
 * composite (id, level); the county-axis decision table and its describe
 * block are deleted with the law.)
 */
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
    providerLevelCode: 'Municipality',
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
      Promise.resolve(
        makePlaceRow({ ...args.data, placeId: args.where?.placeId }),
      ),
    );
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUniqueOrThrow = jest
    .fn()
    .mockImplementation(() => Promise.resolve(makePlaceRow()));
  const findUnique = jest.fn().mockImplementation((args: any) => {
    if (
      args?.where?.providerPlaceId !== undefined ||
      args?.where?.providerPlaceId_providerLevelCode !== undefined
    ) {
      return findUniqueVendorId(args);
    }
    return Promise.resolve(makePlaceRow());
  });
  const findFirst = jest.fn().mockResolvedValue(null);
  // FINAL DISSOLUTION: identity lookup is the COMPOSITE (id, level). The
  // default resolves against the fixture rows, so tests read like the law.
  const findUniqueVendorId = jest.fn().mockImplementation((args: any) => {
    const composite = args?.where?.providerPlaceId_providerLevelCode;
    const id = composite?.providerPlaceId ?? args?.where?.providerPlaceId;
    const lvl = composite?.providerLevelCode;
    const row = knownRows.find(
      (r: any) =>
        r.providerPlaceId === id &&
        (lvl == null || r.providerLevelCode === lvl),
    );
    return Promise.resolve(row ?? null);
  });
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
  providerLevelCode: 'Municipality',
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
        providerPlaceId: 'tomtom-geom-hydepark',
      },
      austinNode,
      {
        name: 'Texas',
        providerLevelCode: 'subdivision',
        countryCode: 'US',
        subdivisionCode: 'TX',
        providerPlaceId: 'tomtom-geom-texas',
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
    // FINAL DISSOLUTION: there is no name lookup to run — the composite
    // (id, level) resolved it, and the name variant is just a scalar the
    // merge declines to overwrite.
    expect(findMany).not.toHaveBeenCalled();
  });

  it('bbox MERGES on conflict: ATOMIC LEAST/GREATEST widen against the live row, never shrinks (finding 1c)', async () => {
    const existing = makePlaceRow({
      bboxMinLat: 30.2,
      bboxMinLng: -97.9,
      bboxMaxLat: 30.4,
      bboxMaxLng: -97.6,
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, update, create, executeRaw, findUniqueOrThrow } =
      makeHarness([existing]);

    await service.sketchChain([
      {
        ...austinNode,
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
    // UPSERT, not UPDATE (red-team 2026-08-01): a node can arrive BBOX-LESS
    // at birth (the forward-geocode budget is 5 for a 6-rung ladder), so no
    // ground row exists to update — a bare UPDATE matched zero rows and the
    // place stayed groundless, and therefore invisible, forever.
    expect(sql).toContain('INSERT INTO place_geometries');
    expect(sql).toContain('ON CONFLICT (place_id) DO UPDATE');
    expect(sql).toContain('ST_Envelope(ST_Collect(');
    expect(sql).toContain('ST_MakeEnvelope(');
    expect(sql).toContain('provider_boundary_id IS NULL');
    // The HULL of known∪observed rides in: known 30.2..30.4 × -97.9..-97.6 ∪
    // observed 30.1..30.3 × -97.95..-97.7 = 30.1..30.4 × -97.95..-97.6.
    expect(values).toEqual([
      existing.placeId,
      expect.closeTo(-97.95, 6),
      expect.closeTo(30.1, 6),
      expect.closeTo(-97.6, 6),
      expect.closeTo(30.4, 6),
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
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, update, executeRaw } = makeHarness([existing]);

    await service.sketchChain([
      {
        ...austinNode,
        bbox: { minLat: 30.2, minLng: -97.9, maxLat: 30.4, maxLng: -97.6 },
      },
    ]);

    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
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
      where: {
        providerPlaceId_providerLevelCode: {
          providerPlaceId: 'tomtom-geom-austin',
          providerLevelCode: 'Municipality',
        },
      },
    });
    // Resolved to the id-matched row despite the name disagreeing entirely.
    expect(resolved.placeId).toBe(stored.placeId);
    // The name-candidate lookup never ran, and nothing was forked.
    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
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

  it('appends a new parent edge ATOMICALLY (Prisma push — concurrent merges cannot drop each other, finding 1c)', async () => {
    const priorParent = '11111111-1111-4111-8111-111111111111';
    const texasRow = makePlaceRow({
      placeId: 'id-texas-row',
      name: 'Texas',
      providerLevelCode: 'subdivision',
      providerPlaceId: 'tomtom-geom-texas',
    });
    const existingAustin = makePlaceRow({
      parentPlaceIds: [priorParent],
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, update } = makeHarness([texasRow, existingAustin]);

    await service.sketchChain([
      { ...austinNode, bbox: null },
      {
        name: 'Texas',
        providerLevelCode: 'subdivision',
        countryCode: 'US',
        subdivisionCode: 'TX',
        providerPlaceId: 'tomtom-geom-texas',
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

describe('THE FINAL DISSOLUTION — identity is (vendor id, level); the name table is gone', () => {
  it('an id-LESS node is REFUSED (the fallback lane is deleted — TomTom or nothing): nothing minted, nothing updated, loud log', async () => {
    // The mirror law: a place is a vendor entity. An observation without the
    // vendor id is not an entity observation — it updates nothing and mints
    // nothing. (Measured 2026-07-30: 0 of 22,769 places lack an id; the
    // id-less case has never occurred in live traffic. The machinery that
    // reconciled it was where the only crash bug of the arc lived.)
    const { service, create, update, updateMany, findMany } = makeHarness([
      null,
    ]);
    const results = await service.sketchChain([
      { ...austinNode, providerPlaceId: null },
    ]);
    expect(results).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled(); // no name lookup exists to run
  });

  it('the same vendor id at a DIFFERENT level mints a SIBLING carrying the SAME id — identity is (id, level)', async () => {
    // The coincident-boundary case (a city-state, a consolidated
    // city-county): the vendor stamps one geometry id on two rungs and
    // distinguishes the entities by entityType. So do we — the composite
    // unique (provider_place_id, provider_level_code) IS the vendor's own
    // identity, and the old id-STRIP hack (mint the sibling id-less, then
    // reconcile it by name forever after) dies with the name table.
    const stateRow = makePlaceRow({
      placeId: 'id-state-row',
      providerLevelCode: 'CountrySubdivision',
      providerPlaceId: 'tomtom-geom-austin',
    });
    const { service, create, findUniqueVendorId } = makeHarness([null]);
    findUniqueVendorId.mockImplementation((args: any) => {
      // Answer BOTH query shapes: the old simple-id lookup (so this test is
      // RED against the pre-dissolution code, which then STRIPPED the id)
      // and the composite (id, level) lookup the dissolution introduces.
      const composite = args?.where?.providerPlaceId_providerLevelCode;
      if (composite) {
        return Promise.resolve(
          composite.providerPlaceId === 'tomtom-geom-austin' &&
            composite.providerLevelCode === 'CountrySubdivision'
            ? stateRow
            : null,
        );
      }
      return Promise.resolve(
        args?.where?.providerPlaceId === 'tomtom-geom-austin' ? stateRow : null,
      );
    });
    await service.sketchChain([austinNode]); // Municipality, same id
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.providerPlaceId).toBe(
      'tomtom-geom-austin',
    );
    expect(create.mock.calls[0][0].data.providerLevelCode).toBe('Municipality');
  });
});

// The §1 COUNTY-AXIS decision table describe block (rules c/b'/a/u1-u4,
// ~15 tests) was DELETED with the law it pinned (THE FINAL DISSOLUTION,
// 2026-07-30): identity is the vendor's composite (id, level); id-less
// observations are refused, so there is nothing left for a county axis to
// disambiguate. County survives only as a gap-filled scalar in mergeSketch.

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
  });

  it('the viewport read names a cap and ranks centre-containing grounds ahead of it (SHAPE ONLY — the LAW is proven in places-viewport-cap.integration.spec.ts)', async () => {
    // Abuse audit 2026-08-01: this read had no LIMIT, so a world-span view
    // scanned every ground and serialized 11 MB of GeoJSON — reachable at
    // 100/min from an UNAUTHENTICATED endpoint. The ORDERING flipped with
    // the center-anchored header law (2026-08-07): area-DESC protected the
    // dominator law's winners (the largest places) and dropped exactly the
    // class the new law selects from (the finest centred place), so the
    // centre-containment key now outranks the cut.
    //
    // F371/D30 — READ THE TITLE. This case string-matches the query and
    // proves nothing about the cap's VALUE or the ordering's EFFECT; the
    // relationship — "the smallest centred ground survives an over-capacity
    // read" — is a PostGIS fact asserted in
    // places-viewport-cap.integration.spec.ts, where bare area-DESC turns
    // RED. What survives here is a shape tripwire, nothing more.
    const { service, queryRaw } = makeHarness([]);
    queryRaw.mockResolvedValueOnce([]);
    await service.placesInView({
      minLat: -85,
      minLng: -180,
      maxLat: 85,
      maxLng: 180,
    });
    const [template] = queryRaw.mock.calls[0] as [
      { strings?: string[]; sql?: string },
    ];
    const sql = template.strings
      ? template.strings.join('?')
      : String(template.sql ?? '');
    expect(sql).toContain('ST_Covers(');
    expect(sql).toContain('ST_Area(g.geometry) DESC');
    expect(sql).toContain('LIMIT');
  });

  it('a ground read failure THROWS — never an empty result, never a weaker judgment', async () => {
    // Round-2 red team: returning [] here made a Postgres blip
    // indistinguishable from an honest "nothing here" — the header rendered
    // «this area» and the feed rendered empty, behind one warn line. The
    // §2.6 half survives (no bbox-judged fallback arm); the failure is now
    // a failure.
    const { service, findMany, queryRaw } = makeHarness([]);
    queryRaw.mockRejectedValue(new Error('postgis down'));

    await expect(
      service.placesInView({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 }),
    ).rejects.toThrow('postgis down');
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
    // 2 view arms + 1 centre-point envelope prefilter in the ORDER BY (the
    // sort-key guard that keeps ST_Covers off every &&-matched row).
    expect((sql.match(/geometry && /g) ?? []).length).toBe(3);
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
    // 1 view arm + the centre prefilter.
    expect((plainSql.match(/geometry && /g) ?? []).length).toBe(2);
  });
});

describe('PlacesCatalogService — §2.5(d) polygon at birth', () => {
  it('a CREATED place fires the birth enqueue (awaited — the newborn promote closes the vendor-bbox window in the same settle)', async () => {
    const { service, birthListener, create } = makeHarness([null]);
    const [created] = await service.sketchChain([austinNode]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(birthListener.enqueue).toHaveBeenCalledWith(
      created.placeId,
      'birth',
      null,
    );
  });

  it('BULK callers never spend inline: a bulk_seed chain enqueues with its own trigger, so the governed drain (not the mint) pays for the outline', async () => {
    // Red-team 2026-08-01, cross-change finding: the awaited birth promote
    // is for a USER settle. The seed scripts call sketchChain in a loop —
    // with trigger 'birth' every seeded place spent an inline, UNCAMPAIGNED
    // scarce polygon draw, breaking the seeders' own stated law ("NO direct
    // vendor calls happen here... budgeted by this campaign's envelope") and
    // serializing an HTTP fetch per place across a ~22k-probe grid run.
    const { service, birthListener, create } = makeHarness([null]);
    const [created] = await service.sketchChain([austinNode], {
      birthTrigger: 'bulk_seed',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(birthListener.enqueue).toHaveBeenCalledWith(
      created.placeId,
      'bulk_seed',
      null,
    );
    // The promotion service promotes synchronously ONLY for 'birth', so a
    // non-birth trigger provably cannot draw inline.
    expect(birthListener.enqueue).not.toHaveBeenCalledWith(
      created.placeId,
      'birth',
      null,
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
