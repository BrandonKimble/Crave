/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  FavoriteListProvisioningService,
  SYSTEM_DEFAULT_LISTS,
  systemKindRank,
} from './favorite-list-provisioning.service';
import { FavoriteListsService } from './favorite-lists.service';

/**
 * Auto-created default lists (page-registry §8.7) + save-sheet flip
 * resolution (§8.8): provisioning idempotency, non-deletability, pinned-top
 * home ordering, and connection→restaurant target resolution.
 */

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONNECTION_ID = '99999999-9999-4999-8999-999999999999';
const RESTAURANT_ID = '11111111-1111-4111-8111-111111111111';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('FavoriteListProvisioningService.ensureDefaultLists', () => {
  function makeHarness(existingKinds: string[]) {
    const createMany = jest
      .fn()
      .mockImplementation((args: any) =>
        Promise.resolve({ count: args.data.length }),
      );
    const prisma: any = {
      favoriteList: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            existingKinds.map((systemKind) => ({ systemKind })),
          ),
        createMany,
      },
    };
    const userStats = { applyDelta: jest.fn().mockResolvedValue(undefined) };
    const service = new FavoriteListProvisioningService(
      prisma as never,
      logger as never,
      userStats as never,
    );
    return { service, createMany, userStats };
  }

  it('creates all four defaults for a fresh user (skipDuplicates backstop)', async () => {
    const { service, createMany, userStats } = makeHarness([]);
    await service.ensureDefaultLists(OWNER);
    expect(createMany).toHaveBeenCalledTimes(1);
    const args = createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data.map((row: any) => row.systemKind)).toEqual([
      'been',
      'want_to_go',
      'tried',
      'want_to_try',
    ]);
    expect(args.data.map((row: any) => row.listType)).toEqual([
      'restaurant',
      'restaurant',
      'dish',
      'dish',
    ]);
    expect(args.data.every((row: any) => row.ownerUserId === OWNER)).toBe(true);
    expect(userStats.applyDelta).toHaveBeenCalledWith(OWNER, {
      favoriteListsCount: 4,
    });
  });

  it('is idempotent: a fully provisioned user writes nothing', async () => {
    const { service, createMany, userStats } = makeHarness(
      SYSTEM_DEFAULT_LISTS.map((entry) => entry.systemKind),
    );
    await service.ensureDefaultLists(OWNER);
    expect(createMany).not.toHaveBeenCalled();
    expect(userStats.applyDelta).not.toHaveBeenCalled();
  });

  it('backfills only the missing kinds', async () => {
    const { service, createMany } = makeHarness(['been', 'tried']);
    await service.ensureDefaultLists(OWNER);
    const args = createMany.mock.calls[0][0];
    expect(args.data.map((row: any) => row.systemKind)).toEqual([
      'want_to_go',
      'want_to_try',
    ]);
  });
});

