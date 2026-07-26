/**
 * Curated-list builder recipes — RED-provable contracts (charter: a list
 * must be EARNED by data):
 *  - a city below the min-viable gate produces NO list (and crossing the
 *    gate produces one — the metric can show red AND green);
 *  - hidden-gems excludes above-median-mention entities and sub-floor
 *    evidence;
 *  - rotation supersedes atomically (old rotations deleted in the SAME
 *    transaction that inserts the new one);
 *  - the weekly personal rotator honors the untried proxy and the
 *    once-per-week idempotence.
 *
 * polls-feed.spec harness style: the prisma fake evaluates the REAL query
 * shapes (marker-tagged raw SQL + prisma args) against in-memory tables,
 * exercised end-to-end through the real service.
 */
import 'reflect-metadata';
import { CuratedListBuilderService } from './curated-list-builder.service';
import {
  HIDDEN_GEMS_EVIDENCE_FLOOR,
  MIN_VIABLE_LIST_ITEMS,
  RECIPE_CUISINE_BEST_PREFIX,
  RECIPE_HIDDEN_GEMS,
  RECIPE_TRENDING,
  RECIPE_WEEKLY_TASTING,
  weeklyRotationKey,
} from './curated-lists.constants';

const CITY = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const MEX_ATTR = '33333333-3333-3333-3333-333333333333';

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

interface RestaurantFixture {
  entity_id: string;
  name: string;
  restaurant_attributes: string[];
  mention_volume: number;
  display_score: number;
  percentile_rank: number;
  rising: number | null;
}

interface DishFixture {
  connection_id: string;
  food_id: string;
  food_name: string;
  restaurant_id: string;
  mention_count: number;
  display_score: number;
  percentile_rank: number;
}

interface StoredList {
  listId: string;
  cityPlaceId: string;
  recipeKey: string;
  scope: string;
  ownerUserId: string | null;
  listType: string;
  title: string;
  rotationKey: string;
  itemCount: number;
  items: Array<{ rank: number; entityId: string; restaurantId: string | null }>;
}

function createHarness(options: {
  restaurants: RestaurantFixture[];
  dishes?: DishFixture[];
  cuisineAttributeIds?: string[];
  attributeEntities?: Array<{
    entityId: string;
    name: string;
    aliases: string[];
  }>;
  users?: Array<{
    userId: string;
    onboardingSelectedCity: string | null;
    onboardingResponses: unknown;
  }>;
  engagedSignalSubjects?: string[];
  engagedFavoriteItems?: Array<{
    connectionId: string | null;
    restaurantId: string | null;
  }>;
  preexistingLists?: StoredList[];
}) {
  const store: StoredList[] = [...(options.preexistingLists ?? [])];
  let nextListId = 1000;
  const txAtomicity: Array<{ deletes: number; creates: number }> = [];

  const makeListDelegate = () => ({
    deleteMany: jest.fn(
      ({
        where,
      }: {
        where: {
          cityPlaceId?: string;
          recipeKey?: string;
          ownerUserId?: string | null;
          rotationKey?: string;
        };
      }) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i -= 1) {
          const row = store[i];
          if (
            (where.cityPlaceId === undefined ||
              row.cityPlaceId === where.cityPlaceId) &&
            (where.recipeKey === undefined ||
              row.recipeKey === where.recipeKey) &&
            (where.ownerUserId === undefined ||
              row.ownerUserId === where.ownerUserId)
          ) {
            store.splice(i, 1);
          }
        }
        return Promise.resolve({ count: before - store.length });
      },
    ),
    create: jest.fn(
      ({
        data,
      }: {
        data: {
          cityPlaceId: string;
          recipeKey: string;
          scope: string;
          ownerUserId: string | null;
          listType: string;
          title: string;
          rotationKey: string;
          itemCount: number;
          items: {
            create: Array<{
              rank: number;
              entityId: string;
              restaurantId: string | null;
            }>;
          };
        };
      }) => {
        const row: StoredList = {
          listId: uuid(nextListId++),
          cityPlaceId: data.cityPlaceId,
          recipeKey: data.recipeKey,
          scope: data.scope,
          ownerUserId: data.ownerUserId,
          listType: data.listType,
          title: data.title,
          rotationKey: data.rotationKey,
          itemCount: data.itemCount,
          items: data.items.create,
        };
        store.push(row);
        return Promise.resolve(row);
      },
    ),
    findMany: jest.fn(
      ({ where }: { where: { recipeKey?: string; rotationKey?: string } }) =>
        Promise.resolve(
          store
            .filter(
              (row) =>
                (where.recipeKey === undefined ||
                  row.recipeKey === where.recipeKey) &&
                (where.rotationKey === undefined ||
                  row.rotationKey === where.rotationKey),
            )
            .map((row) => ({
              cityPlaceId: row.cityPlaceId,
              ownerUserId: row.ownerUserId,
            })),
        ),
    ),
  });

  const prisma = {
    $queryRaw: jest.fn((query: { sql: string; values: unknown[] }) => {
      const { sql, values } = query;
      if (sql.includes('/*curated:live_cities*/')) {
        return Promise.resolve([{ place_id: CITY, name: 'Austin' }]);
      }
      if (sql.includes('/*curated:city_restaurants*/')) {
        return Promise.resolve(options.restaurants);
      }
      if (sql.includes('/*curated:city_dishes*/')) {
        const restaurantIds = values[0] as string[];
        return Promise.resolve(
          (options.dishes ?? []).filter((row) =>
            restaurantIds.includes(row.restaurant_id),
          ),
        );
      }
      if (sql.includes('/*curated:cuisine_attribute_ids*/')) {
        return Promise.resolve(
          (options.cuisineAttributeIds ?? []).map((attribute_id) => ({
            attribute_id,
          })),
        );
      }
      if (sql.includes('/*curated:user_engagement*/')) {
        const subjectIds = values[1] as string[];
        return Promise.resolve(
          (options.engagedSignalSubjects ?? [])
            .filter((id) => subjectIds.includes(id))
            .map((subject_id) => ({ subject_id })),
        );
      }
      throw new Error(`unexpected raw query: ${sql.slice(0, 80)}`);
    }),
    entity: {
      findMany: jest.fn(
        ({ where }: { where: { entityId: { in: string[] } } }) =>
          Promise.resolve(
            (options.attributeEntities ?? []).filter((row) =>
              where.entityId.in.includes(row.entityId),
            ),
          ),
      ),
    },
    user: {
      findMany: jest.fn(() => Promise.resolve(options.users ?? [])),
    },
    userListItem: {
      findMany: jest.fn(() =>
        Promise.resolve(options.engagedFavoriteItems ?? []),
      ),
    },
    curatedList: makeListDelegate(),
    $transaction: jest.fn(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        // The tx client records delete/create pairing so the supersede's
        // atomicity (both inside ONE callback) is assertable.
        const txList = makeListDelegate();
        const result = await fn({ curatedList: txList });
        txAtomicity.push({
          deletes: txList.deleteMany.mock.calls.length,
          creates: txList.create.mock.calls.length,
        });
        return result;
      },
    ),
  };

  const service = new CuratedListBuilderService(
    prisma as never,
    createLogger() as never,
  );
  return { service, prisma, store, txAtomicity };
}

