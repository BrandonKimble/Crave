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
    retryCount?: number;
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
        const defaultFallbackMs = Date.now() - 24 * 60 * 60 * 1000; // 24h default
        effectiveLastProcessed = Math.floor(defaultFallbackMs / 1000);
        await job.log(
          `No lane cursor; using 24h fallback: ${new Date(
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
      const envLimit =
        process.env.TEST_CHRONO_MAX_POSTS &&
        !Number.isNaN(Number(process.env.TEST_CHRONO_MAX_POSTS))
          ? Math.max(0, Number.parseInt(process.env.TEST_CHRONO_MAX_POSTS, 10))
          : null;
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
      if (
        sourceId &&
        allPosts.length > 0 &&
        postsResult.metadata.overlapConfirmed === false
      ) {
        const oldestFetched = allPosts.reduce<number | null>((oldest, post) => {
          const created = this.extractCreatedUtc(post);
          return created !== null && (oldest === null || created < oldest)
            ? created
            : oldest;
        }, null);
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

      if (posts.length === 0) {
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

      // PHASE 2: Queue batches for async processing
      const batches = chunk(ids, this.BATCH_SIZE);
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
          expectedBatches: batches.length,
          coveredThrough: new Date(collectionStartTime * 1000),
        });
        await this.sourceRegistry.stagePendingWindow(
          sourceId,
          'chronological',
          {
            parentJobId: jobId,
            coveredThrough: new Date(collectionStartTime * 1000).toISOString(),
            expectedBatches: batches.length,
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
          totalBatches: batches.length,
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

      // Wait for all batch jobs to be queued
      await Promise.all(batchJobs);
      await job.log(
        `📨 Successfully queued ${batches.length} batches for async processing`,
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
      });
      this.logger.info('Staged pending window after queuing batches', {
        correlationId,
        subreddit,
        coveredThrough: new Date(collectionStartTime * 1000).toISOString(),
        batchesQueued: batches.length,
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
        batchesProcessed: batches.length,
        mentionsExtracted: 0, // Will be updated by async batch processing
        processingTime: Date.now() - startTime,
        nextScheduledCollection: undefined,
        latestTimestamp,
      };

      this.logger.info('Chronological collection job queued successfully', {
        correlationId,
        result,
        batchesQueued: batches.length,
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
      const retryCount = options.retryCount || 0;

      this.logger.error('Chronological collection job failed', {
        correlationId,
        jobId,
        error: errorMessage,
        retryCount,
        subreddit,
      });

      // Implement retry logic
      if (retryCount < 3) {
        this.logger.info('Scheduling retry for failed collection job', {
          correlationId,
          jobId,
          retryCount: retryCount + 1,
        });

        job.data.options = {
          ...options,
          retryCount: retryCount + 1,
        };
      }

      // §12.4 liar purge: exhausted retries used to RETURN {success:false} —
      // Bull marked the job COMPLETED and the failure vanished (always-green).
      // A failed collection is a REAL job failure, always thrown.
      throw error;
    }
  }

  /** §10/§12.4/§14.2 durable source facts after a fetch: output heartbeat
   *  and the declared-vs-actual reddit-draw mirror (~1 listing request per
   *  100 posts, minimum 1). The cursor advances here ONLY on the legit-zero
   *  path (advanceCursor) — a non-empty window's cursor is staged and
   *  commits at extraction-run creation (§10). Best-effort: fact recording
   *  must never fail the collection it describes. */
  private async recordSourceFacts(params: {
    sourceId: string | undefined;
    collectionStartTime: number;
    advanceCursor: boolean;
    outputDocs: number;
    declaredRequests?: number;
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
        const actualRequests = Math.max(1, Math.ceil(params.outputDocs / 100));
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
    const raw = process.env.TEST_REDDIT_FETCH_LIMIT;
    if (typeof raw !== 'string' || !raw.trim()) {
      return 1000;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1000;
    }

    const appEnv = (process.env.APP_ENV || process.env.CRAVE_ENV || '')
      .trim()
      .toLowerCase();
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    if (
      appEnv === 'prod' ||
      appEnv === 'production' ||
      nodeEnv === 'production'
    ) {
      return 1000;
    }

    return Math.min(1000, parsed);
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

    // Here we could send metrics to monitoring systems:
    // - Prometheus metrics
    // - Custom dashboards
    // - Performance tracking
    // - Alert systems
  }
}
