/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { FavoriteListsService } from './favorite-lists.service';
import { FavoriteListAccessPolicy } from './favorite-list-access.policy';
import { ListResultsAssembler } from './favorite-list-results.assembler';
import { FavoriteListMapper } from './favorite-list.mappers';

/**
 * Red-team W2 (page-registry §8.4 Overview element 1): GET
 * /favorites/entities/:entityId/memberships — the viewer's lists containing
 * an entity, incl. the saved note. Scoped to owner-or-collaborator lists.
 */

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTITY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeService(items: any[]) {
  const prisma: any = {
    favoriteListItem: { findMany: jest.fn().mockResolvedValue(items) },
  };
  const logger = {
    setContext: () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  } as any;
  const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new FavoriteListsService(
    prisma,
    new FavoriteListAccessPolicy(prisma, blocks as never),
    new ListResultsAssembler({} as never),
    new FavoriteListMapper(prisma, logger),
    { loadTileImages: () => Promise.resolve(new Map()) } as never,
  );
  return { prisma, service };
}

describe('listMembershipsForEntity (§8.4 saved-note read)', () => {
  it('matches the entity as restaurantId OR connectionId, scoped to owner-or-collaborator lists', async () => {
    const { prisma, service } = makeService([]);
    await service.listMembershipsForEntity(VIEWER, ENTITY);
    const where = prisma.favoriteListItem.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { restaurantId: ENTITY },
      { connectionId: ENTITY },
    ]);
    expect(where.list.OR).toEqual([
      { ownerUserId: VIEWER },
      { collaborators: { some: { userId: VIEWER } } },
    ]);
  });

  it('maps rows to {itemId, listId, listName, listType, systemKind, note}', async () => {
    const { service } = makeService([
      {
        itemId: 'item-1',
        listId: 'list-1',
        note: 'Get the fondue',
        list: { name: 'Date night', listType: 'restaurant', systemKind: null },
      },
      {
        itemId: 'item-2',
        listId: 'list-2',
        note: null,
        list: { name: 'Been', listType: 'restaurant', systemKind: 'been' },
      },
    ]);
    const result = await service.listMembershipsForEntity(VIEWER, ENTITY);
    expect(result).toEqual([
      {
        itemId: 'item-1',
        listId: 'list-1',
        listName: 'Date night',
        listType: 'restaurant',
        systemKind: null,
        note: 'Get the fondue',
      },
      {
        itemId: 'item-2',
        listId: 'list-2',
        listName: 'Been',
        listType: 'restaurant',
        systemKind: 'been',
        note: null,
      },
    ]);
  });
});
