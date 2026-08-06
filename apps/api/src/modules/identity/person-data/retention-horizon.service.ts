import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PERSON_DATA_RULES } from './person-data-class';
import { ruleWhere, subjectRows } from './person-data-scope';

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
export class RetentionHorizonService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RetentionHorizon');
  }

  /** Rules that keep data under a stated, bounded promise. */
  private horizonRules() {
    return PERSON_DATA_RULES.filter(
      (rule) => rule.disposition === 'retain' && rule.horizonDays != null,
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
      // A retained column is not a scoping key, so the table's own person
      // scope locates the rows — the compiler's answer, not a new one.
      const scope = subjectRows(rule.table, {
        includeRetained: true,
        alias: 't',
      });
      if (!scope) continue;
      const [row] = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n
           FROM "${rule.table}" t
           JOIN users u ON (${scope.replace(/\$1/g, 'u.user_id::text')})
          WHERE u.deleted_at IS NOT NULL
            AND u.purge_due_at IS NULL
            AND u.deleted_at < now() - ($1::int * INTERVAL '1 day')`,
        rule.horizonDays,
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
    let deleted = 0;
    for (const rule of this.horizonRules()) {
      const scope = subjectRows(rule.table, {
        includeRetained: true,
        alias: 't',
      });
      if (!scope) continue;
      const count = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "${rule.table}" t
          WHERE EXISTS (
            SELECT 1 FROM users u
             WHERE (${scope.replace(/\$1/g, 'u.user_id::text')})
               AND u.deleted_at IS NOT NULL
               AND u.purge_due_at IS NULL
               AND u.deleted_at < now() - ($1::int * INTERVAL '1 day')
          )`,
        rule.horizonDays,
      );
      if (count > 0) {
        deleted += count;
        this.logger.info('Retention horizon reached — rows deleted', {
          rule: `${rule.table}.${rule.column}`,
          rows: count,
          horizonDays: rule.horizonDays,
        });
      }
    }
    return { deleted };
  }

  /** Exposed so a guard can assert the sweep and the eraser stay aligned. */
  static horizonRuleKeys(): string[] {
    return PERSON_DATA_RULES.filter(
      (rule) => rule.disposition === 'retain' && rule.horizonDays != null,
    ).map((rule) => `${rule.table}.${rule.column}`);
  }

  /** A retained rule must not ALSO be an acting rule — it would be erased at
   *  the deadline and never reach its horizon. */
  static contradictions(): string[] {
    return PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' &&
        rule.horizonDays != null &&
        ruleWhere(rule) !== null,
    ).map((rule) => `${rule.table}.${rule.column}`);
  }
}
