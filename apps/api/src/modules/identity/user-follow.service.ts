import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserNotificationFeedService } from '../notifications/user-notification-feed.service';
import { UserStatsService } from './user-stats.service';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class UserFollowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStats: UserStatsService,
    private readonly feed: UserNotificationFeedService,
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

    // RT-10: concurrent double-follow passes the read check; the second create's unique
    // violation is idempotent success (the edge exists) — stats/feed only run for the
    // create that actually landed.
    try {
      await this.prisma.userFollow.create({
        data: {
          followerUserId,
          followingUserId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { followed: true };
      }
      throw error;
    }

    await this.userStats.applyDelta(followerUserId, { followingCount: 1 });
    await this.userStats.applyDelta(followingUserId, { followersCount: 1 });

    // Feed producer ("{user} started following you") — never fails the follow itself.
    try {
      await this.feed.enqueue({
        userId: followingUserId,
        type: NotificationType.follower_added,
        payload: { followerUserId },
      });
    } catch {
      // The follow edge is the truth; a missed feed row is acceptable loss.
    }

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

  /** The viewer→user follow edge (pairs with the public profile endpoint). */
  async getFollowEdge(viewerUserId: string, userId: string) {
    if (viewerUserId === userId) {
      return { isFollowedByMe: false, isMe: true };
    }
    const edge = await this.prisma.userFollow.findUnique({
      where: {
        followerUserId_followingUserId: {
          followerUserId: viewerUserId,
          followingUserId: userId,
        },
      },
    });
    return { isFollowedByMe: edge != null, isMe: false };
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
