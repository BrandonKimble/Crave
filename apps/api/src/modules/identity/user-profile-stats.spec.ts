/**
 * W4 regression, extended by the red-team stats-drift fix: every profile
 * stat, contributed included, MUST be a LIVE count over the same rows
 * its profile section lists — never a denormalized user_stats counter.
 *
 * Original W4 case: the "Polls" stat read the drifting
 * user_stats.polls_created_count while the section listed live poll rows.
 * Red-team finding (same disease): followers/following/lists/favorites were
 * increment/decrement counters applied OUTSIDE the edge-write tx
 * (user-follow.service, favorites service) — a crash between the edge write
 * and the counter write drifted them forever. Fix: live indexed counts at
 * profile-read time. W2 cleanup finished the job: every applyDelta call site
 * is deleted and the dead counter COLUMNS are dropped from user_stats
 * (user_stats survives only as the ensure() provisioning seam).
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
  contributed?: number;
  softDeleted?: boolean;
}) => {
  const row = {
    userId: USER,
    username: 'them',
    displayName: 'Them',
    avatarUrl: null,
    // user_stats is a pure provisioning seam now — the profile read only
    // checks row PRESENCE. statsCounter simulates a stale extra field to
    // prove nothing reads it; pollsContributed is a live $queryRaw count.
    stats: { pollsCreatedCount: opts.statsCounter },
  };
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ count: BigInt(opts.contributed ?? 0) }]),
    user: {
      // KEYED ON THE WHERE (F2184). A findUnique that answers ANY where
      // identically cannot see the difference between "the live user asked
      // for" and "any row at all": with one, dropping `deletedAt: null` from
      // getPublicProfile — serving a DELETED account's profile — left all 68
      // identity specs green. This double models the soft-delete predicate
      // the way Postgres does: a query that omits it sees the deleted row.
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { userId?: string; deletedAt?: Date | null };
        }) => {
          if (where.userId !== USER) return Promise.resolve(null);
          const filtersDeleted = where.deletedAt === null;
          if (opts.softDeleted && filtersDeleted) return Promise.resolve(null);
          return Promise.resolve(row);
        },
      ),
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
    userList: {
      count: jest.fn().mockResolvedValue(opts.lists ?? 0),
    },
    userListItem: {
      count: jest.fn().mockResolvedValue(opts.favorites ?? 0),
    },
  };
  const service = new UserService(
    prisma as never,
    // Config owns the entitlement default; the service refuses to guess it.
    {
      get: jest.fn((key: string) =>
        key === 'billing.defaultEntitlement' ? 'premium' : undefined,
      ),
    } as never,
    { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as never,
    { ensure: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    // D40: the live-city reader — the onboarding write resolves the selected
    // city to a place KEY through it. Unused by the stats reads under test.
    { liveCities: jest.fn(), resolvePlaceIdByName: jest.fn() } as never,
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
    expect(prisma.userList.count).toHaveBeenCalledWith({
      where: { ownerUserId: USER },
    });
    expect(prisma.userListItem.count).toHaveBeenCalledWith({
      where: { list: { ownerUserId: USER } },
    });
  });

  it('a SOFT-DELETED account has no public profile', async () => {
    const { service } = makeService({
      pollCount: 0,
      statsCounter: 0,
      softDeleted: true,
    });
    await expect(service.getPublicProfile(USER)).rejects.toThrow(/not found/i);
  });

  it('pollsContributedCount is a live endorsed-or-commented distinct count', async () => {
    const { service } = makeService({
      pollCount: 1,
      statsCounter: 9,
      contributed: 4,
    });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.pollsContributedCount).toBe(4);
  });
});
