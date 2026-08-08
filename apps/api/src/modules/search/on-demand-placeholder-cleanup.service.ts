import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

// §16 K1 (its OWN sentence — retro audit 2026-07-24: the earlier "reuses
// the 30d no-place TTL" claim was value-coincidence laundering; that
// sentence governs geo observations, this governs evidence-less
// placeholder ENTITIES — a distinct decision that happens to share a
// value): "an evidence-less placeholder gets a month to earn its
// existence." §18 docket: awaiting batch ratification.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class OnDemandPlaceholderCleanupService {
  private readonly retentionMs = THIRTY_DAYS_MS;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OnDemandPlaceholderCleanupService');
  }

  /**
   * Archive on-demand placeholder restaurants that never produced
   * connections within the retention window (archive-not-delete contract).
   */
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
  @Cron('15 9 * * *')
  async runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs);
    // ARCHIVE, never delete (audit §1): entity rows are FK-load-bearing —
    // an in-flight extraction can hold a placeholder's id and write events
    // after this sweep; a hard delete makes that an FK crash. Archived
    // placeholders are invisible to all read surfaces and matching.
    const deleted = await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE core_entities e
        SET status = 'archived'
        WHERE e.type = 'restaurant'
          AND e.status <> 'archived'
          AND e.restaurant_metadata->>'origin' = 'on_demand'
          -- NAIVE COLUMN, EXPLICIT FRAME (audit 2026-08-02). core_entities
          -- .created_at is timestamp WITHOUT time zone, holding UTC wall
          -- clock, but Prisma binds a JS Date as timestamptz — so Postgres
          -- coerces the column using the SESSION TimeZone, and this
          -- mutation's SCOPE silently depends on where the server thinks it
          -- is. West of UTC it under-archives; east of UTC it archives rows
          -- NEWER than the retention window. Same defect that made the polls
          -- feed unpageable, but on an UPDATE.
          AND e.created_at < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
          AND NOT EXISTS (
            SELECT 1
            FROM core_restaurant_items c
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
