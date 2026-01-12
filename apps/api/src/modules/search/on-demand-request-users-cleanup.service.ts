import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OnDemandRequestUsersCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly retentionMs = NINETY_DAYS_MS;
  private readonly cadenceMs = ONE_DAY_MS;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'OnDemandRequestUsersCleanupService',
    );
  }

  onModuleInit(): void {
    void this.runCleanup().catch((error) => {
      this.logger.error('Initial on-demand request user cleanup failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });

    this.cleanupTimer = setInterval(() => {
      void this.runCleanup().catch((error) => {
        this.logger.error('On-demand request user cleanup failed', {
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      });
    }, this.cadenceMs);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs);

    const deleted = await this.prisma.onDemandRequestUser.deleteMany({
      where: { createdAt: { lt: cutoff } },
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
          FROM on_demand_request_users
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
          FROM on_demand_request_users u
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
