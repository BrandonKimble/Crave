/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FavoriteListsService } from './favorite-lists.service';
import { FavoriteListAccessPolicy } from './favorite-list-access.policy';
import { ListResultsAssembler } from './favorite-list-results.assembler';
import { FavoriteListMapper } from './favorite-list.mappers';

/**
 * W1 data-layer contracts beyond raw access (w1-listdetail spec B.1.2-B.1.6):
 * share-event dedupe, the visibility canon (visibility = discovery, never
 * access — owner 2026-07-12), collaborator join/leave/kick
 * idempotency, batch reorder set-equality, sort semantics, note projection,
 * and the virtual All-list union.
 */

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COLLABORATOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SLUG = 'slug-current';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });

function makeItem(overrides: any = {}) {
  return {
    itemId: overrides.itemId ?? 'itemid',
    listId: LIST_ID,
    addedByUserId: OWNER,
    restaurantId: null,
    connectionId: null,
    note: null,
    position: 0,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    restaurant: null,
    connection: null,
    ...overrides,
  };
}

function makeList(overrides: any = {}) {
  return {
    listId: LIST_ID,
    ownerUserId: OWNER,
    name: 'BBQ crawl',
    description: null,
    listType: 'restaurant',
    visibility: 'public',
    itemCount: 0,
    position: 1,
    shareSlug: SLUG,
    shareEnabled: true,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    items: [],
    ...overrides,
  };
}

function makeHarness(opts: {
  lists?: any[];
  collaboratorIds?: string[];
  shareEventCreate?: jest.Mock;
  itemUpdate?: jest.Mock;
  collaboratorCreate?: jest.Mock;
  blockedPairs?: Array<[string, string]>;
}) {
  const lists = opts.lists ?? [makeList()];
  const collaboratorIds = opts.collaboratorIds ?? [];
  const shareEventCreate =
    opts.shareEventCreate ?? jest.fn().mockResolvedValue({});
  const itemUpdate = opts.itemUpdate ?? jest.fn().mockResolvedValue({});
  const collaboratorDeleteMany = jest.fn().mockResolvedValue({
    count: collaboratorIds.length,
  });
  const collaboratorCreate =
    opts.collaboratorCreate ?? jest.fn().mockResolvedValue({});
  const listUpdate = jest.fn().mockResolvedValue({});
  const prisma: any = {
    favoriteList: {
      // findFirst assigned below (honest predicate over the fixtures)
      findFirst: jest.fn(),
      findMany: jest.fn((args: any) =>
        Promise.resolve(
          lists.filter(
            (l) =>
              l.ownerUserId === args.where.ownerUserId &&
              l.listType === args.where.listType &&
              (!args.where.visibility ||
                l.visibility === args.where.visibility),
          ),
        ),
      ),
      update: listUpdate,
    },
    favoriteListCollaborator: {
      findUnique: jest.fn((args: any) => {
        const key = args.where.listId_userId;
        return Promise.resolve(
          key && collaboratorIds.includes(key.userId)
            ? { listId: key.listId, userId: key.userId }
            : null,
        );
      }),
      deleteMany: collaboratorDeleteMany,
      create: collaboratorCreate,
    },
    favoriteListShareEvent: { create: shareEventCreate },
    favoriteListItem: {
      findMany: jest.fn((args: any) => {
        const list = lists.find((l) => l.listId === args.where.listId);
        return Promise.resolve(
          (list?.items ?? []).map((item: any) => ({ itemId: item.itemId })),
        );
      }),
      update: itemUpdate,
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }),
    },
    publicEntityScore: { findMany: jest.fn().mockResolvedValue([]) },
    connection: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  // fix findFirst: simpler honest impl
  prisma.favoriteList.findFirst = jest.fn((args: any) => {
    const hit = lists.find(
      (l) =>
        (!args.where.listId || l.listId === args.where.listId) &&
        (!args.where.shareSlug || l.shareSlug === args.where.shareSlug) &&
        (!args.where.ownerUserId || l.ownerUserId === args.where.ownerUserId),
    );
    return Promise.resolve(hit ? { ...hit } : null);
  });
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const execResult = (over: any = {}) => ({
    restaurants: [],
    dishes: [],
    totalRestaurantCount: 0,
    totalDishCount: 0,
    metadata: {
      openNowApplied: false,
      openNowSupportedRestaurants: 0,
      openNowUnsupportedRestaurants: 0,
      openNowUnsupportedRestaurantIds: [],
      openNowFilteredOut: 0,
      priceFilterApplied: false,
      minimumVotesApplied: false,
    },
    ...over,
  });
  const executor = {
    executeSingle: jest.fn().mockResolvedValue(execResult()),
    executeDual: jest.fn().mockResolvedValue(execResult()),
  };
  const blockedPairs = opts.blockedPairs ?? [];
  const blocks = {
    isBlockedPair: jest.fn((a: string, b: string) =>
      Promise.resolve(
        blockedPairs.some(
          ([x, y]) => (x === a && y === b) || (x === b && y === a),
        ),
      ),
    ),
  };
  const access = new FavoriteListAccessPolicy(prisma as never, blocks as never);
  const assemblerPrisma = {
    $queryRaw: jest.fn(() => Promise.resolve([{ restaurantId: R1 }])),
  };
  const assembler = new ListResultsAssembler(
    executor as never,
    assemblerPrisma as never,
  );
  const mapper = new FavoriteListMapper(prisma as never, logger as never);
  const service = new FavoriteListsService(
    prisma as never,
    access,
    assembler,
    mapper,
    { loadTileImages: () => Promise.resolve(new Map()) } as never,
  );
  return {
    service,
    prisma,
    assemblerPrisma,
    blocks,
    executor,
    shareEventCreate,
    itemUpdate,
    collaboratorCreate,
    collaboratorDeleteMany,
    listUpdate,
    execResult,
  };
}

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333';

