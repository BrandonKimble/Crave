/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §1 identity-law fixtures (plans/geo-demand-foundation-rebuild.md §1, §17):
 * no silent forks — re-sketching the same placeKey (countryCode,
 * subdivisionCode?, providerLevelCode, normalized name) MERGES (bbox widens
 * to union, providerPlaceId adopted as alias, parent edges union) instead of
 * creating a twin row; chain order supplies the DAG's parent edges.
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
    providerLevelCode: 'municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
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
  existingByCall: Array<ReturnType<typeof makePlaceRow> | null>,
) {
  const findFirst = jest.fn();
  for (const row of existingByCall) {
    findFirst.mockResolvedValueOnce(row);
  }
  findFirst.mockResolvedValue(null);
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
  const findMany = jest.fn().mockResolvedValue([]);
  const findUniqueOrThrow = jest
    .fn()
    .mockImplementation(() => Promise.resolve(makePlaceRow()));
  const executeRaw = jest.fn().mockResolvedValue(1);
  const prisma: any = {
    place: {
      findFirst,
      create,
      update,
      findMany,
      findUniqueOrThrow,
      // Prisma field-reference stub (crossing-row branch of the WHEREs).
      fields: { bboxMaxLng: Symbol('bboxMaxLng') },
    },
    $executeRaw: executeRaw,
  };
  const service = new PlacesCatalogService(prisma, logger);
  return {
    service,
    prisma,
    findFirst,
    create,
    update,
    findMany,
    findUniqueOrThrow,
    executeRaw,
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
    const { service, create, update, findFirst } = makeHarness([existing]);

    await service.sketchChain([
      { ...austinNode, name: '  AUSTIN  ' }, // trim/collapse + case-insensitive match
    ]);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled(); // identical observation → idempotent no-op
    // The identity lookup normalized the name and compared case-insensitively.
    expect(findFirst.mock.calls[0][0].where.name).toEqual({
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
    // a plain read-modify-write update would let one merge shrink another's).
    expect(update).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
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

describe('PlacesCatalogService.placesInView — §2 coverage shares', () => {
  it('returns intersecting places with coverage-of-view shares', async () => {
    const half = makePlaceRow({
      name: 'West Town',
      bboxMinLat: 0,
      bboxMinLng: 0,
      bboxMaxLat: 1,
      bboxMaxLng: 1,
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
  });
});

describe('PlacesCatalogService.smallestContaining — §2/§3 containment read', () => {
  it('picks the smallest-area containing place (point = zero-area bbox)', async () => {
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
    const { service, findMany } = makeHarness([]);
    findMany.mockResolvedValue([county, city]);

    const smallest = await service.smallestContaining({ lat: 0.5, lng: 0.5 });
    expect(smallest?.name).toBe('City');
  });
});
