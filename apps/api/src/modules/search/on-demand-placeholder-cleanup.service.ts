import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OnDemandPlaceholderCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly retentionMs = THIRTY_DAYS_MS;
  private readonly cadenceMs = ONE_DAY_MS;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OnDemandPlaceholderCleanupService');
  }

  onModuleInit(): void {
    // Schedule daily cleanup; fire-and-forget but log failures.
    void this.runCleanup().catch((error) => {
      this.logger.error('Initial on-demand placeholder cleanup failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });

    this.cleanupTimer = setInterval(() => {
      void this.runCleanup().catch((error) => {
        this.logger.error('On-demand placeholder cleanup failed', {
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

  /**
   * Remove on-demand placeholder restaurants that never produced connections
   * within the retention window.
   */
  async runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs);
    const deleted = await this.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM core_entities e
        WHERE e.type = 'restaurant'
          AND e.restaurant_metadata->>'origin' = 'on_demand'
          AND e.created_at < ${cutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM core_connections c
            WHERE c.restaurant_id = e.entity_id
          )
      `,
    );

    const deletedCount = Number(deleted);

    if (deletedCount > 0) {
      this.logger.info('Pruned on-demand placeholder restaurants', {
        deleted: deletedCount,
        cutoff: cutoff.toISOString(),
      });
    }
  }
}
