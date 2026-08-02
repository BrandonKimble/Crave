/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserListsService } from './user-lists.service';
import { UserListAccessPolicy } from './user-list-access.policy';
import { UserListMapper } from './user-list.mappers';

/**
 * The kind law (owner-ratified 2026-07-26, Spotify Liked-Songs model):
 *  - ensureFavoritesList is idempotent and race-safe (P2002 → refetch);
 *  - the favorites-kind list cannot be deleted (typed 409), standard can;
 *  - the heart verb (add/remove through the favorites selector) is
 *    ensure-then-add and idempotent both directions;
 *  - list payloads carry `kind` (plus the deprecated systemKind wire alias).
 */

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAV_LIST_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const STD_LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const R1 = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });

const favoritesRow = (overrides: any = {}) => ({
  listId: FAV_LIST_ID,
  ownerUserId: OWNER,
  name: 'Favorites',
  description: null,
  listType: 'restaurant',
  visibility: 'private',
  kind: 'favorites',
  itemCount: 0,
  position: 5,
  shareSlug: null,
  shareEnabled: false,
  pinned: false,
  useOwnPhotos: false,
  createdAt: new Date('2026-07-26T00:00:00Z'),
  updatedAt: new Date('2026-07-26T00:00:00Z'),
  ...overrides,
});

function makeHarness(opts: {
  favoritesList?: Record<string, unknown> | null;
  standardList?: Record<string, unknown> | null;
  createImpl?: jest.Mock;
  itemCreateImpl?: jest.Mock;
  existingItems?: any[];
  connectionRestaurantId?: string | null;
  deleteManyCount?: number;
}) {
  const lists: any[] = [opts.favoritesList, opts.standardList].filter(Boolean);
  const listCreate =
    opts.createImpl ??
    jest.fn((args: any) => {
      const created = favoritesRow({ ...args.data, listId: FAV_LIST_ID });
      lists.push(created);
      return Promise.resolve(created);
    });
  const listDelete = jest.fn().mockResolvedValue({});
  const listUpdate = jest.fn().mockResolvedValue({});
  const itemCreate =
    opts.itemCreateImpl ??
    jest.fn((args: any) =>
      Promise.resolve({ itemId: 'item-new', ...args.data }),
    );
  const itemDeleteMany = jest
    .fn()
    .mockResolvedValue({ count: opts.deleteManyCount ?? 1 });
  const prisma: any = {
    userList: {
      findFirst: jest.fn((args: any) =>
        Promise.resolve(
          lists.find(
            (l: any) =>
              (!args.where.listId || l.listId === args.where.listId) &&
              (!args.where.ownerUserId ||
                l.ownerUserId === args.where.ownerUserId) &&
              (!args.where.kind || l.kind === args.where.kind),
          ) ?? null,
        ),
      ),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
      create: listCreate,
      delete: listDelete,
      update: listUpdate,
    },
    userListItem: {
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }),
      create: itemCreate,
      findFirst: jest.fn((args: any) =>
        Promise.resolve(
          (opts.existingItems ?? []).find(
            (item: any) =>
              item.listId === args.where.listId &&
              (!args.where.restaurantId ||
                item.restaurantId === args.where.restaurantId),
          ) ?? null,
        ),
      ),
      deleteMany: itemDeleteMany,
    },
    userListCollaborator: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    entity: {
      findUnique: jest.fn(() => Promise.resolve({ entityId: R1 })),
    },
    connection: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          opts.connectionRestaurantId === null
            ? null
            : {
                connectionId: C1,
                restaurantId: opts.connectionRestaurantId ?? R1,
              },
        ),
      ),
    },
  };
  const logger: any = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new UserListsService(
    prisma as never,
    new UserListAccessPolicy(prisma as never, blocks as never),
    {} as never,
    new UserListMapper(prisma as never, logger as never),
    { loadTileImages: () => Promise.resolve(new Map()) } as never,
    {
      record: () => undefined,
      bboxFromPoint: () => null,
      bboxFromRestaurantLocation: () => Promise.resolve(null),
    } as never,
    blocks as never,
  );
  return {
    service,
    prisma,
    listCreate,
    listDelete,
    itemCreate,
    itemDeleteMany,
  };
}

describe('ensureFavoritesList — idempotent lazy creation', () => {
  it('creates the ONE kind=favorites list on first call (name Favorites, restaurant-typed, private)', async () => {
    const { service, listCreate } = makeHarness({ favoritesList: null });
    const list = await service.ensureFavoritesList(OWNER);
    expect(listCreate).toHaveBeenCalledTimes(1);
    const data = listCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      ownerUserId: OWNER,
      name: 'Favorites',
      listType: 'restaurant',
      visibility: 'private',
      kind: 'favorites',
    });
    expect(list.kind).toBe('favorites');
  });

  it('is idempotent: an existing favorites-kind list is returned without a create', async () => {
    const { service, listCreate } = makeHarness({
      favoritesList: favoritesRow(),
    });
    const list = await service.ensureFavoritesList(OWNER);
    expect(list.listId).toBe(FAV_LIST_ID);
    expect(listCreate).not.toHaveBeenCalled();
  });

  it('resolves the concurrent-first-heart race: P2002 on create → refetch returns the winner', async () => {
    const raced = favoritesRow();
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null) // pre-create check: not there yet
      .mockResolvedValueOnce(raced); // post-P2002 refetch: winner landed
    const { service, prisma, listCreate } = makeHarness({
      favoritesList: null,
      createImpl: jest.fn().mockRejectedValue(p2002()),
    });
    prisma.userList.findFirst = findFirst;
    const list = await service.ensureFavoritesList(OWNER);
    expect(list).toBe(raced);
    expect(listCreate).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('a P2002 that is NOT the race (a standard list literally named Favorites) is a loud typed 409', async () => {
    const { service } = makeHarness({
      favoritesList: null,
      createImpl: jest.fn().mockRejectedValue(p2002()),
    });
    await expect(service.ensureFavoritesList(OWNER)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'FAVORITES_NAME_TAKEN' },
    });
  });
});

