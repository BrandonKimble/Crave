import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PersonDataEraserService } from './person-data-eraser.service';
import { AccountDeletionService } from '../account-deletion.service';
import { OpsAlertsService } from '../../external-integrations/shared/ops-alerts.service';

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
    private readonly opsAlerts: OpsAlertsService,
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
        const message = error instanceof Error ? error.message : String(error);
        const daysOverdue = this.daysOverdue(user.purgeDueAt);
        this.logger.error(
          'CRITICAL: purge failed; deadline left set for retry',
          { userId, error: message, daysOverdue },
        );
        // NOT CRASHING AND NOT TELLING ANYONE ARE DIFFERENT DECISIONS. The
        // retry above is correct and stays exactly as it was — but a retry
        // that fails every night forever is a legally-required erasure that
        // never happens, and the {purged, failed} return this method hands
        // back is consumed by nobody. So the FIRST failure rings the bell.
        // dedupeKey is per-ACCOUNT: a stuck account is ONE issue, not one
        // per nightly pass.
        this.opsAlerts.emit({
          severity: 'critical',
          kind: 'deletion_purge_failed',
          title: 'Account purge failed — erasure deadline is past due',
          body: [
            `User ${userId} is past its disclosed deletion deadline and the hard purge threw.`,
            `Error: ${message}`,
            `Days overdue: ${daysOverdue}. The deadline (\`purge_due_at\`) is stamped once and never moved, so it is also the consecutive-failure count: the nightly pass has now failed roughly ${daysOverdue + 1} time(s) for this account.`,
            'The deadline is deliberately left set, so tomorrow retries — but nothing else will notice if it never succeeds.',
          ].join('\n'),
          dedupeKey: `deletion_purge_failed:${userId}`,
        });
      }
    }
    this.logger.info('Deletion purge pass complete', { purged, failed });
    return { purged, failed };
  }

  /**
   * WHY NO NEW COLUMN. `purge_due_at` is stamped ONCE at request time
   * (AccountDeletionService) and is only ever CLEARED — by a successful purge
   * or by a restore. A failure leaves it exactly where it was. So the distance
   * from the deadline to now is monotone in the number of nightly passes that
   * have failed, and a separate failure counter would carry no information
   * this does not already carry.
   *
   * Floored, so the first failing pass (which runs 0–1 days after an
   * arbitrary-time-of-day deadline) reports 0 — hence "≈ daysOverdue + 1
   * passes" in the alert body rather than a false exact count.
   */
  private daysOverdue(purgeDueAt: Date | null, now: Date = new Date()): number {
    if (!purgeDueAt) return 0;
    const elapsed = now.getTime() - purgeDueAt.getTime();
    return elapsed <= 0 ? 0 : Math.floor(elapsed / 86_400_000);
  }
}
