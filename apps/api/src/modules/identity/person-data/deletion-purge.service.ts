import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PersonDataEraserService } from './person-data-eraser.service';

/**
 * THE HARD PURGE — the second half of "logically instant, physically deferred".
 *
 * Without this, `deleted_at` was a stamp nothing ever acted on: the grace
 * period existed only in a document. A published retention promise with no
 * mechanism is a WORSE position than no promise, because it is a commitment
 * you are provably not keeping.
 *
 * What this is NOT responsible for: hiding the account. That already happened
 * at confirm time — sessions revoked, push tokens deleted, authorship severed,
 * profile hidden. This only converts "hidden" into "gone".
 *
 * Re-running the eraser here is deliberate and not redundant. Between the
 * confirm and the deadline, a webhook, a cron, or an in-flight request can
 * write a new row keyed to a user who no longer exists (a late RevenueCat
 * event, a queued notification). The purge is the sweep that catches whatever
 * arrived during the window.
 */
@Injectable()
export class DeletionPurgeService {
  /** How many accounts one pass will purge. Bounded so a backlog cannot turn
   *  into an unbounded transaction; the next run takes the rest. */
  private static readonly BATCH = 50;

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eraser: PersonDataEraserService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DeletionPurge');
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDueAccounts(): Promise<{ purged: number; failed: number }> {
    const due = await this.prisma.user.findMany({
      where: { purgeDueAt: { not: null, lte: new Date() } },
      select: { userId: true },
      take: DeletionPurgeService.BATCH,
    });
    if (due.length === 0) return { purged: 0, failed: 0 };

    let purged = 0;
    let failed = 0;
    for (const { userId } of due) {
      try {
        // Sweep anything that landed during the grace window.
        await this.eraser.erase(userId);
        // The shell must be anonymous BEFORE we stop tracking the deadline —
        // otherwise a regression in the anonymize step would leave identity
        // behind with nothing left to notice it.
        await this.eraser.assertShellIsAnonymous(userId);
        await this.prisma.user.update({
          where: { userId },
          data: { purgeDueAt: null },
        });
        purged += 1;
      } catch (error) {
        // Leave purgeDueAt SET so the next run retries. A purge that fails
        // silently and clears its own deadline is how a retention promise
        // quietly stops being kept.
        failed += 1;
        this.logger.error('CRITICAL: purge failed; deadline left set for retry', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.info('Deletion purge pass complete', { purged, failed });
    return { purged, failed };
  }
}