function restaurant(
  n: number,
  overrides: Partial<RestaurantFixture> = {},
): RestaurantFixture {
  return {
    entity_id: uuid(n),
    name: `Restaurant ${n}`,
    restaurant_attributes: [],
    mention_volume: 10,
    display_score: 8,
    percentile_rank: 0.5,
    rising: null,
    ...overrides,
  };
}

const NOW = new Date('2026-07-26T12:00:00Z');

describe('CuratedListBuilderService — recipe laws', () => {
  it('MIN-VIABLE GATE is red-provable: 1 fewer than the gate builds NO list; at the gate the list materializes', async () => {
    const below = createHarness({
      restaurants: Array.from({ length: MIN_VIABLE_LIST_ITEMS - 1 }, (_, i) =>
        restaurant(i + 1, { rising: 1 + i }),
      ),
    });
    await below.service.buildAll(NOW);
    expect(below.store).toHaveLength(0);

    const atGate = createHarness({
      restaurants: Array.from({ length: MIN_VIABLE_LIST_ITEMS }, (_, i) =>
        restaurant(i + 1, { rising: 1 + i }),
      ),
    });
    await atGate.service.buildAll(NOW);
    const trending = atGate.store.filter(
      (row) => row.recipeKey === RECIPE_TRENDING,
    );
    expect(trending).toHaveLength(1);
    expect(trending[0].itemCount).toBe(MIN_VIABLE_LIST_ITEMS);
    // Ranked by the score's rising component, descending.
    expect(trending[0].items[0].entityId).toBe(uuid(MIN_VIABLE_LIST_ITEMS));
  });

  it('UNCAPPED RECIPES (owner-ratified 2026-07-26): a 9th viable cuisine materializes — RED under the old MAX_CUISINE_LISTS_PER_CITY=8 cap', async () => {
    // 9 cuisines, each with exactly MIN_VIABLE_LIST_ITEMS member restaurants.
    // Under the deleted cap (slice(0, 8)) the lowest-volume cuisine was cut;
    // uncapped, every min-viable cuisine earns its list.
    const cuisineCount = 9;
    const attrIds = Array.from({ length: cuisineCount }, (_, c) =>
      uuid(900 + c),
    );
    const restaurants: RestaurantFixture[] = [];
    attrIds.forEach((attrId, c) => {
      for (let m = 0; m < MIN_VIABLE_LIST_ITEMS; m += 1) {
        restaurants.push(
          restaurant(100 + c * 10 + m, {
            restaurant_attributes: [attrId],
            // Distinct volumes so cuisine ranking (and the old cap's cut
            // point) is deterministic: cuisine 0 loudest, cuisine 8 quietest.
            mention_volume: 100 - c * 10,
          }),
        );
      }
    });
    const { service, store } = createHarness({
      restaurants,
      cuisineAttributeIds: attrIds,
      attributeEntities: attrIds.map((entityId, c) => ({
        entityId,
        name: `Cuisine ${c}`,
        aliases: [],
      })),
    });
    await service.buildAll(NOW);
    const cuisineLists = store.filter((row) =>
      row.recipeKey.startsWith(RECIPE_CUISINE_BEST_PREFIX),
    );
    // The RED-provable bit: 9 > the old cap of 8. The 9th (quietest) cuisine
    // is present by identity, not just by count.
    expect(cuisineLists).toHaveLength(cuisineCount);
    expect(cuisineLists.map((row) => row.recipeKey)).toContain(
      `${RECIPE_CUISINE_BEST_PREFIX}${attrIds[cuisineCount - 1]}`,
    );
  });

  it('HIDDEN GEMS excludes above-median-mention entities AND sub-evidence-floor rows', async () => {
    // Low-mention cohort 2..8 + five loud 50s. Median = 7.5, so qualifying
    // = volume < 7.5 AND >= floor(3): exactly {3,4,5,6,7}. The volume-2 row
    // is below the evidence floor; every 50 is above the median.
    const lows = [2, 3, 4, 5, 6, 7, 8].map((volume, i) =>
      restaurant(i + 1, { mention_volume: volume, display_score: 9 - i * 0.1 }),
    );
    const highs = [50, 50, 50, 50, 50].map((volume, i) =>
      restaurant(i + 20, { mention_volume: volume, display_score: 9.9 }),
    );
    const { service, store } = createHarness({
      restaurants: [...lows, ...highs],
    });
    await service.buildAll(NOW);
    const gems = store.filter((row) => row.recipeKey === RECIPE_HIDDEN_GEMS);
    expect(gems).toHaveLength(1);
    const memberIds = gems[0].items.map((item) => item.entityId);
    // The five qualifiers, no loud row, no sub-floor row.
    expect(memberIds).toHaveLength(5);
    expect(memberIds).not.toContain(uuid(1)); // volume 2 < evidence floor
    for (let i = 20; i < 25; i += 1) {
      expect(memberIds).not.toContain(uuid(i)); // above-median mentions
    }
    expect(HIDDEN_GEMS_EVIDENCE_FLOOR).toBeGreaterThan(2); // fixture premise
  });

  it('HIDDEN GEMS median is measured over the CREDIBLE population — a long sub-floor tail cannot empty the list (the 2026-07-26 prod shape)', async () => {
    // Prod failure shape: a huge 1-mention enrichment tail dragged the
    // whole-population median BELOW the evidence floor, making
    // "below median AND above floor" structurally empty. Under the credible
    // -population law the tail is invisible to the median: credible volumes
    // {3,3,4,4,5,50,50,50,50,50} → median 27.5 → qualifying {3,3,4,4,5},
    // exactly the min-viable gate.
    const tail = Array.from({ length: 40 }, (_, i) =>
      restaurant(i + 100, { mention_volume: 1, display_score: 5 }),
    );
    const credibleLows = [3, 3, 4, 4, 5].map((volume, i) =>
      restaurant(i + 1, { mention_volume: volume, display_score: 9 - i * 0.1 }),
    );
    const loud = [50, 50, 50, 50, 50].map((volume, i) =>
      restaurant(i + 20, { mention_volume: volume, display_score: 9.9 }),
    );
    const { service, store } = createHarness({
      restaurants: [...tail, ...credibleLows, ...loud],
    });
    await service.buildAll(NOW);
    const gems = store.filter((row) => row.recipeKey === RECIPE_HIDDEN_GEMS);
    // Whole-population median here is 1 (< floor): the OLD law returns [].
    expect(gems).toHaveLength(1);
    const memberIds = gems[0].items.map((item) => item.entityId);
    expect(memberIds).toHaveLength(5); // the five credible-below-median rows
    for (const id of memberIds) {
      expect([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]).toContain(id);
    }
  });

  it('ROTATION SUPERSEDES ATOMICALLY: prior rotations of the tuple are deleted in the SAME transaction that inserts the new rotation', async () => {
    const stale: StoredList = {
      listId: uuid(999),
      cityPlaceId: CITY,
      recipeKey: RECIPE_TRENDING,
      scope: 'global',
      ownerUserId: null,
      listType: 'restaurant',
      title: 'Trending in Austin',
      rotationKey: '2026-07-25',
      itemCount: 5,
      items: [],
    };
    const { service, store, txAtomicity } = createHarness({
      restaurants: Array.from({ length: 6 }, (_, i) =>
        restaurant(i + 1, { rising: 1 + i }),
      ),
      preexistingLists: [stale],
    });
    await service.buildAll(NOW);
    const trending = store.filter((row) => row.recipeKey === RECIPE_TRENDING);
    // Exactly ONE rotation survives — the new one.
    expect(trending).toHaveLength(1);
    expect(trending[0].rotationKey).toBe('2026-07-26');
    // Delete + insert happened inside one $transaction callback.
    expect(txAtomicity.some((tx) => tx.deletes >= 1 && tx.creates === 1)).toBe(
      true,
    );
    expect(txAtomicity.every((tx) => tx.creates <= 1)).toBe(true);
  });

  it("WEEKLY PERSONAL rotator: untried proxy excludes engaged dishes; builds only from the user's preferred cuisines; skips users already built this week", async () => {
    const mexRestaurants = Array.from({ length: 3 }, (_, i) =>
      restaurant(i + 1, { restaurant_attributes: [MEX_ATTR] }),
    );
    const otherRestaurant = restaurant(9); // no preferred cuisine
    const dishes: DishFixture[] = [];
    // 7 candidate dishes at mexican restaurants.
    for (let i = 0; i < 7; i += 1) {
      dishes.push({
        connection_id: uuid(100 + i),
        food_id: uuid(200 + i),
        food_name: `Dish ${i}`,
        restaurant_id: mexRestaurants[i % 3].entity_id,
        mention_count: 5,
        display_score: 8,
        percentile_rank: 0.9 - i * 0.05,
      });
    }
    // A dish at the non-preferred restaurant must never enter the pool.
    dishes.push({
      connection_id: uuid(180),
      food_id: uuid(280),
      food_name: 'Off-cuisine dish',
      restaurant_id: otherRestaurant.entity_id,
      mention_count: 50,
      display_score: 9.9,
      percentile_rank: 0.99,
    });
    const harness = createHarness({
      restaurants: [...mexRestaurants, otherRestaurant],
      dishes,
      attributeEntities: [{ entityId: MEX_ATTR, name: 'Mexican', aliases: [] }],
      users: [
        {
          userId: USER,
          onboardingSelectedCity: 'Austin',
          onboardingResponses: { cuisines: ['mexican'] },
        },
      ],
      // Engagement: one via signals (the food entity), one via a favorite
      // save (the connection) — both must drop out of "untried".
      engagedSignalSubjects: [uuid(200)],
      engagedFavoriteItems: [{ connectionId: uuid(101), restaurantId: null }],
    });
    await harness.service.buildAll(NOW);
    const weekly = harness.store.filter(
      (row) => row.recipeKey === RECIPE_WEEKLY_TASTING,
    );
    expect(weekly).toHaveLength(1);
    expect(weekly[0].scope).toBe('personal');
    expect(weekly[0].ownerUserId).toBe(USER);
    expect(weekly[0].listType).toBe('dish');
    expect(weekly[0].rotationKey).toBe(weeklyRotationKey(NOW));
    const foods = weekly[0].items.map((item) => item.entityId);
    expect(foods).toHaveLength(5); // 7 candidates − 2 engaged
    expect(foods).not.toContain(uuid(200)); // signal-engaged food
    expect(foods).not.toContain(uuid(201)); // connection uuid(101)'s food
    expect(foods).not.toContain(uuid(280)); // off-cuisine dish never enters

    // Re-run inside the same ISO week: idempotent, no rebuild churn.
    const before = harness.store.length;
    const txCountBefore = harness.prisma.$transaction.mock.calls.length;
    await harness.service.buildPersonalWeekly(
      [{ placeId: CITY, name: 'Austin' }],
      NOW,
    );
    expect(harness.store.length).toBe(before);
    expect(harness.prisma.$transaction.mock.calls.length).toBe(txCountBefore);
  });

  it('a user whose selected city is not a LIVE city is honestly skipped (no fake city inference)', async () => {
    const { service, store } = createHarness({
      restaurants: [restaurant(1, { restaurant_attributes: [MEX_ATTR] })],
      attributeEntities: [{ entityId: MEX_ATTR, name: 'Mexican', aliases: [] }],
      users: [
        {
          userId: USER,
          onboardingSelectedCity: 'Nowhereville',
          onboardingResponses: { cuisines: ['mexican'] },
        },
      ],
    });
    await service.buildAll(NOW);
    expect(
      store.filter((row) => row.recipeKey === RECIPE_WEEKLY_TASTING),
    ).toHaveLength(0);
  });
});
