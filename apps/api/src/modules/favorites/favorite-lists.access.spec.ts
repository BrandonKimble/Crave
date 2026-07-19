/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { GoneException, NotFoundException } from '@nestjs/common';
import { FavoriteListsService } from './favorite-lists.service';
import { FavoriteListAccessPolicy } from './favorite-list-access.policy';
import { ListResultsAssembler } from './favorite-list-results.assembler';
import { FavoriteListMapper } from './favorite-list.mappers';

/**
 * RT-18 "the slug IS the capability" contract (w1-listdetail-structural-spec.md
 * B.1.1, red-team-2026-07-10.md RT-18 DECIDED).
 *
 * The RED case that pins the revocation model: a listId-holder WITHOUT the
 * slug must NOT read a shared list. Today's grant is the shareEnabled BOOLEAN
 * (`OR: [{ ownerUserId }, { shareEnabled: true }]`), so slug rotation revokes
 * nothing — this spec fails against that code by construction and goes green
 * only when access = owner OR collaborator OR presented-slug-matches.
 */

type ListRow = {
  listId: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  listType: 'restaurant' | 'dish';
  visibility: 'private' | 'public';
  itemCount: number;
  position: number;
  shareSlug: string | null;
  shareEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: any[];
};

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTRUDER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COLLABORATOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SLUG = 'slug-current';

function makeList(overrides?: Partial<ListRow>): ListRow {
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
    ...(overrides ?? {}),
  };
}

function makeHarness(list: ListRow, collaboratorIds: string[] = []) {
  // Honest predicate emulation for BOTH the legacy shape
  // ({ listId, OR: [{ ownerUserId }, { shareEnabled: true }] }) and the
  // fail-closed shape ({ listId } + in-code role resolution).
  const matches = (where: any): boolean => {
    if (where.listId && where.listId !== list.listId) return false;
    if (where.ownerUserId && where.ownerUserId !== list.ownerUserId) {
      return false;
    }
    if (where.shareSlug && where.shareSlug !== list.shareSlug) return false;
    if (
      where.shareEnabled !== undefined &&
      where.shareEnabled !== list.shareEnabled
    ) {
      return false;
    }
    if (where.OR) {
      return where.OR.some((clause: any) => matches(clause));
    }
    return true;
  };
  const shareEventCreate = jest.fn().mockResolvedValue({});
  const prisma = {
    favoriteList: {
      findFirst: jest.fn((args: any) =>
        Promise.resolve(matches(args.where) ? { ...list } : null),
      ),
      findUnique: jest.fn((args: any) =>
        Promise.resolve(args.where.listId === list.listId ? { ...list } : null),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    favoriteListCollaborator: {
      findUnique: jest.fn((args: any) => {
        const key = args.where.listId_userId;
        const hit =
          key &&
          key.listId === list.listId &&
          collaboratorIds.includes(key.userId);
        return Promise.resolve(
          hit ? { listId: list.listId, userId: key.userId } : null,
        );
      }),
      deleteMany: jest
        .fn()
        .mockResolvedValue({ count: collaboratorIds.length }),
      create: jest.fn().mockResolvedValue({}),
    },
    favoriteListShareEvent: { create: shareEventCreate },
    favoriteListItem: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }),
    },
    publicEntityScore: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const executor = {
    executeSingle: jest.fn().mockResolvedValue({
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
    }),
    executeDual: jest.fn(),
  };
  const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new FavoriteListsService(
    prisma as never,
    new FavoriteListAccessPolicy(prisma as never, blocks as never),
    new ListResultsAssembler(executor as never, {} as never),
    new FavoriteListMapper(prisma as never, logger as never),
    { loadTileImages: () => Promise.resolve(new Map()) } as never,
  );
  return { service, prisma, shareEventCreate };
}

describe('RT-18: the slug is the capability (getListResults)', () => {
  it('RED contract: a listId-holder WITHOUT the slug loses access even while sharing is enabled', async () => {
    const { service } = makeHarness(makeList());
    await expect(
      service.getListResults(INTRUDER, LIST_ID, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('grants access when the presented slug matches', async () => {
    const { service } = makeHarness(makeList());
    await expect(
      service.getListResults(INTRUDER, LIST_ID, { shareSlug: SLUG } as never),
    ).resolves.toMatchObject({ format: 'dual_list' });
  });

  it('rotation = revocation: a stale slug no longer grants', async () => {
    const { service } = makeHarness(makeList());
    await expect(
      service.getListResults(INTRUDER, LIST_ID, {
        shareSlug: 'slug-rotated-away',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dead slug (sharing disabled) returns 410 {state: private}, distinct from 404', async () => {
    const { service } = makeHarness(makeList({ shareEnabled: false }));
    const failure = service.getListResults(INTRUDER, LIST_ID, {
      shareSlug: SLUG,
    } as never);
    await expect(failure).rejects.toBeInstanceOf(GoneException);
    await failure.catch((error: GoneException) => {
      expect(error.getResponse()).toMatchObject({ state: 'private' });
    });
  });

  it('owner keeps access with no slug presented', async () => {
    const { service } = makeHarness(
      makeList({ shareEnabled: false, shareSlug: null }),
    );
    await expect(
      service.getListResults(OWNER, LIST_ID, {}),
    ).resolves.toMatchObject({ format: 'dual_list' });
  });
});

describe('RT-18: getListForUser (detail) uses the same capability', () => {
  it('non-owner without slug is refused on a share-enabled list', async () => {
    const { service } = makeHarness(makeList());
    await expect(
      (service.getListForUser as any)(INTRUDER, LIST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('collaborator reads the detail without a slug', async () => {
    const { service } = makeHarness(makeList({ shareEnabled: false }), [
      COLLABORATOR,
    ]);
    await expect(
      (service.getListForUser as any)(COLLABORATOR, LIST_ID),
    ).resolves.toMatchObject({ viewerRole: 'collaborator' });
  });
});
