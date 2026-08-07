import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { NotificationTypeName } from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UserBlockService } from '../identity/user-block.service';
import {
  AUTHOR_SELECT,
  publicAuthorIdentity,
} from '../identity/public-author-identity';

const DEFAULT_PAGE_SIZE = 30;

/** The USER-facing in-app feed (the notifications page) — writes ride producers
 *  (follow, poll lifecycle, movement as they land); reads are user-scoped +
 *  read-state aware. Distinct from the push-delivery ledger. */
@Injectable()
export class UserNotificationFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: UserBlockService,
  ) {}

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
    // §8.6 BLOCKING (red team 2026-08-02). This was the last read surface that
    // joined actor identity without a block filter: A follows B, B blocks A,
    // and A's avatar, handle and display name still rendered in B's feed — on
    // the screen B is most likely to open right after blocking. Every other
    // module applies UserBlockService; this one was simply missed.
    const hidden = actorIds.length
      ? await this.blocks.blockedPeerIds(userId)
      : new Set<string>();
    const visibleActorIds = actorIds.filter((id) => !hidden.has(id));
    const actors = visibleActorIds.length
      ? await this.prisma.user.findMany({
          where: { userId: { in: visibleActorIds } },
          select: AUTHOR_SELECT,
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
        // F5803 — THE PIN. The client restates this vocabulary as a closed union
        // (@crave-search/shared, types/notifications) because mobile cannot import
        // @prisma/client. `satisfies` is what stops the two from drifting: add a member to
        // the NotificationType enum and this line stops compiling, HERE, before the new
        // value can reach a client switch that has no sentence for it. Widening the shared
        // union to admit it then breaks that switch's exhaustiveness check, which is where
        // someone has to decide what the user reads.
        type: row.type satisfies NotificationTypeName,
        // A notification outlives the account that caused it.
        actor: followerUserId
          ? publicAuthorIdentity(actorById.get(followerUserId))
          : null,
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
