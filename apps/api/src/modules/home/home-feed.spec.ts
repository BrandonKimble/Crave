/**
 * HOME feed + detail reads — the charter contracts:
 *  - viewport rolls UP to the containing live city (header may be finer);
 *  - made-for-you shelf orders FIRST when personal lists exist;
 *  - the near-you shelf is a read-time derived view gated by the SAME
 *    min-viable law (red-provable both ways);
 *  - no containing city → honest {resolvedCity: null, liveCities} fallback;
 *  - list detail mirrors the favorites read shape (label/subLabel/craveScore
 *    from LIVE joins, dish rows resolving their connection score).
 */
import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { HomeFeedService } from './home-feed.service';
import { MIN_VIABLE_LIST_ITEMS } from './curated-lists.constants';

const CITY = '11111111-1111-1111-1111-111111111111';
const NEIGHBORHOOD = '55555555-5555-5555-5555-555555555555';
const USER = '22222222-2222-2222-2222-222222222222';

const VIEW = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };

function uuid(n: number): string {
  return `aaaaaaaa-aaaa-aaaa-aaaa-${String(n).padStart(12, '0')}`;
}

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

interface ListFixture {
  listId: string;
  cityPlaceId: string;
  recipeKey: string;
  scope: string;
  ownerUserId: string | null;
  listType: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  rotationKey: string;
  itemCount: number;
  builtAt?: Date;
  items?: Array<{
    rank: number;
    entityId: string;
    restaurantId: string | null;
    connectionId?: string | null;
    entity: {
      entityId: string;
      name: string;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    restaurant?: {
      entityId: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }>;
}

function createHarness(options: {
  headerPlace: { placeId: string; name: string } | null;
  lists: ListFixture[];
  /** placeId → deduped parent ids (drives the upward rollup walk). */
  parents?: Record<string, string[]>;
  /** near_you raw rows: [listId, rank, name]. */
  nearYouRows?: Array<{ list_id: string; rank: number; name: string }>;
  previewItems?: Array<{ listId: string; entity: { name: string } }>;
  scores?: Array<{
    subjectId: string;
    displayScore: number;
    percentileRank: number | null;
    rising: number | null;
  }>;
  cityNames?: Record<string, string>;
}) {
  const parents = options.parents ?? {};
  const cityNames = options.cityNames ?? { [CITY]: 'Austin' };
  const globalCities = [
    ...new Set(
      options.lists
        .filter((list) => list.scope === 'global')
        .map((list) => list.cityPlaceId),
    ),
  ];

  const prisma = {
    $queryRaw: jest.fn((query: { sql: string; values: unknown[] }) => {
      const { sql } = query;
      if (sql.includes('/*curated:feed_cities*/')) {
        return Promise.resolve(
          globalCities.map((place_id) => ({
            place_id,
            name: cityNames[place_id] ?? 'Unknown',
          })),
        );
      }
      if (sql.includes('/*curated:near_you_items*/')) {
        return Promise.resolve(options.nearYouRows ?? []);
      }
      throw new Error(`unexpected raw query: ${sql.slice(0, 80)}`);
    }),
    curatedList: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: {
            cityPlaceId: string;
            OR: Array<{ scope?: string; ownerUserId?: string }>;
          };
        }) =>
          Promise.resolve(
            options.lists.filter(
              (list) =>
                list.cityPlaceId === where.cityPlaceId &&
                where.OR.some(
                  (arm) =>
                    (arm.scope && list.scope === arm.scope) ||
                    (arm.ownerUserId && list.ownerUserId === arm.ownerUserId),
                ),
            ),
          ),
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: {
            listId: string;
            OR: Array<{ scope?: string; ownerUserId?: string }>;
          };
        }) => {
          const list = options.lists.find(
            (row) =>
              row.listId === where.listId &&
              where.OR.some(
                (arm) =>
                  (arm.scope && row.scope === arm.scope) ||
                  (arm.ownerUserId && row.ownerUserId === arm.ownerUserId),
              ),
          );
          if (!list) {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            ...list,
            builtAt: list.builtAt ?? new Date('2026-07-26T06:00:00Z'),
            city: {
              placeId: list.cityPlaceId,
              name: cityNames[list.cityPlaceId] ?? 'Unknown',
            },
            items: list.items ?? [],
          });
        },
      ),
    },
    curatedListItem: {
      findMany: jest.fn(({ where }: { where: { listId: { in: string[] } } }) =>
        Promise.resolve(
          (options.previewItems ?? []).filter((item) =>
            where.listId.in.includes(item.listId),
          ),
        ),
      ),
    },
    place: {
      findMany: jest.fn(({ where }: { where: { placeId: { in: string[] } } }) =>
        Promise.resolve(
          where.placeId.in
            .filter((id) => id in parents)
            .map((id) => ({ placeId: id, parentPlaceIds: parents[id] })),
        ),
      ),
    },
    userList: {
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
      create: jest.fn(
        ({
          data,
        }: {
          data: { ownerUserId: string; name: string; listType: string };
        }) =>
          Promise.resolve({
            listId: 'ffffffff-ffff-ffff-ffff-000000000001',
            ...data,
          }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    userListItem: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    publicEntityScore: {
      findMany: jest.fn(
        ({ where }: { where: { subjectId: { in: string[] } } }) =>
          Promise.resolve(
            (options.scores ?? []).filter((score) =>
              where.subjectId.in.includes(score.subjectId),
            ),
          ),
      ),
    },
  };

  const viewportVerdict = {
    resolveViewportVerdict: jest.fn().mockResolvedValue({
      headerPlace: options.headerPlace,
      placeIds: [],
      placesInView: [],
    }),
  };

  const service = new HomeFeedService(
    prisma as never,
    viewportVerdict as never,
    createLogger() as never,
  );
  return { service, prisma };
}

function globalList(
  n: number,
  recipeKey: string,
  overrides: Partial<ListFixture> = {},
): ListFixture {
  return {
    listId: uuid(n),
    cityPlaceId: CITY,
    recipeKey,
    scope: 'global',
    ownerUserId: null,
    listType: 'restaurant',
    title: `List ${n}`,
    subtitle: null,
    iconKey: 'cuisine',
    rotationKey: '2026-07-26',
    itemCount: 10,
    ...overrides,
  };
}

describe('HomeFeedService.getFeed — the city-rollup shelves read', () => {
  it('rolls the FINER header place up the DAG to the containing live city; shelves carry previewNames', async () => {
    const { service } = createHarness({
      headerPlace: { placeId: NEIGHBORHOOD, name: 'Old Town' },
      parents: { [NEIGHBORHOOD]: [CITY] },
      lists: [globalList(1, 'cuisine_best:attr-1')],
      previewItems: [
        { listId: uuid(1), entity: { name: 'Alpha' } },
        { listId: uuid(1), entity: { name: 'Beta' } },
        { listId: uuid(1), entity: { name: 'Gamma' } },
      ],
    });
    const feed = await service.getFeed(VIEW, USER);
    expect(feed.resolvedCity).toEqual({ placeId: CITY, name: 'Austin' });
    const bestOf = feed.shelves.find((shelf) => shelf.key === 'best_of');
    expect(bestOf?.lists).toEqual([
      expect.objectContaining({
        listId: uuid(1),
        previewNames: ['Alpha', 'Beta', 'Gamma'],
      }),
    ]);
  });

  it('made-for-you shelf orders FIRST when the requesting user has personal lists (and only theirs)', async () => {
    const { service } = createHarness({
      headerPlace: { placeId: CITY, name: 'Austin' },
      lists: [
        globalList(1, 'trending'),
        globalList(2, 'your_weekly_tasting', {
          scope: 'personal',
          ownerUserId: USER,
          listType: 'dish',
        }),
        // Another user's personal list must never leak into this feed.
        globalList(3, 'your_weekly_tasting', {
          scope: 'personal',
          ownerUserId: uuid(77),
          listType: 'dish',
        }),
      ],
    });
    const feed = await service.getFeed(VIEW, USER);
    expect(feed.shelves[0].key).toBe('made_for_you');
    expect(feed.shelves[0].lists.map((list) => list.listId)).toEqual([uuid(2)]);
    expect(
      feed.shelves.flatMap((shelf) => shelf.lists.map((list) => list.listId)),
    ).not.toContain(uuid(3));
  });

  it('NEAR-YOU gate is red-provable: a finer header with >= min-viable in-ground items derives the shelf; one fewer suppresses it', async () => {
    const nearYouRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        list_id: uuid(1),
        rank: i + 1,
        name: `Spot ${i + 1}`,
      }));
    const base = {
      headerPlace: { placeId: NEIGHBORHOOD, name: 'The Domain' },
      parents: { [NEIGHBORHOOD]: [CITY] },
      lists: [globalList(1, 'cuisine_best:attr-1')],
    };

    const passing = createHarness({
      ...base,
      nearYouRows: nearYouRows(MIN_VIABLE_LIST_ITEMS),
    });
    const feedWithShelf = await passing.service.getFeed(VIEW, USER);
    const nearYou = feedWithShelf.shelves.find(
      (shelf) => shelf.key === 'near_you',
    );
    expect(nearYou?.title).toBe('Best near you in The Domain');
    expect(nearYou?.lists[0]).toEqual(
      expect.objectContaining({
        listId: uuid(1),
        itemCount: MIN_VIABLE_LIST_ITEMS,
        previewNames: ['Spot 1', 'Spot 2', 'Spot 3'],
      }),
    );

    const failing = createHarness({
      ...base,
      nearYouRows: nearYouRows(MIN_VIABLE_LIST_ITEMS - 1),
    });
    const feedWithout = await failing.service.getFeed(VIEW, USER);
    expect(
      feedWithout.shelves.find((shelf) => shelf.key === 'near_you'),
    ).toBeUndefined();
  });

  it('header AT the city itself derives no near-you shelf (nothing finer to filter by)', async () => {
    const { service, prisma } = createHarness({
      headerPlace: { placeId: CITY, name: 'Austin' },
      lists: [globalList(1, 'trending')],
      nearYouRows: [],
    });
    const feed = await service.getFeed(VIEW, USER);
    expect(
      feed.shelves.find((shelf) => shelf.key === 'near_you'),
    ).toBeUndefined();
    // The derived read never even runs.
    const nearYouCalls = prisma.$queryRaw.mock.calls.filter(([query]) =>
      (query as { sql: string }).sql.includes('/*curated:near_you_items*/'),
    );
    expect(nearYouCalls).toHaveLength(0);
  });

  it('no containing live city → honest fallback: resolvedCity null, no shelves, liveCities as the pick-a-city vocabulary', async () => {
    const FAR_PLACE = uuid(60);
    const { service } = createHarness({
      headerPlace: { placeId: FAR_PLACE, name: 'Elsewhere' },
      parents: { [FAR_PLACE]: [] },
      lists: [globalList(1, 'trending')], // content exists — in ANOTHER city
    });
    const feed = await service.getFeed(VIEW, USER);
    expect(feed.resolvedCity).toBeNull();
    expect(feed.shelves).toEqual([]);
    expect(feed.liveCities).toEqual([{ placeId: CITY, name: 'Austin' }]);
  });

  it('explicit pick is a SOFT FALLBACK: it resolves a broader-than-city viewport, but never overrides an honest city verdict', async () => {
    const OTHER_CITY = uuid(50);
    const harness = () =>
      createHarness({
        // Broad viewport: header resolves a STATE with no live-city ancestor.
        headerPlace: { placeId: uuid(60), name: 'Texas' },
        parents: { [uuid(60)]: [] },
        lists: [globalList(1, 'trending')],
      });

    // Broader-than-city + picked live city → the pick fills the gap.
    const picked = await harness().service.getFeed(VIEW, USER, CITY);
    expect(picked.resolvedCity).toEqual({ placeId: CITY, name: 'Austin' });

    // A pick of an unknown/non-live city is ignored, not trusted.
    const bogus = await harness().service.getFeed(VIEW, USER, OTHER_CITY);
    expect(bogus.resolvedCity).toBeNull();

    // An honest city-level verdict WINS over a stale pick.
    const verdictWins = createHarness({
      headerPlace: { placeId: CITY, name: 'Austin' },
      lists: [globalList(1, 'trending')],
    });
    const feed = await verdictWins.service.getFeed(VIEW, USER, OTHER_CITY);
    expect(feed.resolvedCity).toEqual({ placeId: CITY, name: 'Austin' });
  });
});

