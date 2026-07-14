import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type FavoriteList } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserBlockService } from '../identity/user-block.service';

export type FavoriteListViewerRole = 'owner' | 'collaborator' | 'viewer';

export type ListAccessRow = Pick<
  FavoriteList,
  'listId' | 'ownerUserId' | 'shareSlug' | 'shareEnabled'
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The favorite-list capability law (RT-18 slug-as-capability + the
 * visibility canon, owner 2026-07-12), in ONE home:
 *
 * - Read: owner OR collaborator OR presented-shareSlug-matches (the slug IS
 *   the capability; rotation = revocation). Fail-closed 404 otherwise; a
 *   matching slug on a share-disabled list is 410 {state:'private'}.
 * - Mutate: owner or collaborator only — never the slug.
 * - Visibility is NEVER consulted here: it controls DISCOVERY (profile
 *   presence), not ACCESS. Private = unlisted, not locked — link holders and
 *   collaborators keep access across visibility flips until individually
 *   revoked (disableShare / removeCollaborator).
 * - Blocked pairs (§8.6): a viewer in a blocked pair with the owner gets the
 *   same 410 {state:'private'} on slug-granted reads and cannot join as a
 *   collaborator — indistinguishable from sharing having been revoked.
 */
@Injectable()
export class FavoriteListAccessPolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: UserBlockService,
  ) {}

  assertConcreteListId(listId: string): void {
    if (!UUID_RE.test(listId)) {
      throw new BadRequestException('Invalid list id');
    }
  }

  /**
   * Resolves the viewer's role against the RT-18 capability model. Throws
   * NotFound (fail-closed) when no grant applies, Gone({state:'private'})
   * when the presented slug matches but sharing is off OR the viewer is in a
   * blocked pair with the owner. A slug-granted read records a deduped
   * 'opened' share event (slug+viewer).
   */
  async resolveViewerRole(
    list: ListAccessRow,
    viewerUserId: string | null,
    presentedSlug?: string,
  ): Promise<FavoriteListViewerRole> {
    if (viewerUserId && list.ownerUserId === viewerUserId) {
      return 'owner';
    }
    if (viewerUserId) {
      const collaborator =
        await this.prisma.favoriteListCollaborator.findUnique({
          where: {
            listId_userId: { listId: list.listId, userId: viewerUserId },
          },
          select: { userId: true },
        });
      if (collaborator) {
        return 'collaborator';
      }
    }
    if (presentedSlug && list.shareSlug === presentedSlug) {
      if (!list.shareEnabled) {
        // Dead slug (sharing revoked): the row is kept so the client can
        // render the "no longer shared" body instead of a generic not-found.
        throw new GoneException({ state: 'private' });
      }
      if (viewerUserId) {
        // §8.6: a blocked pair sees the same 'private' body — nothing leaks.
        await this.assertNotBlockedPair(viewerUserId, list.ownerUserId);
      }
      await this.recordShareOpenEvent(list.listId, presentedSlug, viewerUserId);
      return 'viewer';
    }
    throw new NotFoundException('Favorite list not found');
  }

  /** Mutation grant: owner or collaborator only — never the slug. */
  async assertOwnerOrCollaborator(
    list: Pick<FavoriteList, 'listId' | 'ownerUserId'>,
    userId: string,
  ): Promise<void> {
    if (list.ownerUserId === userId) {
      return;
    }
    const collaborator = await this.prisma.favoriteListCollaborator.findUnique({
      where: { listId_userId: { listId: list.listId, userId } },
      select: { userId: true },
    });
    if (!collaborator) {
      throw new NotFoundException('Favorite list not found');
    }
  }

  /** §8.6 blocked-pair gate: throws the 'private'-shaped 410 (same body a
   *  gone-private list produces — the block itself never leaks). */
  async assertNotBlockedPair(
    viewerUserId: string,
    ownerUserId: string,
  ): Promise<void> {
    if (await this.blocks.isBlockedPair(viewerUserId, ownerUserId)) {
      throw new GoneException({ state: 'private' });
    }
  }

  /**
   * Share-open telemetry with the RT-18 flood fix: idempotent via the
   * dedupe_key unique constraint (P2002 = already counted = no-op).
   * Key = slug+viewer for authed reads, slug+day for anonymous ones
   * (anchor adjudication, w1 spec D.8).
   */
  async recordShareOpenEvent(
    listId: string,
    shareSlug: string,
    viewerUserId: string | null,
  ): Promise<void> {
    const dedupeKey = viewerUserId
      ? `opened:${shareSlug}:${viewerUserId}`
      : `opened:${shareSlug}:${new Date().toISOString().slice(0, 10)}`;
    try {
      await this.prisma.favoriteListShareEvent.create({
        data: {
          listId,
          shareSlug,
          eventType: 'opened',
          dedupeKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
