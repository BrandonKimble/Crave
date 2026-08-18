import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedditService } from '../../../external-integrations/reddit/reddit.service';
import { RedditGovernanceDenialError } from '../../../external-integrations/reddit/reddit.exceptions';
import { GovernanceService } from '../../../external-integrations/governance/governance.service';
import { CollectorSourceRegistryService } from '../collector-source-registry.service';
import { CollectionEvidenceService } from '../collection-evidence.service';
import { REDDIT_POOL_NAME } from '../reddit-collection-adapter';
import { BatchJob } from '../batch-processing-queue.types';
import { RedditApiError } from '../../../external-integrations/reddit/reddit.exceptions';
import { filterAndTransformToLLM } from '../../../external-integrations/reddit/reddit-data-filter';
import { LLMPost } from '../../../external-integrations/llm/llm.types';
import { Prisma } from '@prisma/client';
import { resolveTestLimit } from '../test-limit';
import { MAX_CHRONOLOGICAL_INTERVAL_DAYS } from '../collector-pacer.service';

export interface ChronologicalCollectionJobData {
  subreddit: string; // Changed from subreddits array to single subreddit
  jobId: string;
  triggeredBy: 'scheduled' | 'manual' | 'gap_detection';
  /** §10 source identity (lane-row cursor + output heartbeat). */
  sourceId?: string;
  /** Pacer's reserved estimate for the §14.2 declared-vs-actual mirror. */
  declaredRequests?: number;
  options?: {
    lastProcessedTimestamp?: number;
    limit?: number;
  };
}

export interface ChronologicalCollectionJobResult {
  success: boolean;
  jobId: string;
  subreddit: string;
  postsProcessed: number;
  batchesProcessed: number;
  mentionsExtracted: number;
  processingTime: number;
  error?: string;
  /** §12.3 typed not-now: the governor denied mid-dispatch — the work item
   *  was re-armed as due; NOT a failure. */
  deferredByGovernance?: boolean;
  nextScheduledCollection?: Date;
  latestTimestamp?: number;
  componentProcessing?: {
    restaurantsProcessed?: number;
    connectionsCreated?: number;
    connectionsUpdated?: number;
    componentsExecuted?: string;
    successRate?: number;
    totalTime?: number;
  };
  qualityScores?: {
    connectionsUpdated?: number;
    restaurantsUpdated?: number;
    averageTimeMs?: number;
    errors?: number;
    totalTime?: number;
  };
}

type RedditPostDataCandidate = Record<string, unknown> & {
  id?: string;
  name?: string;
  created_utc?: number;
};

// Helper function to chunk arrays
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Chronological Collection Worker
 *
 * Implements PRD Section 5.1.2: Complete chronological collection pipeline
 * Processes scheduled chronological collection jobs via Bull queue.
 *
 * Key responsibilities:
 * - Process scheduled chronological collection jobs via Bull queue
 * - Execute Reddit API chronological collection
 * - Queue batches for async LLM processing
 * - Handle retry logic for failed collections
 * - Update database timestamps and schedule next collections
 * - Provide comprehensive error handling and logging
 */