describe('HomeFeedService.getListDetail — the ListDetail-shaped read', () => {
  it('restaurant list: live entity joins + restaurant public score per item', async () => {
    const { service } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'hidden_gems', {
          title: 'Hidden gems of Austin',
          itemCount: 1,
          items: [
            {
              rank: 1,
              entityId: uuid(10),
              restaurantId: null,
              entity: {
                entityId: uuid(10),
                name: 'Quiet Corner',
                city: 'Austin',
                latitude: 30.27,
                longitude: -97.74,
              },
              restaurant: null,
            },
          ],
        }),
      ],
      scores: [
        {
          subjectId: uuid(10),
          displayScore: 9.1,
          percentileRank: 0.97,
          rising: null,
        },
      ],
    });
    const detail = await service.getListDetail(uuid(1), USER);
    expect(detail).toEqual(
      expect.objectContaining({
        listId: uuid(1),
        title: 'Hidden gems of Austin',
        listType: 'restaurant',
        viewerRole: 'viewer',
        city: { placeId: CITY, name: 'Austin' },
      }),
    );
    expect(detail.items).toEqual([
      {
        rank: 1,
        entityId: uuid(10),
        restaurantId: null,
        connectionId: null,
        label: 'Quiet Corner',
        subLabel: 'Austin',
        latitude: 30.27,
        longitude: -97.74,
        craveScore: 9.1,
        craveScoreExact: 0.97,
        rising: null,
      },
    ]);
  });

  it('dish list: the STORED build-time connectionId keys the CONNECTION score; subLabel is the serving restaurant', async () => {
    const { service } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'dish_best:food-1', {
          listType: 'dish',
          itemCount: 1,
          items: [
            {
              rank: 1,
              entityId: uuid(20), // the FOOD entity
              restaurantId: uuid(30),
              connectionId: uuid(40), // build fact stored on the curated row
              entity: {
                entityId: uuid(20),
                name: 'Breakfast Taco',
                city: null,
                latitude: null,
                longitude: null,
              },
              restaurant: {
                entityId: uuid(30),
                name: 'Taco Haus',
                latitude: 30.3,
                longitude: -97.7,
              },
            },
          ],
        }),
      ],
      scores: [
        {
          subjectId: uuid(40), // CONNECTION-keyed score
          displayScore: 9.5,
          percentileRank: 0.99,
          rising: 0.4,
        },
      ],
    });
    const detail = await service.getListDetail(uuid(1), USER);
    expect(detail.items).toEqual([
      {
        rank: 1,
        entityId: uuid(20),
        restaurantId: uuid(30),
        connectionId: uuid(40),
        label: 'Breakfast Taco',
        subLabel: 'Taco Haus',
        latitude: 30.3,
        longitude: -97.7,
        craveScore: 9.5,
        craveScoreExact: 0.99,
        rising: 0.4,
      },
    ]);
  });

  it("another user's personal list 404s for this viewer", async () => {
    const { service } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'your_weekly_tasting', {
          scope: 'personal',
          ownerUserId: uuid(77),
        }),
      ],
    });
    await expect(service.getListDetail(uuid(1), USER)).rejects.toMatchObject({
      name: 'NotFoundException',
    });
  });
});

