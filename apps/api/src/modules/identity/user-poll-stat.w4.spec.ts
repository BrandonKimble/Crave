/**
 * W4 regression: the profile "Polls" stat MUST agree with the profile Polls
 * section (GET /polls/users/:userId?activity=created). Root cause of the W3
 * sim mismatch ("2 Polls" stat vs "No polls yet" section): the stat read the
 * denormalized user_stats.polls_created_count counter (increment-on-create,
 * no reconciliation, drifted in real data) while the section listed live
 * poll rows by createdByUserId. Fix: the stat is a LIVE prisma.poll.count
 * over the SAME predicate as the list — same rows by construction.
 */
import { UserService } from './user.service';

const USER = '0feefee6-ef68-4df7-a817-71abe42abfc2';

const makeService = (opts: { pollCount: number; statsCounter: number }) => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        userId: USER,
        username: 'them',
        displayName: 'Them',
        avatarUrl: null,
        stats: {
          // The drifting counter — must NOT be what the DTO reports.
          pollsCreatedCount: opts.statsCounter,
          pollsContributedCount: 4,
          followersCount: 5,
          followingCount: 6,
          favoriteListsCount: 7,
          favoritesTotalCount: 8,
        },
      }),
    },
    poll: {
      count: jest.fn().mockResolvedValue(opts.pollCount),
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

describe('UserService profile "Polls" stat == created-list count (W4)', () => {
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

  it('other stats still flow through from user_stats', async () => {
    const { service } = makeService({ pollCount: 1, statsCounter: 9 });
    const profile = await service.getPublicProfile(USER);
    expect(profile.stats.followersCount).toBe(5);
    expect(profile.stats.favoriteListsCount).toBe(7);
  });
});