const restaurantRow = (id: string) => ({
  restaurantId: id,
  restaurantName: id,
  restaurantAliases: [],
  scoreSubjectType: 'restaurant',
  scoreSubjectId: id,
  craveScore: 9,
  topFood: [],
  totalDishCount: 0,
});

describe('share-event write dedupe (RT-18 flood fix)', () => {
  it('authed slug read writes opened:<slug>:<viewer>; P2002 is swallowed', async () => {
    const shareEventCreate = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002());
    const { service } = makeHarness({ shareEventCreate });
    await service.getListResults(STRANGER, LIST_ID, {
      shareSlug: SLUG,
    } as never);
    await service.getListResults(STRANGER, LIST_ID, {
      shareSlug: SLUG,
    } as never);
    expect(shareEventCreate).toHaveBeenCalledTimes(2);
    expect(shareEventCreate.mock.calls[0][0].data.dedupeKey).toBe(
      `opened:${SLUG}:${STRANGER}`,
    );
  });

  it('anonymous share GET dedupes by slug+day', async () => {
    const { service, shareEventCreate } = makeHarness({});
    await service.getSharedList(SLUG);
    const key = shareEventCreate.mock.calls[0][0].data.dedupeKey as string;
    expect(key).toBe(`opened:${SLUG}:${new Date().toISOString().slice(0, 10)}`);
  });
});

