import { ClosenessService } from './closeness.service';

describe('ClosenessService (v1 heuristic ordering contract)', () => {
  const VIEWER = 'viewer';

  type Fixture = {
    outbound: { followingUserId: string; createdAt: Date }[];
    inbound: { followerUserId: string }[];
    likes: { userId: string; comment: { userId: string } }[];
    replies: { userId: string; parent: { userId: string } | null }[];
  };

  const build = (fx: Partial<Fixture>) => {
    const prisma = {
      userFollow: {
        findMany: jest.fn((args: { where: { followerUserId: unknown } }) =>
          Promise.resolve(
            args.where.followerUserId === VIEWER
              ? (fx.outbound ?? [])
              : (fx.inbound ?? []),
          ),
        ),
      },
      pollCommentLike: {
        findMany: jest.fn(() => Promise.resolve(fx.likes ?? [])),
      },
      pollComment: {
        findMany: jest.fn(() => Promise.resolve(fx.replies ?? [])),
      },
    };
    return new ClosenessService(
      prisma as unknown as ConstructorParameters<typeof ClosenessService>[0],
    );
  };

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  it('ranks followed users above non-followed users', async () => {
    const svc = build({
      outbound: [{ followingUserId: 'followed', createdAt: daysAgo(30) }],
    });
    await expect(
      svc.rankByCloseness(VIEWER, ['stranger', 'followed']),
    ).resolves.toEqual(['followed', 'stranger']);
  });

  it('ranks mutual follows above one-way follows', async () => {
    const svc = build({
      outbound: [
        { followingUserId: 'oneWay', createdAt: daysAgo(1) },
        { followingUserId: 'mutual', createdAt: daysAgo(300) },
      ],
      inbound: [{ followerUserId: 'mutual' }],
    });
    await expect(
      svc.rankByCloseness(VIEWER, ['oneWay', 'mutual']),
    ).resolves.toEqual(['mutual', 'oneWay']);
  });

  it('among one-way follows, more recent follow wins', async () => {
    const svc = build({
      outbound: [
        { followingUserId: 'old', createdAt: daysAgo(300) },
        { followingUserId: 'recent', createdAt: daysAgo(2) },
      ],
    });
    await expect(
      svc.rankByCloseness(VIEWER, ['old', 'recent']),
    ).resolves.toEqual(['recent', 'old']);
  });

  it('interactions rank a non-followed user above a quieter one', async () => {
    const svc = build({
      likes: [
        { userId: VIEWER, comment: { userId: 'chatty' } },
        { userId: 'chatty', comment: { userId: VIEWER } },
      ],
      replies: [{ userId: 'chatty', parent: { userId: VIEWER } }],
    });
    await expect(
      svc.rankByCloseness(VIEWER, ['quiet', 'chatty']),
    ).resolves.toEqual(['chatty', 'quiet']);
  });

  it('interactions alone never outrank a follow (cap at 20)', async () => {
    const svc = build({
      outbound: [{ followingUserId: 'followed', createdAt: daysAgo(360) }],
      likes: Array.from({ length: 50 }, () => ({
        userId: VIEWER,
        comment: { userId: 'chatty' },
      })),
    });
    await expect(
      svc.rankByCloseness(VIEWER, ['chatty', 'followed']),
    ).resolves.toEqual(['followed', 'chatty']);
  });

  it('is a stable sort: ties keep input order, viewer and dupes dropped', async () => {
    const svc = build({});
    await expect(
      svc.rankByCloseness(VIEWER, ['a', 'b', VIEWER, 'a', 'c']),
    ).resolves.toEqual(['a', 'b', 'c']);
  });
});
