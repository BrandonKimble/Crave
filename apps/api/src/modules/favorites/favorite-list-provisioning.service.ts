import { Injectable } from '@nestjs/common';
import {
  FavoriteListType,
  FavoriteListVisibility,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * Auto-created default lists (page-registry §8.7): every user owns four
 * system lists — restaurants side 'Been' + 'Want to go', dish side 'Tried' +
 * 'Want to try' (copy TBD by owner). They start empty, pin to the TOP of the
 * home ordering (systemKind rank, see FavoriteListsService.listForUser), and
 * are not deletable (deleteList guard).
 *
 * SYSTEM_DEFAULT_LISTS order IS the pinned display order.
 */
export const SYSTEM_DEFAULT_LISTS: ReadonlyArray<{
  systemKind: string;
  name: string;
  listType: FavoriteListType;
}> = [
  { systemKind: 'been', name: 'Been', listType: FavoriteListType.restaurant },
  {
    systemKind: 'want_to_go',
    name: 'Want to go',
    listType: FavoriteListType.restaurant,
  },
  { systemKind: 'tried', name: 'Tried', listType: FavoriteListType.dish },
  {
    systemKind: 'want_to_try',
    name: 'Want to try',
    listType: FavoriteListType.dish,
  },
];

/** Fixed pinned rank per systemKind; Number.MAX_SAFE_INTEGER for user lists. */
export const systemKindRank = (
  systemKind: string | null | undefined,
): number => {
  if (!systemKind) {
    return Number.MAX_SAFE_INTEGER;
  }
  const rank = SYSTEM_DEFAULT_LISTS.findIndex(
    (entry) => entry.systemKind === systemKind,
  );
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
};

/**
 * Registered in IdentityModule (NOT FavoritesModule): the provisioning seam is
 * signup (UserService.syncFromClerkClaims, next to userStats.ensure), and
 * FavoritesModule already imports IdentityModule — providing it here serves
 * both sides without a module cycle. Domain code stays in the favorites folder.
 */
@Injectable()
export class FavoriteListProvisioningService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FavoriteListProvisioningService');
  }

  /**
   * Idempotent, self-healing on every identity sync (the userStats.ensure
   * pattern — this IS the backfill path for pre-existing users). Duplicates
   * are impossible by construction: the (ownerUserId, systemKind) unique is
   * the once-ever contract, and createMany(skipDuplicates) treats a
   * concurrent-first-launch race as a no-op.
   */
  async ensureDefaultLists(userId: string): Promise<void> {
    const existing = await this.prisma.favoriteList.findMany({
      where: { ownerUserId: userId, systemKind: { not: null } },
      select: { systemKind: true },
    });
    const existingKinds = new Set(existing.map((row) => row.systemKind));
    const missing = SYSTEM_DEFAULT_LISTS.filter(
      (entry) => !existingKinds.has(entry.systemKind),
    );
    if (missing.length === 0) {
      return;
    }

    const data: Prisma.FavoriteListCreateManyInput[] = missing.map((entry) => ({
      ownerUserId: userId,
      name: entry.name,
      listType: entry.listType,
      visibility: FavoriteListVisibility.private,
      systemKind: entry.systemKind,
      // Display order comes from the systemKind rank (system lists always
      // sort before user lists); position 1..4 only anchors intra-batch order.
      position: systemKindRank(entry.systemKind) + 1,
    }));

    const created = await this.prisma.favoriteList.createMany({
      data,
      skipDuplicates: true,
    });

    if (created.count < missing.length) {
      // Loud, not silent: a shortfall that is NOT the concurrent-sync race
      // means the (owner, listType, name) unique collided with a user-made
      // list of the same name — the systemKind row can never be provisioned
      // until the owner decides the collision policy.
      this.logger.warn('Default-list provisioning shortfall', {
        userId,
        expected: missing.length,
        created: created.count,
      });
    }
  }
}