describe('visibility canon (owner 2026-07-12): visibility = discovery, never access', () => {
  // RED against the RT-18-era cascade: the old code deleted collaborators and
  // disabled sharing on a private flip, and enableShare force-flipped a
  // private list public. Every spec here fails against that behavior.

  it('visibility->private touches ONLY visibility — no collaborator delete, no shareEnabled write', async () => {
    const { service, collaboratorDeleteMany, listUpdate } = makeHarness({
      collaboratorIds: [COLLABORATOR],
    });
    await service.updateList(OWNER, LIST_ID, {
      visibility: 'private',
    } as never);
    expect(collaboratorDeleteMany).not.toHaveBeenCalled();
    const data = listUpdate.mock.calls[0][0].data;
    expect(data.visibility).toBe('private');
    expect(data.shareEnabled).toBeUndefined();
  });

  it('enableShare on a PRIVATE list never writes visibility (sharing mints the link, nothing else)', async () => {
    const { service, listUpdate } = makeHarness({
      lists: [makeList({ visibility: 'private', shareSlug: null })],
    });
    const result = await service.enableShare(OWNER, LIST_ID, {} as never);
    expect(result.shareSlug).toBeTruthy();
    const data = listUpdate.mock.calls[0][0].data;
    expect(data.shareEnabled).toBe(true);
    expect(data.visibility).toBeUndefined();
  });

  it('a link holder keeps reading a list that went private (access survives the flip)', async () => {
    const { service } = makeHarness({
      lists: [makeList({ visibility: 'private' })],
    });
    await expect(
      service.getListResults(STRANGER, LIST_ID, { shareSlug: SLUG } as never),
    ).resolves.toMatchObject({ format: 'dual_list' });
  });

  it('a collaborator keeps their seat and mutation grant on a PRIVATE list', async () => {
    const { service, prisma } = makeHarness({
      lists: [makeList({ visibility: 'private' })],
      collaboratorIds: [COLLABORATOR],
    });
    prisma.entity = {
      findUnique: jest.fn().mockResolvedValue({ entityId: R1 }),
    };
    prisma.favoriteListItem.create = jest
      .fn()
      .mockResolvedValue({ itemId: 'x' });
    await expect(
      service.addItem(COLLABORATOR, LIST_ID, { restaurantId: R1 } as never),
    ).resolves.toMatchObject({ itemId: 'x' });
  });

  it('a PRIVATE list stays joinable as collaborator via its live slug', async () => {
    const { service } = makeHarness({
      lists: [makeList({ visibility: 'private' })],
    });
    await expect(
      service.joinCollaborators(STRANGER, LIST_ID, SLUG),
    ).resolves.toEqual({ listId: LIST_ID, role: 'collaborator' });
  });

  it('disableShare is the lock: it kills the link and touches nothing else', async () => {
    const { service, listUpdate, collaboratorDeleteMany } = makeHarness({
      lists: [makeList({ visibility: 'private' })],
      collaboratorIds: [COLLABORATOR],
    });
    await service.disableShare(OWNER, LIST_ID);
    expect(listUpdate.mock.calls[0][0].data).toEqual({ shareEnabled: false });
    expect(collaboratorDeleteMany).not.toHaveBeenCalled();
  });
});

