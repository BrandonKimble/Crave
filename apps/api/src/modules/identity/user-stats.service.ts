import { Injectable } from '@nestjs/common';
import { Prisma, type UserStats } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type UserStatsDelta = Partial<
  Record<
    // NOTE: no 'pollsCreatedCount' / 'followersCount' / 'followingCount' /
    // 'favoriteListsCount' / 'favoritesTotalCount' as profile TRUTH — every
    // profile stat except pollsContributedCount is a LIVE count at read time
    // (UserService.getProfile/getPublicProfile), the pollsCreatedCount W4
    // pattern: counters applied outside the edge-write tx drift forever on a
    // crash between writes. The favorites fields remain in this union ONLY
    // because the favorites service still calls applyDelta with them (owned
    // by a parallel pass); nothing READS those columns anymore — cleanup pass
    // should delete the call sites, these fields, and note the dead columns.
    'pollsContributedCount' | 'favoriteListsCount' | 'favoritesTotalCount',
    number
  >
>;

@Injectable()
export class UserStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(userId: string): Promise<UserStats> {
    return this.prisma.userStats.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        pollsCreatedCount: 0,
        pollsContributedCount: 0,
        followersCount: 0,
        followingCount: 0,
        favoriteListsCount: 0,
        favoritesTotalCount: 0,
      },
    });
  }

  async applyDelta(userId: string, delta: UserStatsDelta): Promise<void> {
    if (!delta || Object.keys(delta).length === 0) {
      return;
    }

    const updateData: Prisma.UserStatsUpdateInput = {};
    const createData: Prisma.UserStatsCreateInput = {
      user: { connect: { userId } },
      pollsCreatedCount: 0,
      pollsContributedCount: 0,
      followersCount: 0,
      followingCount: 0,
      favoriteListsCount: 0,
      favoritesTotalCount: 0,
    };

    Object.entries(delta).forEach(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
        return;
      }
      if (value > 0) {
        updateData[key] = { increment: value };
        createData[key] = value;
        return;
      }
      updateData[key] = { decrement: Math.abs(value) };
      createData[key] = 0;
    });

    await this.prisma.userStats.upsert({
      where: { userId },
      update: updateData,
      create: createData,
    });
  }
}
