import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PersonDataEraserService } from './person-data-eraser.service';
import { AccountDeletionService } from '../account-deletion.service';

/**
 * THE HARD PURGE — where an account actually dies.
 *
 * The deletion REQUEST is reversible: it signs the person out and marks the
 * account, and destroys nothing (see AccountDeletionService). This cron is the
 * other half — it runs when the disclosed window has expired and does the
 * irreversible work: destroy the Clerk identity, burn the handle, propagate to
 * processors, erase the person.
 *
 * Without it, `purge_due_at` would be a stamp nothing acted on and the grace
 * period would exist only in a document. A published retention promise with no
 * mechanism is a WORSE position than no promise, because it is a commitment
 * you are provably not keeping.
 *
 * THE DEADLINE IS THE ONLY AUTHORITY. It reads `purgeDueAt`, never
 * `deletedAt`, and restore clears BOTH together — anything else silently
 * destroys an account that came back.
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
    private readonly accountDeletion: AccountDeletionService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DeletionPurge');
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDueAccounts(): Promise<{ purged: number; failed: number }> {
    const due = await this.prisma.user.findMany({
      where: { purgeDueAt: { not: null, lte: new Date() } },
      take: DeletionPurgeService.BATCH,
    });
    if (due.length === 0) return { purged: 0, failed: 0 };

    let purged = 0;
    let failed = 0;
    for (const user of due) {
      const userId = user.userId;
      try {
        // The irreversible half. Idempotent, because a failure below leaves
        // the deadline set and this runs again tomorrow.
        await this.accountDeletion.purgeAccount(user);
        // Sweep anything that landed DURING the window: a webhook, a cron or
        // an in-flight request can write a new row keyed to a user between the
        // request and the deadline (a late RevenueCat event, a queued
        // notification). purgeAccount already erased once; this catches
        // whatever the purge itself raced with.
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
        this.logger.error(
          'CRITICAL: purge failed; deadline left set for retry',
          {
            userId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    this.logger.info('Deletion purge pass complete', { purged, failed });
    return { purged, failed };
  }
}