describe('collaborators (spec B.1.3)', () => {
  it('join via the current slug creates the row; P2002 (already joined) is success', async () => {
    const collaboratorCreate = jest.fn().mockRejectedValue(p2002());
    const { service } = makeHarness({ collaboratorCreate });
    await expect(
      service.joinCollaborators(STRANGER, LIST_ID, SLUG),
    ).resolves.toEqual({ listId: LIST_ID, role: 'collaborator' });
  });

  it('join with a rotated slug is refused', async () => {
    const { service } = makeHarness({});
    await expect(
      service.joinCollaborators(STRANGER, LIST_ID, 'old-slug'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a non-owner cannot kick someone else', async () => {
    const { service } = makeHarness({ collaboratorIds: [COLLABORATOR] });
    await expect(
      service.removeCollaborator(STRANGER, LIST_ID, COLLABORATOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('owner kick and self-leave both delete the row', async () => {
    const { service, collaboratorDeleteMany } = makeHarness({
      collaboratorIds: [COLLABORATOR],
    });
    await service.removeCollaborator(OWNER, LIST_ID, COLLABORATOR);
    await service.removeCollaborator(COLLABORATOR, LIST_ID, COLLABORATOR);
    expect(collaboratorDeleteMany).toHaveBeenCalledTimes(2);
  });

  it('collaborator has full item parity (addItem passes the guard)', async () => {
    const { service, prisma } = makeHarness({
      collaboratorIds: [COLLABORATOR],
    });
    prisma.entity = {
      findUnique: jest.fn().mockResolvedValue({ entityId: R1 }),
    };
    prisma.favoriteListItem.create = jest
      .fn()
      .mockResolvedValue({ itemId: 'x' });
    await expect(
      service.addItem(COLLABORATOR, LIST_ID, { restaurantId: R1 } as never),
    ).resolves.toMatchObject({ itemId: 'x' });
  });

  it('a stranger is still refused item mutations', async () => {
    const { service } = makeHarness({});
    await expect(
      service.removeItem(STRANGER, LIST_ID, R1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('batch reorder (spec B.1.4)', () => {
  const items = [
    makeItem({ itemId: R1, restaurantId: R1, position: 1 }),
    makeItem({ itemId: R2, restaurantId: R2, position: 2 }),
  ];

  it('rejects duplicates and foreign itemIds (still a loud 400)', async () => {
    const { service } = makeHarness({ lists: [makeList({ items })] });
    await expect(
      service.reorderItems(OWNER, LIST_ID, [R1, R1]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderItems(OWNER, LIST_ID, [R1, R3]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes 1..n positions in one transaction in the given order', async () => {
    const { service, itemUpdate, prisma } = makeHarness({
      lists: [makeList({ items })],
    });
    await service.reorderItems(OWNER, LIST_ID, [R2, R1]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(
      itemUpdate.mock.calls.map((c: any) => [
        c[0].where.itemId,
        c[0].data.position,
      ]),
    ).toEqual([
      [R2, 1],
      [R1, 2],
    ]);
  });

  it('accepts a SUBSET: unlisted items keep their relative order appended after the ordered head', async () => {
    // The client orders from executor-backed rows, which silently drop
    // score-less/un-geocoded items — a subset must not brick the drag-save.
    const threeItems = [
      makeItem({ itemId: R1, restaurantId: R1, position: 1 }),
      makeItem({ itemId: R2, restaurantId: R2, position: 2 }),
      makeItem({ itemId: R3, restaurantId: R3, position: 3 }),
    ];
    const { service, itemUpdate } = makeHarness({
      lists: [makeList({ items: threeItems })],
    });
    const result = await service.reorderItems(OWNER, LIST_ID, [R3, R1]);
    expect(
      itemUpdate.mock.calls.map((c: any) => [
        c[0].where.itemId,
        c[0].data.position,
      ]),
    ).toEqual([
      [R3, 1],
      [R1, 2],
      [R2, 3], // deterministic tail: unlisted item retains its slot after the head
    ]);
    expect(result).toEqual({ listId: LIST_ID, itemCount: 3 });
  });

  it('a concurrent remove mid-write is a 409 Conflict, never a 500', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('gone', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const itemUpdate = jest.fn().mockRejectedValue(p2025);
    const { service } = makeHarness({
      lists: [makeList({ items })],
      itemUpdate,
    });
    await expect(
      service.reorderItems(OWNER, LIST_ID, [R2, R1]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('sort + note projection on results (spec B.1.4/B.1.5)', () => {
  const items = [
    makeItem({
      itemId: 'i1',
      restaurantId: R1,
      position: 3,
      note: 'get the brisket',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    }),
    makeItem({
      itemId: 'i2',
      restaurantId: R2,
      position: 1,
      createdAt: new Date('2026-07-02T00:00:00Z'),
    }),
    makeItem({
      itemId: 'i3',
      restaurantId: R3,
      position: 2,
      createdAt: new Date('2026-07-03T00:00:00Z'),
    }),
  ];

  it("sort:'custom' returns rows in position order with notes projected", async () => {
    const { service, executor, execResult } = makeHarness({
      lists: [makeList({ items })],
    });
    executor.executeSingle.mockResolvedValue(
      execResult({
        restaurants: [restaurantRow(R1), restaurantRow(R3), restaurantRow(R2)],
        totalRestaurantCount: 3,
      }),
    );
    const response = await service.getListResults(OWNER, LIST_ID, {
      sort: 'custom',
    } as never);
    expect(response.restaurants.map((r) => r.restaurantId)).toEqual([
      R2,
      R3,
      R1,
    ]);
    expect(response.restaurants[2].note).toBe('get the brisket');
    expect(response.restaurants[0].note).toBeNull();
  });

  it("sort:'recent' orders by createdAt desc", async () => {
    const { service, executor, execResult } = makeHarness({
      lists: [makeList({ items })],
    });
    executor.executeSingle.mockResolvedValue(
      execResult({
        restaurants: [restaurantRow(R1), restaurantRow(R2), restaurantRow(R3)],
        totalRestaurantCount: 3,
      }),
    );
    const response = await service.getListResults(OWNER, LIST_ID, {
      sort: 'recent',
    } as never);
    expect(response.restaurants.map((r) => r.restaurantId)).toEqual([
      R3,
      R2,
      R1,
    ]);
  });

  it('detail DTO carries viewerRole + defaultSort (custom iff order diverges from insertion)', async () => {
    const { service } = makeHarness({ lists: [makeList({ items })] });
    const detail: any = await service.getListForUser(OWNER, LIST_ID);
    expect(detail.viewerRole).toBe('owner');
    expect(detail.defaultSort).toBe('custom');

    const insertionOrdered = items.map((item, index) => ({
      ...item,
      position: index + 1,
    }));
    const { service: service2 } = makeHarness({
      lists: [makeList({ items: insertionOrdered })],
    });
    const detail2: any = await service2.getListForUser(OWNER, LIST_ID);
    expect(detail2.defaultSort).toBe('best');
  });

  it('detail rows project note + favoriteListItemId (parity with the results path)', async () => {
    const detailItems = [
      makeItem({
        itemId: 'item-1',
        restaurantId: R1,
        position: 1,
        note: 'the brisket',
        restaurant: { entityId: R1, name: 'Place', city: 'Austin' },
      }),
    ];
    const { service, prisma } = makeHarness({
      lists: [makeList({ items: detailItems })],
    });
    prisma.publicEntityScore.findMany = jest
      .fn()
      .mockResolvedValue([
        { subjectId: R1, displayScore: 9, percentileRank: null, rising: null },
      ]);
    const detail: any = await service.getListForUser(OWNER, LIST_ID);
    expect(detail.restaurants[0].note).toBe('the brisket');
    expect(detail.restaurants[0].favoriteListItemId).toBe('item-1');
  });
});

describe('virtual All list (spec B.1.6)', () => {
  const LIST_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const lists = [
    makeList({
      items: [makeItem({ itemId: 'a1', restaurantId: R1, position: 1 })],
      visibility: 'private',
    }),
    makeList({
      listId: LIST_B,
      name: 'other',
      visibility: 'public',
      items: [makeItem({ itemId: 'b1', restaurantId: R2, position: 1 })],
    }),
  ];

  it('own All unions ALL own lists of the type through the executor', async () => {
    const { service, executor } = makeHarness({ lists });
    await service.getListResults(OWNER, 'all:restaurants', {} as never);
    const filter =
      executor.executeSingle.mock.calls[0][0].plan.restaurantFilters[0];
    expect(new Set(filter.entityIds)).toEqual(new Set([R1, R2]));
  });

  it("profile All unions only the target's PUBLIC lists", async () => {
    const { service, executor } = makeHarness({ lists });
    await service.getListResults(STRANGER, 'all:restaurants', {
      targetUserId: OWNER,
    } as never);
    const filter =
      executor.executeSingle.mock.calls[0][0].plan.restaurantFilters[0];
    expect(filter.entityIds).toEqual([R2]);
  });

  it('priceLevels ride the PLAN clause payload (the executor reads the plan, not the request)', async () => {
    const { service, executor } = makeHarness({ lists });
    await service.getListResults(OWNER, 'all:restaurants', {
      priceLevels: [2],
    } as never);
    const filter =
      executor.executeSingle.mock.calls[0][0].plan.restaurantFilters[0];
    expect(filter.payload).toEqual({ priceLevels: [2] });
  });

  it('marketKey slices by geometry as an id PRE-FILTER — the search engine carries no market conditions (master plan §7)', async () => {
    const { service, executor, assemblerPrisma } = makeHarness({ lists });
    await service.getListResults(OWNER, 'all:restaurants', {
      marketKey: 'austin',
    } as never);
    // The slice ran one geometry query over the list's candidate restaurants…
    expect(assemblerPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    // …and the executor received only the in-market ids, with NO directives.
    const call = executor.executeSingle.mock.calls[0][0];
    expect(call.plan.restaurantFilters[0].entityIds).toEqual([R1]);
    expect(call.directives).toBeUndefined();
  });

  it('omitted marketKey runs no geometry query and passes no directives', async () => {
    const { service, executor, assemblerPrisma } = makeHarness({ lists });
    await service.getListResults(OWNER, 'all:restaurants', {} as never);
    expect(assemblerPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(executor.executeSingle.mock.calls[0][0].directives).toBeUndefined();
  });

  it('custom sort on the virtual list is a loud BadRequest', async () => {
    const { service } = makeHarness({ lists });
    await expect(
      service.getListResults(OWNER, 'all:restaurants', {
        sort: 'custom',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a non-UUID non-virtual id is rejected, never queried', async () => {
    const { service } = makeHarness({ lists });
    await expect(
      service.getListResults(OWNER, 'all:everything', {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('blocked pairs on the slug capability (§8.6, red-team finding 5)', () => {
  it('a blocked viewer presenting a valid slug gets the private-shaped 410, not the list', async () => {
    const { service } = makeHarness({
      blockedPairs: [[OWNER, STRANGER]],
    });
    const failure = service.getListResults(STRANGER, LIST_ID, {
      shareSlug: SLUG,
    } as never);
    await expect(failure).rejects.toBeInstanceOf(GoneException);
    await failure.catch((error: GoneException) => {
      expect(error.getResponse()).toMatchObject({ state: 'private' });
    });
  });

  it('a blocked user cannot join as collaborator via the slug', async () => {
    const { service, collaboratorCreate } = makeHarness({
      blockedPairs: [[OWNER, STRANGER]],
    });
    await expect(
      service.joinCollaborators(STRANGER, LIST_ID, SLUG),
    ).rejects.toBeInstanceOf(GoneException);
    expect(collaboratorCreate).not.toHaveBeenCalled();
  });

  it('an unblocked stranger with the slug still reads and joins', async () => {
    const { service } = makeHarness({});
    await expect(
      service.getListResults(STRANGER, LIST_ID, { shareSlug: SLUG } as never),
    ).resolves.toMatchObject({ format: 'dual_list' });
    await expect(
      service.joinCollaborators(STRANGER, LIST_ID, SLUG),
    ).resolves.toEqual({ listId: LIST_ID, role: 'collaborator' });
  });
});

describe('score-gap resilience on the home lists read (red-team finding 4)', () => {
  it('a summary with one score-less item returns the list WITHOUT that preview item (no 500)', async () => {
    const items = [
      makeItem({
        itemId: 'good',
        restaurantId: R1,
        position: 1,
        restaurant: { entityId: R1, name: 'Scored place', city: 'Austin' },
      }),
      makeItem({
        itemId: 'bad',
        restaurantId: R2,
        position: 2,
        restaurant: { entityId: R2, name: 'Unscored place', city: 'Austin' },
      }),
    ];
    const { service, prisma } = makeHarness({
      lists: [makeList({ items, systemKind: null, pinned: false })],
    });
    // Only R1 has a public score; R2 is the data gap.
    prisma.publicEntityScore.findMany = jest
      .fn()
      .mockResolvedValue([
        { subjectId: R1, displayScore: 9.1, percentileRank: 0.9, rising: null },
      ]);
    const result = await service.listForUser(OWNER, {
      listType: 'restaurant',
    } as never);
    expect(result).toHaveLength(1);
    expect(result[0].previewItems.map((p: any) => p.itemId)).toEqual(['good']);
    expect(result[0].previewItems[0].craveScore).toBe(9.1);
  });
});
