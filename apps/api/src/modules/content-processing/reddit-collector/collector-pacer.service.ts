/**
 * THE collection pacer (§10/§14.3, at priors) — replaces the market-keyed
 * scheduler that predated it (since exterminated).
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
 * Draw semantics after the §12.5 client rewrite — THE DOCUMENTED READING of
 * §12.5 × §14 (option (a), declared-estimate reservation): §14.3 keeps the
 * pacer as the sole dispatcher "select[ing] the highest-priority job whose
 * declared pools all reserve", while §14.2 puts actuals at the chokepoint
 * ("chokepoints record actuals") and §14.8 allows only ONE window. So:
 *   - the pacer RESERVES the adapter's declared estimate per dispatch — the
 *     dispatch-grain admission/backpressure peek (§14.3) — and RELEASES the
 *     hold once the dispatch is enqueued (no window consumption here: work
 *     runs async, often in a later minute window, so consuming now would be
 *     fiction);
 *   - every vendor HTTP call is a per-REQUEST draw at the client's single
 *     makeRequest chokepoint (reserve 1 → act → reconcile 1) — the ONE
 *     window and ledger, truthful to the minute the request happens;
 *   - workers close the dispatch-grain declared-vs-actual pair via
 *     recordActualPair — the §14.2 drift instrument on the estimate.
 * A pool denial (either grain) is a typed "not now" — the work item simply
 * STAYS DUE, never an error, never a cooldown (§12.3).
 */
