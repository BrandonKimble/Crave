import { descendantPlaceIds, isSubdivisionOrBigger } from './place-dag-read';

const COUNTRY = '00000000-0000-0000-0000-0000000000aa';
const STATE = '00000000-0000-0000-0000-0000000000bb';
const COUNTY = '00000000-0000-0000-0000-0000000000cc';
const TOWN = '00000000-0000-0000-0000-0000000000dd';

/** Mocked place table keyed by id → parent edges (duplicates allowed). */
function prismaWithParents(parents: Record<string, string[]>) {
  return {
    place: {
      findMany: jest.fn(({ where }: { where: { placeId: { in: string[] } } }) =>
        Promise.resolve(
          where.placeId.in
            .filter((id) => id in parents)
            .map((id) => ({ placeId: id, parentPlaceIds: parents[id] })),
        ),
      ),
    },
    $queryRaw: jest.fn(),
  };
}

describe('place-dag-read — descendantPlaceIds (§6 subtree expansion)', () => {
  it('runs ONE recursive CTE over parent_place_ids with deduped roots', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ place_id: STATE }, { place_id: TOWN }]),
    };
    const result = await descendantPlaceIds(prisma as never, [
      STATE,
      STATE, // duplicate collapses before it reaches the DB
    ]);
    expect(result).toEqual([STATE, TOWN]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [query] = prisma.$queryRaw.mock.calls[0] as [
      { sql: string; values: unknown[] },
    ];
    expect(query.sql).toContain('WITH RECURSIVE subtree');
    expect(query.values).toContainEqual([STATE]);
  });

  it('empty roots short-circuit without touching the DB', async () => {
    const prisma = { $queryRaw: jest.fn() };
    expect(await descendantPlaceIds(prisma as never, [])).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('place-dag-read — isSubdivisionOrBigger (§4 structural bigness)', () => {
  it('a parentless ROOT (country level) is big', async () => {
    const prisma = prismaWithParents({ [COUNTRY]: [] });
    expect(await isSubdivisionOrBigger(prisma as never, COUNTRY)).toBe(true);
  });

  it('a direct child of a root (first-level subdivision) is big', async () => {
    const prisma = prismaWithParents({
      [STATE]: [COUNTRY],
      [COUNTRY]: [],
    });
    expect(await isSubdivisionOrBigger(prisma as never, STATE)).toBe(true);
  });

  it('a municipality (root at depth ≥ 2) is NOT big', async () => {
    const prisma = prismaWithParents({
      [TOWN]: [COUNTY, STATE],
      [COUNTY]: [STATE],
      [STATE]: [COUNTRY],
      [COUNTRY]: [],
    });
    expect(await isSubdivisionOrBigger(prisma as never, TOWN)).toBe(false);
  });

  it('duplicate parent edges (the catalog append semantics) dedupe — a town with doubled edges stays small', async () => {
    const prisma = prismaWithParents({
      [TOWN]: [STATE, STATE],
      [STATE]: [COUNTRY, COUNTRY],
      [COUNTRY]: [],
    });
    expect(await isSubdivisionOrBigger(prisma as never, TOWN)).toBe(false);
  });
});
