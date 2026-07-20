/**
 * THE collection pacer (§10/§14.3, at priors) — replaces the market-keyed
 * CollectionSchedulerService.
 *
 * Pull model: each tick selects due (source, lane) rows ordered by
 * NORMALIZED LATENESS = (now − dueAt) ÷ latenessTolerance — the owner's
 * "days late is fine, months is not" as the scheduler. No cycle budget, no
 * per-kind cost table (KIND_COST is dead — §16: no chosen numbers): capacity
 * comes from the governor. Every dispatch is an enumerated draw on the
 * reddit pool (reserve → act → reconcile); a pool denial is a typed
 * "not now" — the lane simply STAYS DUE and is retried next tick, it never
 * becomes an error, never brands a cooldown (§12.3).
 *
 * Dispatch-level draw semantics (priors edition): the pacer reserves and
 * immediately reconciles the adapter's declared ESTIMATE (admission consumes
 * the estimate); workers mirror the ACTUAL request count on completion —
 * the declared-vs-actual pair is the §14.2 drift instrument. Per-request
 * chokepoint draws arrive with the §12.5 client rewrite.
 */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { GovernanceService } from '../../external-integrations/governance/governance.service';
import {
  CollectorSourceRegistryService,
  CollectorLane,
  normalizedLateness,
} from './collector-source-registry.service';
import {
  REDDIT_POOL_NAME,
  redditLaneDeclaration,
} from './reddit-collection-adapter';
import { CollectionJobSchedulerService } from './chronological/collection-job-scheduler.service';
import { KeywordSliceSelectionService } from './keyword-slice-selection.service';
import { KeywordSearchOrchestratorService } from './keyword-search-orchestrator.service';
import { buildKeywordSortPlan } from './keyword-sort-plan';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CollectorPacerService implements OnModuleInit {
  private logger!: LoggerService;
  private enabled = false;
  private tickInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly registry: CollectorSourceRegistryService,
    private readonly governance: GovernanceService,
    private readonly chronologicalScheduler: CollectionJobSchedulerService,
    private readonly sliceSelection: KeywordSliceSelectionService,
    private readonly keywordOrchestrator: KeywordSearchOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('CollectorPacer');
    this.enabled =
      String(process.env.COLLECTION_SCHEDULER_ENABLED ?? '').toLowerCase() ===
      'true';
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runPacerTick(): Promise<void> {
    if (!this.enabled || this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      await this.tick();
    } catch (error) {
      this.logger.error('Pacer tick failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.tickInFlight = false;
    }
  }

  /** Exposed for probes/scripts; the cron calls this. */
  async tick(
    now: Date = new Date(),
  ): Promise<{ dispatched: number; denied: number }> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const dueLanes = await this.registry.listDueLanes(now);
    if (!dueLanes.length) return { dispatched: 0, denied: 0 };

    let dispatched = 0;
    let denied = 0;
    for (const lane of dueLanes) {
      if (lane.platform !== 'reddit') {
        // poll_surface is push-complete (zero pull lanes, §10) — an unknown
        // platform lane must never silently route or advance.
        this.logger.error('Lane for unknown collection platform', {
          correlationId,
          platform: lane.platform,
          handle: lane.handle,
          lane: lane.lane,
        });
        continue;
      }
      const declaration = redditLaneDeclaration(lane.lane);
      if (!declaration) {
        this.logger.error('Unknown reddit lane; leaving due', {
          correlationId,
          handle: lane.handle,
          lane: lane.lane,
        });
        continue;
      }
      try {
        const outcome = await this.dispatchLane(lane, now);
        if (outcome === 'denied') {
          denied += 1;
          // Typed 'not now': the lane stays due; normalized lateness rises
          // and it wins admission next tick. Minute windows refill fast —
          // later lanes may still fit, so keep scanning.
          continue;
        }
        dispatched += 1;
        await this.registry.advanceLane(lane.sourceId, lane.lane, now);
      } catch (error) {
        // Loud, and the lane stays due so the next tick retries.
        this.logger.error('Lane dispatch failed; lane remains due', {
          correlationId,
          handle: lane.handle,
          lane: lane.lane,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      }
    }
    this.logger.info('Pacer tick complete', {
      correlationId,
      due: dueLanes.length,
      dispatched,
      denied,
      worstNormalizedLateness: dueLanes.length
        ? normalizedLateness(dueLanes[0], now)
        : 0,
    });
    return { dispatched, denied };
  }

  private async dispatchLane(
    lane: CollectorLane,
    now: Date,
  ): Promise<'dispatched' | 'denied' | 'empty'> {
    // Tick key = the row's due time: duplicate dispatches of the SAME tick
    // (crash between enqueue and row-advance, second instance) collapse at
    // Bull's jobId dedupe instead of double-collecting.
    const tickKey = String(lane.dueAt.getTime());

    if (lane.lane === 'chronological') {
      const declared = redditLaneDeclaration('chronological')!.estimateRequests(
        {},
      );
      if (!this.drawEstimate(declared, 'collector.chronological')) {
        return 'denied';
      }
      const lastProcessedAt =
        typeof lane.state.lastProcessedAt === 'string'
          ? Date.parse(lane.state.lastProcessedAt)
          : NaN;
      await this.chronologicalScheduler.scheduleChronologicalCollection(
        lane.handle,
        {
          dedupeKey: tickKey,
          sourceId: lane.sourceId,
          declaredRequests: declared,
          lastProcessedTimestamp: Number.isFinite(lastProcessedAt)
            ? Math.floor(lastProcessedAt / 1000)
            : undefined,
        },
      );
      return 'dispatched';
    }

    // keyword lane
    if (!lane.engineId) {
      this.logger.error(
        'Keyword lane on an engineless source (operator wiring gap)',
        { handle: lane.handle, sourceId: lane.sourceId },
      );
      return 'empty';
    }
    const [engine, territoryPlaceIds, safeIntervalDays] = await Promise.all([
      this.registry.getEngine(lane.engineId),
      this.registry.territoryPlaceIds(lane.engineId),
      this.resolveSafeIntervalDays(lane.handle),
    ]);
    const selection = await this.sliceSelection.selectTermsForSource({
      sourceId: lane.sourceId,
      handle: lane.handle,
      engineId: engine.engineId,
      engineName: engine.name,
      territoryPlaceIds,
      safeIntervalDays,
    });
    if (!selection.terms.length) {
      // Legit outcome (nothing due for this source); cadence still advances —
      // this tick had nothing to collect.
      this.logger.info('Keyword dispatch skipped: no terms due', {
        handle: lane.handle,
      });
      return 'empty';
    }
    const declared = redditLaneDeclaration('keyword')!.estimateRequests({
      termCount: selection.terms.length,
    });
    if (!this.drawEstimate(declared, 'collector.keyword')) {
      return 'denied';
    }
    const lastTopRelevanceRunAt =
      typeof lane.state.lastTopRelevanceRunAt === 'string'
        ? new Date(lane.state.lastTopRelevanceRunAt)
        : undefined;
    await this.keywordOrchestrator.enqueueKeywordSearchJob({
      cycleId: CorrelationUtils.generateCorrelationId(),
      jobId: `scheduled-${lane.handle}-${tickKey}`,
      subreddit: lane.handle,
      sourceId: lane.sourceId,
      engineId: engine.engineId,
      collectableMarketKey: engine.name,
      safeIntervalDays,
      declaredRequests: declared,
      sortPlan: buildKeywordSortPlan({
        safeIntervalDays,
        lastTopRelevanceRunAt:
          lastTopRelevanceRunAt &&
          !Number.isNaN(lastTopRelevanceRunAt.getTime())
            ? lastTopRelevanceRunAt
            : undefined,
        runAt: now,
      }),
      terms: selection.terms,
      source: 'scheduled',
    });
    return 'dispatched';
  }

  /** Reserve→reconcile the declared estimate on the reddit pool. Returns
   *  false on denial (typed not-now). */
  private drawEstimate(declared: number, workClass: string): boolean {
    const reservation = this.governance.pools.reserve(
      REDDIT_POOL_NAME,
      declared,
      workClass,
    );
    if (!reservation.admitted) {
      this.logger.warn('Reddit pool denied dispatch (lane stays due)', {
        workClass,
        declared,
        reason: reservation.reason,
        retryAfterMs: reservation.retryAfterMs,
      });
      return false;
    }
    this.governance.pools.reconcile(reservation.reservationId, declared);
    return true;
  }

  /** Saturation-adaptive cadence is trigger-deferred (§22); the measured
   *  safe interval survives as collector-owned source metadata. */
  private async resolveSafeIntervalDays(handle: string): Promise<number> {
    const community = await this.prisma.collectionCommunity.findFirst({
      where: { communityName: { equals: handle, mode: 'insensitive' } },
      select: { safeIntervalDays: true },
    });
    const raw = community?.safeIntervalDays;
    // §16: the 7d fallback is K3-as-prior — the chronological-cadence
    // controller's start value for a source with no measured safe interval
    // yet (one 7d cycle, plan §16 K1's cycle length); the measured
    // safeIntervalDays replaces it per source as saturation data accrues.
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 7;
  }
}
