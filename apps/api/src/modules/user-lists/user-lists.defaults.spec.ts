/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { NotFoundException } from '@nestjs/common';
import {
  UserListProvisioningService,
  SYSTEM_DEFAULT_LISTS,
  provisioningSeedPosition,
} from './user-list-provisioning.service';
import { UserListsService } from './user-lists.service';
import { UserListAccessPolicy } from './user-list-access.policy';
import { ListResultsAssembler } from './user-list-results.assembler';
import { UserListMapper } from './user-list.mappers';

/**
 * Auto-created default lists (page-registry §8.7) + save-sheet flip
 * resolution (§8.8): provisioning idempotency, uniform home ordering (wave-2 §2:
 * system defaults are regular lists), and connection→restaurant target resolution.
 */

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONNECTION_ID = '99999999-9999-4999-8999-999999999999';
const PLACE_ID = '11111111-1111-4111-8111-111111111111';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('UserListProvisioningService.ensureDefaultLists', () => {
  // F3805: the fixture is OWNED. The old double resolved the same kinds
  // whatever `where` it was handed, so `ownerUserId: userId` in
  // user-list-provisioning.service.ts was pinned by NOTHING — dropping it
  // would make ANY user's existing `been` list suppress provisioning for
  // every new signup, and `missing.length === 0` returns with no log.
  function makeHarness(
    existingKinds: string[],
    ownerOfExisting: string = OWNER,
  ) {
    const createMany = jest
      .fn()
      .mockImplementation((args: any) =>
        Promise.resolve({ count: args.data.length }),
      );
    const findMany = jest.fn((args: any) =>
      Promise.resolve(
        args?.where?.ownerUserId === ownerOfExisting
          ? existingKinds.map((kind) => ({ kind }))
          : [],
      ),
    );
    const prisma: any = {
      userList: {
        findMany,
        createMany,
      },
    };
    const service = new UserListProvisioningService(
      prisma as never,
      logger as never,
    );
    return { service, createMany, findMany };
  }

  it('creates all four defaults for a fresh user (skipDuplicates backstop)', async () => {
    const { service, createMany } = makeHarness([]);
    await service.ensureDefaultLists(OWNER);
    expect(createMany).toHaveBeenCalledTimes(1);
    const args = createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data.map((row: any) => row.kind)).toEqual([
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
  });

  it('is idempotent: a fully provisioned user writes nothing', async () => {
    const { service, createMany } = makeHarness(
      SYSTEM_DEFAULT_LISTS.map((entry) => entry.kind),
    );
    await service.ensureDefaultLists(OWNER);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('ANOTHER user’s lists never suppress provisioning (the owner scope is in the where)', async () => {
    // The only existing rows on the table belong to STRANGER; OWNER is a
    // fresh signup and must still get all four defaults.
    const STRANGER = '99999999-9999-9999-9999-999999999999';
    const { service, createMany, findMany } = makeHarness(
      SYSTEM_DEFAULT_LISTS.map((entry) => entry.kind),
      STRANGER,
    );

    await service.ensureDefaultLists(OWNER);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(
      SYSTEM_DEFAULT_LISTS.length,
    );
    // Pinned directly too, so the scope stays observable even if the double
    // is ever loosened again.
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      ownerUserId: OWNER,
    });
  });

  it('backfills only the missing kinds', async () => {
    const { service, createMany } = makeHarness(['been', 'tried']);
    await service.ensureDefaultLists(OWNER);
    const args = createMany.mock.calls[0][0];
    expect(args.data.map((row: any) => row.kind)).toEqual([
      'want_to_go',
      'want_to_try',
    ]);
  });
});

describe('system-default guards + home ordering (UserListsService)', () => {
  function makeService(overrides: {
    lists?: any[];
    connection?: { placeId: string } | null;
  }) {
    const itemCreate = jest
      .fn()
      .mockImplementation((args: any) =>
        Promise.resolve({ itemId: 'new-item', ...args.data }),
      );
    const prisma: any = {
      userList: {
        // F3805: OWNER-KEYED, not just id-keyed. The old double matched on
        // `args.where.listId` ALONE, so deleting `ownerUserId: userId` from
        // deleteList / updateList / updateListPosition
        // (user-lists.service.ts) turned NOTHING red anywhere in the module —
        // the guard IS correct in production, it was simply unprovable, and
        // there was no "a stranger cannot delete my list" test at all.
        findFirst: jest.fn((args: any) =>
          Promise.resolve(
            (overrides.lists ?? []).find(
              (l) =>
                l.listId === args.where.listId &&
                (args.where.ownerUserId === undefined ||
                  l.ownerUserId === args.where.ownerUserId),
            ) ?? null,
          ),
        ),
        findMany: jest.fn().mockResolvedValue(overrides.lists ?? []),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      userListItem: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }),
        create: itemCreate,
      },
      entity: {
        findUnique: jest.fn((args: any) =>
          Promise.resolve(
            args.where.entityId === PLACE_ID ? { entityId: PLACE_ID } : null,
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
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
    const service = new UserListsService(
      prisma as never,
      new UserListAccessPolicy(prisma as never, blocks as never),
      new ListResultsAssembler(
        {} as never,
        {} as never,
        {
          getDietaryPairs: () => Promise.resolve(new Map()),
          resolveDietaryWalls: () => Promise.resolve([]),
        } as never,
      ),
      new UserListMapper(prisma as never, logger as never),
      { loadTileImages: () => Promise.resolve(new Map()) } as never,
      {
        record: () => undefined,
        bboxFromPoint: () => null,
        bboxFromPlaceLocation: () => Promise.resolve(null),
      } as never,
      blocks as never,
      // D36: the one saveable-entity law (stubbed live here).
      {
        resolveSaveablePlace: (id: string) =>
          Promise.resolve({ entityId: id, name: 'R', city: null }),
        resolveSaveableItem: (id: string) =>
          Promise.resolve({ entityId: id, name: 'F', city: null }),
        resolveActiveByIds: (ids: string[]) =>
          Promise.resolve(
            new Map(
              ids.map((id) => [id, { entityId: id, name: 'E', city: null }]),
            ),
          ),
      } as never,
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
    _count: { items: 0 },
    position: 1,
    kind: null,
    shareSlug: null,
    shareEnabled: false,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    items: [],
    ...over,
  });

  it('deleteList deletes a system default too (wave-2 §2: default-created, not special)', async () => {
    const { service, prisma } = makeService({
      lists: [baseList({ kind: 'been', name: 'Been' })],
    });
    await service.deleteList(OWNER, LIST_ID);
    expect(prisma.userList.delete).toHaveBeenCalled();
  });

  it('deleteList still deletes a user list', async () => {
    const { service, prisma } = makeService({ lists: [baseList()] });
    await service.deleteList(OWNER, LIST_ID);
    expect(prisma.userList.delete).toHaveBeenCalled();
  });

  it('a STRANGER cannot delete another user’s list', async () => {
    const STRANGER = '99999999-9999-9999-9999-999999999999';
    const { service, prisma } = makeService({ lists: [baseList()] });

    await expect(service.deleteList(STRANGER, LIST_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.userList.delete).not.toHaveBeenCalled();
  });

  it('deleteList carries the acting user into the lookup where', async () => {
    // Direct pin (the memberships.spec.ts idiom): the scope lives in the
    // QUERY, not in the caller. NOTE (honest accounting): the production
    // mutation for this row — deleting `ownerUserId: userId` from
    // user-lists.service.ts:741 — could NOT be run in this session because
    // that file was dirty under another session. The scope is pinned two
    // ways here instead: an owner-keyed double (the case above) and this
    // direct assertion on the emitted args.
    const { service, prisma } = makeService({ lists: [baseList()] });

    await service.deleteList(OWNER, LIST_ID);

    expect(prisma.userList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listId: LIST_ID,
          ownerUserId: OWNER,
        }),
      }),
    );
  });

  it('a STRANGER cannot rename or reposition another user’s list', async () => {
    const STRANGER = '99999999-9999-9999-9999-999999999999';
    const { service, prisma } = makeService({ lists: [baseList()] });

    await expect(
      service.updateList(STRANGER, LIST_ID, { name: 'mine now' } as any),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.updateListPosition(STRANGER, LIST_ID, 1),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.userList.update).not.toHaveBeenCalled();
  });

  it('listForUser has NO pinned system prefix (wave-2 §2): recently-updated across ALL lists when no custom order', async () => {
    const mk = (listId: string, over: any) => baseList({ listId, ...over });
    const { service } = makeService({
      lists: [
        // positions match creation order (no custom order); updatedAt decides.
        mk('s1', {
          kind: 'been',
          name: 'Been',
          position: 1,
          createdAt: new Date('2026-06-01T00:00:00Z'),
          updatedAt: new Date('2026-07-05T00:00:00Z'),
        }),
        mk('s2', {
          kind: 'want_to_go',
          name: 'Want to go',
          position: 2,
          createdAt: new Date('2026-06-01T00:01:00Z'),
          updatedAt: new Date('2026-07-01T00:00:00Z'),
        }),
        mk('u1', {
          name: 'Older',
          position: 3,
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-02T00:00:00Z'),
        }),
        mk('u2', {
          name: 'Fresher',
          position: 4,
          createdAt: new Date('2026-07-03T00:00:00Z'),
          updatedAt: new Date('2026-07-09T00:00:00Z'),
        }),
      ],
    });
    const result = await service.listForUser(OWNER, {
      listType: 'restaurant',
    } as any);
    expect(result.map((row: any) => row.listId)).toEqual([
      'u2',
      's1',
      'u1',
      's2',
    ]);
  });

  it('listForUser: a moved SYSTEM list participates in the custom order (wave-2 §2)', async () => {
    const mk = (listId: string, over: any) => baseList({ listId, ...over });
    const { service } = makeService({
      lists: [
        // created s1 then u1, but s1 moved BELOW u1 = custom order set, and honored.
        mk('s1', {
          kind: 'been',
          name: 'Been',
          position: 2,
          createdAt: new Date('2026-06-01T00:00:00Z'),
          updatedAt: new Date('2026-07-09T00:00:00Z'),
        }),
        mk('u1', {
          name: 'Mine first',
          position: 1,
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-02T00:00:00Z'),
        }),
      ],
    });
    const result = await service.listForUser(OWNER, {
      listType: 'restaurant',
    } as any);
    expect(result.map((row: any) => row.listId)).toEqual(['u1', 's1']);
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

  it('provisioningSeedPosition orders been < want_to_go < tried < want_to_try < user lists', () => {
    expect(provisioningSeedPosition('been')).toBeLessThan(
      provisioningSeedPosition('want_to_go'),
    );
    expect(provisioningSeedPosition('want_to_go')).toBeLessThan(
      provisioningSeedPosition('tried'),
    );
    expect(provisioningSeedPosition('tried')).toBeLessThan(
      provisioningSeedPosition('want_to_try'),
    );
    expect(provisioningSeedPosition(null)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('addItem on a RESTAURANT list resolves a connection target to its restaurant (save-sheet flip)', async () => {
    const { service, itemCreate } = makeService({
      lists: [baseList()],
      connection: { placeId: PLACE_ID },
    });
    await service.addItem(OWNER, LIST_ID, {
      connectionId: CONNECTION_ID,
      note: 'flip note',
    } as any);
    const data = itemCreate.mock.calls[0][0].data;
    expect(data.placeId).toBe(PLACE_ID);
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
