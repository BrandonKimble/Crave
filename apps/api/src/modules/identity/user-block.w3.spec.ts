/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserBlockService } from './user-block.service';
import { UserFollowService } from './user-follow.service';

/**
 * W3 blocking contracts (page-registry §8.6): idempotent block/unblock,
 * pair predicate both directions, and the enforcement seams inside the
 * follow service (write guard, edge flags, viewer-relative list filtering).
 */

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });

function makePrisma() {
  return {
    userBlock: {
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userFollow: {
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('UserBlockService (§8.6)', () => {
  let prisma: any;
  let service: UserBlockService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UserBlockService(prisma);
  });

  it('rejects self-block', async () => {
    await expect(service.blockUser(ME, ME)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('block is idempotent (P2002 = already blocked = success)', async () => {
    prisma.userBlock.create.mockRejectedValueOnce(p2002());
    await expect(service.blockUser(ME, THEM)).resolves.toEqual({
      blocked: true,
    });
  });

  it('isBlockedPair is direction-agnostic', async () => {
    prisma.userBlock.findFirst.mockResolvedValueOnce({ blockerUserId: THEM });
    await expect(service.isBlockedPair(ME, THEM)).resolves.toBe(true);
    const where = prisma.userBlock.findFirst.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
  });

  it('isBlockedPair never gates a self-read', async () => {
    await expect(service.isBlockedPair(ME, ME)).resolves.toBe(false);
    expect(prisma.userBlock.findFirst).not.toHaveBeenCalled();
  });

  it('getBlockFlags splits directions', async () => {
    prisma.userBlock.findMany.mockResolvedValueOnce([{ blockerUserId: THEM }]);
    await expect(service.getBlockFlags(ME, THEM)).resolves.toEqual({
      isBlockedByMe: false,
      hasBlockedMe: true,
    });
  });

  it('blockedPeerIds unions both directions', async () => {
    prisma.userBlock.findMany.mockResolvedValueOnce([
      { blockerUserId: ME, blockedUserId: THEM },
      { blockerUserId: OTHER, blockedUserId: ME },
    ]);
    const peers = await service.blockedPeerIds(ME);
    expect([...peers].sort()).toEqual([THEM, OTHER].sort());
  });
});

describe('UserFollowService block enforcement (§8.6 seams)', () => {
  let prisma: any;
  let blocks: UserBlockService;
  let service: UserFollowService;
  const stats = { applyDelta: jest.fn() } as any;
  const feed = { enqueue: jest.fn() } as any;

  beforeEach(() => {
    prisma = makePrisma();
    blocks = new UserBlockService(prisma);
    service = new UserFollowService(prisma, stats, feed, blocks);
  });

  it('followUser refuses a blocked pair (either direction)', async () => {
    prisma.userBlock.findFirst.mockResolvedValueOnce({ blockerUserId: THEM });
    await expect(service.followUser(ME, THEM)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.userFollow.create).not.toHaveBeenCalled();
  });

  it('getFollowEdge carries the block flags', async () => {
    prisma.userBlock.findMany.mockResolvedValueOnce([{ blockerUserId: ME }]);
    await expect(service.getFollowEdge(ME, THEM)).resolves.toEqual({
      isFollowedByMe: false,
      isMe: false,
      isBlockedByMe: true,
      hasBlockedMe: false,
    });
  });

  it('listFollowers excludes the viewer-blocked set', async () => {
    prisma.userBlock.findMany.mockResolvedValueOnce([
      { blockerUserId: ME, blockedUserId: OTHER },
    ]);
    prisma.userFollow.findMany.mockResolvedValueOnce([]);
    await service.listFollowers(THEM, { viewerUserId: ME });
    const where = prisma.userFollow.findMany.mock.calls[0][0].where;
    expect(where.followerUserId).toEqual({ notIn: [OTHER] });
  });

  it('listFollowing without a viewer applies no filter', async () => {
    prisma.userFollow.findMany.mockResolvedValueOnce([]);
    await service.listFollowing(THEM, {});
    const where = prisma.userFollow.findMany.mock.calls[0][0].where;
    expect(where.followingUserId).toBeUndefined();
    expect(where.followerUserId).toBe(THEM);
  });
});
