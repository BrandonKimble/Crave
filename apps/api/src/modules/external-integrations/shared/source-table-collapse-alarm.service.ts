import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { isSchedulerRuntime } from '../../../shared/utils/process-role';
import { OpsAlertsService } from './ops-alerts.service';

/**
 * THE SOURCE-TABLE ROW-COLLAPSE ALARM (08-16 silent-wipe incident).
 *
 * The core source tables are the part of the corpus that CANNOT be rebuilt:
 * entities, their surfaces, grounded locations, collected documents, and the
 * evidence event ledger. Every derived layer has an emptiness self-heal
 * (DerivedIndexJob, the rescore parity audit) precisely because it can be
 * re-derived — but on 2026-08-16 a wipe emptied SOURCE tables and nothing
 * anywhere said a word: no guard compared today's row count to yesterday's,
 * so total data loss was indistinguishable from a small database.
 *
 * This is an ALARM, deliberately not a self-heal: source data has no
 * upstream to rebuild from, so the only honest response is a critical,
 * deduped ops alert naming the table, loudly and early (boot + nightly).
 *
 * THE THRESHOLD, justified from the incident rather than invented: the
 * incident was a wipe — a drop TO ZERO, a 100% single-step loss. Legitimate
 * operations on these tables shrink them by rows, not by fractions: dedupe
 * merges ARCHIVE (status flip, row kept), GDPR erasure nulls columns,
 * community-scoped wipes preserve place-grounded restaurants by law. Nothing
 * legitimate removes a fifth of a source table in one step, so a >20%
 * single-step drop — or any drop to zero from a nonzero high water — alarms.
 * 20% sits far above observed legitimate churn (single-digit rows/day) and
 * far below the incident's 100%; it is a generous margin, not a measurement
 * of precision we do not have.
 *
 * HIGH WATER ONLY RATCHETS UP. A deliberate, human-decided shrink (a city
 * offboarding, say) is accepted by updating source_table_high_water by hand
 * — the alert body says exactly that, so the acknowledgment path is the
 * reset path and an unacknowledged collapse can never quietly become the new
 * baseline.
 */

/** The unrebuildable tables. CLOSED list — counts are interpolated into SQL,
 *  so nothing dynamic may ever join it. */
export const SOURCE_TABLES = [
  'core_entities',
  'entity_surface',
  'core_restaurant_locations',
  'collection_source_documents',
  'core_restaurant_events',
] as const;

export type SourceTable = (typeof SOURCE_TABLES)[number];

/** A single-step drop beyond this fraction of high water alarms. See the
 *  header for why 0.2: generously above legitimate churn, far below the
 *  incident's 100% wipe. */
export const COLLAPSE_DROP_FRACTION = 0.2;

export interface SourceTableCensusVerdict {
  readonly table: SourceTable;
  readonly current: number;
  readonly highWater: number;
  readonly outcome: 'baseline-seeded' | 'ratcheted' | 'steady' | 'collapsed';
}

@Injectable()
export class SourceTableCollapseAlarmService implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SourceTableCollapseAlarm');
  }

  /** Boot arm — fire-and-forget, an audit must never block boot. Runs on
   *  EVERY runtime (api included): a cron-free process can still SEE the
   *  collapse, and kill-switch honesty lives in the alert body. */
  onApplicationBootstrap(): void {
    void this.runCensus('boot').catch(() => undefined);
  }

  /** Nightly arm — cron-guarded per the repo law (ScheduleModule itself is
   *  gated by CRONS_ENABLED / PROCESS_ROLE, so this is inert on cron-free
   *  runtimes; the boot arm still runs there). 4AM: after the 3AM nightly
   *  convergence, so a convergence night's legitimate churn is settled. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runNightly(): Promise<void> {
    await this.runCensus('nightly');
  }

  /** The census: compare each source table's live count to its persisted
   *  high water; ratchet up, alarm on collapse. Fail-isolated per table. */
  async runCensus(
    when: 'boot' | 'nightly',
  ): Promise<SourceTableCensusVerdict[]> {
    const verdicts: SourceTableCensusVerdict[] = [];
    for (const table of SOURCE_TABLES) {
      try {
        verdicts.push(await this.censusOne(table, when));
      } catch (error) {
        this.logger.error('Source-table census failed for a table', {
          table,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      }
    }
    const collapsed = verdicts.filter((v) => v.outcome === 'collapsed');
    if (collapsed.length === 0) {
      this.logger.info('Source-table collapse census clean', {
        when,
        tables: verdicts.length,
      });
    }
    return verdicts;
  }

  private async censusOne(
    table: SourceTable,
    when: 'boot' | 'nightly',
  ): Promise<SourceTableCensusVerdict> {
    // `table` comes from the CLOSED const list above — never from input.
    const [countRow] = await this.prisma.$queryRawUnsafe<
      Array<{ n: bigint | number }>
    >(`SELECT count(*)::bigint AS n FROM ${table}`);
    const current = Number(countRow?.n ?? 0);

    const snapshot = await this.prisma.sourceTableHighWater.findUnique({
      where: { tableName: table },
    });
    if (!snapshot) {
      // First observation IS the baseline — no history, nothing to compare.
      await this.prisma.sourceTableHighWater.create({
        data: { tableName: table, highWaterCount: BigInt(current) },
      });
      return { table, current, highWater: current, outcome: 'baseline-seeded' };
    }

    const highWater = Number(snapshot.highWaterCount);
    if (current > highWater) {
      await this.prisma.sourceTableHighWater.update({
        where: { tableName: table },
        data: { highWaterCount: BigInt(current) },
      });
      return { table, current, highWater: current, outcome: 'ratcheted' };
    }

    const floor = Math.ceil(highWater * (1 - COLLAPSE_DROP_FRACTION));
    const collapsed = highWater > 0 && (current === 0 || current < floor);
    if (!collapsed) {
      return { table, current, highWater, outcome: 'steady' };
    }

    // KILL-SWITCH HONESTY (DerivedIndexJob's law): on a cron-free runtime
    // the nightly arm never runs, so the boot sighting may be the ONLY one —
    // the alert says so instead of implying a recheck that will not come.
    const willRecheck = isSchedulerRuntime();
    this.opsAlerts.emit({
      severity: 'critical',
      kind: 'source_table_row_collapse',
      dedupeKey: `source-table-collapse:${table}`,
      title: `Source table ${table} collapsed: ${current} rows vs high water ${highWater}`,
      body: [
        `${table} holds ${current} row(s) against a persisted high water of ${highWater} (detected at ${when}). ` +
          `That is a >${COLLAPSE_DROP_FRACTION * 100}% single-step drop on a SOURCE table — data that has no upstream to rebuild from. ` +
          'The 2026-08-16 wipe emptied source tables with zero signal; this alarm exists so that can never be silent again.',
        'If this was a deliberate, human-decided shrink, accept the new baseline by updating source_table_high_water for this table. ' +
          'Otherwise: stop writes, find the deleter, and restore from backup — nothing in this codebase can regenerate these rows.',
        willRecheck
          ? 'The nightly census will keep re-checking (deduped: this alert fires once until acknowledged).'
          : 'THIS RUNTIME HAS CRONS DISABLED (CRONS_ENABLED / PROCESS_ROLE) — the nightly census will NOT run here; this boot sighting may be the only signal.',
      ].join('\n\n'),
    });
    this.logger.error('SOURCE TABLE ROW COLLAPSE', {
      table,
      current,
      highWater,
      when,
    });
    return { table, current, highWater, outcome: 'collapsed' };
  }
}
