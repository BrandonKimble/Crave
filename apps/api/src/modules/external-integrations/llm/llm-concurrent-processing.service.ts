import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import pLimit from 'p-limit';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMService } from './llm.service';
import { LLMOutputStructure } from './llm.types';
import { ChunkResult, ChunkMetadata } from './llm-chunking.service';

/**
 * Processing result for a single chunk
 */
export interface ChunkProcessingResult {
  success: boolean;
  result?: LLMOutputStructure;
  error?: any;
  chunkId: string;
  commentCount: number;
  duration: number;
}

/**
 * Overall processing result for all chunks
 */
export interface ProcessingResult {
  results: LLMOutputStructure[];
  failures: ChunkProcessingResult[];
  metrics: {
    totalDuration: number;
    chunksProcessed: number;
    successRate: number;
    topCommentsCount: number;
    averageChunkTime: number;
    fastestChunk: number;
    slowestChunk: number;
  };
}

/**
 * LLM Concurrent Processing Service
 *
 * Handles concurrent processing of Reddit content chunks using p-limit:
 * - Processes chunks with controlled concurrency (default: 5 simultaneous)
 * - Maintains "top" comment processing order value while allowing concurrency
 * - Handles variable chunk sizes gracefully (1-50+ comments per chunk)
 * - Provides comprehensive error handling and metrics
 * - Natural load balancing (fast chunks complete quickly, slow ones take time)
 */
@Injectable()
export class LLMConcurrentProcessingService implements OnModuleInit {
  private logger!: LoggerService;
  private limit!: ReturnType<typeof pLimit>;
  private readonly concurrencyLimit: number = 16; // Significantly increased for compound term processing test

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LlmConcurrentProcessing');
    this.limit = pLimit(this.concurrencyLimit);

