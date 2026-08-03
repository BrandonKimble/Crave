import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';

/**
 * §3 signals monthly partitions — automatic partition creation.
 *
 * The ledger is RANGE-partitioned on occurred_at by month (migration
 * 20260720110000). An insert into a month with no partition would FAIL the
 * write; the §3 law is "a write failure never fails the user action", so the
 * writer swallows it — silently dropping signals. Partitions must therefore
 * exist strictly AHEAD of the clock.
 *
 * §16 K6 (definitional — nothing changes it): PARTITION_LEAD_MONTHS = 2.
 * The daily idempotent pass keeps [current .. current+2] present, so the
 * cron would have to be dead for over TWO FULL MONTHS before any insert
 * could miss a partition — the lead is the definition of "strictly ahead",
 * not a tunable. occurred_at is bounded server-side (no client-supplied far
 * future), and the migration's signals_p_pre partition catches any
 * pre-ledger past, so [pre .. current+2] tiles the whole writable range.
 */
export const PARTITION_LEAD_MONTHS = 2;

/** UTC months [current .. current+lead] as {label 'YYYY_MM', from, to}. */
export function partitionMonths(
  now: Date,
  leadMonths: number = PARTITION_LEAD_MONTHS,
): Array<{ label: string; fromIso: string; toIso: string }> {
  const months: Array<{ label: string; fromIso: string; toIso: string }> = [];
  for (let offset = 0; offset <= leadMonths; offset += 1) {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
    );
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1),
    );
    months.push({
      label: `${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, '0')}`,
      fromIso: from.toISOString().slice(0, 10),
      toIso: to.toISOString().slice(0, 10),
    });
  }
  return months;
}

/** Idempotent DDL for one month's partition. */
export function partitionDdl(month: {
  label: string;
  fromIso: string;
  toIso: string;
}): string {
  return (
    `CREATE TABLE IF NOT EXISTS signals_p${month.label} ` +
    `PARTITION OF signals FOR VALUES FROM ('${month.fromIso} 00:00:00') ` +
    `TO ('${month.toIso} 00:00:00')`
  );
}

@Injectable()
export class SignalPartitionMaintenanceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SignalPartitionMaintenanceService');
  }

  /** Daily 03:10 UTC-ish (server local): keep the lead window present. */
  @Cron('10 3 * * *')
  async ensurePartitions(now: Date = new Date()): Promise<void> {
    try {
      for (const month of partitionMonths(now)) {
        await this.prisma.$executeRawUnsafe(partitionDdl(month));
      }
    } catch (error) {
      // NOT CRASHING AND NOT TELLING ANYONE ARE DIFFERENT DECISIONS (audit
      // 2026-08-02, F205). Only the first was ever made here; the second was
      // inherited from it. A dead partition cron eventually means EVERY
      // signal is silently dropped (the §3 writer swallows the insert
      // failure), so this is the one background failure in the ledger that
      // is genuinely critical. It still swallows — it just rings a bell now.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Signal partition maintenance failed', {
        error: { message },
      });
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'signal_partition_maintenance_failed',
        title: 'Signal partition maintenance failed',
        body: [
          'The daily pass that keeps signals RANGE partitions ahead of the clock threw.',
          `Error: ${message}`,
          `Lead window is ${PARTITION_LEAD_MONTHS} months, so writes are safe until the current window runs out — but an insert into an uncovered month FAILS and the §3 writer swallows it, i.e. user acts are lost silently.`,
        ].join('\n'),
        dedupeKey: `signal_partition_maintenance_failed:${this.dayKey(now)}`,
      });
    }
    await this.assertLeadPartitionExists(now);
  }

  /**
   * THE ASSERTION A DEAD SCHEDULER CANNOT FOOL (F205).
   *
   * A cron that never RUNS raises no exception, so a catch block — however
   * loud — cannot report it. This asserts the INVARIANT rather than the pass:
   * a partition covering `now + 1 month` must exist. It fails on a DDL that
   * errored, on a DDL that silently did nothing, and on a scheduler that
   * simply stopped scheduling (whereupon the assertion's own absence is the
   * only remaining hole, and that is a scheduler-liveness question, not a
   * partition one).
   */
  async assertLeadPartitionExists(now: Date = new Date()): Promise<boolean> {
    const [, nextMonth] = partitionMonths(now, 1);
    const expected = `signals_p${nextMonth.label}`;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ relname: string }>>`
        SELECT c.relname
        FROM pg_catalog.pg_inherits i
        JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'signals'::regclass
          AND c.relname = ${expected}
      `;
      if (rows.length > 0) {
        return true;
      }
      this.logger.error('Signal lead partition missing', { expected });
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'signal_lead_partition_missing',
        title: 'Signal ledger has no partition for next month',
        body: [
          `Expected partition ${expected} of \`signals\` does not exist.`,
          'Every act recorded into an uncovered month FAILS to insert, and the §3 writer swallows that failure — the ledger stops growing with no error surfaced to any user.',
          'Most likely cause: the partition-maintenance cron is not running at all (a dead scheduler raises no exception for a catch block to report).',
        ].join('\n'),
        dedupeKey: `signal_lead_partition_missing:${this.dayKey(now)}`,
      });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Signal lead partition check failed', {
        error: { message },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'signal_lead_partition_check_failed',
        title: 'Signal lead-partition check could not run',
        body: `The daily partition-existence assertion threw and therefore proved nothing.\nError: ${message}`,
        dedupeKey: `signal_lead_partition_check_failed:${this.dayKey(now)}`,
      });
      return false;
    }
  }

  private dayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
  }
}
