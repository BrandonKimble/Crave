import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import pLimit from 'p-limit';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMService } from './llm.service';
import { LLMOutputStructure } from './llm.types';
import { ChunkResult, ChunkMetadata } from './llm-chunking.service';
// LLMPerformanceOptimizerService removed - optimization handled by SmartLLMProcessor
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
 * Simplified concurrency coordinator that delegates to SmartLLMProcessor:
 * - Controls worker concurrency using p-limit (16 workers max)
 * - Distributes chunks to SmartLLMProcessor with worker IDs
 * - Aggregates results and provides metrics
 * - All rate limiting handled by SmartLLMProcessor
 * - Simple coordination without redundant timing logic
 */
@Injectable()
export class LLMConcurrentProcessingService implements OnModuleInit {
  private logger!: LoggerService;
  private limit!: ReturnType<typeof pLimit>;
  private concurrencyLimit: number = 16; // default; can be overridden by CONCURRENCY env
  private readonly delayStrategy: 'none' | 'linear' = 'none'; // Simplified - no artificial delays
  private readonly delayMs: number = 0; // No delays - SmartLLMProcessor handles timing
  private backpressureUntil = 0;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(SmartLLMProcessor)
    private readonly smartProcessor: SmartLLMProcessor,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LlmConcurrentProcessing');
    const envConc = parseInt(process.env.CONCURRENCY || '', 10);
    if (!isNaN(envConc) && envConc > 0) {
      this.concurrencyLimit = envConc;
    }
    this.limit = pLimit(this.concurrencyLimit);

    this.logger.info('LLM Concurrent Processing Service initialized', {
      concurrencyLimit: this.concurrencyLimit,
      rateLimitingMode: 'delegated_to_smart_processor',
    });
  }

  /**
   * Optimize concurrency settings based on actual performance testing
   * Note: Rate limiting optimization is handled by SmartLLMProcessor
   */
  async optimizeConfiguration(
    sampleChunks: ChunkResult,
    llmService: LLMService,
    options: {
      maxWorkers?: number;
      testDurationLimitMs?: number;
    } = {},
  ): Promise<void> {
    this.logger.info(
      'Concurrency optimization delegated to SmartLLMProcessor',
      {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'optimize_configuration',
        concurrencyLimit: this.concurrencyLimit,
        note: 'Rate limiting optimization handled by SmartLLMProcessor',
      },
    );

    // No-op: SmartLLMProcessor handles all rate limiting optimization
    // This service only manages concurrency via pLimit
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
      rateLimitingMode: 'delegated_to_smart_processor',
      topRootScores: metadata.slice(0, 5).map((m) => m.rootCommentScore),
    });

    // Process chunks with concurrency control and optional delay strategy
    // p-limit naturally handles variable processing times
    const promises = chunks.map((chunk, index) =>
      this.limit(async (): Promise<ChunkProcessingResult> => {
        // No artificial delays - SmartLLMProcessor handles all timing
        // Workers start immediately and wait for their reserved time slots

        const chunkStart = Date.now();
        const meta = metadata[index];

        await this.waitForGlobalCooldown(meta);

        const throttleDelay = this.smartProcessor.getThrottleDelayMs();
        if (throttleDelay > 0) {
          const proposedUntil = Date.now() + throttleDelay;
          if (proposedUntil > this.backpressureUntil) {
            this.backpressureUntil = proposedUntil;
          }
          this.logger.warn('Global backpressure triggered before dispatch', {
            correlationId: CorrelationUtils.getCorrelationId(),
            chunkId: meta.chunkId,
            delayMs: throttleDelay,
            backpressureUntil: new Date(this.backpressureUntil).toISOString(),
          });
          await this.waitForGlobalCooldown(meta);
        }

        this.logger.info('Starting chunk processing', {
          correlationId: CorrelationUtils.getCorrelationId(),
          chunkId: meta.chunkId,
          position: index + 1,
          totalChunks: chunks.length,
          commentCount: meta.commentCount,
          rootScore: meta.rootCommentScore,
          estimatedTime: meta.estimatedProcessingTime,
          chunkSize: `${meta.commentCount} comments`,
        });

        try {

          // Use smart processor with worker ID for perfect rate limiting
          const workerId = `worker-${index % 16}`; // Distribute across 16 worker IDs
          const result = await this.smartProcessor.processContent(
            chunk,
            llmService,
            workerId,
          );
          const duration = (Date.now() - chunkStart) / 1000;

          // Validate all vital fields are present
          this.validateOutputStructure(result, meta.chunkId);

          this.logger.info('Chunk processing completed', {
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
        burstRate: 0, // Not applicable - SmartLLMProcessor handles timing
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

  private async waitForGlobalCooldown(meta: ChunkMetadata): Promise<void> {
    let logged = false;
    while (true) {
      const remaining = this.backpressureUntil - Date.now();
      if (remaining <= 0) return;
      const sleepMs = Math.min(remaining, 2000);
      if (!logged) {
        this.logger.warn('Global backpressure active; delaying chunk dispatch', {
          correlationId: CorrelationUtils.getCorrelationId(),
          chunkId: meta.chunkId,
          remainingMs: remaining,
        });
        logged = true;
      }
      await this.sleep(sleepMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (mention.food_name && mention.is_menu_item === undefined) {
        this.logger.warn('Missing vital field: is_menu_item', {
          chunkId,
          mentionId: mention.temp_id,
          hasFood: !!mention.food_name,
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

  // REMOVED: All delay strategy logic
  // Rate limiting is now handled by SmartLLMProcessor's reservation system
  // which provides more precise timing than artificial delays

  // REMOVED: Burst rate calculation
  // SmartLLMProcessor handles all rate limiting calculations

  /**
   * Get current configuration for monitoring and debugging
   */
  getCurrentConfiguration(): {
    workerCount: number;
    rateLimitingMode: string;
    note: string;
  } {
    return {
      workerCount: this.concurrencyLimit,
      rateLimitingMode: 'delegated_to_smart_processor',
      note: 'All rate limiting handled by SmartLLMProcessor reservation system',
    };
  }
}
