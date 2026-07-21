import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

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
      // A creation failure is loud but non-fatal: the lead window means the
      // NEXT successful pass (within two months) still lands ahead of need.
      this.logger.error('Signal partition maintenance failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