    this.logger.info('LLM Concurrent Processing Service initialized', {
      concurrencyLimit: this.concurrencyLimit,
    });
  }

  /**
   * Process multiple chunks concurrently with controlled concurrency
   *
   * @param chunkData - Chunks and metadata from chunking service
   * @param llmService - LLM service instance for processing
   * @returns Processing result with consolidated outputs and metrics
   */
  async processConcurrent(
    chunkData: ChunkResult,
    llmService: LLMService,
  ): Promise<ProcessingResult> {
    const { chunks, metadata } = chunkData;
    const startTime = Date.now();

    if (chunks.length === 0) {
      this.logger.warn('No chunks provided for processing', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_concurrent',
      });

      return {
        results: [],
        failures: [],
        metrics: {
          totalDuration: 0,
          chunksProcessed: 0,
          successRate: 100,
          topCommentsCount: 0,
          averageChunkTime: 0,
          fastestChunk: 0,
          slowestChunk: 0,
        },
      };
    }

    this.logger.info('Starting concurrent chunk processing', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_concurrent',
      totalChunks: chunks.length,
      chunkSizes: metadata.map((m) => m.commentCount),
      estimatedTimes: metadata.map((m) => m.estimatedProcessingTime),
      concurrencyLimit: this.concurrencyLimit,
      topRootScores: metadata.slice(0, 5).map((m) => m.rootCommentScore),
    });

    // Process chunks with concurrency control
    // p-limit naturally handles variable processing times
    const promises = chunks.map((chunk, index) =>
      this.limit(async (): Promise<ChunkProcessingResult> => {
        const chunkStart = Date.now();
        const meta = metadata[index];

        this.logger.debug('Starting chunk processing', {
          correlationId: CorrelationUtils.getCorrelationId(),
          chunkId: meta.chunkId,
          position: index + 1,
          totalChunks: chunks.length,
          commentCount: meta.commentCount,
          rootScore: meta.rootCommentScore,
          estimatedTime: meta.estimatedProcessingTime,
        });

        try {
          const result = await llmService.processContent(chunk);
          const duration = (Date.now() - chunkStart) / 1000;

          // Validate all vital fields are present
          this.validateOutputStructure(result, meta.chunkId);

          this.logger.debug('Chunk processing completed', {
            correlationId: CorrelationUtils.getCorrelationId(),
            chunkId: meta.chunkId,
            commentCount: meta.commentCount,
            actualTime: duration,
            estimatedTime: meta.estimatedProcessingTime,
            variance: duration - meta.estimatedProcessingTime,
            mentionsExtracted: result.mentions.length,
          });

          return {
            success: true,
            result,
            chunkId: meta.chunkId,
            commentCount: meta.commentCount,
            duration,
          };
        } catch (error) {
          const duration = (Date.now() - chunkStart) / 1000;

          this.logger.error('Chunk processing failed', {
            correlationId: CorrelationUtils.getCorrelationId(),
            chunkId: meta.chunkId,
            commentCount: meta.commentCount,
            duration,
            error: error instanceof Error ? error.message : String(error),
            rootScore: meta.rootCommentScore,
          });

          return {
            success: false,
            error,
            chunkId: meta.chunkId,
            commentCount: meta.commentCount,
            duration,
          };
        }
      }),
    );

    // Wait for all chunks to complete (or fail)
    const settledResults = await Promise.allSettled(promises);

    // Consolidate results
    const successful: ChunkProcessingResult[] = [];
    const failed: ChunkProcessingResult[] = [];

    settledResults.forEach((settled, index) => {
      if (settled.status === 'fulfilled') {
        if (settled.value.success) {
          successful.push(settled.value);
        } else {
          failed.push(settled.value);
        }
      } else {
        // Promise itself rejected (shouldn't happen with our error handling)
        const meta = metadata[index];
        failed.push({
          success: false,
          error: settled.reason,
          chunkId: meta.chunkId,
          commentCount: meta.commentCount,
          duration: 0,
        });
      }
    });

    const totalDuration = (Date.now() - startTime) / 1000;
    const successfulResults = successful.map((r) => r.result!);
    const topCommentsCount = successful.filter((r) => {
      const meta = metadata.find((m) => m.chunkId === r.chunkId);
      return meta && meta.rootCommentScore > 10;
    }).length;

    // Calculate timing metrics
    const allDurations = successful.map((r) => r.duration);
    const averageChunkTime =
      allDurations.length > 0
        ? allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length
        : 0;
    const fastestChunk =
      allDurations.length > 0 ? Math.min(...allDurations) : 0;
    const slowestChunk =
      allDurations.length > 0 ? Math.max(...allDurations) : 0;

    this.logger.info('Concurrent processing completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_concurrent',
      totalDuration,
      chunksProcessed: settledResults.length,
      successCount: successful.length,
      failureCount: failed.length,
      successRate: (successful.length / settledResults.length) * 100,
      topCommentsProcessed: topCommentsCount,
      averageChunkTime,
      fastestChunk,
      slowestChunk,
      totalMentions: successfulResults.reduce(
        (sum, r) => sum + r.mentions.length,
        0,
      ),
    });

    // Log failures for debugging
    if (failed.length > 0) {
      this.logger.warn('Some chunks failed processing', {
        correlationId: CorrelationUtils.getCorrelationId(),
        failedChunks: failed.map((f) => ({
          chunkId: f.chunkId,
          commentCount: f.commentCount,
          error: f.error instanceof Error ? f.error.message : String(f.error),
        })),
      });
    }

    return {
      results: successfulResults,
      failures: failed,
      metrics: {
        totalDuration,
        chunksProcessed: settledResults.length,
        successRate: (successful.length / settledResults.length) * 100,
        topCommentsCount,
        averageChunkTime,
        fastestChunk,
        slowestChunk,
      },
    };
  }

  /**
   * Get current queue status from p-limit
   *
   * @returns Queue status information
   */
  getQueueStatus(): {
    activeCount: number;
    pendingCount: number;
    concurrencyLimit: number;
  } {
    return {
      activeCount: this.limit.activeCount,
      pendingCount: this.limit.pendingCount,
      concurrencyLimit: this.concurrencyLimit,
    };
  }

  /**
   * Validate that the LLM output structure contains all vital fields
   *
   * @param output - LLM flat output structure
   * @param chunkId - Chunk ID for error context
   */
  private validateOutputStructure(
    output: LLMOutputStructure,
    chunkId: string,
  ): void {
    if (!output || !output.mentions) {
      throw new Error(
        `Invalid output structure for chunk ${chunkId}: missing mentions array`,
      );
    }

    for (const mention of output.mentions) {
      // Check vital fields
      if (
        mention.dish_primary_category &&
        mention.dish_is_menu_item === undefined
      ) {
        this.logger.warn('Missing vital field: dish_is_menu_item', {
          chunkId,
          mentionId: mention.temp_id,
          hasDish: !!mention.dish_primary_category,
        });
      }

      if (mention.general_praise === undefined) {
        throw new Error(
          `Missing vital field: general_praise in chunk ${chunkId}, mention ${mention.temp_id}`,
        );
      }

      if (!mention.restaurant_temp_id) {
        throw new Error(
          `Missing vital field: restaurant_temp_id in chunk ${chunkId}, mention ${mention.temp_id}`,
        );
      }

      if (!mention.source_id) {
        throw new Error(
          `Missing vital field: source_id in chunk ${chunkId}, mention ${mention.temp_id}`,
        );
      }
    }
  }

  /**
   * Get performance statistics for monitoring
   *
   * @returns Performance statistics
   */
  getPerformanceStats(): {
    concurrencyLimit: number;
    currentlyActive: number;
    currentlyPending: number;
    utilizationRate: number;
  } {
    const utilizationRate = this.limit.activeCount / this.concurrencyLimit;

    return {
      concurrencyLimit: this.concurrencyLimit,
      currentlyActive: this.limit.activeCount,
      currentlyPending: this.limit.pendingCount,
      utilizationRate,
    };
  }
}
