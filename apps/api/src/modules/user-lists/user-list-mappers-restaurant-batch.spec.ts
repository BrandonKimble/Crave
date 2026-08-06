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
import { CraveScoreSubjectType } from '@prisma/client';
import {
  UserListMapper,
  type UserListItemDetail,
} from './user-list.mappers';

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
    const connectionsByRestaurant: Record<string, any[]> = {
      'rest-1': [
        {
          connectionId: 'conn-1',
          restaurantId: 'rest-1',
          foodId: 'food-1',
          totalUpvotes: 5,
          food: { entityId: 'food-1', name: 'Rest1 Dish' },
        },
      ],
      'rest-2': [
        {
          connectionId: 'conn-2',
          restaurantId: 'rest-2',
          foodId: 'food-2',
          totalUpvotes: 9,
          food: { entityId: 'food-2', name: 'Rest2 Dish' },
        },
      ],
    };

    const connectionFindMany = jest.fn(async ({ where }: any) => {
      const ids: string[] = where.restaurantId.in;
      return ids.flatMap((id) => connectionsByRestaurant[id] ?? []);
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
        restaurant: {
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
        restaurant: {
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
    await mapper.mapRestaurantResults(buildItems());
    expect(connectionFindMany).toHaveBeenCalledTimes(1);
  });

  it('attributes each restaurant its OWN topFood connections, not a mismapped/merged set', async () => {
    const { mapper } = buildHarness();
    const out = await mapper.mapRestaurantResults(buildItems());

    const rest1 = out.find((r) => r.restaurantId === 'rest-1');
    const rest2 = out.find((r) => r.restaurantId === 'rest-2');
    expect(rest1).toBeDefined();
    expect(rest2).toBeDefined();

    expect(rest1!.topFood).toHaveLength(1);
    expect(rest1!.topFood[0].connectionId).toBe('conn-1');
    expect(rest1!.topFood[0].foodName).toBe('Rest1 Dish');

    expect(rest2!.topFood).toHaveLength(1);
    expect(rest2!.topFood[0].connectionId).toBe('conn-2');
    expect(rest2!.topFood[0].foodName).toBe('Rest2 Dish');
  });

  it('sanity: CraveScoreSubjectType import unused directly, kept for prisma typing parity', () => {
    expect(CraveScoreSubjectType.restaurant).toBeDefined();
  });
});
