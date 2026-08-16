/* eslint-disable @typescript-eslint/require-await -- the `async` on these jest.fn mocks is
   not decoration: each stands in for a genuinely async method, so the mock must return a
   promise to match the interface it replaces. The rule targets a function that only
   PRETENDS to be async; that is not this. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * F1910: `mapRestaurantResults` used to issue a per-item `connection.findMany`
 * (top foods) inside an awaited `for...of` loop — N sequential round trips for
 * an N-item list. This proves the batched replacement (1) issues exactly ONE
 * `connection.findMany` call regardless of item count, and (2) still maps each
 * restaurant's topFood snippets to the CORRECT connections — a naive batch
 * rewrite that forgot to group by `restaurantId` would attribute every
 * restaurant's topFoods to every item (or the wrong item), which a
 * count-only assertion would not catch.
 */
import 'reflect-metadata';
import { UserListMapper, type UserListItemDetail } from './user-list.mappers';

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

describe('UserListMapper.mapRestaurantResults batching (F1910)', () => {
  function buildHarness() {
    // Two restaurants, each with one distinctly-named, distinctly-scored
    // connection. A row-mismapping bug (e.g. assigning ALL connections to
    // the first item, or not filtering by restaurantId) would surface as
    // rest-1 getting rest-2's dish (or both dishes) in its topFood array.
    const connectionsByPlace: Record<string, any[]> = {
      'rest-1': [
        {
          connectionId: 'conn-1',
          placeId: 'rest-1',
          itemId: 'food-1',
          totalUpvotes: 5,
          item: { entityId: 'food-1', name: 'Rest1 Dish' },
        },
      ],
      'rest-2': [
        {
          connectionId: 'conn-2',
          placeId: 'rest-2',
          itemId: 'food-2',
          totalUpvotes: 9,
          item: { entityId: 'food-2', name: 'Rest2 Dish' },
        },
      ],
    };

    const connectionFindMany = jest.fn(async ({ where }: any) => {
      const ids: string[] = where.placeId.in;
      return ids.flatMap((id) => connectionsByPlace[id] ?? []);
    });

    const scoresBySubject: Record<string, number> = {
      'rest-1': 4.1,
      'rest-2': 4.5,
      'conn-1': 3.9,
      'conn-2': 4.7,
    };

    const publicEntityScoreFindMany = jest.fn(async ({ where }: any) => {
      const ids: string[] = where.subjectId.in;
      return ids
        .filter((id) => id in scoresBySubject)
        .map((id) => ({
          subjectId: id,
          displayScore: scoresBySubject[id],
          percentileRank: 0.5,
          rising: 0,
        }));
    });

    const prisma = {
      publicEntityScore: { findMany: publicEntityScoreFindMany },
      connection: { findMany: connectionFindMany },
    };
    const mapper = new UserListMapper(prisma as never, createLogger() as never);
    return { mapper, connectionFindMany, publicEntityScoreFindMany };
  }

  function buildItems(): UserListItemDetail[] {
    return [
      {
        itemId: 'item-1',
        note: null,
        place: {
          entityId: 'rest-1',
          name: 'Restaurant One',
          aliases: [],
          address: null,
          priceLevel: null,
          priceLevelUpdatedAt: null,
          generalPraiseUpvotes: 0,
          primaryLocation: null,
        },
      },
      {
        itemId: 'item-2',
        note: null,
        place: {
          entityId: 'rest-2',
          name: 'Restaurant Two',
          aliases: [],
          address: null,
          priceLevel: null,
          priceLevelUpdatedAt: null,
          generalPraiseUpvotes: 0,
          primaryLocation: null,
        },
      },
    ] as unknown as UserListItemDetail[];
  }

  it('issues exactly ONE connection.findMany for a multi-item list (not one per item)', async () => {
    const { mapper, connectionFindMany } = buildHarness();
    await mapper.mapPlaceResults(buildItems());
    expect(connectionFindMany).toHaveBeenCalledTimes(1);
  });

  it('attributes each restaurant its OWN topFood connections, not a mismapped/merged set', async () => {
    const { mapper } = buildHarness();
    const out = await mapper.mapPlaceResults(buildItems());

    const rest1 = out.find((r) => r.placeId === 'rest-1');
    const rest2 = out.find((r) => r.placeId === 'rest-2');
    expect(rest1).toBeDefined();
    expect(rest2).toBeDefined();

    expect(rest1!.topItem).toHaveLength(1);
    expect(rest1!.topItem[0].connectionId).toBe('conn-1');
    expect(rest1!.topItem[0].itemName).toBe('Rest1 Dish');

    expect(rest2!.topItem).toHaveLength(1);
    expect(rest2!.topItem[0].connectionId).toBe('conn-2');
    expect(rest2!.topItem[0].itemName).toBe('Rest2 Dish');
  });
});
