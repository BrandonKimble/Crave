import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import pLimit from 'p-limit';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMService } from './llm.service';
import { LLMOutputStructure } from './llm.types';
import { ChunkResult, ChunkMetadata } from './llm-chunking.service';
import { LLMPerformanceOptimizerService } from './llm-performance-optimizer.service';
import { SmartLLMProcessor } from './rate-limiting/smart-llm-processor.service';

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
  configuration?: {
    workerCount: number;
    delayStrategy: string;
    delayMs: number;
    burstRate: number;
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
  private concurrencyLimit: number = 24; // Optimized for TPM limits: 24w/linear/50ms
  private delayStrategy: 'none' | 'linear' | 'exponential' | 'jittered' = 'linear';
  private delayMs: number = 50;
  private isOptimized: boolean = true; // Pre-configured with optimized settings

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(LLMPerformanceOptimizerService) private readonly optimizer: LLMPerformanceOptimizerService,
    @Inject(SmartLLMProcessor) private readonly smartProcessor: SmartLLMProcessor,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LlmConcurrentProcessing');
    this.limit = pLimit(this.concurrencyLimit);

    this.logger.info('LLM Concurrent Processing Service initialized', {
      concurrencyLimit: this.concurrencyLimit,
      optimized: this.isOptimized,
    });
  }

  /**
   * Optimize concurrency settings based on actual performance testing
   */
  async optimizeConfiguration(
    sampleChunks: ChunkResult,
    llmService: LLMService,
    options: {
      maxWorkers?: number;
      testDurationLimitMs?: number;
    } = {}
  ): Promise<void> {
    this.logger.info('Starting performance optimization', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'optimize_configuration',
      currentConfig: {
        workerCount: this.concurrencyLimit,
        delayStrategy: this.delayStrategy,
        delayMs: this.delayMs
      }
    });

    try {
      const optimal = await this.optimizer.findOptimalConfiguration(
        sampleChunks,
        llmService,
        options
      );

      // Update configuration
      this.concurrencyLimit = optimal.workerCount;
      this.delayStrategy = optimal.delayStrategy;
      this.delayMs = optimal.delayMs;
      this.isOptimized = true;

      // Recreate p-limit with new concurrency
      this.limit = pLimit(this.concurrencyLimit);

      this.logger.info('Performance optimization completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'optimize_configuration',
        optimalConfig: optimal,
        previousWorkerCount: 16,
        newWorkerCount: this.concurrencyLimit
      });

    } catch (error) {
      this.logger.error('Performance optimization failed, keeping current configuration', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'optimize_configuration',
        error: error instanceof Error ? error.message : String(error)
      });
    }
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
      delayStrategy: this.delayStrategy,
      delayMs: this.delayMs,
      isOptimized: this.isOptimized,
      topRootScores: metadata.slice(0, 5).map((m) => m.rootCommentScore),
    });

    // Process chunks with concurrency control and optional delay strategy
    // p-limit naturally handles variable processing times
    const promises = chunks.map((chunk, index) =>
      this.limit(async (): Promise<ChunkProcessingResult> => {
        // Apply delay strategy to stagger request initiation
        await this.applyDelayStrategy(index);
        
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
          // Use smart processor with worker ID for perfect rate limiting
          const workerId = `worker-${index % 24}`; // Distribute across 24 worker IDs
          const result = await this.smartProcessor.processContent(chunk, llmService, workerId);
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
            rateLimitWait: result.rateLimitInfo?.waitTimeMs || 0,
            tpmUtilization: result.rateLimitInfo?.tpmUtilization || 0,
            rpmUtilization: result.rateLimitInfo?.rpmUtilization || 0,
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
      configuration: {
        workerCount: this.concurrencyLimit,
        delayStrategy: this.delayStrategy,
        delayMs: this.delayMs,
        burstRate: this.calculateBurstRate(this.concurrencyLimit, this.delayMs, this.delayStrategy),
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

  /**
   * Apply delay strategy before starting request to stagger worker initiation
   * Enhanced with RPM protection for Gemini Tier 1 limits (1000 RPM = 16.67 req/sec)
   */
  private async applyDelayStrategy(workerIndex: number): Promise<void> {
    let delayMs = 0;

    // PHASE 1: Initial worker staggering (existing logic)
    if (this.delayStrategy !== 'none' && this.delayMs > 0) {
      switch (this.delayStrategy) {
        case 'linear':
          // Linear spacing: 0ms, 50ms, 100ms, 150ms...
          delayMs = workerIndex * this.delayMs;
          break;
        
        case 'exponential':
          // Exponential spacing: 0ms, 50ms, 75ms, 112ms...
          delayMs = this.delayMs * Math.pow(1.5, workerIndex);
          break;
        
        case 'jittered':
          // Linear + random jitter to avoid thundering herd
          const jitter = Math.random() * this.delayMs;
          delayMs = (workerIndex * this.delayMs) + jitter;
          break;
      }
    }

    // PHASE 2: RPM protection - add minimum spacing to prevent rate limits
    // Target: Stay under 15 req/sec to provide safety margin below 16.67 req/sec limit
    const minRpmDelay = 75; // 75ms minimum = max ~13.3 req/sec per worker
    delayMs = Math.max(delayMs, minRpmDelay);

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Calculate theoretical burst rate based on configuration
   */
  private calculateBurstRate(
    workerCount: number, 
    delayMs: number, 
    strategy: string
  ): number {
    if (strategy === 'none' || delayMs === 0) {
      // All workers start simultaneously
      return workerCount / 0.01; // 16 workers in 10ms = 1600 req/sec
    }

    let totalSpreadMs = 0;
    switch (strategy) {
      case 'linear':
        totalSpreadMs = (workerCount - 1) * delayMs;
        break;
      case 'exponential':
        totalSpreadMs = delayMs * Math.pow(1.5, workerCount - 1);
        break;
      case 'jittered':
        totalSpreadMs = (workerCount - 1) * delayMs + delayMs; // worst case
        break;
    }

    // Convert to seconds and calculate rate
    const totalSpreadSeconds = Math.max(totalSpreadMs / 1000, 0.01);
    return workerCount / totalSpreadSeconds;
  }

  /**
   * Get current configuration for monitoring and debugging
   */
  getCurrentConfiguration(): {
    workerCount: number;
    delayStrategy: string;
    delayMs: number;
    isOptimized: boolean;
    burstRate: number;
  } {
    return {
      workerCount: this.concurrencyLimit,
      delayStrategy: this.delayStrategy,
      delayMs: this.delayMs,
      isOptimized: this.isOptimized,
      burstRate: this.calculateBurstRate(this.concurrencyLimit, this.delayMs, this.delayStrategy),
    };
  }
}