describe('deleteList — the favorites kind is the ONE undeletable list', () => {
  it('deleting the favorites-kind list is a typed 409 and never reaches the delete', async () => {
    const { service, listDelete } = makeHarness({
      favoritesList: favoritesRow(),
    });
    await expect(service.deleteList(OWNER, FAV_LIST_ID)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'FAVORITES_LIST_UNDELETABLE' },
    });
    expect(listDelete).not.toHaveBeenCalled();
  });

  it('a standard list still deletes (the guard is kind-scoped, not global)', async () => {
    const { service, listDelete } = makeHarness({
      standardList: favoritesRow({
        listId: STD_LIST_ID,
        kind: 'standard',
        name: 'BBQ crawl',
      }),
    });
    await service.deleteList(OWNER, STD_LIST_ID);
    expect(listDelete).toHaveBeenCalledWith({ where: { listId: STD_LIST_ID } });
  });
});

describe('the heart verb — add/remove through the favorites selector', () => {
  it('addFavoriteItem is ensure-then-add: lazily creates the list, then lands the item in it', async () => {
    const { service, listCreate, itemCreate } = makeHarness({
      favoritesList: null,
    });
    const item = await service.addFavoriteItem(OWNER, { restaurantId: R1 });
    expect(listCreate).toHaveBeenCalledTimes(1);
    expect(itemCreate).toHaveBeenCalledTimes(1);
    expect(itemCreate.mock.calls[0][0].data).toMatchObject({
      listId: FAV_LIST_ID,
      restaurantId: R1,
    });
    expect(item.restaurantId).toBe(R1);
  });

  it('re-hearting is idempotent: P2002 on the item returns the existing item, never a 400', async () => {
    const existing = {
      itemId: 'item-existing',
      listId: FAV_LIST_ID,
      restaurantId: R1,
    };
    const { service } = makeHarness({
      favoritesList: favoritesRow(),
      itemCreateImpl: jest.fn().mockRejectedValue(p2002()),
      existingItems: [existing],
    });
    const item = await service.addFavoriteItem(OWNER, { restaurantId: R1 });
    expect(item).toEqual(existing);
  });

  it('a dish-triggered heart side-flips to the restaurant of the connection (the favorites list is restaurant-typed)', async () => {
    const { service, itemCreate } = makeHarness({
      favoritesList: favoritesRow(),
      connectionRestaurantId: R1,
    });
    await service.addFavoriteItem(OWNER, { connectionId: C1 });
    expect(itemCreate.mock.calls[0][0].data).toMatchObject({
      listId: FAV_LIST_ID,
      restaurantId: R1,
      connectionId: null,
    });
  });

  it('removeFavoriteItemByTarget unhearts by restaurant target and decrements itemCount', async () => {
    const { service, prisma, itemDeleteMany } = makeHarness({
      favoritesList: favoritesRow({ itemCount: 3 }),
    });
    await service.removeFavoriteItemByTarget(OWNER, { restaurantId: R1 });
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: { listId: FAV_LIST_ID, restaurantId: R1 },
    });
    expect(prisma.userList.update).toHaveBeenCalledWith({
      where: { listId: FAV_LIST_ID },
      data: { itemCount: { decrement: 1 } },
    });
  });

  it('unhearting a connection target resolves to its restaurant; a never-hearted target is a no-op (no decrement)', async () => {
    const { service, prisma, itemDeleteMany } = makeHarness({
      favoritesList: favoritesRow(),
      connectionRestaurantId: R1,
      deleteManyCount: 0,
    });
    await service.removeFavoriteItemByTarget(OWNER, { connectionId: C1 });
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: { listId: FAV_LIST_ID, restaurantId: R1 },
    });
    expect(prisma.userList.update).not.toHaveBeenCalled();
  });
});

describe('kind in payloads', () => {
  const buildSummary = (kind: string) => {
    const logger: any = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const mapper = new UserListMapper({} as never, logger as never);
    return mapper.buildListSummary(
      { ...favoritesRow({ kind }), items: [] } as never,
      { restaurantScores: new Map(), connectionScores: new Map() },
      'owner',
    );
  };

  it('summaries carry kind, with the deprecated systemKind wire alias (standard spelled null)', () => {
    const standard = buildSummary('standard');
    expect(standard.kind).toBe('standard');
    expect(standard.systemKind).toBeNull();

    const favorites = buildSummary('favorites');
    expect(favorites.kind).toBe('favorites');
    expect(favorites.systemKind).toBe('favorites');

    const been = buildSummary('been');
    expect(been.kind).toBe('been');
    expect(been.systemKind).toBe('been');
  });
});
