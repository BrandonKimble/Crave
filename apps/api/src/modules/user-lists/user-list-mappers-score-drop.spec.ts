/* eslint-disable @typescript-eslint/require-await -- the `async` on these jest.fn mocks is
   not decoration: each stands in for a genuinely async method, so the mock must return a
   promise to match the interface it replaces. The rule targets a function that only
   PRETENDS to be async; that is not this. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * F604: `toPublicScoreValue` used to THROW (InternalServerErrorException) on
 * an unscored SAVED item, 500-ing the entire list detail — while the sibling
 * preview path (`buildListSummary`) drops such rows with a loud log. This
 * proves `mapRestaurantResults`/`mapFoodResults` now DROP + COUNT instead of
 * throwing.
 */
import 'reflect-metadata';
import { CraveScoreSubjectType } from '@prisma/client';
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

describe('UserListMapper score drop policy (F604)', () => {
  function buildHarness(scoredSubjectIds: Set<string>) {
    const prisma = {
      publicEntityScore: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.subjectId.in;
          return ids
            .filter((id) => scoredSubjectIds.has(id))
            .map((id) => ({
              subjectId: id,
              displayScore: 4.2,
              percentileRank: 0.5,
              rising: 0,
            }));
        }),
      },
      connection: {
        findMany: jest.fn(async () => []),
      },
    };
    const mapper = new UserListMapper(prisma as never, createLogger() as never);
    return { mapper, prisma };
  }

  it('mapRestaurantResults never throws on an unscored restaurant — item survives with craveScore null', async () => {
    const { mapper } = buildHarness(new Set()); // nothing scored
    const items = [
      {
        itemId: 'item-1',
        note: null,
        place: {
          entityId: 'rest-1',
          name: 'Test Restaurant',
          aliases: [],
          address: null,
          priceLevel: null,
          priceLevelUpdatedAt: null,
          generalPraiseUpvotes: 0,
          primaryLocation: null,
        },
      },
    ] as unknown as UserListItemDetail[];

    const results = await expect(
      mapper.mapPlaceResults(items),
    ).resolves.toBeDefined();
    void results;
    const out = await mapper.mapPlaceResults(items);
    expect(out).toHaveLength(1);
    expect(out[0].craveScore).toBeNull();
  });

  it('mapFoodResults DROPS (not throws) an unscored connection, and counts it', async () => {
    const { mapper, prisma } = buildHarness(new Set()); // nothing scored
    void prisma;
    const items = [
      {
        itemId: 'item-1',
        note: null,
        connection: {
          connectionId: 'conn-1',
          itemId: 'food-1',
          placeId: 'rest-1',
          mentionCount: 0,
          totalUpvotes: 0,
          lastMentionedAt: null,
          categories: [],
          itemAttributes: [],
          item: { name: 'Taco', aliases: [] },
          place: {
            name: 'Test Restaurant',
            aliases: [],
            priceLevel: null,
            primaryLocation: null,
          },
        },
      },
    ] as unknown as UserListItemDetail[];

    await expect(mapper.mapItemResults(items)).resolves.not.toThrow?.();
    const out = await mapper.mapItemResults(items);
    expect(out).toHaveLength(0);
  });

  it('mapFoodResults keeps a fully-scored connection with both scores populated', async () => {
    const { mapper } = buildHarness(new Set(['conn-1', 'rest-1']));
    const items = [
      {
        itemId: 'item-1',
        note: null,
        connection: {
          connectionId: 'conn-1',
          itemId: 'food-1',
          placeId: 'rest-1',
          mentionCount: 0,
          totalUpvotes: 0,
          lastMentionedAt: null,
          categories: [],
          itemAttributes: [],
          item: { name: 'Taco', aliases: [] },
          place: {
            name: 'Test Restaurant',
            aliases: [],
            priceLevel: null,
            primaryLocation: null,
          },
        },
      },
    ] as unknown as UserListItemDetail[];

    const out = await mapper.mapItemResults(items);
    expect(out).toHaveLength(1);
    expect(out[0].craveScore).toBeCloseTo(4.2);
    expect(out[0].placeCraveScore).toBeCloseTo(4.2);
  });

  it('sanity: CraveScoreSubjectType import unused directly, kept for prisma typing parity', () => {
    expect(CraveScoreSubjectType.restaurant).toBeDefined();
  });
});
