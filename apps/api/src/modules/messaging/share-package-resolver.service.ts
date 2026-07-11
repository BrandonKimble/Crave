import { Injectable } from '@nestjs/common';
import { SharedEntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserBlockService } from '../identity/user-block.service';
import { SharePackagePreviewDto } from './dto/messaging.dto';

/**
 * Share-package resolution (w3-messaging-design §3.3): (kind, id, viewer) →
 * preview DTO or an honest `unavailable`. Visibility is applied AT RESOLVE
 * TIME (private list, deleted comment, blocked author) so a DM bubble can
 * never leak content the viewer shouldn't see. Three consumers by design:
 * DM bubbles, the universal share modal, the /l/{slug} landing.
 *
 * v1 is deliberately crude-real (M3/owner design pass owns beauty): title +
 * subtitle + best-effort image, one query per kind, no snapshots.
 */
@Injectable()
export class SharePackageResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: UserBlockService,
  ) {}

  async resolve(
    kind: SharedEntityKind,
    id: string,
    viewerUserId: string,
  ): Promise<SharePackagePreviewDto> {
    const unavailable = { unavailable: true as const, kind, id };
    const available = (
      title: string,
      subtitle: string | null = null,
      imageUrl: string | null = null,
    ): SharePackagePreviewDto => ({
      unavailable: false,
      kind,
      id,
      title,
      subtitle,
      imageUrl,
    });

    // All six kinds are uuid-keyed tables; a malformed id is just "not found".
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return unavailable;
    }

    switch (kind) {
      case SharedEntityKind.list: {
        const list = await this.prisma.favoriteList.findUnique({
          where: { listId: id },
          select: {
            name: true,
            itemCount: true,
            visibility: true,
            shareEnabled: true,
            ownerUserId: true,
            collaborators: { select: { userId: true } },
          },
        });
        if (!list) return unavailable;
        const viewerCanSee =
          list.ownerUserId === viewerUserId ||
          list.visibility === 'public' ||
          list.shareEnabled ||
          list.collaborators.some((c) => c.userId === viewerUserId);
        if (!viewerCanSee) return unavailable;
        return available(list.name, `${list.itemCount} places`);
      }
      case SharedEntityKind.restaurant:
      case SharedEntityKind.dish: {
        const wantedType =
          kind === SharedEntityKind.restaurant ? 'restaurant' : 'food';
        const entity = await this.prisma.entity.findUnique({
          where: { entityId: id },
          select: { name: true, type: true, status: true, city: true },
        });
        if (!entity || entity.type !== wantedType) return unavailable;
        if (entity.status !== 'active') {
          return unavailable;
        }
        return available(entity.name, entity.city ?? null);
      }
      case SharedEntityKind.poll: {
        const poll = await this.prisma.poll.findUnique({
          where: { pollId: id },
          select: { question: true, state: true, createdByUserId: true },
        });
        if (!poll) return unavailable;
        if (poll.state === 'draft' && poll.createdByUserId !== viewerUserId) {
          return unavailable;
        }
        return available(poll.question, 'Poll');
      }
      case SharedEntityKind.comment: {
        const comment = await this.prisma.pollComment.findUnique({
          where: { commentId: id },
          select: {
            body: true,
            deletedAt: true,
            userId: true,
            user: { select: { username: true, displayName: true } },
          },
        });
        if (!comment || comment.deletedAt) return unavailable;
        if (await this.blocks.isBlockedPair(viewerUserId, comment.userId)) {
          return unavailable;
        }
        const author =
          comment.user.displayName ?? comment.user.username ?? 'Someone';
        return available(comment.body.slice(0, 140), author);
      }
      case SharedEntityKind.user_profile: {
        const user = await this.prisma.user.findUnique({
          where: { userId: id },
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            deletedAt: true,
          },
        });
        if (!user || user.deletedAt) return unavailable;
        if (await this.blocks.isBlockedPair(viewerUserId, id)) {
          return unavailable;
        }
        return available(
          user.displayName ?? user.username ?? 'Crave user',
          user.username ? `@${user.username}` : null,
          user.avatarUrl,
        );
      }
    }
  }
}
