/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { UserListsService } from './user-lists.service';
import { UserListAccessPolicy } from './user-list-access.policy';
import { ListResultsAssembler } from './user-list-results.assembler';
import { UserListMapper } from './user-list.mappers';

/**
 * Red-team W2 (page-registry §8.4 Overview element 1): GET
 * /favorites/entities/:entityId/memberships — the viewer's lists containing
 * an entity, incl. the saved note. Scoped to owner-or-collaborator lists.
 */

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTITY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeService(items: any[]) {
  const prisma: any = {
    userListItem: { findMany: jest.fn().mockResolvedValue(items) },
  };
  const logger = {
    setContext: () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  } as any;
  const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new UserListsService(
    prisma,
    new UserListAccessPolicy(prisma, blocks as never),
    new ListResultsAssembler(
      {} as never,
      {} as never,
      {
        getDietaryPairs: () => Promise.resolve(new Map()),
        resolveDietaryWalls: () => Promise.resolve([]),
      } as never,
    ),
    new UserListMapper(prisma, logger),
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
  return { prisma, service };
}

describe('listMembershipsForEntity (§8.4 saved-note read)', () => {
  it('matches the entity as restaurantId OR connectionId, scoped to owner-or-collaborator lists', async () => {
    const { prisma, service } = makeService([]);
    await service.listMembershipsForEntity(VIEWER, ENTITY);
    const where = prisma.userListItem.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ placeId: ENTITY }, { connectionId: ENTITY }]);
    expect(where.list.OR).toEqual([
      { ownerUserId: VIEWER },
      { collaborators: { some: { userId: VIEWER } } },
    ]);
  });

  it('maps rows to {itemId, listId, listName, listType, kind, systemKind, note}', async () => {
    const { service } = makeService([
      {
        itemId: 'item-1',
        listId: 'list-1',
        note: 'Get the fondue',
        list: { name: 'Date night', listType: 'restaurant', kind: 'standard' },
      },
      {
        itemId: 'item-2',
        listId: 'list-2',
        note: null,
        list: { name: 'Been', listType: 'restaurant', kind: 'been' },
      },
    ]);
    const result = await service.listMembershipsForEntity(VIEWER, ENTITY);
    expect(result).toEqual([
      {
        itemId: 'item-1',
        listId: 'list-1',
        listName: 'Date night',
        listType: 'restaurant',
        kind: 'standard',
        systemKind: null,
        note: 'Get the fondue',
      },
      {
        itemId: 'item-2',
        listId: 'list-2',
        listName: 'Been',
        listType: 'restaurant',
        kind: 'been',
        systemKind: 'been',
        note: null,
      },
    ]);
  });
});