import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../../shared/completion-work-timer';
import { GovernanceService } from '../../external-integrations/governance/governance.service';
import {
  CollectorSourceRegistryService,
  CollectorLane,
  normalizedLateness,
  PENDING_WINDOW_GRACE_HOURS,
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
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';

/** Vendor fact (reddit-collection-adapter): /new serves ≤1000 posts. */
const REDDIT_NEW_WINDOW_POSTS = 1000;

/**
 * Loss-horizon safety factor: revisit by the time HALF the window could
 * have scrolled — derived, not tuned: one fully missed tick (crash,
 * governance denial streak) must never overflow the window.
 */
const LOSS_HORIZON_SAFETY = 0.5;

/** Pathological-count guard: the floor never spins a lane under 2h. */
const MIN_CHRONOLOGICAL_INTERVAL_DAYS = 2 / 24;

/**
 * The arrival measurement's trailing horizon — AND therefore the derived
 * interval's upper clamp. The COUPLING (clamp = lookback) is a genuine
 * stability derivation: an interval longer than the lookback depresses the
 * measured rate, stretching the interval further — a quiet-lock feedback
 * loop; clamping at the lookback is the fixed-point bound. The VALUE 14 is
 * K1 — RATIFIED 2026-07-24 (§18-8b(c), owner-delegated): "two weeks of
 * behavior defines a source's rhythm"; the clamp derives cleanly from it.
 * What changes it: owner re-ratifying the horizon, never cadence tuning.
 */
const ARRIVAL_LOOKBACK_DAYS = 14;

/** The lane's maximum legitimate visit gap = the derived interval's upper
 *  clamp. Exported for the cursor-loss fallback: a rescan window smaller
 *  than this can silently drop posts from a quiet source. */
export const MAX_CHRONOLOGICAL_INTERVAL_DAYS = ARRIVAL_LOOKBACK_DAYS;

/** Reconciler cadence — unchanged from the retired @Cron(EVERY_HOUR). */
const RECONCILER_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class CollectorPacerService implements OnModuleInit, OnModuleDestroy {
  private logger!: LoggerService;
  private enabled = false;
  private tickInFlight = false;

  /**
   * THE SPLIT (2026-08-31). This service used to carry TWO @Crons of
   * opposite kinds under one gate:
   *
   *   - runPacerTick STARTS work — Reddit draws and the LLM extraction
   *     behind them. Discretionary spend. It STAYS an @Cron, inert whenever
   *     CRONS_ENABLED is off. That is exactly what the switch is for.
   *   - runExpectedBatchesReconciler starts nothing. It is a pure-DB read
   *     that compares each lane's registered expectedBatches against the
   *     extraction runs that actually PROVE them, and folds the verdict onto
   *     the lane row where collectorHeartbeats reads it. Its own docblock
   *     says the divergence IS the collector's RED heartbeat.
   *
   * So under one gate, turning crons off turned off THE DETECTOR — the thing
   * that would have said the collector was not producing. The reconciler now
   * owns its own interval on the worker runtime, with its own explicit
   * off-switch (COLLECTION_RECONCILER_ENABLED=false), unref()'d and cleared
   * on shutdown. Same shape as gemini-batch.service.ts's poller.
   */
  private reconcilerTimer: CompletionWorkTimerHandle | null = null;
  private reconcilerInFlight = false;

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
    this.enabled = isEnvFlagEnabled(process.env.COLLECTION_SCHEDULER_ENABLED);
    this.reconcilerTimer = startCompletionWorkTimer({
      intervalMs: RECONCILER_INTERVAL_MS,
      offSwitchEnv: 'COLLECTION_RECONCILER_ENABLED',
      run: () => this.runExpectedBatchesReconciler(),
      onFailure: (error) =>
        this.logger.error('Expected-batches reconciler tick failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  onModuleDestroy(): void {
    this.reconcilerTimer?.stop();
    this.reconcilerTimer = null;
  }

  /** STAYS AN @Cron ON PURPOSE: this tick STARTS work — Reddit draws and the
   *  LLM extraction behind them. CRONS_ENABLED must keep it inert. */
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
    // Dispatch-grain reservations are HELD for the whole tick so admission
    // is honest ACROSS lanes within it (releasing per-lane would let every
    // lane see full headroom), then released together — the per-request
    // chokepoint draws own the real window accounting (reading (a) above).
    this.tickReservationIds = [];
    try {
      await this.dispatchDueLanes(dueLanes, now, correlationId, (kind) => {
        if (kind === 'dispatched') dispatched += 1;
        else denied += 1;
      });
    } finally {
      for (const reservationId of this.tickReservationIds) {
        this.governance.pools.release(reservationId);
      }
      this.tickReservationIds = [];
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

  private tickReservationIds: string[] = [];

  private async dispatchDueLanes(
    dueLanes: CollectorLane[],
    now: Date,
    correlationId: string,
    count: (kind: 'dispatched' | 'denied') => void,
  ): Promise<void> {
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
          count('denied');
          // Typed 'not now': the lane stays due; normalized lateness rises
          // and it wins admission next tick. Minute windows refill fast —
          // later lanes may still fit, so keep scanning.
          continue;
        }
        if (outcome === 'unwired') {
          // F457: an engineless keyword lane can collect NOTHING — a permanent
          // operator wiring gap, NOT a dispatch. It used to be counted as
          // dispatched and the lane ADVANCED, turning the gap permanently
          // green. It must stay RED: never count it dispatched, and do NOT
          // advance — the lane stays due and re-logs the error every tick
          // until someone wires the engine.
          count('denied');
          continue;
        }
        count('dispatched');
        await this.registry.advanceLane(
          lane.sourceId,
          lane.lane,
          now,
          lane.lane === 'chronological'
            ? await this.chronologicalDerivedIntervalDays(lane.handle, now)
            : undefined,
        );
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
  }

  private async dispatchLane(
    lane: CollectorLane,
    now: Date,
  ): Promise<'dispatched' | 'denied' | 'empty' | 'unwired'> {
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
      // F457: RED, not a dispatch — the caller must leave this lane due.
      return 'unwired';
    }
    const [engine, territoryPlaceIds] = await Promise.all([
      this.registry.getEngine(lane.engineId),
      this.registry.territoryPlaceIds(lane.engineId),
    ]);
    const selection = await this.sliceSelection.selectTermsForSource({
      sourceId: lane.sourceId,
      handle: lane.handle,
      engineId: engine.engineId,
      engineName: engine.name,
      territoryPlaceIds,
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
      engineName: engine.name,
      declaredRequests: declared,
      sortPlan: buildKeywordSortPlan({
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

  /** Dispatch-grain admission peek (§14.3, reading (a) above): reserve the
   *  declared estimate and HOLD it until the tick ends (released in tick()'s
   *  finally) — the per-request chokepoint draws do the real window
   *  accounting. Returns false on denial (typed not-now). */
  private drawEstimate(declared: number, workClass: string): boolean {
    const reservation = this.governance.pools.reserve(
      REDDIT_POOL_NAME,
      declared,
      workClass,
    );
    if (!reservation.admitted) {
      // Reservation denials showing up here are the §25 trigger — see
      // plans/geo-demand-foundation-rebuild.md §25 "ID-first chronological
      // collection": split the chronological tick into a tiny ID sweep
      // (secures the delta in ~1-2 req/day) + elastic comment fetching by id.
      this.logger.warn('Reddit pool denied dispatch (lane stays due)', {
        workClass,
        declared,
        reason: reservation.reason,
        retryAfterMs: reservation.retryAfterMs,
      });
      return false;
    }
    this.tickReservationIds.push(reservation.reservationId);
    return true;
  }

  /**
   * §10 hourly expectedBatches RECONCILER — "parents record expected
   * fan-out; extraction runs prove it": for each lane's most recent
   * chronological parent past the grace window, compare the registered
   * expectedBatches against PROVEN batches (extraction runs actually created
   * under the parent's collection run + covered-skip batches, which create
   * no run by construction). The verdict is folded onto the lane row
   * (state.reconciler), where collectorHeartbeats reads it — divergence IS
   * the RED heartbeat signal, not a parallel alarm. A lane that fetched but
   * created no runs goes RED here within one pass (shortfall = expected),
   * and independently via the stale pending-window read. Also the §15
   * migration drain instrument.
   */
  async runExpectedBatchesReconciler(): Promise<void> {
    // DELIBERATELY NOT GATED ON `this.enabled` (2026-08-31). The old gate was
    // COLLECTION_SCHEDULER_ENABLED — the switch that stops the pacer STARTING
    // collection. Parents dispatched before the switch flipped (or by a
    // script/backfill) still owe proof, and the whole point of this pass is
    // to say when that proof never arrived. Gating the detector on the
    // dispatcher's switch is the same mistake one level down.
    if (this.reconcilerInFlight) return;
    this.reconcilerInFlight = true;
    try {
      await this.reconcileExpectedBatches();
    } catch (error) {
      this.logger.error('expectedBatches reconciler pass failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.reconcilerInFlight = false;
    }
  }

  /** Exposed for probes/specs; the hourly reconciler interval calls this. */
  async reconcileExpectedBatches(now: Date = new Date()): Promise<void> {
    // §16: K3-shaped operational bounds. Grace = PENDING_WINDOW_GRACE_HOURS
    // (shared with the heartbeat's stale-window read — one number, one law);
    // 48h lookback covers the slowest honest batch path (Gemini batch SLA
    // 24h + reconciler cadence) without rescanning history forever.
    const LOOKBACK_HOURS = 48;
    const rows = await this.prisma.$queryRaw<
      Array<{
        scope_key: string;
        started_at: Date;
        source_id: string;
        expected_batches: number;
        skipped_batches: number;
        proven_runs: bigint | number;
      }>
    >`
      SELECT DISTINCT ON (cr.metadata->>'sourceId')
        cr.scope_key,
        cr.started_at,
        cr.metadata->>'sourceId' AS source_id,
        COALESCE((cr.metadata->>'expectedBatches')::int, 0)
          AS expected_batches,
        COALESCE((cr.metadata->>'skippedBatches')::int, 0)
          AS skipped_batches,
        (SELECT COUNT(*) FROM collection_extraction_runs er
          WHERE er.collection_run_id = cr.collection_run_id) AS proven_runs
      FROM collection_runs cr
      WHERE cr.pipeline = 'chronological'
        AND cr.metadata ? 'expectedBatches'
        AND cr.metadata ? 'sourceId'
        AND cr.started_at >= ${now} - (${LOOKBACK_HOURS} * interval '1 hour')
        AND cr.started_at <= ${now} - (${PENDING_WINDOW_GRACE_HOURS} * interval '1 hour')
      ORDER BY cr.metadata->>'sourceId', cr.started_at DESC
    `;
    for (const row of rows) {
      const provenRuns = Number(row.proven_runs);
      const shortfall = Math.max(
        0,
        row.expected_batches - provenRuns - row.skipped_batches,
      );
      await this.registry.mergeLaneState(row.source_id, 'chronological', {
        reconciler: {
          checkedAt: now.toISOString(),
          parentScopeKey: row.scope_key,
          expectedBatches: row.expected_batches,
          provenRuns,
          skippedBatches: row.skipped_batches,
          shortfall,
        },
      });
      if (shortfall > 0) {
        // The RED signal (§10/C8) — read via collectorHeartbeats.
        this.logger.error(
          'expectedBatches shortfall: fetched window under-proven (RED)',
          {
            scopeKey: row.scope_key,
            sourceId: row.source_id,
            expectedBatches: row.expected_batches,
            provenRuns,
            skippedBatches: row.skipped_batches,
            shortfall,
          },
        );
      }
    }
  }

  /**
   * THE DERIVED CHRONOLOGICAL INTERVAL (no-fake-estimates law, owner-ratified
   * 2026-07-24) — the lane's whole rhythm derives from facts; the adapter's
   * 1d declaration is BOOTSTRAP-ONLY (a source with no measured arrival yet):
   *
   *   interval = clamp( SAFETY × window ÷ measured posts/day,
   *                     2h,  ARRIVAL_LOOKBACK_DAYS )
   *
   * Bounds (retro-audited 2026-07-24 — honest status, not an overclaim): the loss-horizon term is reddit's
   * ≤1000-post /new window (vendor fact) with SAFETY 0.5 = one fully missed
   * tick can never overflow; the 2h floor guards a pathological count; and
   * the upper clamp is the arrival MEASUREMENT'S OWN horizon — stretch
   * visits past the lookback and the measurement starves itself blind (a
   * quiet source must still be observed once per measurement window to
   * notice it waking up). Arrival is measured from the durable
   * source_documents substrate (post-archive the window is completely
   * covered, so the count is the true rate). Undefined = no data yet
   * (fresh onboard, pre-archive) → the bootstrap cadence stands until the
   * first visit creates the measurement.
   */
  private async chronologicalDerivedIntervalDays(
    handle: string,
    now: Date,
  ): Promise<number | undefined> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT count(*) AS n FROM collection_source_documents
      WHERE community = ${handle}
        AND source_type = 'post'
        AND source_created_at >= ${now} - (${ARRIVAL_LOOKBACK_DAYS} * interval '1 day')
    `;
    const postsPerDay = Number(rows[0]?.n ?? 0) / ARRIVAL_LOOKBACK_DAYS;
    if (!(postsPerDay > 0)) {
      return undefined;
    }
    const lossHorizonDays =
      (LOSS_HORIZON_SAFETY * REDDIT_NEW_WINDOW_POSTS) / postsPerDay;
    return Math.min(
      Math.max(lossHorizonDays, MIN_CHRONOLOGICAL_INTERVAL_DAYS),
      ARRIVAL_LOOKBACK_DAYS,
    );
  }
}