@Processor('chronological-collection')
export class ChronologicalCollectionWorker implements OnModuleInit {
  private logger!: LoggerService;
  private readonly BATCH_SIZE = 25;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedditService) private readonly redditService: RedditService,
    private readonly sourceRegistry: CollectorSourceRegistryService,
    private readonly governance: GovernanceService,
    private readonly collectionEvidence: CollectionEvidenceService,
    @InjectQueue('chronological-batch-processing-queue')
    private readonly batchQueue: Queue<BatchJob>,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ChronologicalCollectionWorker',
    );
    // Scheduling now handled by database-driven Bull queue scheduler
  }

  /**
   * Process chronological collection job for a single subreddit
   * Implements batch processing with natural rate limiting via LLM processing
   */
  @Process('execute-chronological-collection')
  async processChronologicalCollection(
    job: Job<ChronologicalCollectionJobData>,
  ): Promise<ChronologicalCollectionJobResult> {
    const { subreddit, jobId, triggeredBy, options = {} } = job.data;
    const correlationId = CorrelationUtils.generateCorrelationId();
    const startTime = Date.now();

    this.logger.info('Processing chronological collection job', {
      correlationId,
      operation: 'process_chronological_job',
      jobId,
      subreddit,
      triggeredBy,
      options,
    });

    // Services injected via constructor - no ModuleRef resolution needed

    try {
      // Resolve the SOURCE (§10: collection work keys off source rows). The
      // pacer passes sourceId; manual/script dispatches resolve by handle.
      const sourceId =
        job.data.sourceId ??
        (await this.sourceRegistry.findRedditSourceByHandle(subreddit))
          ?.sourceId;

      // PHASE 1: Determine lastProcessed timestamp with safe fallback when
      // not provided. The LANE ROW is the cursor's home (§10: lane state
      // lives on the lane row) so delayed jobs/retries remain correct.
      let effectiveLastProcessed = options.lastProcessedTimestamp;
      if (typeof effectiveLastProcessed !== 'number' && sourceId) {
        const lane = await this.sourceRegistry.getLane(
          sourceId,
          'chronological',
        );
        const cursorRaw =
          typeof lane?.state.lastProcessedAt === 'string'
            ? Date.parse(lane.state.lastProcessedAt)
            : NaN;
        if (Number.isFinite(cursorRaw)) {
          effectiveLastProcessed = Math.floor(cursorRaw / 1000);
          await job.log(
            `Using lane cursor: ${new Date(cursorRaw).toISOString()}`,
          );
        }
      }
      if (typeof effectiveLastProcessed !== 'number') {
        // DERIVED 2026-08-03 (F470, corrected from the old 24h guess): on
        // cursor loss, rescan one full pacer scheduling period — the derived
        // interval's UPPER clamp (14d), not a day: a quiet source is
        // legitimately visited that rarely, and a 24h fallback would have
        // silently dropped up to 13 days of its posts. Overlap is harmless —
        // processedSource dedupe absorbs anything rescanned; the only cost is
        // re-fetch, never re-extraction.
        const defaultFallbackMs =
          Date.now() - MAX_CHRONOLOGICAL_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
        effectiveLastProcessed = Math.floor(defaultFallbackMs / 1000);
        await job.log(
          `No lane cursor; using ${MAX_CHRONOLOGICAL_INTERVAL_DAYS}d fallback: ${new Date(
            defaultFallbackMs,
          ).toISOString()}`,
        );
      }

      // CRITICAL: Capture collection start time BEFORE Reddit API call
      // This prevents missing posts that arrive during the 1+ hour processing time
      const collectionStartTime = Math.floor(Date.now() / 1000); // Unix timestamp

      await job.log(
        `Collecting posts from r/${subreddit} since ${new Date(
          effectiveLastProcessed * 1000,
        ).toISOString()}`,
      );
      await job.log(
        `Collection start time: ${new Date(
          collectionStartTime * 1000,
        ).toISOString()} (for next cycle)`,
      );

      // Default to Reddit's maximum (1000) to avoid missing posts between cycles.
      // Allow an explicit test override to reduce fetch volume in dev/test runs.
      const fetchLimit = this.resolveTestFetchLimit();
      const postsResult = await this.redditService.getChronologicalPosts(
        subreddit,
        effectiveLastProcessed,
        fetchLimit,
      );

      const allPosts: RedditPostDataCandidate[] = Array.isArray(
        postsResult.data,
      )
        ? postsResult.data
        : [];
      const jobLimit =
        typeof options.limit === 'number' && options.limit > 0
          ? Math.floor(options.limit)
          : null;
      // F455: prod-refusing lever — a stray TEST_CHRONO_MAX_POSTS in prod
      // used to silently truncate the collection into PERMANENT loss.
      const envLimit = resolveTestLimit('TEST_CHRONO_MAX_POSTS');
      const manualLimitProvided =
        job.data.triggeredBy === 'manual' && jobLimit !== null;
      const effectiveLimit = manualLimitProvided
        ? jobLimit
        : envLimit !== null && envLimit >= 0
          ? envLimit
          : jobLimit;
      const posts =
        typeof effectiveLimit === 'number' && effectiveLimit > 0
          ? allPosts.slice(0, effectiveLimit)
          : allPosts;
      await job.log(
        `Collected ${allPosts.length} posts from r/${subreddit}, limited to ${posts.length} for testing`,
      );

      // Build IDs list (Reddit API post.data.id is the base id without t3_)
      const ids: string[] = posts
        .map((post) => this.extractPostId(post))
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      // Process all collected posts - async queue handles batching and rate limiting

      // §10 saturation MISS DETECTOR (observation — the deferral law forbids
      // deferring observations): overlap semantics, never fullname anchoring.
      // A fetch whose reach ended WITHOUT one strictly-older confirmation
      // means posts between the cursor and the listing's reach are beyond
      // recall — a C4 COVERAGE GAP fact, recorded on the lane and RED on the
      // heartbeat. The money-gated recovery sweep (targeted window sweep via
      // the §21.7 proposed-sweep verb) and the AIMD cadence controller are
      // TRIGGER-DEFERRED (§22: "saturation AIMD live trigger (volume near
      // clamps)"; grant flow = manual until a fleet) — until then the
      // operator clears the gap with a manual sweep.
      const oldestFetchedUtc =
        sourceId && allPosts.length > 0
          ? allPosts.reduce<number | null>((oldest, post) => {
              const created = this.extractCreatedUtc(post);
              return created !== null && (oldest === null || created < oldest)
                ? created
                : oldest;
            }, null)
          : null;

      if (
        sourceId &&
        allPosts.length > 0 &&
        postsResult.metadata.overlapConfirmed === false
      ) {
        const oldestFetched = oldestFetchedUtc;
        this.logger.error(
          'Chronological reach miss: fetch never overlapped the cursor (§10 C4 coverage gap)',
          {
            correlationId,
            subreddit,
            windowStart: new Date(effectiveLastProcessed * 1000).toISOString(),
            oldestFetched:
              oldestFetched !== null
                ? new Date(oldestFetched * 1000).toISOString()
                : null,
          },
        );
        await this.sourceRegistry.mergeLaneState(sourceId, 'chronological', {
          coverageGap: {
            detectedAt: new Date().toISOString(),
            windowStart: new Date(effectiveLastProcessed * 1000).toISOString(),
            oldestFetched:
              oldestFetched !== null
                ? new Date(oldestFetched * 1000).toISOString()
                : null,
          },
        });
      }

      // THE RELEASE (F456). The gap above was a one-way latch — one miss
      // pinned the lane RED forever because nothing could un-record it, an
      // always-RED metric being just as useless as an always-GREEN one. The
      // release is the SAME overlap fact read the other way: a fetch that
      // CONFIRMED overlap (opened no new hole) and reached back to at-or-
      // before the recorded gap's windowStart has re-covered that hole with
      // real documents. The predicate lives in the registry so the fact —
      // not this worker's opinion — decides.
      if (
        sourceId &&
        oldestFetchedUtc !== null &&
        postsResult.metadata.overlapConfirmed === true
      ) {
        const reachedBackTo = new Date(oldestFetchedUtc * 1000);
        const cleared = await this.sourceRegistry.clearCoverageGapIfRecovered(
          sourceId,
          'chronological',
          reachedBackTo,
        );
        if (cleared) {
          this.logger.info(
            'Chronological coverage gap cleared: a later fetch re-covered the gap window (§10 C4)',
            {
              correlationId,
              subreddit,
              reachedBackTo: reachedBackTo.toISOString(),
            },
          );
        }
      }

      // §10 SELF-HEALING ORPHAN-PARENT SWEEP: comments can arrive on posts
      // OLDER than any collection window, so the parent post doc was never
      // collected — and since the relevance gate judges POSTS (comments
      // inherit the parent's verdict), such orphan comments never enter
      // extraction. Each tick, fetch a bounded set of missing parents and
      // ride them through the NORMAL batch machinery (persist-first → gate →
      // extraction) as one extra batch. Community-scoped and unscoped in
      // time, so pre-existing orphans (e.g. the 2026-07-24 foodnyc backlog)
      // heal with zero manual steps. Best-effort per tick: a failure leaves
      // the orphans for the next tick, never fails the collection.
      const healedParents = await this.sweepOrphanCommentParents(
        subreddit,
        correlationId,
      );

      if (posts.length === 0 && healedParents.length === 0) {
        // Legit zero: the window was OBSERVED empty at fetch — there is no
        // extraction evidence to await, so the cursor advances here (§10's
        // advance-at-extraction degenerates to advance-at-observation for an
        // empty window). Output heartbeat still writes — legit-zero vs
        // broken-zero is judged against the lane's own baseline.
        await this.recordSourceFacts({
          sourceId,
          collectionStartTime,
          advanceCursor: true,
          outputDocs: 0,
          declaredRequests: job.data.declaredRequests,
          listingRequests: postsResult.performance?.apiCallsUsed ?? 0,
          healedParentFetches: healedParents.length,
        });
        return {
          success: true,
          jobId,
          subreddit,
          postsProcessed: 0,
          batchesProcessed: 0,
          mentionsExtracted: 0,
          processingTime: Date.now() - startTime,
          nextScheduledCollection: undefined,
        };
      }

      // PHASE 2: Queue batches for async processing. The orphan-parent
      // healing batch (when present) counts in the fan-out so the §10
      // expectedBatches reconciler and the staged-window commit see it.
      const batches = chunk(ids, this.BATCH_SIZE);
      const totalBatchCount = batches.length + (healedParents.length ? 1 : 0);
      let latestTimestamp = 0;

      // §10 advance-at-extraction, BEFORE any batch is enqueued:
      // (1) the parent records its expected fan-out on the collection-run
      //     row (the hourly expectedBatches reconciler's expectation side);
      // (2) the window is STAGED on the lane (visible-at-fetch
      //     coveredThrough) — the cursor itself moves only when a batch
      //     durably creates this window's extraction run (or proves it
      //     already covered). A crash between here and run-creation leaves
      //     the cursor untouched → re-fetch, never a lost window.
      if (sourceId) {
        await this.collectionEvidence.registerExpectedFanOut({
          scopeKey: `collection:${jobId}`,
          pipeline: 'chronological',
          platform: 'reddit',
          community: subreddit,
          sourceId,
          lane: 'chronological',
          expectedBatches: totalBatchCount,
          coveredThrough: new Date(collectionStartTime * 1000),
        });
        await this.sourceRegistry.stagePendingWindow(
          sourceId,
          'chronological',
          {
            parentJobId: jobId,
            coveredThrough: new Date(collectionStartTime * 1000).toISOString(),
            expectedBatches: totalBatchCount,
            stagedAt: new Date().toISOString(),
          },
        );
      }

      // Queue all batches for async processing
      const batchJobs: Promise<Job<BatchJob>>[] = [];

      for (const [index, batchIds] of batches.entries()) {
        const batchNum = index + 1;
        const batchId = `${jobId}-batch-${batchNum}`;

        await job.log(
          `📋 Queuing batch ${batchNum}/${batches.length} (${batchIds.length} posts) for async processing`,
        );

        // Create batch job for queue
        const batchJob: BatchJob = {
          batchId,
          parentJobId: jobId,
          collectionType: 'chronological',
          subreddit,
          postIds: batchIds,
          batchNumber: batchNum,
          totalBatches: totalBatchCount,
          createdAt: new Date(),
          options: {
            depth: 50,
          },
          priority: 1, // High priority for chronological collection
        };

        // Queue the batch job
        const queuedJob = this.queueChronologicalBatch(batchJob, index);

        batchJobs.push(queuedJob);
      }

      // Orphan-parent healing batch: pre-transformed llmPosts ride the
      // NORMAL chronological batch path (persist-first → relevance gate →
      // extraction) — no parallel gating machinery.
      if (healedParents.length) {
        batchJobs.push(
          this.queueChronologicalBatch(
            {
              batchId: `${jobId}-orphan-parents`,
              parentJobId: jobId,
              collectionType: 'chronological',
              subreddit,
              llmPosts: healedParents,
              batchNumber: totalBatchCount,
              totalBatches: totalBatchCount,
              createdAt: new Date(),
              options: { depth: 50 },
              priority: 1,
            },
            batches.length,
          ),
        );
      }

      // Wait for all batch jobs to be queued
      await Promise.all(batchJobs);
      await job.log(
        `📨 Successfully queued ${totalBatchCount} batches for async processing`,
      );
      // For now, we'll return immediately after queuing
      // The actual processing and mention extraction will happen asynchronously
      // Results will be aggregated by async batch processing workers
      // No synchronous processing needed - batches handle their own LLM processing and database operations

      const timestamps = posts
        .map((post) => this.extractCreatedUtc(post) ?? 0)
        .filter((timestamp) => timestamp > 0);
      if (timestamps.length > 0) {
        latestTimestamp = Math.max(...timestamps);
      }

      // Output heartbeat + declared-vs-actual mirror. The CURSOR does NOT
      // advance here (§10): it is staged above and commits with the first
      // durable extraction-run write for this window (the batch side calls
      // commitPendingWindow). coveredThrough stays the collection START time
      // (visible-at-fetch) so posts arriving during processing are never
      // skipped.
      await this.recordSourceFacts({
        sourceId,
        collectionStartTime,
        advanceCursor: false,
        outputDocs: posts.length,
        declaredRequests: job.data.declaredRequests,
        listingRequests: postsResult.performance?.apiCallsUsed ?? 0,
        healedParentFetches: healedParents.length,
      });
      this.logger.info('Staged pending window after queuing batches', {
        correlationId,
        subreddit,
        coveredThrough: new Date(collectionStartTime * 1000).toISOString(),
        batchesQueued: totalBatchCount,
        latestPostTimestamp: latestTimestamp,
        processingDurationMinutes: Math.round(
          (Date.now() - startTime) / (1000 * 60),
        ),
      });

      // Cadence is owned solely by CollectorPacerService (source lane rows) —
      // the worker must NOT self-schedule a successor job, or two planners
      // run in parallel and double-collect.

      const result: ChronologicalCollectionJobResult = {
        success: true,
        jobId,
        subreddit,
        postsProcessed: posts.length,
        batchesProcessed: totalBatchCount,
        mentionsExtracted: 0, // Will be updated by async batch processing
        processingTime: Date.now() - startTime,
        nextScheduledCollection: undefined,
        latestTimestamp,
      };

      this.logger.info('Chronological collection job queued successfully', {
        correlationId,
        result,
        batchesQueued: totalBatchCount,
        message: 'Async batch processing will handle mention extraction',
      });

      return result;
    } catch (error) {
      if (error instanceof RedditGovernanceDenialError) {
        // §12.3 typed not-now MID-DISPATCH: abort the remaining requests
        // cleanly. The pacer advanced this lane at dispatch, so re-arm it as
        // due — the work item STAYS DUE, with zero error branding (no Bull
        // failure, no retryCount, no cursor movement; any partially fetched
        // pages are simply re-fetched next tick via the persist-first
        // upsert).
        const sourceId =
          job.data.sourceId ??
          (await this.sourceRegistry.findRedditSourceByHandle(subreddit))
            ?.sourceId;
        if (sourceId) {
          await this.sourceRegistry
            .markLaneDue(sourceId, 'chronological')
            .catch(() => undefined);
        }
        this.logger.info(
          'Chronological dispatch deferred by governance (lane re-armed due)',
          {
            correlationId,
            jobId,
            subreddit,
            retryAfterMs: error.retryAfterMs,
          },
        );
        return {
          success: true,
          jobId,
          subreddit,
          postsProcessed: 0,
          batchesProcessed: 0,
          mentionsExtracted: 0,
          processingTime: Date.now() - startTime,
          deferredByGovernance: true,
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Chronological collection job failed', {
        correlationId,
        jobId,
        error: errorMessage,
        attemptsMade: job.attemptsMade,
        subreddit,
      });

      // F465: the in-memory `options.retryCount` mutation that used to live
      // here retried NOTHING — the job object is discarded when the handler
      // throws, and the 'Scheduling retry' log beside it was simply false.
      // Bull's own `attempts` is the retry mechanism; `job.attemptsMade` is
      // the honest count.

      // §12.4 liar purge: exhausted retries used to RETURN {success:false} —
      // Bull marked the job COMPLETED and the failure vanished (always-green).
      // A failed collection is a REAL job failure, always thrown.
      throw error;
    }
  }

  /** §10/§12.4/§14.2 durable source facts after a fetch: output heartbeat
   *  and the declared-vs-actual reddit-draw mirror. The actual side is the
   *  REAL listing-request count the fetch made (`apiCallsUsed` from the
   *  chokepoint), NOT a model of it (F462): recording `ceil(outputDocs/100)`
   *  as the actual just re-derived the declared estimate's own arithmetic, so
   *  the drift pair could only ever confirm itself. The cursor advances here
   *  ONLY on the legit-zero path (advanceCursor) — a non-empty window's cursor
   *  is staged and commits at extraction-run creation (§10). Best-effort: fact
   *  recording must never fail the collection it describes. */
  private async recordSourceFacts(params: {
    sourceId: string | undefined;
    collectionStartTime: number;
    advanceCursor: boolean;
    outputDocs: number;
    declaredRequests?: number;
    /** The REAL number of listing requests the fetch made (chokepoint count),
     *  the honest actual for the §14.2 drift pair. */
    listingRequests: number;
    /** Orphan-parent heals this tick — each was a real governed by-id fetch
     *  the declared estimate could not have known about; folded into the
     *  actual side of the §14.7 drift pair so healing ticks don't read as
     *  under-actual. */
    healedParentFetches?: number;
  }): Promise<void> {
    if (!params.sourceId) {
      return;
    }
    try {
      if (params.advanceCursor) {
        await this.sourceRegistry.mergeLaneState(
          params.sourceId,
          'chronological',
          {
            lastProcessedAt: new Date(
              params.collectionStartTime * 1000,
            ).toISOString(),
          },
        );
      }
      await this.sourceRegistry.recordLaneOutput(
        params.sourceId,
        'chronological',
        params.outputDocs,
      );
      if (typeof params.declaredRequests === 'number') {
        // F462: the REAL chokepoint count, plus the real by-id heal fetches —
        // never a model of the output.
        const actualRequests =
          params.listingRequests + (params.healedParentFetches ?? 0);
        this.governance.pools.recordActualPair(
          REDDIT_POOL_NAME,
          'collector.chronological',
          params.declaredRequests,
          actualRequests,
        );
      }
    } catch (error) {
      this.logger.warn('Source fact recording failed (collection unaffected)', {
        sourceId: params.sourceId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * §10 self-healing orphan-parent sweep.
   *
   * Finds collected COMMENT docs in this community whose parent post doc is
   * absent (the comment arrived inside a collection window; its parent post
   * predates every window), fetches each missing parent from Reddit through
   * the existing governed chokepoint, and returns them as LLMPosts for one
   * extra normal batch (persist-first → relevance gate → extraction).
   *
   * Idempotence / termination per parent id:
   *  - healed: the post doc persists → the anti-join stops matching;
   *  - gate-rejected: same (persist-first stores the doc regardless);
   *  - unfetchable on Reddit (404 / no post in the response): a tombstone
   *    verdict keep=false reason 'parent_unfetchable' is persisted through
   *    the existing collection_relevance_verdicts table, the verdict filter
   *    below excludes it forever, and the orphan comments become
   *    gate-rejected instead of eternally pending;
   *  - transient fetch failure: log + leave for the next tick (never
   *    fabricate, never fail the collection).
   *
   * Per-tick bound: BATCH_SIZE (25) — REUSED from the tick's existing batch
   * granularity (§16: no invented constants); the sweep adds at most one
   * batch-sized unit of healing work per tick, so the 687-doc prod backlog
   * drains across ticks with zero manual steps.
   */
  private async sweepOrphanCommentParents(
    subreddit: string,
    correlationId: string,
  ): Promise<LLMPost[]> {
    let candidateParentIds: string[];
    try {
      // Anti-join over ALL collected docs for the community (no collected_at
      // scope — pre-existing orphans must match). Parents are post fullnames
      // (t3_*); a t1_ parent means a nested comment whose thread root is
      // healed via its own top-level sibling rows.
      const rows = await this.prisma.$queryRaw<
        Array<{ parent_source_id: string }>
      >(Prisma.sql`
        SELECT DISTINCT c.parent_source_id
        FROM collection_source_documents c
        WHERE c.platform = 'reddit'
          AND c.community = ${subreddit}
          AND c.source_type = 'comment'
          AND c.parent_source_id LIKE 't3\\_%'
          AND NOT EXISTS (
            SELECT 1
            FROM collection_source_documents p
            WHERE p.platform = 'reddit'
              AND p.source_type = 'post'
              AND p.source_id = c.parent_source_id
          )
        ORDER BY c.parent_source_id
      `);
      candidateParentIds = rows
        .map((row) => row.parent_source_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 3);
    } catch (error) {
      this.logger.warn(
        'Orphan-parent sweep query failed (collection unaffected; retried next tick)',
        {
          correlationId,
          subreddit,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return [];
    }

    if (candidateParentIds.length === 0) {
      return [];
    }

    // Exclude parents already judged (incl. 'parent_unfetchable' tombstones):
    // a verdict means the parent was fetched (or proven unfetchable) once —
    // never re-FETCH. Deliberately hash-agnostic: the config-scoped re-open
    // (P7, 2026-08-17) re-JUDGES at gate time; it never re-downloads.
    const judged = await this.prisma.collectionRelevanceVerdict.findMany({
      where: { platform: 'reddit', postId: { in: candidateParentIds } },
      select: { postId: true },
    });
    const judgedSet = new Set(judged.map((row) => row.postId));
    const dueParentIds = candidateParentIds
      .filter((id) => !judgedSet.has(id))
      .slice(0, this.BATCH_SIZE);

    if (dueParentIds.length === 0) {
      return [];
    }

    this.logger.info('Orphan-parent sweep found missing parents', {
      correlationId,
      subreddit,
      orphanParentCandidates: candidateParentIds.length,
      fetchingThisTick: dueParentIds.length,
    });

    const healed: LLMPost[] = [];
    const unfetchable: string[] = [];
    for (const fullname of dueParentIds) {
      const baseId = fullname.replace(/^t3_/i, '');
      try {
        const rawResult = await this.redditService.getCompletePostWithComments(
          subreddit,
          baseId,
          { depth: 50 },
        );
        const { post, comments } = filterAndTransformToLLM(
          rawResult.rawResponse,
          rawResult.attribution.postUrl,
        );
        if (!post) {
          // Fetch answered but carried no post payload — the parent is gone
          // from Reddit. Decisive tombstone, not an eternal retry.
          unfetchable.push(fullname);
          continue;
        }
        post.comments = comments;
        healed.push(post);
      } catch (error) {
        if (error instanceof RedditGovernanceDenialError) {
          // Typed not-now: stop drawing from the pool; the remaining orphans
          // stay due and the next tick's sweep resumes.
          this.logger.info(
            'Orphan-parent sweep deferred by governance (remaining parents stay due)',
            { correlationId, subreddit, remaining: dueParentIds.length },
          );
          break;
        }
        if (error instanceof RedditApiError && error.statusCode === 404) {
          unfetchable.push(fullname);
          continue;
        }
        // Transient failure: log + leave for next tick — never fabricate.
        this.logger.warn('Orphan-parent fetch failed (retried next tick)', {
          correlationId,
          subreddit,
          parentSourceId: fullname,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    if (unfetchable.length) {
      // §10 honest outcome through the EXISTING verdicts table: keep=false so
      // the orphan comments become gate-rejected; the sweep's verdict filter
      // never retries these ids.
      await this.prisma.collectionRelevanceVerdict
        .createMany({
          data: unfetchable.map((postId) => ({
            platform: 'reddit',
            postId,
            keep: false,
            reason: 'parent_unfetchable',
            model: 'orphan-parent-sweep',
            // Sentinel config: a fetch outcome is not an LLM judgment, so it
            // is not scoped to any gate configuration and never re-opens.
            promptHash: 'unfetchable',
          })),
          skipDuplicates: true,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            'Orphan-parent tombstone persistence failed (retried next tick)',
            {
              correlationId,
              subreddit,
              parents: unfetchable.length,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            },
          );
        });
      this.logger.info('Orphan parents tombstoned as unfetchable', {
        correlationId,
        subreddit,
        tombstoned: unfetchable.length,
      });
    }

    return healed;
  }

  private queueChronologicalBatch(
    batchJob: BatchJob,
    batchIndex: number,
  ): Promise<Job<BatchJob>> {
    return this.batchQueue.add('process-chronological-batch', batchJob, {
      jobId: batchJob.batchId,
      priority: 1,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      delay: batchIndex * 1000,
    });
  }

  private extractPostId(post: RedditPostDataCandidate): string | null {
    if (typeof post.id === 'string' && post.id.trim().length > 0) {
      return post.id.replace(/^t3_/i, '').trim();
    }

    if (typeof post.name === 'string' && post.name.trim().length > 0) {
      return post.name.replace(/^t3_/i, '').trim();
    }

    return null;
  }

  private extractCreatedUtc(post: RedditPostDataCandidate): number | null {
    if (typeof post.created_utc !== 'number') {
      return null;
    }

    return Number.isFinite(post.created_utc) ? post.created_utc : null;
  }

  private resolveTestFetchLimit(): number {
    // F455: ONE resolver, prod-refusing (a test cap in prod would truncate a
    // fetch). The default fetch reach is 1000; the lever can only lower it.
    return resolveTestLimit('TEST_REDDIT_FETCH_LIMIT', 1000) || 1000;
  }

  /**
   * Handle job failure events
   */
  @Process('handle-collection-failure')
  handleCollectionFailure(
    job: Job<{ jobId: string; error: string; subreddit: string }>,
  ): void {
    const { jobId, error, subreddit } = job.data;

    this.logger.error('Handling collection failure', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'handle_collection_failure',
      jobId,
      error,
      subreddit,
    });

    // Failure recovery strategies:
    // - Alert administrators
    // - Schedule emergency collection
    // - Update monitoring dashboards
    // - Adjust collection frequencies temporarily
  }

  /**
   * Handle job completion events for monitoring
   */
  @Process('log-collection-metrics')
  logCollectionMetrics(job: Job<ChronologicalCollectionJobResult>): void {
    const result = job.data;

    this.logger.info('Logging collection metrics', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'log_collection_metrics',
      metrics: {
        success: result.success,
        postsProcessed: result.postsProcessed,
        batchesProcessed: result.batchesProcessed,
        mentionsExtracted: result.mentionsExtracted,
        processingTime: result.processingTime,
        nextScheduledCollection: result.nextScheduledCollection,
      },
    });
  }
}
