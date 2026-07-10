import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 30;

/** The USER-facing in-app feed (the notifications page) — writes ride producers
 *  (follow, poll lifecycle, movement as they land); reads are user-scoped +
 *  read-state aware. Distinct from the push-delivery ledger. */
@Injectable()
export class UserNotificationFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(args: {
    userId: string;
    type: NotificationType;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.userNotification.create({
      data: {
        userId: args.userId,
        type: args.type,
        payload: args.payload ?? {},
      },
    });
  }

  async listFeed(userId: string, options: { offset?: number; limit?: number }) {
    const offset = options.offset ?? 0;
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, 100);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.userNotification.count({
        where: { userId, readAt: null },
      }),
    ]);
    // Enrich actor-shaped payloads (follower_added) with the actor's identity card in one
    // pass — rows render without N per-row lookups client-side.
    const actorIds = Array.from(
      new Set(
        rows
          .map((row) =>
            row.type === NotificationType.follower_added
              ? ((row.payload as { followerUserId?: string } | null)
                  ?.followerUserId ?? null)
              : null,
          )
          .filter((id): id is string => id != null),
      ),
    );
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { userId: { in: actorIds } },
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.userId, actor]));
    const items = rows.map((row) => {
      const followerUserId =
        row.type === NotificationType.follower_added
          ? ((row.payload as { followerUserId?: string } | null)
              ?.followerUserId ?? null)
          : null;
      return {
        ...row,
        actor: followerUserId ? (actorById.get(followerUserId) ?? null) : null,
      };
    });
    return { items, unreadCount };
  }

  /** Mark the whole feed read (the page-open behavior). */
  async markAllRead(userId: string): Promise<{ marked: number }> {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }
}
