import { Injectable } from '@nestjs/common';
import { UserListType, UserListVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * Auto-created default lists (page-registry §8.7): every user owns four
 * system lists — restaurants side 'Been' + 'Want to go', dish side 'Tried' +
 * 'Want to try' (copy TBD by owner). They start empty, pin to the TOP of the
 * home ordering (kind rank, see UserListsService.listForUser), and
 * are not deletable (deleteList guard).
 *
 * SYSTEM_DEFAULT_LISTS order IS the pinned display order.
 */
export const SYSTEM_DEFAULT_LISTS: ReadonlyArray<{
  kind: string;
  name: string;
  listType: UserListType;
}> = [
  { kind: 'been', name: 'Been', listType: UserListType.restaurant },
  {
    kind: 'want_to_go',
    name: 'Want to go',
    listType: UserListType.restaurant,
  },
  { kind: 'tried', name: 'Tried', listType: UserListType.dish },
  {
    kind: 'want_to_try',
    name: 'Want to try',
    listType: UserListType.dish,
  },
];

/** Fixed pinned rank per kind; Number.MAX_SAFE_INTEGER for user lists. */
export const kindRank = (kind: string | null | undefined): number => {
  if (!kind) {
    return Number.MAX_SAFE_INTEGER;
  }
  const rank = SYSTEM_DEFAULT_LISTS.findIndex((entry) => entry.kind === kind);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
};

/**
 * Registered in IdentityModule (NOT UserListsModule): the provisioning seam is
 * signup (UserService.syncFromClerkClaims, next to userStats.ensure), and
 * UserListsModule already imports IdentityModule — providing it here serves
 * both sides without a module cycle. Domain code stays in the favorites folder.
 */
@Injectable()
export class UserListProvisioningService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UserListProvisioningService');
  }

  /**
   * Idempotent, self-healing on every identity sync (the userStats.ensure
   * pattern — this IS the backfill path for pre-existing users). Duplicates
   * are impossible by construction: the (ownerUserId, kind) unique is
   * the once-ever contract, and createMany(skipDuplicates) treats a
   * concurrent-first-launch race as a no-op.
   */
  async ensureDefaultLists(userId: string): Promise<void> {
    const existing = await this.prisma.userList.findMany({
      where: { ownerUserId: userId, kind: { not: 'standard' } },
      select: { kind: true },
    });
    const existingKinds = new Set(existing.map((row) => row.kind));
    const missing = SYSTEM_DEFAULT_LISTS.filter(
      (entry) => !existingKinds.has(entry.kind),
    );
    if (missing.length === 0) {
      return;
    }

    const data: Prisma.UserListCreateManyInput[] = missing.map((entry) => ({
      ownerUserId: userId,
      name: entry.name,
      listType: entry.listType,
      visibility: UserListVisibility.private,
      kind: entry.kind,
      // Display order comes from the kind rank (system lists always
      // sort before user lists); position 1..4 only anchors intra-batch order.
      position: kindRank(entry.kind) + 1,
    }));

    const created = await this.prisma.userList.createMany({
      data,
      skipDuplicates: true,
    });

    if (created.count < missing.length) {
      // Loud, not silent: a shortfall that is NOT the concurrent-sync race
      // means the (owner, listType, name) unique collided with a user-made
      // list of the same name — the kind row can never be provisioned
      // until the owner decides the collision policy.
      this.logger.warn('Default-list provisioning shortfall', {
        userId,
        expected: missing.length,
        created: created.count,
      });
    }
  }
}
