/**
 * W4 regression, extended by the red-team stats-drift fix: every profile
 * stat except pollsContributedCount MUST be a LIVE count over the same rows
 * its profile section lists — never a denormalized user_stats counter.
 *
 * Original W4 case: the "Polls" stat read the drifting
 * user_stats.polls_created_count while the section listed live poll rows.
 * Red-team finding (same disease): followers/following/lists/favorites were
 * increment/decrement counters applied OUTSIDE the edge-write tx
 * (user-follow.service, favorites service) — a crash between the edge write
 * and the counter write drifted them forever. Fix: live indexed counts at
 * profile-read time; the follow-service applyDelta call sites are deleted.
 */
import { UserService } from './user.service';

const USER = '0feefee6-ef68-4df7-a817-71abe42abfc2';

const makeService = (opts: {
  pollCount: number;
  statsCounter: number;
  followers?: number;
  following?: number;
  lists?: number;
  favorites?: number;
}) => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        userId: USER,
        username: 'them',
        displayName: 'Them',
        avatarUrl: null,
        stats: {
          // The drifting counters — must NOT be what the DTO reports
          // (pollsContributedCount excepted: still counter-backed).
          pollsCreatedCount: opts.statsCounter,
          pollsContributedCount: 4,
          followersCount: 555,
          followingCount: 666,
          favoriteListsCount: 777,
          favoritesTotalCount: 888,
        },
      }),
    },
    poll: {
      count: jest.fn().mockResolvedValue(opts.pollCount),
    },
    userFollow: {
      count: jest.fn(({ where }: { where: { followingUserId?: string } }) =>
        Promise.resolve(
          where.followingUserId != null
            ? (opts.followers ?? 0)
            : (opts.following ?? 0),
        ),
      ),
    },
    favoriteList: {
      count: jest.fn().mockResolvedValue(opts.lists ?? 0),
    },
    favoriteListItem: {
      count: jest.fn().mockResolvedValue(opts.favorites ?? 0),
    },
  };
  const service = new UserService(
    prisma as never,
    { get: jest.fn() } as never,
    { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as never,
    { ensure: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
};

describe('UserService profile stats == live counts (W4 pattern, all stats)', () => {
  it('reports the live poll count, not the user_stats counter', async () => {
    // The exact W3 repro shape: counter says 2, zero actual poll rows.
    const { service } = makeService({ pollCount: 0, statsCounter: 2 });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.pollsCreatedCount).toBe(0);
  });

  it('counts over the SAME predicate as listPollsForUser(activity=created): createdByUserId only — no state/market filter', async () => {
    const { service, prisma } = makeService({ pollCount: 3, statsCounter: 0 });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.pollsCreatedCount).toBe(3);
    expect(prisma.poll.count).toHaveBeenCalledWith({
      where: { createdByUserId: USER },
    });
  });

  it('followers/following are live user_follows counts, not the counters', async () => {
    const { service, prisma } = makeService({
      pollCount: 0,
      statsCounter: 0,
      followers: 5,
      following: 2,
    });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.followersCount).toBe(5);
    expect(profile.stats.followingCount).toBe(2);
    expect(prisma.userFollow.count).toHaveBeenCalledWith({
      where: { followingUserId: USER },
    });
    expect(prisma.userFollow.count).toHaveBeenCalledWith({
      where: { followerUserId: USER },
    });
  });

  it('lists/favorites are live counts over owned lists and their items', async () => {
    const { service, prisma } = makeService({
      pollCount: 0,
      statsCounter: 0,
      lists: 4,
      favorites: 17,
    });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.favoriteListsCount).toBe(4);
    expect(profile.stats.favoritesTotalCount).toBe(17);
    expect(prisma.favoriteList.count).toHaveBeenCalledWith({
      where: { ownerUserId: USER },
    });
    expect(prisma.favoriteListItem.count).toHaveBeenCalledWith({
      where: { list: { ownerUserId: USER } },
    });
  });

  it('pollsContributedCount is the ONE remaining user_stats read', async () => {
    const { service } = makeService({ pollCount: 1, statsCounter: 9 });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.pollsContributedCount).toBe(4);
  });
});
