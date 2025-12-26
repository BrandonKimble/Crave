import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatsService } from './user-stats.service';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class UserFollowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStats: UserStatsService,
  ) {}

  async followUser(followerUserId: string, followingUserId: string) {
    if (followerUserId === followingUserId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const existing = await this.prisma.userFollow.findUnique({
      where: {
        followerUserId_followingUserId: {
          followerUserId,
          followingUserId,
        },
      },
      select: { followerUserId: true },
    });
    if (existing) {
      return { followed: true };
    }

    await this.prisma.userFollow.create({
      data: {
        followerUserId,
        followingUserId,
      },
    });

    await this.userStats.applyDelta(followerUserId, { followingCount: 1 });
    await this.userStats.applyDelta(followingUserId, { followersCount: 1 });

    return { followed: true };
  }

  async unfollowUser(followerUserId: string, followingUserId: string) {
    const result = await this.prisma.userFollow.deleteMany({
      where: {
        followerUserId,
        followingUserId,
      },
    });

    if (result.count === 0) {
      return { followed: false };
    }

    await this.userStats.applyDelta(followerUserId, { followingCount: -1 });
    await this.userStats.applyDelta(followingUserId, { followersCount: -1 });

    return { followed: false };
  }

  async listFollowers(
    userId: string,
    options: { offset?: number; limit?: number },
  ) {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.userFollow.findMany({
      where: { followingUserId: userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        follower: {
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return rows.map((row) => row.follower);
  }

  async listFollowing(
    userId: string,
    options: { offset?: number; limit?: number },
  ) {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.userFollow.findMany({
      where: { followerUserId: userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        following: {
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return rows.map((row) => row.following);
  }
}
