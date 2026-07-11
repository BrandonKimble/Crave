/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { FavoriteListsService } from './favorite-lists.service';

/**
 * W3 profile Lists view contracts (page-registry §8.12/§8.14/§8.15):
 * public-only read, pins float first then reverse-chronological (the
 * own-home custom order never applies), majority-city annotation.
 */

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeList(overrides: any = {}) {
  return {
    listId: overrides.listId ?? '11111111-1111-4111-8111-111111111111',
    ownerUserId: OWNER,
    name: overrides.name ?? 'List',
    description: null,
    listType: 'restaurant',
    visibility: 'public',
    itemCount: 0,
    position: 0,
    shareSlug: null,
    shareEnabled: false,
    systemKind: null,
    pinned: false,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    items: [],
    ...overrides,
  };
}

function makeService(lists: any[], cityRows: any[] = []) {
  const prisma: any = {
    favoriteList: { findMany: jest.fn().mockResolvedValue(lists) },
    publicEntityScore: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(cityRows),
  };
  const logger = {
    setContext: () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  } as any;
  const service = new FavoriteListsService(
    prisma,
    logger,
    {} as any,
    {} as any,
  );
  return { prisma, service };
}

describe('listPublicForUser (profile Lists view, §8.14/§8.15)', () => {
  it('reads public lists only', async () => {
    const { prisma, service } = makeService([]);
    await service.listPublicForUser(OWNER, {});
    const where = prisma.favoriteList.findMany.mock.calls[0][0].where;
    expect(where.visibility).toBe('public');
    expect(where.ownerUserId).toBe(OWNER);
    // No city query for zero lists.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('pins float first, then reverse-chronological; city annotated', async () => {
    const a = makeList({
      listId: 'aaaaaaa1-1111-4111-8111-111111111111',
      name: 'old-pinned',
      pinned: true,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const b = makeList({
      listId: 'bbbbbbb1-1111-4111-8111-111111111111',
      name: 'new-unpinned',
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    });
    const c = makeList({
      listId: 'ccccccc1-1111-4111-8111-111111111111',
      name: 'older-unpinned',
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const { service } = makeService(
      [b, c, a],
      [{ list_id: b.listId, city: 'Austin' }],
    );
    const result = await service.listPublicForUser(OWNER, {});
    expect(result.map((l: any) => l.name)).toEqual([
      'old-pinned',
      'new-unpinned',
      'older-unpinned',
    ]);
    expect(result[0].pinned).toBe(true);
    expect(result[1].city).toBe('Austin');
    expect(result[0].city).toBeNull();
  });
});
