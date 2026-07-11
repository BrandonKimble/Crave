import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Blocking (page-registry §8.6 — the Apple 1.2 UGC requirement).
 *
 * The table is the single truth; ENFORCEMENT is distributed to the read/write
 * seams that consume it (each site documents itself as a §8.6 enforcement
 * point): follow write + follow edge + follow lists (user-follow.service),
 * the food log (photos.controller), public lists-of-user
 * (favorites.public.controller), user polls/comments (polls.controller), and
 * the public profile read itself (public-user.controller: optional auth —
 * an authed blocked-pair viewer gets a minimal `unavailable: true` payload;
 * anonymous reads stay full). The authed follow-edge flags additionally
 * drive the mobile "unavailable" body + Unblock affordance.
 */
@Injectable()
export class UserBlockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent block. Also severs the follow edges BOTH ways (industry
   *  semantics: blocking force-unfollows in both directions). */
  async blockUser(blockerUserId: string, blockedUserId: string) {
    if (blockerUserId === blockedUserId) {
      throw new BadRequestException('Cannot block yourself');
    }
    try {
      await this.prisma.userBlock.create({
        data: { blockerUserId, blockedUserId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { blocked: true };
      }
      throw error;
    }
    return { blocked: true };
  }

  /** Idempotent unblock. */
  async unblockUser(blockerUserId: string, blockedUserId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerUserId, blockedUserId },
    });
    return { blocked: false };
  }

  /** True when EITHER side has blocked the other — the "no contact"
   *  predicate every read seam gates on. */
  async isBlockedPair(userIdA: string, userIdB: string): Promise<boolean> {
    if (userIdA === userIdB) {
      return false;
    }
    const row = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerUserId: userIdA, blockedUserId: userIdB },
          { blockerUserId: userIdB, blockedUserId: userIdA },
        ],
      },
      select: { blockerUserId: true },
    });
    return row != null;
  }

  /** Directional flags for the profile edge (drives the mobile
   *  "unavailable" body + the Unblock affordance). */
  async getBlockFlags(viewerUserId: string, userId: string) {
    if (viewerUserId === userId) {
      return { isBlockedByMe: false, hasBlockedMe: false };
    }
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerUserId: viewerUserId, blockedUserId: userId },
          { blockerUserId: userId, blockedUserId: viewerUserId },
        ],
      },
      select: { blockerUserId: true },
    });
    return {
      isBlockedByMe: rows.some((r) => r.blockerUserId === viewerUserId),
      hasBlockedMe: rows.some((r) => r.blockerUserId === userId),
    };
  }

  /** W4 settings (§8.6 privacy): the viewer's OWN block list — one direction
   *  only (people I blocked; being-blocked stays invisible by design). Drives
   *  Settings → Privacy → Blocked users, each row with an Unblock affordance. */
  async listBlockedUsers(blockerUserId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
    return rows.map((row) => row.blocked);
  }

  /** Every userId the viewer must not see / be seen by (both directions) —
   *  the follow-list filter set. */
  async blockedPeerIds(viewerUserId: string): Promise<Set<string>> {
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerUserId: viewerUserId }, { blockedUserId: viewerUserId }],
      },
      select: { blockerUserId: true, blockedUserId: true },
    });
    const peers = new Set<string>();
    for (const row of rows) {
      peers.add(
        row.blockerUserId === viewerUserId
          ? row.blockedUserId
          : row.blockerUserId,
      );
    }
    return peers;
  }
}
