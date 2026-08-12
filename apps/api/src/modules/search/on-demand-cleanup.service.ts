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

// §16 K1 (owner sentence): "who asked" is operator forensics, kept one
// quarter — long enough to debug any collection complaint, short enough to
// not hoard user data. What changes it: owner re-ratify (privacy stance).
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * THE ON-DEMAND RETENTION JOB — one nightly pass, two steps (owner-approved
 * merge 2026-08-11).
 *
 * These were two services with two @Crons fifteen minutes apart
 * (OnDemandPlaceholderCleanupService at 9:15, OnDemandRequestUsersCleanupService
 * at 9:30). They are one subject — what the on-demand request rail is allowed
 * to keep, and for how long — differing only in retention window and table, and
 * splitting them bought nothing: two schedule entries to keep in step, two
 * places to look when a retention question comes up, and two chances for one to
 * be quietly disabled while the other reads healthy.
 *
 * THE TWO STEPS ARE UNCHANGED, deliberately down to the SQL. Each carries the
 * owner sentence that governs its own window; they are not one policy and must
 * never be collapsed into one number.
 *
 *   1. PLACEHOLDER ENTITIES — 30 days. Archive on-demand placeholder
 *      restaurants that never produced connections.
 *   2. REQUEST USERS — 90 days. Prune "who asked" rows, then recompute the
 *      aggregated counts that outlive them.
 *
 * EACH STEP RUNS EVEN IF THE OTHER THROWS. Two crons were independent by
 * accident of being two crons; sequential calls in one method would have made
 * step 1's failure silently skip step 2 — a retention pass that stops running
 * without ever failing is the worst version of this. So the isolation is
 * explicit, and the first error is still raised once both have had their turn.
 *
 * @Cron, not setInterval. Both jobs scheduled themselves from onModuleInit with
 * a raw timer plus an immediate run at boot, which put them OUTSIDE the one
 * gate that decides which process runs scheduled work: app.module.ts registers
 * ScheduleModule only for the scheduler runtime, and says of that line "this,
 * and nothing else, decides it". That sentence was false here.
 *
 * Two consequences, both silent. They ran in EVERY api replica rather than
 * the worker. And stopCronsForScript only stops SchedulerRegistry jobs, so
 * a raw interval survived it — meaning every `createApplicationContext`
 * script fired an entity-ARCHIVING pass at boot. stop-crons.ts predicted
 * exactly this ("when a fourth member appears..."); that was member four.
 */
@Injectable()
export class OnDemandCleanupService {
  private readonly placeholderRetentionMs = THIRTY_DAYS_MS;
  private readonly requestUserRetentionMs = NINETY_DAYS_MS;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OnDemandCleanupService');
  }

  @Cron('15 9 * * *')
  async runCleanup(): Promise<void> {
    let firstError: Error | undefined;
    for (const step of [
      { name: 'placeholders', run: () => this.prunePlaceholders() },
      { name: 'request users', run: () => this.pruneRequestUsers() },
    ]) {
      try {
        await step.run();
      } catch (error) {
        firstError ??=
          error instanceof Error ? error : new Error(String(error));
        this.logger.error(`On-demand cleanup step failed: ${step.name}`, {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    if (firstError) {
      throw firstError;
    }
  }

  /**
   * Archive on-demand placeholder restaurants that never produced
   * connections within the retention window (archive-not-delete contract).
   */
  private async prunePlaceholders(): Promise<void> {
    const cutoff = new Date(Date.now() - this.placeholderRetentionMs);
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

  private async pruneRequestUsers(): Promise<void> {
    // Phase C: ask events live on the immutable signals ledger now — no
    // retention pruning here (the deletion story severs signal_actors).
    const cutoff = new Date(Date.now() - this.requestUserRetentionMs);

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
