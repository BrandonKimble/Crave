import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { LLMChunkingService } from '../../external-integrations/llm/llm-chunking.service';
import {
  LLMConcurrentProcessingService,
  ProcessingResult as LlmProcessingResult,
} from '../../external-integrations/llm/llm-concurrent-processing.service';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';

/**
 * Job data for LLM processing queue
 */
export interface LLMProcessingJobData {
  postId: string;
  subreddit: string;
  correlationId?: string;
  requestedBy?: string;
  options?: {
    commentLimit?: number;
    sort?: 'new' | 'old' | 'top' | 'controversial';
  };
}

/**
 * Job result for LLM processing queue
 */
export interface LLMProcessingJobResult {
  postId: string;
  subreddit: string;
  chunksProcessed: number;
  totalMentions: number;
  processingDuration: number;
  successRate: number;
  results: LLMOutputStructure[];
  metadata: {
    chunkCount: number;
    averageChunkTime: number;
    fastestChunk: number;
    slowestChunk: number;
    topCommentsProcessed: number;
  };
}

/**
 * LLM Processing Queue Processor
 *
 * Handles asynchronous LLM processing jobs with the following pipeline:
 * 1. Retrieve Reddit content with comments
 * 2. Create context-aware chunks (maintaining "top" order)
 * 3. Process chunks concurrently using p-limit
 * 4. Validate and consolidate results
 * 5. Return processing metrics and results
 */
@Processor('llm-processing-queue')
@Injectable()
export class LLMProcessingQueueProcessor implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly redditService: RedditService,
    private readonly llmService: LLMService,
    private readonly chunkingService: LLMChunkingService,
    private readonly concurrentService: LLMConcurrentProcessingService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LlmProcessing');
  }

  /**
   * Process LLM content extraction job
   *
   * @param job - Bull job with LLM processing data
   * @returns Job result with processing metrics and extracted content
   */
  @Process('process-content')
  async processContentJob(
    job: Job<LLMProcessingJobData>,
  ): Promise<LLMProcessingJobResult> {
    const {
      postId,
      subreddit,
      correlationId,
      requestedBy,
      options = {},
    } = job.data;
    const startTime = Date.now();

    // Set correlation ID for tracking
    if (correlationId) {
      CorrelationUtils.setContext({
        correlationId,
        startTime: Date.now(),
        method: 'queue-job',
        url: `/llm-processing/${postId}`,
      });
    }

    this.logger.info('Starting LLM processing job', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_content_job',
      jobId: job.id,
      postId,
      subreddit,
      requestedBy,
      options,
    });

    try {
      // Step 1: Retrieve Reddit content with "top" sorting for best content first
      this.logger.debug('Step 1: Retrieving Reddit content', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId,
        subreddit,
      });

      // Get Reddit content directly
      const rawResult = await this.redditService.getCompletePostWithComments(
        subreddit,
        postId,
        {
          sort: 'top', // Ensures valuable content processes first
          limit: options.commentLimit || 1000,
          depth: 50, // Increased depth to get all nested comments
        },
      );

      const { rawResponse } = rawResult;
      if (!Array.isArray(rawResponse) || rawResponse.length === 0) {
        throw new Error(
          `No content retrieved for post ${postId} in subreddit ${subreddit}`,
        );
      }

      // Transform to LLM format
      const { post, comments } = filterAndTransformToLLM(
        rawResponse,
        rawResult.attribution.postUrl,
      );

      if (!post) {
        throw new Error(
          `Failed to transform post ${postId} content for LLM processing`,
        );
      }

      post.comments = comments;
      const llmInput: LLMInputStructure = { posts: [post] };

      this.logger.info('Content retrieved successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId,
        totalComments: post.comments.length,
        postTitle: post.title.substring(0, 100),
      });

      // Step 2: Create context-aware chunks
      this.logger.debug('Step 2: Creating contextual chunks', {
        correlationId: CorrelationUtils.getCorrelationId(),
        totalComments: post.comments.length,
      });

      const chunkData = this.chunkingService.createContextualChunks(llmInput);

      if (chunkData.chunks.length === 0) {
        this.logger.warn(
          'No chunks created, processing post without comments',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            postId,
          },
        );
      }

      // Validate chunking
      const validation = this.chunkingService.validateChunking(
        llmInput,
        chunkData,
      );
      if (!validation.isValid) {
        this.logger.warn('Chunking validation issues detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          issues: validation.issues,
          summary: validation.summary,
        });
      }

      this.logger.info('Chunks created successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        chunkCount: chunkData.chunks.length,
        chunkSizes: chunkData.metadata.map((m) => m.commentCount),
        estimatedTotalTime: Math.max(
          ...chunkData.metadata.map((m) => m.estimatedProcessingTime),
        ),
      });

      // Step 3: Process chunks concurrently
      this.logger.debug('Step 3: Processing chunks concurrently', {
        correlationId: CorrelationUtils.getCorrelationId(),
        chunkCount: chunkData.chunks.length,
      });

      await job.progress(25); // Update job progress

      const processingResult = await this.concurrentService.processConcurrent(
        chunkData,
        this.llmService,
      );

      await job.progress(90); // Update job progress

      // Step 4: Validate and log results
      this.validateCompleteResults(processingResult, postId);

      const totalDuration = (Date.now() - startTime) / 1000;
      const totalMentions = processingResult.results.reduce(
        (sum, result) => sum + result.mentions.length,
        0,
      );

      await job.progress(100); // Complete

      this.logger.info('LLM processing job completed successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content_job',
        jobId: job.id,
        postId,
        totalDuration,
        chunksProcessed: processingResult.metrics.chunksProcessed,
        successRate: processingResult.metrics.successRate,
        totalMentions,
        averageChunkTime: processingResult.metrics.averageChunkTime,
      });

      // Return comprehensive job result
      return {
        postId,
        subreddit,
        chunksProcessed: processingResult.metrics.chunksProcessed,
        totalMentions,
        processingDuration: totalDuration,
        successRate: processingResult.metrics.successRate,
        results: processingResult.results,
        metadata: {
          chunkCount: chunkData.chunks.length,
          averageChunkTime: processingResult.metrics.averageChunkTime,
          fastestChunk: processingResult.metrics.fastestChunk,
          slowestChunk: processingResult.metrics.slowestChunk,
          topCommentsProcessed: processingResult.metrics.topCommentsCount,
        },
      };
    } catch (error) {
      const totalDuration = (Date.now() - startTime) / 1000;

      this.logger.error('LLM processing job failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content_job',
        jobId: job.id,
        postId,
        subreddit,
        totalDuration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error; // Let Bull handle retry logic
    }
  }

  /**
   * Validate that the complete processing results meet quality standards
   *
   * @param result - Processing result to validate
   * @param postId - Post ID for error context
   */
  private validateCompleteResults(
    result: LlmProcessingResult,
    postId: string,
  ): void {
    if (!Array.isArray(result.results)) {
      throw new Error(`Invalid processing result structure for post ${postId}`);
    }

    if (result.metrics.successRate < 80) {
      this.logger.warn('Low success rate detected', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId,
        successRate: result.metrics.successRate,
        failureCount: result.failures?.length || 0,
      });
    }
    const totalMentions = result.results.reduce(
      (sum, llmResult) => sum + llmResult.mentions.length,
      0,
    );
    if (totalMentions === 0 && result.metrics.chunksProcessed > 0) {
      this.logger.warn('No mentions extracted despite processing chunks', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId,
        chunksProcessed: result.metrics.chunksProcessed,
      });
    }
  }
}
