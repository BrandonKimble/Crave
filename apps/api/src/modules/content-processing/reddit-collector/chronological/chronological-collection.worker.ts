import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { OnModuleInit, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedditService } from '../../../external-integrations/reddit/reddit.service';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';
import { BatchJob } from '../batch-processing-queue.types';

export interface ChronologicalCollectionJobData {
  subreddit: string; // Changed from subreddits array to single subreddit
  jobId: string;
  triggeredBy:
    | 'scheduled'
    | 'manual'
    | 'gap_detection'
    | 'startup_due'
    | 'delayed_schedule';
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
  private readonly BATCH_SIZE =
    process.env.TEST_CHRONO_BATCH_SIZE &&
    !Number.isNaN(Number(process.env.TEST_CHRONO_BATCH_SIZE))
      ? Math.max(1, Number.parseInt(process.env.TEST_CHRONO_BATCH_SIZE, 10))
      : 25; // Default batch size

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedditService) private readonly redditService: RedditService,
    @InjectQueue('chronological-batch-processing-queue')
    private readonly batchQueue: Queue,
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
      // PHASE 1: Determine lastProcessed timestamp with safe fallback when not provided
      // Use DB as source of truth so delayed jobs/retries remain correct
      let effectiveLastProcessed = options.lastProcessedTimestamp;
      if (typeof effectiveLastProcessed !== 'number') {
        const sr = await this.prisma.subreddit.findUnique({
          where: { name: subreddit.toLowerCase() },
          select: { lastProcessed: true, safeIntervalDays: true },
        });
        if (sr) {
          const fallbackMs = sr.lastProcessed
            ? sr.lastProcessed.getTime()
            : Date.now() - (sr.safeIntervalDays || 1) * 24 * 60 * 60 * 1000;
          effectiveLastProcessed = Math.floor(fallbackMs / 1000);
          await job.log(
            `Using computed lastProcessed fallback: ${new Date(fallbackMs).toISOString()}`,
          );
        } else {
          const defaultFallbackMs = Date.now() - 24 * 60 * 60 * 1000; // 24h default
          effectiveLastProcessed = Math.floor(defaultFallbackMs / 1000);
          await job.log(
            `Subreddit not found; using 24h fallback: ${new Date(defaultFallbackMs).toISOString()}`,
          );
        }
      }

      // CRITICAL: Capture collection start time BEFORE Reddit API call
      // This prevents missing posts that arrive during the 1+ hour processing time
      const collectionStartTime = Math.floor(Date.now() / 1000); // Unix timestamp

      await job.log(
        `Collecting posts from r/${subreddit} since ${new Date(effectiveLastProcessed * 1000).toISOString()}`,
      );
      await job.log(
        `Collection start time: ${new Date(collectionStartTime * 1000).toISOString()} (for next cycle)`,
      );

      // ALWAYS request maximum posts (1000) regardless of what's in options
      // We want to ensure we never miss any posts between collection cycles
      // The PRD safety buffer (750) is for scheduling frequency, not collection limit
      const postsResult = await this.redditService.getChronologicalPosts(
        subreddit,
        effectiveLastProcessed,
        1000, // Always request Reddit's maximum to never miss posts
      );

      const allPosts = postsResult.data || [];
      const maxPostsOverride =
        process.env.TEST_CHRONO_MAX_POSTS &&
        !Number.isNaN(Number(process.env.TEST_CHRONO_MAX_POSTS))
          ? Math.max(0, Number.parseInt(process.env.TEST_CHRONO_MAX_POSTS, 10))
          : null;
      const posts =
        typeof maxPostsOverride === 'number' && maxPostsOverride > 0
          ? allPosts.slice(0, maxPostsOverride)
          : allPosts;
      await job.log(
        `Collected ${allPosts.length} posts from r/${subreddit}, limited to ${posts.length} for testing`,
      );

      // TEMPORARY INJECTION: Ensure a specific post ID is processed first if provided
      const injectIdRaw = process.env.TEST_INJECT_FIRST_POST_ID || '';
      const injectId = injectIdRaw.replace(/^t3_/i, '').trim();
      // Build IDs list (Reddit API post.data.id is the base id without t3_)
      const ids: string[] = posts
        .map((p: any) =>
          typeof p?.id === 'string' ? p.id : String(p?.id || ''),
        )
        .filter((id: string) => !!id);
      if (injectId) {
        // If already present, move to front; otherwise, prepend
        const existingIndex = ids.indexOf(injectId);
        if (existingIndex >= 0) {
          ids.splice(existingIndex, 1);
          ids.unshift(injectId);
          await job.log(
            `🔧 Injection: moved post ${injectIdRaw} to first slot`,
          );
        } else {
          ids.unshift(injectId);
          await job.log(
            `🔧 Injection: added post ${injectIdRaw} to first slot`,
          );
        }
      }

      // Process all collected posts - async queue handles batching and rate limiting

      if (posts.length === 0) {
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
        const queuedJob = this.batchQueue.add(
          'process-chronological-batch',
          batchJob,
          {
            priority: 1,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            delay: index * 1000, // Stagger batch processing by 1 second intervals
          },
        );

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

      // Update last processed timestamp in database for async queue approach
      const timestamps = posts
        .map((p: any) => p.created_utc || 0)
        .filter((t: number) => t > 0);
      if (timestamps.length > 0) {
        latestTimestamp = Math.max(...timestamps);

        // For async queue approach, we update the timestamp immediately after queuing
        // The actual LLM processing will happen asynchronously
        // CRITICAL: Use collection start time to prevent missing posts during processing
        await this.prisma.subreddit.update({
          where: { name: subreddit.toLowerCase() },
          data: {
            lastProcessed: new Date(collectionStartTime * 1000),
          },
        });

        this.logger.info(
          'Updated lastProcessed timestamp after queuing batches',
          {
            correlationId,
            subreddit,
            lastProcessedTimestamp: collectionStartTime,
            lastProcessedDate: new Date(
              collectionStartTime * 1000,
            ).toISOString(),
            batchesQueued: batches.length,
            latestPostTimestamp: latestTimestamp,
            latestPostDate: new Date(latestTimestamp * 1000).toISOString(),
            processingDurationMinutes: Math.round(
              (Date.now() - startTime) / (1000 * 60),
            ),
          },
        );

        // Schedule next collection using event-driven approach
        const collectionJobScheduler = await this.moduleRef.resolve(
          CollectionJobSchedulerService,
        );
        await collectionJobScheduler.scheduleNextCollection(subreddit);
      }

      // Update scheduling based on observed posting volume
      this.updateSchedulingFromResults(
        subreddit,
        posts.length,
        latestTimestamp - (effectiveLastProcessed || 0),
      );

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

        throw error; // Trigger Bull's retry mechanism
      }

      return {
        success: false,
        jobId,
        subreddit,
        postsProcessed: 0,
        batchesProcessed: 0,
        mentionsExtracted: 0,
        processingTime: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Update scheduling configurations based on collection results
   * Volume tracking is now handled by database updates
   * Scheduling is handled by the CollectionJobSchedulerService via delayed jobs
   */
  private updateSchedulingFromResults(
    subredditName: string,
    postsCollected: number,
    timeSpanSeconds: number,
  ): void {
    // Placeholder for future volume tracking enhancements
    // Current implementation relies on CollectionJobSchedulerService
    this.logger.debug('Scheduling update completed', {
      subreddit: subredditName,
      postsCollected,
      timeSpanSeconds,
    });
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