describe('system-default guards + home ordering (FavoriteListsService)', () => {
  function makeService(overrides: {
    lists?: any[];
    connection?: { restaurantId: string } | null;
  }) {
    const itemCreate = jest
      .fn()
      .mockImplementation((args: any) =>
        Promise.resolve({ itemId: 'new-item', ...args.data }),
      );
    const prisma: any = {
      favoriteList: {
        findFirst: jest.fn((args: any) =>
          Promise.resolve(
            (overrides.lists ?? []).find(
              (l) => l.listId === args.where.listId,
            ) ?? null,
          ),
        ),
        findMany: jest.fn().mockResolvedValue(overrides.lists ?? []),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      favoriteListItem: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }),
        create: itemCreate,
      },
      entity: {
        findUnique: jest.fn((args: any) =>
          Promise.resolve(
            args.where.entityId === RESTAURANT_ID
              ? { entityId: RESTAURANT_ID }
              : null,
          ),
        ),
      },
      connection: {
        findUnique: jest.fn((args: any) =>
          Promise.resolve(
            args.where.connectionId === CONNECTION_ID
              ? (overrides.connection ?? { connectionId: CONNECTION_ID })
              : null,
          ),
        ),
      },
      publicEntityScore: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const userStats = { applyDelta: jest.fn().mockResolvedValue(undefined) };
    const service = new FavoriteListsService(
      prisma as never,
      logger as never,
      userStats as never,
      {} as never,
    );
    return { service, prisma, itemCreate };
  }

  const baseList = (over: any = {}) => ({
    listId: LIST_ID,
    ownerUserId: OWNER,
    name: 'BBQ crawl',
    description: null,
    listType: 'restaurant',
    visibility: 'private',
    itemCount: 0,
    position: 1,
    systemKind: null,
    shareSlug: null,
    shareEnabled: false,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    items: [],
    ...over,
  });

  it('deleteList refuses a system default (loud, not silent)', async () => {
    const { service, prisma } = makeService({
      lists: [baseList({ systemKind: 'been', name: 'Been' })],
    });
    await expect(service.deleteList(OWNER, LIST_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.favoriteList.delete).not.toHaveBeenCalled();
  });

  it('deleteList still deletes a user list', async () => {
    const { service, prisma } = makeService({ lists: [baseList()] });
    await service.deleteList(OWNER, LIST_ID);
    expect(prisma.favoriteList.delete).toHaveBeenCalled();
  });

  it('listForUser pins system lists first (fixed rank), then recently-updated user lists when no custom order', async () => {
    const mk = (listId: string, over: any) => baseList({ listId, ...over });
    const { service } = makeService({
      lists: [
        // insertion order deliberately scrambled
        mk('u1', {
          name: 'Older',
          position: 1,
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-02T00:00:00Z'),
        }),
        mk('s2', { systemKind: 'want_to_go', name: 'Want to go', position: 2 }),
        mk('u2', {
          name: 'Fresher',
          position: 2,
          createdAt: new Date('2026-07-03T00:00:00Z'),
          updatedAt: new Date('2026-07-09T00:00:00Z'),
        }),
        mk('s1', { systemKind: 'been', name: 'Been', position: 1 }),
      ],
    });
    const result = await service.listForUser(OWNER, {
      listType: 'restaurant',
    } as any);
    expect(result.map((row: any) => row.listId)).toEqual([
      's1',
      's2',
      'u2',
      'u1',
    ]);
  });

  it('listForUser honors a custom home order (positions diverge from creation order)', async () => {
    const mk = (listId: string, over: any) => baseList({ listId, ...over });
    const { service } = makeService({
      lists: [
        // created u1 then u2, but u2 moved to position 1 = custom order set
        mk('u1', {
          name: 'First made',
          position: 2,
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-09T00:00:00Z'),
        }),
        mk('u2', {
          name: 'Moved up',
          position: 1,
          createdAt: new Date('2026-07-02T00:00:00Z'),
          updatedAt: new Date('2026-07-03T00:00:00Z'),
        }),
      ],
    });
    const result = await service.listForUser(OWNER, {
      listType: 'restaurant',
    } as any);
    expect(result.map((row: any) => row.listId)).toEqual(['u2', 'u1']);
  });

  it('systemKindRank orders been < want_to_go < tried < want_to_try < user lists', () => {
    expect(systemKindRank('been')).toBeLessThan(systemKindRank('want_to_go'));
    expect(systemKindRank('want_to_go')).toBeLessThan(systemKindRank('tried'));
    expect(systemKindRank('tried')).toBeLessThan(systemKindRank('want_to_try'));
    expect(systemKindRank(null)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('addItem on a RESTAURANT list resolves a connection target to its restaurant (save-sheet flip)', async () => {
    const { service, itemCreate } = makeService({
      lists: [baseList()],
      connection: { restaurantId: RESTAURANT_ID },
    });
    await service.addItem(OWNER, LIST_ID, {
      connectionId: CONNECTION_ID,
      note: 'flip note',
    } as any);
    const data = itemCreate.mock.calls[0][0].data;
    expect(data.restaurantId).toBe(RESTAURANT_ID);
    expect(data.connectionId).toBeNull();
    expect(data.note).toBe('flip note');
  });

  it('addItem flip 404s loudly when the connection does not exist', async () => {
    const { service } = makeService({ lists: [baseList()] });
    await expect(
      service.addItem(OWNER, LIST_ID, {
        connectionId: '00000000-0000-4000-8000-000000000000',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
