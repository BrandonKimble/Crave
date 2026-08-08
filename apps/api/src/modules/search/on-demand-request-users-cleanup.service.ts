import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

// §16 K1 (owner sentence): "who asked" is operator forensics, kept one
// quarter — long enough to debug any collection complaint, short enough to
// not hoard user data. What changes it: owner re-ratify (privacy stance).
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class OnDemandRequestUsersCleanupService {
  private readonly retentionMs = NINETY_DAYS_MS;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'OnDemandRequestUsersCleanupService',
    );
  }

  /**
   * @Cron, not setInterval. This job scheduled itself from onModuleInit with
   * a raw timer plus an immediate run at boot, which put it OUTSIDE the one
   * gate that decides which process runs scheduled work: app.module.ts
   * registers ScheduleModule only for the scheduler runtime, and says of that
   * line "this, and nothing else, decides it". That sentence was false here.
   *
   * Two consequences, both silent. It ran in EVERY api replica rather than
   * the worker. And stopCronsForScript only stops SchedulerRegistry jobs, so
   * a raw interval survived it — meaning every `createApplicationContext`
   * script fired an entity-ARCHIVING pass at boot. stop-crons.ts predicted
   * exactly this ("when a fourth member appears..."); this was member four.
   */
  @Cron('30 9 * * *')
  async runCleanup(): Promise<void> {
    // Phase C: ask events live on the immutable signals ledger now — no
    // retention pruning here (the deletion story severs signal_actors).
    const cutoff = new Date(Date.now() - this.retentionMs);

    const deleted = await this.prisma.onDemandRequestUser.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });

    if (deleted.count === 0) {
      return;
    }

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE collection_on_demand_requests r
        SET distinct_user_count = counts.distinct_count
        FROM (
          SELECT request_id, COUNT(*)::int AS distinct_count
          FROM collection_on_demand_request_users
          GROUP BY request_id
        ) counts
        WHERE r.request_id = counts.request_id
      `,
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE collection_on_demand_requests r
        SET distinct_user_count = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM collection_on_demand_request_users u
          WHERE u.request_id = r.request_id
        )
      `,
    );

    this.logger.info('Pruned on-demand request user rows', {
      deleted: deleted.count,
      cutoff: cutoff.toISOString(),
    });
  }
}
