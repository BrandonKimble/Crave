import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';
import { LLMChunkingService } from '../../external-integrations/llm/llm-chunking.service';
import { LLMConcurrentProcessingService } from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { UnifiedProcessingService } from './unified-processing.service';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

/**
 * Chronological Batch Processing Worker
 *
 * Processes batches of Reddit chronological collection content asynchronously using Bull queues.
 * Takes the existing chronological collection logic and moves it to async workers.
 *
 * Architecture:
 * - ChronologicalCollectionWorker queues batch jobs (just post IDs)
 * - Workers pick up jobs and process them independently
 * - Full content retrieval → LLM processing → database operations
 * - Results tracked and aggregated per collection
 */
@Processor('chronological-batch-processing-queue')
@Injectable()
export class ChronologicalBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(RedditService)
    private readonly redditService: RedditService,
    @Inject(LLMChunkingService)
    private readonly llmChunkingService: LLMChunkingService,
    @Inject(LLMConcurrentProcessingService)
    private readonly llmConcurrentService: LLMConcurrentProcessingService,
    @Inject(LLMService) private readonly llmService: LLMService,
    @Inject(UnifiedProcessingService)
    private readonly unifiedProcessingService: UnifiedProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ChronologicalBatchProcessingWorker',
    );
  }

  /**
   * Process chronological collection batch
   * Currently only handles chronological batches - extensible for other types later
   */
  @Process({ name: 'process-chronological-batch', concurrency: 1 })
  async processChronologicalBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();
    const {
      batchId,
      parentJobId,
      collectionType,
      subreddit,
      postIds,
      options,
      batchNumber,
      totalBatches,
    } = job.data;

    // Validate this is a chronological batch
    if (collectionType !== 'chronological') {
      throw new Error(
        `This worker only handles chronological batches, got: ${collectionType}`,
      );
    }

    this.logger.info('Starting chronological batch processing', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
      postCount: postIds.length,
      progress: `${batchNumber}/${totalBatches}`,
    });

    try {
      const result = await this.processChronologicalBatchInternal(
        {
          batchId,
          parentJobId,
          collectionType,
          subreddit,
          postIds,
          options,
          batchNumber,
          totalBatches,
        },
        correlationId,
        startTime,
      );

      // Update job progress
      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.logger.info(
        'Chronological batch processing completed successfully',
        {
          correlationId,
          batchId,
          parentJobId,
          subreddit,
          processingTimeMs: processingTime,
          mentionsExtracted: result.metrics.mentionsExtracted,
          entitiesCreated: result.metrics.entitiesCreated,
          connectionsCreated: result.metrics.connectionsCreated,
        },
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Chronological batch processing failed', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
        processingTimeMs: processingTime,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return error result instead of throwing (for proper job completion)
      return {
        batchId,
        parentJobId,
        collectionType: 'chronological',
        success: false,
        error: errorMessage,
        metrics: {
          postsProcessed: 0,
          mentionsExtracted: 0,
          entitiesCreated: 0,
          connectionsCreated: 0,
          processingTimeMs: processingTime,
          llmProcessingTimeMs: 0,
          dbProcessingTimeMs: 0,
        },
        completedAt: new Date(),
      };
    }
  }

  /**
   * Internal chronological batch processing logic
   * Moved from ChronologicalCollectionWorker nearly as-is for consistency
   */
  private async processChronologicalBatchInternal(
    batchJob: {
      batchId: string;
      parentJobId: string;
      collectionType: string;
      subreddit: string;
      postIds: string[];
      options: any;
      batchNumber: number;
      totalBatches: number;
    },
    correlationId: string,
    startTime: number,
  ): Promise<BatchProcessingResult> {
    const { batchId, parentJobId, subreddit, postIds, options } = batchJob;
    const llmStartTime = Date.now();

    this.logger.debug('Processing chronological batch', {
      correlationId,
      batchId,
      subreddit,
      postCount: postIds.length,
      depth: options.depth,
    });

    try {
      // Step 1: Get full content for this batch (same as original - 25 API calls)
      this.logger.debug('Retrieving Reddit content for batch', {
        correlationId,
        postCount: postIds.length,
        depth: options.depth,
      });

      const llmPosts: any[] = [];
      for (const postId of postIds) {
        try {
          const rawResult =
            await this.redditService.getCompletePostWithComments(
              subreddit,
              postId,
              { depth: options.depth },
            );

          if (!rawResult.rawResponse || rawResult.rawResponse.length === 0) {
            this.logger.warn(`Skipping post ${postId} - no raw response`, {
              correlationId,
              postId,
            });
            continue;
          }

          const { post, comments } = filterAndTransformToLLM(
            rawResult.rawResponse,
            rawResult.attribution.postUrl,
          );

          if (!post) {
            this.logger.warn(
              `Skipping post ${postId} - transformation failed`,
              {
                correlationId,
                postId,
              },
            );
            continue;
          }

          post.comments = comments;
          llmPosts.push(post);
        } catch (error) {
          this.logger.error(`Failed to retrieve post ${postId}`, {
            correlationId,
            postId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (llmPosts.length === 0) {
        throw new Error('No valid posts retrieved for LLM processing');
      }

      const llmInput = { posts: llmPosts };

      // Step 2: LLM processing (same as original - ~82 seconds, provides natural rate limiting)
      const chunkData =
        this.llmChunkingService.createContextualChunks(llmInput);
      const processingResult =
        await this.llmConcurrentService.processConcurrent(
          chunkData,
          this.llmService,
        );

      // Step 3: Consolidate results (same as original)
      const llmOutput = {
        mentions: processingResult.results.flatMap((r) => r.mentions),
      };

      const llmProcessingTime = Date.now() - llmStartTime;
      const dbStartTime = Date.now();

      // Step 4: Use clean interface - pass LLM output directly to database service
      const dbResult = await this.unifiedProcessingService.processLLMOutput({
        mentions: llmOutput.mentions,
        sourceMetadata: {
          batchId,
          collectionType: 'chronological',
          subreddit,
          sourceBreakdown: {
            pushshift_archive: 0,
            reddit_api_chronological: llmPosts.length,
            reddit_api_keyword_search: 0,
            reddit_api_on_demand: 0,
          },
          temporalRange: {
            earliest: Math.min(
              ...llmPosts.map((p: any) => new Date(p.created_at).getTime()),
            ),
            latest: Math.max(
              ...llmPosts.map((p: any) => new Date(p.created_at).getTime()),
            ),
          },
        },
      });

      const dbProcessingTime = Date.now() - dbStartTime;

      return {
        batchId,
        parentJobId,
        collectionType: 'chronological',
        success: true,
        metrics: {
          postsProcessed: postIds.length,
          mentionsExtracted: llmOutput.mentions.length,
          entitiesCreated: dbResult.entitiesCreated,
          connectionsCreated: dbResult.connectionsCreated,
          processingTimeMs: Date.now() - startTime,
          llmProcessingTimeMs: llmProcessingTime,
          dbProcessingTimeMs: dbProcessingTime,
        },
        completedAt: new Date(),
        details: {
          createdEntityIds: dbResult.createdEntityIds || [],
          updatedConnectionIds: dbResult.affectedConnectionIds || [],
        },
      };
    } catch (error) {
      const processingTime = Date.now() - llmStartTime;

      this.logger.error('Chronological batch processing failed', {
        correlationId,
        batchId,
        subreddit,
        postCount: postIds.length,
        processingTimeMs: processingTime,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error; // Let Bull handle retries
    }
  }
}