describe("HomeFeedService.saveListToUserLists — save-a-copy into the caller's lists", () => {
  const restaurantItems = [
    {
      rank: 1,
      entityId: uuid(10),
      restaurantId: null,
      entity: {
        entityId: uuid(10),
        name: 'Quiet Corner',
        city: 'Austin',
        latitude: 30.27,
        longitude: -97.74,
      },
      restaurant: null,
    },
    {
      rank: 2,
      entityId: uuid(11),
      restaurantId: null,
      entity: {
        entityId: uuid(11),
        name: 'Second Spot',
        city: 'Austin',
        latitude: 30.3,
        longitude: -97.7,
      },
      restaurant: null,
    },
  ];

  it('creates a list OWNED by the caller and copies the current items (rank → position)', async () => {
    const { service, prisma } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'hidden_gems', {
          title: 'Hidden gems of Austin',
          itemCount: 2,
          items: restaurantItems,
        }),
      ],
    });
    const saved = await service.saveListToUserLists(uuid(1), USER);
    expect(prisma.userList.create).toHaveBeenCalledWith({
      data: {
        ownerUserId: USER,
        name: 'Hidden gems of Austin',
        listType: 'restaurant',
        position: 5,
      },
    });
    expect(prisma.userListItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          restaurantId: uuid(10),
          position: 1,
          listId: saved.listId,
          addedByUserId: USER,
        },
        {
          restaurantId: uuid(11),
          position: 2,
          listId: saved.listId,
          addedByUserId: USER,
        },
      ],
    });
    expect(prisma.userList.update).toHaveBeenCalledWith({
      where: { listId: saved.listId },
      data: { itemCount: 2 },
    });
    expect(saved).toEqual({
      listId: saved.listId,
      name: 'Hidden gems of Austin',
      itemCount: 2,
    });
  });

  it('dish list: rows copy by the STORED connectionId; legacy rows without one are skipped and the count stays honest', async () => {
    const { service, prisma } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'dish_best:food-1', {
          listType: 'dish',
          itemCount: 2,
          items: [
            {
              rank: 1,
              entityId: uuid(20),
              restaurantId: uuid(30),
              connectionId: uuid(40),
              entity: {
                entityId: uuid(20),
                name: 'Breakfast Taco',
                city: null,
                latitude: null,
                longitude: null,
              },
              restaurant: {
                entityId: uuid(30),
                name: 'Taco Haus',
                latitude: 30.3,
                longitude: -97.7,
              },
            },
            {
              // Legacy row with no stored connectionId — inexpressible as a
              // favorites row, skipped rather than faked.
              rank: 2,
              entityId: uuid(21),
              restaurantId: uuid(31),
              connectionId: null,
              entity: {
                entityId: uuid(21),
                name: 'Mystery Dish',
                city: null,
                latitude: null,
                longitude: null,
              },
              restaurant: null,
            },
          ],
        }),
      ],
    });
    const saved = await service.saveListToUserLists(uuid(1), USER);
    expect(prisma.userListItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          connectionId: uuid(40),
          position: 1,
          listId: saved.listId,
          addedByUserId: USER,
        },
      ],
    });
    expect(saved.itemCount).toBe(1);
  });

  it("another user's personal list 404s — save grants no access the read would not", async () => {
    const { service } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'your_weekly_tasting', {
          scope: 'personal',
          ownerUserId: uuid(77),
        }),
      ],
    });
    await expect(
      service.saveListToUserLists(uuid(1), USER),
    ).rejects.toMatchObject({ name: 'NotFoundException' });
  });

  it('a name conflict on the caller\'s (owner, type, name) unique retries once with a " (copy)" suffix', async () => {
    const { service, prisma } = createHarness({
      headerPlace: null,
      lists: [
        globalList(1, 'hidden_gems', {
          title: 'Hidden gems of Austin',
          itemCount: 2,
          items: restaurantItems,
        }),
      ],
    });
    prisma.userList.create.mockImplementationOnce(() =>
      Promise.reject(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    );
    const saved = await service.saveListToUserLists(uuid(1), USER);
    expect(saved.name).toBe('Hidden gems of Austin (copy)');
  });
});
