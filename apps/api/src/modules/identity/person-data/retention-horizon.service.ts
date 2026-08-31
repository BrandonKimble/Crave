import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { isSchedulerRuntime } from '../../../shared/utils/process-role';
import { OpsAlertsService } from '../../external-integrations/shared/ops-alerts.service';
import { PERSON_DATA_RULES } from './person-data-class';
import {
  assertNoOverbroadDeleteScope,
  deleteScopeContradictions,
  retentionAction,
  retentionWhere,
} from './person-data-scope';

/**
 * THE HORIZON, ENFORCED.
 *
 * `retain` is the one disposition that KEEPS a person's data, so the
 * declaration requires it to state a basis and a horizon: "billing records,
 * GDPR 17(3)(b) legal obligation, 2555 days." Three rules carried a horizon
 * and NOTHING IN THE CODEBASE READ IT. `grep horizonDays` outside the
 * declaration returned nothing.
 *
 * That is the same shape as the grace period before it was built, and the same
 * shape as the export before it existed: a published retention promise with no
 * mechanism. Storage limitation is not a footnote of erasure — GDPR Art.5(1)(e)
 * makes "no longer than necessary" a standing obligation, and a horizon nobody
 * enforces means we keep financial records about departed people forever while
 * the policy says otherwise.
 *
 * WHY IT IS DERIVED, not a second list. The horizon lives beside the basis, on
 * the rule, in the same declaration the eraser and the exporter read. A
 * hand-written "delete billing rows older than 7 years" job would be a fourth
 * answer to "which columns are this person's", free to drift from the other
 * three — which is precisely the class of bug this whole area was rebuilt to
 * end.
 *
 * WHEN THE CLOCK STARTS: the account's PURGE, not the row's creation. The
 * retention exists because a departed person's financial record must remain
 * auditable; the obligation is anchored to their leaving. `users.deleted_at`
 * survives the purge (only identifying columns are cleared), so it is the
 * durable anchor — and a live account's rows are never touched, which is what
 * keeps this from deleting an active customer's invoices.
 */
