import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { CollectionJobSchedulerService } from './chronological/collection-job-scheduler.service';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { KeywordSearchOrchestratorService } from './keyword-search-orchestrator.service';

type WorkKind = 'chronological' | 'keyword' | 'on_demand_hot_spike';

/** Planning weight per kind — a rough Reddit-request cost so one cycle's
 *  dispatches stay inside a predictable budget (planned, not queued-and-
 *  contending at the rate coordinator). */
const KIND_COST: Record<WorkKind, number> = {
  chronological: 2,
  keyword: 4,
  on_demand_hot_spike: 2,
};

/**
 * THE collection scheduler (plans/collection-scheduler-consolidation.md).
 * One planning loop owns WHEN we talk to Reddit: durable per-(community,
 * workKind) cadence rows in collection_schedules; chronological, keyword,
 * and hot-spike are job VARIANTS dispatched through their existing workers.
 * Term selection and hot-spike scoring remain where they are — consulted as
 * PROVIDERS when a row comes due. Restart resumes from the table; the old
 * in-memory keyword schedule map is gone.
 */
@Injectable()
export class CollectionSchedulerService implements OnModuleInit {
  private logger!: LoggerService;
  private enabled = false;
  private cycleBudget = 12;
  private cycleInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly chronologicalScheduler: CollectionJobSchedulerService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
    private readonly keywordOrchestrator: KeywordSearchOrchestratorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('CollectionScheduler');
    this.enabled =
      String(process.env.COLLECTION_SCHEDULER_ENABLED ?? '').toLowerCase() ===
      'true';
    const budget = Number(process.env.COLLECTION_SCHEDULER_CYCLE_BUDGET);
    if (Number.isFinite(budget) && budget > 0) {
      this.cycleBudget = budget;
    }
    if (this.enabled) {
      await this.ensureGlobalHotSpikeRow();
    }
  }

  /** Hot-spike planning is market-wide, so its cadence lives on ONE global
   *  row. Self-provisioned here — not in market onboarding — because it is
   *  not per-community state; without this the workKind would exist only in
   *  the type union and never run (type-list disease). */
  private async ensureGlobalHotSpikeRow(): Promise<void> {
    await this.prisma.collectionSchedule.upsert({
      where: {
        community_workKind: {
          community: '__global__',
          workKind: 'on_demand_hot_spike',
        },
      },
      create: {
        community: '__global__',
        workKind: 'on_demand_hot_spike',
        intervalDays: 1 / 24,
        enabled: true,
        nextDueAt: new Date(),
      },
      update: {},
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runPlanningCycle(): Promise<void> {
    if (!this.enabled || this.cycleInFlight) return;
    this.cycleInFlight = true;
    try {
      await this.planAndDispatch();
    } catch (error) {
      this.logger.error('Planning cycle failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.cycleInFlight = false;
    }
  }

  /** Exposed for probes/scripts; the cron calls this. */
  async planAndDispatch(): Promise<{ dispatched: number; deferred: number }> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const due = await this.prisma.collectionSchedule.findMany({
      where: { enabled: true, nextDueAt: { lte: new Date() } },
      orderBy: { nextDueAt: 'asc' },
      take: 50,
    });
    if (!due.length) return { dispatched: 0, deferred: 0 };

    let budget = this.cycleBudget;
    let dispatched = 0;
    let deferred = 0;
    for (const row of due) {
      const kind = row.workKind as WorkKind;
      const cost = KIND_COST[kind];
      if (cost === undefined) {
        // A row kind the planner doesn't know must never silently route or
        // advance — leave it due and scream every cycle until it's handled.
        this.logger.error('Unknown workKind in collection_schedules', {
          correlationId,
          community: row.community,
          workKind: row.workKind,
        });
        continue;
      }
      if (cost > budget) {
        deferred += 1;
        continue; // stays due; next cycle picks it up — planned, not contending
      }
      try {
        // Tick key = the row's due time: duplicate dispatches of the SAME
        // tick (crash between enqueue and row-advance, second instance)
        // collapse at Bull's jobId dedupe instead of double-collecting.
        const tickKey = String(row.nextDueAt.getTime());
        await this.dispatch(kind, row.community, row, tickKey);
        budget -= cost;
        dispatched += 1;
        await this.prisma.collectionSchedule.update({
          where: {
            community_workKind: {
              community: row.community,
              workKind: row.workKind,
            },
          },
          data: {
            lastRanAt: new Date(),
            nextDueAt: new Date(
              Date.now() + row.intervalDays * 24 * 60 * 60 * 1000,
            ),
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        // Loud, and the row stays due so the next cycle retries.
        this.logger.error('Dispatch failed; row remains due', {
          correlationId,
          community: row.community,
          workKind: row.workKind,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      }
    }
    this.logger.info('Collection planning cycle complete', {
      correlationId,
      due: due.length,
      dispatched,
      deferred,
      budgetLeft: budget,
    });
    return { dispatched, deferred };
  }

  private async dispatch(
    kind: WorkKind,
    community: string,
    row: { metadata: unknown; intervalDays: number },
    tickKey: string,
  ): Promise<void> {
    if (kind === 'chronological') {
      await this.chronologicalScheduler.scheduleChronologicalCollection(
        community,
        { dedupeKey: tickKey },
      );
      return;
    }
    if (kind === 'keyword') {
      const metadata = (row.metadata ?? {}) as {
        lastTopRelevanceRunAt?: string;
      };
      const schedule = await this.keywordScheduler.buildScheduleForCommunity(
        community,
        metadata.lastTopRelevanceRunAt
          ? new Date(metadata.lastTopRelevanceRunAt)
          : null,
      );
      if (!schedule.terms.length) {
        // Legit outcome of slice selection (nothing due for this community);
        // cadence still advances — this tick had nothing to collect.
        this.logger.info('Keyword dispatch skipped: no terms due', {
          community,
        });
        return;
      }
      // lastTopRelevanceRunAt is stamped by the WORKER after a successful
      // heavy-sort run — the single writer. Stamping here at enqueue time
      // would record intent as outcome.
      await this.keywordOrchestrator.enqueueKeywordSearchJob({
        cycleId: CorrelationUtils.generateCorrelationId(),
        jobId: `scheduled-${community}-${tickKey}`,
        subreddit: community,
        collectableMarketKey: schedule.collectableMarketKey,
        safeIntervalDays: schedule.safeIntervalDays,
        sortPlan: schedule.sortPlan,
        terms: schedule.terms,
        source: 'scheduled',
      });
      return;
    }
    // on_demand_hot_spike (global row)
    await this.keywordOrchestrator.enqueueHotSpikeJobs();
  }
}
