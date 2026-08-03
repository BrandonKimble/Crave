import { Injectable } from '@nestjs/common';
import { SharedEntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserBlockService } from '../identity/user-block.service';
import { UserListAccessPolicy } from '../user-lists/user-list-access.policy';
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
    private readonly listAccess: UserListAccessPolicy,
  ) {}

  /**
   * THE one author/owner blocked-pair gate. Every kind decides EXPLICITLY
   * (no silent omission — the type-list disease): identity-adjacent kinds
   * (list → owner, poll → author, comment → author, user_profile → the user)
   * pass the id; identity-free kinds (restaurant, dish) pass null. Adding a
   * SharedEntityKind forces this decision at its call site.
   */
  private async blockedByAuthorGate(
    viewerUserId: string,
    authorUserId: string | null,
  ): Promise<boolean> {
    if (authorUserId == null) return false;
    return this.blocks.isBlockedPair(viewerUserId, authorUserId);
  }

  async resolve(
    kind: SharedEntityKind,
    id: string,
    viewerUserId: string,
    /** The slug the share package carried. A personal list is reachable ONLY
     *  by presenting it — a DM is not a weaker door than a pasted link. */
    presentedSlug?: string | null,
  ): Promise<SharePackagePreviewDto> {
    const unavailable = { unavailable: true as const, kind, id };
    const available = (
      title: string,
      subtitle: string | null = null,
      imageUrl: string | null = null,
      extra: {
        pollId?: string;
        listType?: 'restaurant' | 'dish';
        listSource?: 'curated';
      } = {},
    ): SharePackagePreviewDto => ({
      unavailable: false,
      kind,
      id,
      title,
      subtitle,
      imageUrl,
      ...extra,
    });

    // All six kinds are uuid-keyed tables; a malformed id is just "not found".
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return unavailable;
    }

    switch (kind) {
      case SharedEntityKind.list: {
        const list = await this.prisma.userList.findUnique({
          where: { listId: id },
          select: {
            listId: true,
            name: true,
            itemCount: true,
            listType: true,
            visibility: true,
            shareEnabled: true,
            shareSlug: true,
            ownerUserId: true,
          },
        });
        if (!list) {
          // Curated lists share under the SAME 'list' kind (uuid namespaces
          // are disjoint; the fetch seam is the only fork — home-surface
          // charter). Global lists are visible to everyone; a personal
          // (weekly-tasting) list only to its owner. No author gate: the
          // system, not a user, owns curated content.
          const curated = await this.prisma.curatedList.findUnique({
            where: { listId: id },
            select: {
              title: true,
              itemCount: true,
              listType: true,
              scope: true,
              ownerUserId: true,
            },
          });
          if (!curated) return unavailable;
          if (
            curated.scope === 'personal' &&
            curated.ownerUserId !== viewerUserId
          ) {
            return unavailable;
          }
          return available(curated.title, `${curated.itemCount} places`, null, {
            listType: curated.listType === 'dish' ? 'dish' : 'restaurant',
            listSource: 'curated',
          });
        }
        // (The owner blocked-pair check lives inside canRead — one place.)
        // ONE AUTHORITY (rederived 2026-08-03). This branch used to compute
        // its own rule — `owner || public || shareEnabled || collaborator` —
        // which granted a preview on `shareEnabled` ALONE, to anyone holding
        // the listId, while `UserListAccessPolicy` says the SLUG IS THE
        // CAPABILITY and 404s that exact case. Two authorities, live
        // disagreement. The policy is the authority; this asks it.
        // Revocation therefore works here for free and by construction:
        // sharing off -> 410, rotated slug -> 404, blocked pair -> hidden.
        const mayRead = await this.listAccess.canRead(
          {
            listId: list.listId,
            ownerUserId: list.ownerUserId,
            visibility: list.visibility,
            shareSlug: list.shareSlug,
            shareEnabled: list.shareEnabled,
          },
          viewerUserId,
          presentedSlug ?? undefined,
        );
        // Every refusal renders the SAME unavailable card — no capability,
        // revoked sharing, and a blocked pair are indistinguishable here.
        if (!mayRead) return unavailable;
        return available(list.name, `${list.itemCount} places`, null, {
          listType: list.listType,
        });
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
        // Explicit non-gate: entities carry no author identity.
        if (await this.blockedByAuthorGate(viewerUserId, null)) {
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
        // Identity-adjacent: a poll carries its AUTHOR's identity.
        if (
          await this.blockedByAuthorGate(viewerUserId, poll.createdByUserId)
        ) {
          return unavailable;
        }
        // (The draft poll state died in wave-6 item 9 — every poll row is
        // active/closed/archived, all shareable.)
        return available(poll.question, 'Poll');
      }
      case SharedEntityKind.comment: {
        const comment = await this.prisma.pollComment.findUnique({
          where: { commentId: id },
          select: {
            body: true,
            deletedAt: true,
            userId: true,
            pollId: true,
            user: { select: { username: true, displayName: true } },
          },
        });
        if (!comment || comment.deletedAt) return unavailable;
        if (await this.blockedByAuthorGate(viewerUserId, comment.userId)) {
          return unavailable;
        }
        const author =
          comment.user.displayName ?? comment.user.username ?? 'Someone';
        // pollId rides the preview so the client can push
        // pollDetail{pollId, commentAnchorId: id} — a shared comment is a
        // destination, not a dead-end card (registry §8.2).
        return available(comment.body.slice(0, 140), author, null, {
          pollId: comment.pollId,
        });
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
        if (await this.blockedByAuthorGate(viewerUserId, id)) {
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