@Injectable()
export class RetentionHorizonService implements OnModuleInit {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RetentionHorizon');
  }

  /**
   * THE KILL-SWITCH IS HONEST (2026-08-31 cron audit, same law as
   * derived-index-job.ts:110-127).
   *
   * The sweep STAYS gated — it hands a person scope to a DELETE and must not
   * act unattended. But GDPR Art.5(1)(e) storage limitation is a STANDING
   * obligation, and the horizon expires on its own clock whether or not
   * anything is enforcing it. With crons off, expired records simply keep
   * existing while the published policy says they do not, and nothing in the
   * codebase says a word. Enforcement is forbidden when the gate is off;
   * visibility is not.
   */
  async onModuleInit(): Promise<void> {
    if (isSchedulerRuntime()) return;
    try {
      const expired = await this.countExpired();
      if (expired === 0) return;
      this.logger.warn(
        'Retention horizons have expired but crons are disabled — no sweep',
        { expired },
      );
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'retention_horizon_disabled_backlog',
        title: `A LEGAL OBLIGATION IS PAUSED: ${expired} row(s) past their retention horizon, crons OFF`,
        body: [
          `${expired} row(s) belonging to departed people have passed the retention horizon our own declaration states, and this process has crons disabled (CRONS_ENABLED / PROCESS_ROLE), so the sweep did NOT run and will not.`,
          'This is a legal obligation (GDPR Art.5(1)(e) storage limitation) that is currently NOT being met — we are keeping data we published a promise to delete.',
          'Enable crons on a runtime that may act, or run the sweep deliberately.',
        ].join('\n\n'),
        dedupeKey: `retention_horizon_disabled_backlog:${new Date()
          .toISOString()
          .slice(0, 10)}`,
      });
    } catch (error) {
      this.logger.error('Retention horizon backlog check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * How many rows the sweep WOULD act on right now — the same scope
   * construction the sweep itself uses (`retentionWhere` + the expired-account
   * predicate), counted instead of deleted, so the alarm and the enforcement
   * can never disagree about what "expired" means.
   */
  private async countExpired(): Promise<number> {
    let expired = 0;
    for (const rule of this.horizonRules()) {
      const scope = retentionWhere(rule, 't');
      if (!scope) continue;
      const action = retentionAction(rule);
      if (!action) continue;
      const expiredAccount = `EXISTS (
            SELECT 1 FROM users u
             WHERE (${scope.replace(/\$1/g, 'u.user_id::text')})
               AND u.deleted_at IS NOT NULL
               AND u.purge_due_at IS NULL
               AND u.deleted_at < now() - ($1::int * INTERVAL '1 day')
          )`;
      const rows = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        action === 'delete_row'
          ? `SELECT count(*) AS n FROM "${rule.table}" t WHERE ${expiredAccount}`
          : `SELECT count(*) AS n FROM "${rule.table}" t
              WHERE t."${rule.column}" IS NOT NULL AND ${expiredAccount}`,
        rule.horizon,
      );
      expired += Number(rows[0]?.n ?? 0);
    }
    return expired;
  }

  /** Rules that keep data under a stated, bounded promise. */
  private horizonRules() {
    return PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' && typeof rule.horizon === 'number',
    );
  }

  /**
   * Rows held past their declared horizon, per rule. Read-only — the same
   * question the sweep answers, asked without acting, so an operator (and a
   * test) can see the state without triggering a deletion.
   */
  async overdue(): Promise<Array<{ rule: string; rows: number }>> {
    const report: Array<{ rule: string; rows: number }> = [];
    for (const rule of this.horizonRules()) {
      // THE RETAINED COLUMN IS THE SCOPE. A 2555-day promise about
      // `user_reports.reported_user_id` is a promise about the rows that report
      // THAT person; reading the table's whole person-OR here (`subjectRows`,
      // the EXPORT scope) is what made a departed reporter's sweep count — and
      // then delete — safety records about live third parties.
      const scope = retentionWhere(rule, 't');
      if (!scope) continue;
      const action = retentionAction(rule);
      if (!action) continue;
      // COUNT WHAT THE SWEEP WOULD ACT ON, not merely what it would find. For
      // a `'column'` horizon the sweep skips rows whose value is already NULL,
      // so counting them here would report work that never happens — an
      // "overdue" number that never reaches zero however often the sweep runs.
      const [row] = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n
           FROM "${rule.table}" t
           JOIN users u ON (${scope.replace(/\$1/g, 'u.user_id::text')})
          WHERE u.deleted_at IS NOT NULL
            AND u.purge_due_at IS NULL
            AND u.deleted_at < now() - ($1::int * INTERVAL '1 day')
            ${action === 'null_column' ? `AND t."${rule.column}" IS NOT NULL` : ''}`,
        rule.horizon,
      );
      if (row.n > 0) {
        report.push({ rule: `${rule.table}.${rule.column}`, rows: row.n });
      }
    }
    return report;
  }

  /**
   * Delete what the promise says is no longer ours to keep.
   *
   * `purge_due_at IS NULL` is load-bearing: it means the account's grace window
   * has already closed and the purge ran. Acting on an account still inside its
   * window would destroy records the person can still come back to.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async sweep(): Promise<{ deleted: number }> {
    // FAIL-CLOSED, BEFORE THE FIRST DELETE — same guard, same reason, as the
    // eraser: this is the second construction that hands a person scope to a
    // DELETE, and it is the one that runs unattended on a cron.
    assertNoOverbroadDeleteScope();

    let deleted = 0;
    for (const rule of this.horizonRules()) {
      const scope = retentionWhere(rule, 't');
      if (!scope) continue;
      const action = retentionAction(rule);
      if (!action) continue;

      // THE VERB IS DECLARED, NOT ASSUMED (`horizonUnit`). A horizon on a
      // column that NAMES the person expires the RECORD; a horizon on a
      // retained VALUE expires the VALUE. Writing only the first — which is
      // what this method did until 2026-08-07 — turns the second into a
      // DELETE on a row that must survive (`users`, the anonymized shell that
      // anchors every retained financial record). It matched nothing and so
      // looked fine; a later scope "fix" would have made it catastrophic.
      const expiredAccount = `EXISTS (
            SELECT 1 FROM users u
             WHERE (${scope.replace(/\$1/g, 'u.user_id::text')})
               AND u.deleted_at IS NOT NULL
               AND u.purge_due_at IS NULL
               AND u.deleted_at < now() - ($1::int * INTERVAL '1 day')
          )`;
      const count = await this.prisma.$executeRawUnsafe(
        action === 'delete_row'
          ? `DELETE FROM "${rule.table}" t WHERE ${expiredAccount}`
          : `UPDATE "${rule.table}" t SET "${rule.column}" = NULL
              WHERE t."${rule.column}" IS NOT NULL AND ${expiredAccount}`,
        rule.horizon,
      );
      if (count > 0) {
        deleted += count;
        this.logger.info('Retention horizon reached', {
          rule: `${rule.table}.${rule.column}`,
          action,
          rows: count,
          horizon: rule.horizon,
        });
      }
    }
    return { deleted };
  }

  /** Exposed so a guard can assert the sweep and the eraser stay aligned. */
  static horizonRuleKeys(): string[] {
    return PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' && typeof rule.horizon === 'number',
    ).map((rule) => `${rule.table}.${rule.column}`);
  }

  /**
   * A RETAINED HORIZON MUST NOT BE ENFORCED BY A SCOPE THAT DELETES OTHER ROWS.
   *
   * The old body was structurally `[]` and could not be otherwise: it filtered
   * for `retain` rules where `ruleWhere(rule) !== null`, but `ruleWhere` returns
   * null for every non-acting disposition (`retain` is not in ACTING), so the
   * second conjunct was false for every candidate — a green light wired to
   * nothing, in the file whose own header argues against promises with no
   * mechanism. Rederived, it went RED and named the real violation: the
   * 2555-day sweep for `user_reports.reported_user_id` ran a DELETE whose scope
   * also matched `reporter_user_id` (`anonymized_by_shell`), so a reporter's
   * purge deleted the safety record about a still-live third party at a horizon
   * that was never its own.
   *
   * That is fixed (D146): `sweep()` scopes by the RETAINED COLUMN, so this is
   * `[]` today. It stays here — and stays wired into the sweep through
   * `assertNoOverbroadDeleteScope` — because it is what makes the fix hold:
   * widening the sweep's scope back to the table's person-OR brings the pair
   * back by name, in the same edit. It reads the same derivation the DELETE is
   * built from, not a second opinion about it.
   */
  static contradictions(): string[] {
    return deleteScopeContradictions()
      .filter((c) => c.scope === 'retention-horizon')
      .map(
        (c) =>
          `${c.onBehalfOf}: horizon DELETE also removes ` +
          `${c.table}.${c.offendingColumn} (${c.offendingDisposition})`,
      );
  }
}
