import { Injectable } from '@nestjs/common';
import { type UserStats } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * user_stats is a pure PROVISIONING SEAM now: ensure() is the idempotent
 * per-sign-in hook that default-list provisioning rides. Every profile stat
 * is a LIVE indexed count at read time (UserService.buildProfileStats) —
 * all counter columns drifted (writes outside the edge tx) and were dropped
 * in the red-team cleanup.
 */
@Injectable()
export class UserStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(userId: string): Promise<UserStats> {
    return this.prisma.userStats.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }
}
