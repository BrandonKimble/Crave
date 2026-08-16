/**
 * THE SERVED LIST COUNT IS THE ROWS (D36 / F600) — against a REAL Postgres.
 *
 * `user_lists.item_count` was a denormalized counter maintained by hand-rolled
 * ±1 deltas OUTSIDE the item write's transaction. Measured on the local mirror
 * 2026-08-03: 26 of 64 lists wrong, EVERY one overstated (336 stored vs 201
 * actual rows). The writers that decremented were addItem / removeItem /
 * removeFavoriteItemByTarget; the ones that did NOT were everything else —
 * most importantly `EntityAnchorRehomeService.rehomeUserListItems`, whose
 * merge FOLD deletes a duplicate row with a bare `tx.userListItem.delete` and
 * never touched the counter.
 *
 * The column is gone. This spec proves the property that replaced it, on the
 * two paths that used to disagree:
 *   1. an item DELETE through the service, and
 *   2. a MERGE FOLD delete — a raw row delete with no counter maintenance at
 *      all, exactly the shape rehomeUserListItems performs.
 *
 * MUTATION RECIPE (how this goes RED): restore the column, restore the ±1
 * writes in UserListsService, and read `list.itemCount` in
 * UserListMapper.buildListSummary instead of `list._count.items`. Case 2 then
 * fails immediately (served 2, actual 1) — which is the live defect this
 * change deleted. Case 1 fails as soon as any second delete path is added.
 * A DB spec is required because the property IS the relationship between the
 * served number and the rows in the table.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { UserListsService } from './user-lists.service';
import { UserListMapper } from './user-list.mappers';
import { UserListAccessPolicy } from './user-list-access.policy';
import { UserBlockService } from '../identity/user-block.service';
import { SaveableEntityResolver } from '../entities/saveable-entity.resolver';

const TEST_TAG = 'itest-list-count';

const prisma = new PrismaClient();

const logger = {
  setContext() {
    return logger;
  },
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

const service = new UserListsService(
  prisma as never,
  new UserListAccessPolicy(
    prisma as never,
    new UserBlockService(prisma as never),
  ),
  {} as never, // results assembler — not on this path
  new UserListMapper(prisma as never, logger as never),
  { loadTileImages: () => Promise.resolve(new Map()) } as never,
  {
    record: () => undefined,
    bboxFromPoint: () => null,
    bboxFromPlaceLocation: () => Promise.resolve(null),
  } as never,
  new UserBlockService(prisma as never) as never,
  new SaveableEntityResolver(prisma as never),
);

let userId: string;
let listId: string;
const entityIds: string[] = [];

async function servedCount(): Promise<number> {
  const lists = await service.listForUser(userId, {
    listType: 'restaurant',
  } as never);
  const list = lists.find((row) => row.listId === listId);
  if (!list) throw new Error('list vanished');
  return list.itemCount;
}

async function actualRows(): Promise<number> {
  return prisma.userListItem.count({ where: { listId } });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a served number against ' +
        'real rows and must not be skipped',
    );
  }
  const user = await prisma.user.create({
    data: {
      email: `${TEST_TAG}@test.local`,
      authProviderUserId: `${TEST_TAG}-clerk`,
    },
  });
  userId = user.userId;
  const list = await prisma.userList.create({
    data: {
      ownerUserId: userId,
      name: `${TEST_TAG}-list`,
      listType: 'restaurant',
    },
  });
  listId = list.listId;
  for (const label of ['a', 'b', 'c']) {
    const entity = await prisma.entity.create({
      data: {
        name: `${TEST_TAG}-${label}`,
        type: 'place',
        status: 'active',
      },
    });
    entityIds.push(entity.entityId);
  }
});

afterAll(async () => {
  await prisma.userListItem.deleteMany({ where: { listId } });
  await prisma.userList.deleteMany({ where: { listId } });
  await prisma.user.deleteMany({ where: { userId } });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.$disconnect();
});

describe('the served list item count is a derivation of the rows (F600)', () => {
  it('tracks a service DELETE and a raw MERGE-FOLD delete alike', async () => {
    for (const entityId of entityIds) {
      await service.addItem(userId, listId, { placeId: entityId });
    }
    expect(await servedCount()).toBe(3);
    expect(await servedCount()).toBe(await actualRows());

    // 1. The maintained path: removeItem.
    const first = await prisma.userListItem.findFirst({ where: { listId } });
    await service.removeItem(userId, listId, first!.itemId);
    expect(await servedCount()).toBe(2);
    expect(await servedCount()).toBe(await actualRows());

    // 2. The UNmaintained path: the merge fold. rehomeUserListItems deletes a
    // now-duplicate row directly and never touched item_count — this is the
    // exact shape that put 26 of 64 mirror lists into the wrong.
    const fold = await prisma.userListItem.findFirst({ where: { listId } });
    await prisma.userListItem.delete({ where: { itemId: fold!.itemId } });
    expect(await actualRows()).toBe(1);
    expect(await servedCount()).toBe(1);
  });
});
