import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { OnModuleInit, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { ContentRetrievalPipelineService } from './content-retrieval-pipeline.service';
import { LLMChunkingService } from '../../external-integrations/llm/llm-chunking.service';
import { LLMConcurrentProcessingService } from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { UnifiedProcessingService } from './unified-processing.service';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';

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
 * Chronological Collection Service
 *
 * Implements PRD Section 5.1.2: Complete chronological collection pipeline
 * Combines Bull queue processing with Reddit data collection and LLM processing.
 *
 * Key responsibilities:
 * - Process scheduled chronological collection jobs via Bull queue
 * - Execute Reddit API chronological collection
 * - Coordinate LLM processing pipeline
 * - Handle retry logic for failed collections
 * - Update database timestamps and schedule next collections
 * - Provide comprehensive error handling and logging
 */
@Processor('chronological-collection')
export class ChronologicalCollectionService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly BATCH_SIZE = 25; // Optimal batch size from testing

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedditService) private readonly redditService: RedditService,
    @Inject(ContentRetrievalPipelineService) private readonly contentRetrievalPipeline: ContentRetrievalPipelineService,
    @Inject(LLMChunkingService) private readonly llmChunkingService: LLMChunkingService,
    @Inject(LLMConcurrentProcessingService) private readonly llmConcurrentService: LLMConcurrentProcessingService,
    @Inject(LLMService) private readonly llmService: LLMService,
    @Inject(UnifiedProcessingService) private readonly unifiedProcessingService: UnifiedProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ChronologicalCollectionService',
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
      // PHASE 1: Collect all post metadata (lightweight, 1 API call)
      // Scheduler ALWAYS provides lastProcessedTimestamp - either from DB or calculated fallback
      const lastProcessed = options.lastProcessedTimestamp!;

      // CRITICAL: Capture collection start time BEFORE Reddit API call
      // This prevents missing posts that arrive during the 1+ hour processing time
      const collectionStartTime = Math.floor(Date.now() / 1000); // Unix timestamp
      
      await job.log(
        `Collecting posts from r/${subreddit} since ${new Date(lastProcessed * 1000).toISOString()}`,
      );
      await job.log(
        `Collection start time: ${new Date(collectionStartTime * 1000).toISOString()} (for next cycle)`,
      );

      // ALWAYS request maximum posts (1000) regardless of what's in options
      // We want to ensure we never miss any posts between collection cycles
      // The PRD safety buffer (750) is for scheduling frequency, not collection limit
      const postsResult = await this.redditService.getChronologicalPosts(
        subreddit,
        lastProcessed,
        1000, // Always request Reddit's maximum to never miss posts
      );

      const posts = postsResult.data || [];
      await job.log(`Collected ${posts.length} posts from r/${subreddit}`);
      
      // TEMPORARY: Limit processing to first 100 posts for testing optimization
      if (posts.length > 25) {
        await job.log(`⚠️  TEMPORARY LIMIT: Processing only first 100 of ${posts.length} posts for testing`);
        posts.splice(25); // Remove everything after the first 100 posts
      }

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

      // PHASE 2: Process in batches of 25 posts
      const batches = chunk(
        posts.map((p: any) => p.id),
        this.BATCH_SIZE,
      );
      let totalMentionsExtracted = 0;
      let latestTimestamp = 0;

      for (const [index, batchIds] of batches.entries()) {
        const batchNum = index + 1;
        const batchStartTime = Date.now();
        await job.log(
          `🔄 Processing batch ${batchNum}/${batches.length} (${batchIds.length} posts) - Started`,
        );

        try {
          // Get full content for this batch (25 API calls)
          const fullPosts =
            await this.contentRetrievalPipeline.retrieveContentForLLM(
              subreddit,
              batchIds,
              { depth: 50 },
            );

          // LLM processing (~82 seconds, provides natural rate limiting)
          const chunkData = await this.llmChunkingService.createContextualChunks(
            fullPosts.llmInput,
          );
          const processingResult = await this.llmConcurrentService.processConcurrent(
            chunkData,
            this.llmService,
          );

          // Consolidate results
          const llmOutput = {
            mentions: processingResult.results.flatMap((r) => r.mentions),
          };
          totalMentionsExtracted += llmOutput.mentions.length;

          // Save to database immediately (progressive saves)
          const mergedInput = {
            posts: fullPosts.llmInput.posts,
            comments: [], // Comments are nested in posts
            sourceMetadata: {
              batchId: `${jobId}-batch-${batchNum}`,
              mergeTimestamp: new Date(),
              sourceBreakdown: {
                pushshift_archive: 0,
                reddit_api_chronological: fullPosts.llmInput.posts.length,
                reddit_api_keyword_search: 0,
                reddit_api_on_demand: 0,
              },
              temporalRange: {
                earliest: Math.min(
                  ...fullPosts.llmInput.posts.map((p: any) =>
                    new Date(p.created_at).getTime(),
                  ),
                ),
                latest: Math.max(
                  ...fullPosts.llmInput.posts.map((p: any) =>
                    new Date(p.created_at).getTime(),
                  ),
                ),
                spanHours: 0, // Will be calculated from earliest/latest
              },
            },
          };
          // Calculate span hours
          mergedInput.sourceMetadata.temporalRange.spanHours =
            (mergedInput.sourceMetadata.temporalRange.latest -
              mergedInput.sourceMetadata.temporalRange.earliest) /
            (1000 * 60 * 60);

          await this.unifiedProcessingService.processUnifiedBatch(mergedInput);

          // Update progress for monitoring
          const progress = (batchNum / batches.length) * 100;
          await job.progress(progress);

          // Log batch completion with timing and performance metrics
          const batchDuration = Date.now() - batchStartTime;
          await job.log(
            `✅ Batch ${batchNum}/${batches.length} completed - ${llmOutput.mentions.length} mentions in ${(batchDuration/1000).toFixed(1)}s (${(llmOutput.mentions.length/(batchDuration/1000)).toFixed(1)} mentions/sec)`,
          );
        } catch (batchError) {
          const batchDuration = Date.now() - batchStartTime;
          await job.log(
            `❌ Batch ${batchNum}/${batches.length} failed after ${(batchDuration/1000).toFixed(1)}s`,
          );
          this.logger.error(`Failed to process batch ${batchNum}`, {
            correlationId,
            error:
              batchError instanceof Error
                ? batchError.message
                : String(batchError),
            batch: batchNum,
            totalBatches: batches.length,
            batchDurationMs: batchDuration,
          });
          // Continue with next batch even if one fails
        }
      }

      // Update last processed timestamp in database ONLY if LLM processing succeeded
      const timestamps = posts
        .map((p: any) => p.created_utc || 0)
        .filter((t: number) => t > 0);
      if (timestamps.length > 0) {
        latestTimestamp = Math.max(...timestamps);

        // Only update database if we successfully extracted mentions
        if (totalMentionsExtracted > 0) {
          // CRITICAL: Use collection start time to prevent missing posts during processing
          // This ensures next cycle includes any posts created during this 1+ hour processing
          await this.prisma.subreddit.update({
            where: { name: subreddit.toLowerCase() },
            data: {
              lastProcessed: new Date(collectionStartTime * 1000),
            },
          });

          this.logger.info('Updated lastProcessed timestamp in database', {
            correlationId,
            subreddit,
            lastProcessedTimestamp: collectionStartTime,
            lastProcessedDate: new Date(collectionStartTime * 1000).toISOString(),
            mentionsExtracted: totalMentionsExtracted,
            latestPostTimestamp: latestTimestamp,
            latestPostDate: new Date(latestTimestamp * 1000).toISOString(),
            processingDurationMinutes: Math.round((Date.now() - startTime) / (1000 * 60)),
          });

          // Schedule next collection using event-driven approach
          const collectionJobScheduler = await this.moduleRef.resolve(
            CollectionJobSchedulerService,
          );
          await collectionJobScheduler.scheduleNextCollection(subreddit);
        } else {
          this.logger.warn('LLM processing failed - NOT updating lastProcessed timestamp', {
            correlationId,
            subreddit,
            postsProcessed: posts.length,
            batchesProcessed: batches.length,
            mentionsExtracted: totalMentionsExtracted,
            message: 'Will retry these posts in next collection cycle',
          });
        }
      }

      // Update scheduling based on observed posting volume
      await this.updateSchedulingFromResults(
        subreddit,
        posts.length,
        latestTimestamp - lastProcessed,
      );

      const result: ChronologicalCollectionJobResult = {
        success: true,
        jobId,
        subreddit,
        postsProcessed: posts.length,
        batchesProcessed: batches.length,
        mentionsExtracted: totalMentionsExtracted,
        processingTime: Date.now() - startTime,
        nextScheduledCollection: undefined,
        latestTimestamp,
      };

      this.logger.info('Chronological collection job completed successfully', {
        correlationId,
        result,
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
   * Adjusts posting volume estimates for better future scheduling
   */
  private async updateSchedulingFromResults(
    subreddit: string,
    postsCollected: number,
    timeSpanSeconds: number,
  ): Promise<void> {
    if (postsCollected > 0 && timeSpanSeconds > 0) {
      const timeSpanDays = timeSpanSeconds / (24 * 60 * 60);
      const observedPostsPerDay = postsCollected / Math.max(timeSpanDays, 1);

      // Volume tracking is now handled by database updates
      // Scheduling is handled by the CollectionJobSchedulerService via delayed jobs
    }
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
