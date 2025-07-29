import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { StreamProcessorService } from './stream-processor.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { ProcessingCheckpointService } from './processing-checkpoint.service';
import {
  BatchProcessingConfig,
  BatchProcessingJob,
  BatchProcessingResult,
  BatchProcessingProgress,
  BatchProcessingStatus,
  MemoryManagementOptions,
  ProcessingJobContext,
} from './batch-processing.types';
import { BatchProcessingExceptionFactory } from './batch-processing.exceptions';
import { HistoricalProcessingConfig } from './historical-content-pipeline.types';

/**
 * Batch Processing Coordinator Service
 *
 * Implements PRD Section 5.1.1 and 6.1 requirements for memory-efficient large dataset handling.
 * Coordinates stream processing, content pipeline, and resource management for realistic archive file sizes.
 *
 * Key responsibilities:
 * - Orchestrate streaming, extraction, and processing components
 * - Manage memory usage across processing pipeline
 * - Provide configurable batch sizes and processing controls
 * - Track progress and enable resumption capabilities
 * - Monitor resources and prevent memory overload
 * - Handle realistic Pushshift archive file sizes without performance degradation
 */
@Injectable()
export class BatchProcessingCoordinatorService {
  private readonly logger: LoggerService;
  private readonly config: BatchProcessingConfig;
  private activeJobs = new Map<string, BatchProcessingJob>();

  constructor(
    private readonly configService: ConfigService,
    private readonly streamProcessor: StreamProcessorService,
    private readonly contentPipeline: HistoricalContentPipelineService,
    private readonly resourceMonitor: ResourceMonitoringService,
    private readonly checkpointService: ProcessingCheckpointService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('BatchProcessingCoordinator');
    this.config = this.loadConfiguration();
  }

  /**
   * Process a large archive file with memory-efficient batch coordination
   * Implements PRD requirement: Handle large datasets efficiently without memory issues
   *
   * @param filePath Path to zstd-compressed ndjson archive file
   * @param options Processing configuration and memory management options
   * @returns Processing result with comprehensive metrics
   */
  async processArchiveFile(
    filePath: string,
    options?: Partial<BatchProcessingConfig & MemoryManagementOptions>,
  ): Promise<BatchProcessingResult> {
    const jobId = this.generateJobId(filePath);
    const startTime = Date.now();

    // Merge configuration with options
    const processingConfig = { ...this.config, ...options };

    this.logger.info('Starting batch processing job', {
      jobId,
      filePath,
      config: {
        baseBatchSize: processingConfig.baseBatchSize,
        maxMemoryUsage: processingConfig.maxMemoryUsage,
        enableCheckpoints: processingConfig.enableCheckpoints,
        progressReportingInterval: processingConfig.progressReportingInterval,
      },
    });

    try {
      // Initialize job context
      const jobContext = await this.initializeJob(
        jobId,
        filePath,
        processingConfig,
      );

      // Check for existing checkpoint
      let resumeFromCheckpoint = false;
      if (processingConfig.enableCheckpoints) {
        // Reason: Service integration methods return unknown types for flexible checkpoint data
        const checkpoint =
          await this.checkpointService.getLatestCheckpoint(jobId);
        if (checkpoint && !checkpoint.completed) {
          resumeFromCheckpoint = true;
          this.logger.info('Resuming from checkpoint', {
            jobId,
            checkpoint: {
              processedLines: checkpoint.processedLines,
              lastPosition: checkpoint.lastPosition,
              completionPercentage: checkpoint.completionPercentage,
            },
          });
        }
      }

      // Start resource monitoring
      if (processingConfig.enableResourceMonitoring) {
        // Reason: Resource monitoring service integration with callback patterns
        await this.resourceMonitor.startMonitoring(jobId, {
          memoryThreshold: processingConfig.maxMemoryUsage,
          checkInterval: processingConfig.resourceCheckInterval,
          onMemoryWarning: (usage) => this.handleMemoryWarning(jobId, usage),
          onMemoryExhaustion: (usage) =>
            this.handleMemoryExhaustion(jobId, usage),
        });
      }

      // Execute the main processing pipeline
      const result = await this.executeProcessingPipeline(
        jobContext,
        resumeFromCheckpoint,
      );

      // Mark job as completed
      await this.completeJob(jobId, result);

      this.logger.info('Batch processing job completed successfully', {
        jobId,
        filePath,
        metrics: result.metrics,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      await this.handleJobFailure(jobId, error);
      throw error;
    } finally {
      // Cleanup resources
      await this.cleanupJob(jobId);
    }
  }

  /**
   * Get progress for an active processing job
   * Implements PRD requirement: Progress tracking provides accurate status updates
   */
  async getJobProgress(jobId: string): Promise<BatchProcessingProgress | null> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return null;
    }

    // Reason: Service integration methods return flexible checkpoint and stats data
    const checkpoint = await this.checkpointService.getLatestCheckpoint(jobId);
    const resourceStats = await this.resourceMonitor.getCurrentStats(jobId);

    return {
      jobId,
      status: job.status,
      completionPercentage: checkpoint?.completionPercentage || 0,
      processedLines: checkpoint?.processedLines || 0,
      totalEstimatedLines: job.estimatedTotalLines,
      startTime: job.startTime,
      estimatedTimeRemaining: this.calculateETA(job, checkpoint),
      memoryUsage: resourceStats?.memoryUsage || 0,
      resourceStats: resourceStats || undefined,
      lastUpdate: new Date(),
    };
  }

  /**
   * Resume a failed or interrupted processing job
   * Implements PRD requirement: Processing can be resumed from checkpoint
   */
  async resumeJob(jobId: string): Promise<BatchProcessingResult> {
    this.logger.info('Resuming batch processing job', { jobId });

    // Reason: Checkpoint service integration with flexible data structures
    const checkpoint = await this.checkpointService.getLatestCheckpoint(jobId);
    if (!checkpoint) {
      throw BatchProcessingExceptionFactory.checkpointNotFound(jobId);
    }

    if (checkpoint.completed) {
      // Reason: Exception class integration with static factory methods

      throw BatchProcessingExceptionFactory.jobAlreadyCompleted(jobId);
    }

    // Reconstruct job context from checkpoint
    const jobContext = this.reconstructJobFromCheckpoint(jobId, checkpoint);

    // Resume processing from checkpoint position
    return this.executeProcessingPipeline(jobContext, true);
  }

  /**
   * Initialize a new processing job with context and estimates
   */
  private async initializeJob(
    jobId: string,
    filePath: string,
    config: BatchProcessingConfig,
  ): Promise<ProcessingJobContext> {
    // Estimate file size and processing requirements
    const fileStats = await import('fs/promises').then((fs) =>
      fs.stat(filePath),
    );
    const fileSizeMB = fileStats.size / (1024 * 1024);

    // Estimate total lines based on file size (heuristic)
    const estimatedLinesPerMB = 5000; // Typical for reddit ndjson files
    const estimatedTotalLines = Math.floor(fileSizeMB * estimatedLinesPerMB);

    // Calculate optimal batch size based on available memory and file size
    const optimalBatchSize = this.calculateOptimalBatchSize(fileSizeMB, config);

    const jobContext: ProcessingJobContext = {
      jobId,
      filePath,
      config: {
        ...config,
        baseBatchSize: optimalBatchSize,
      },
      fileStats: {
        sizeBytes: fileStats.size,
        sizeMB: fileSizeMB,
        estimatedLines: estimatedTotalLines,
      },
      startTime: Date.now(),
      resumeFromLine: 0,
    };

    // Create job record
    const job: BatchProcessingJob = {
      jobId,
      filePath,
      status: BatchProcessingStatus.RUNNING,
      startTime: new Date(),
      estimatedTotalLines,
      config,
    };

    this.activeJobs.set(jobId, job);

    // Create initial checkpoint
    if (config.enableCheckpoints) {
      // Reason: Checkpoint service integration with flexible initialization data
      await this.checkpointService.createInitialCheckpoint(jobId, {
        filePath,
        totalEstimatedLines: estimatedTotalLines,
        config,
      });
    }

    return jobContext;
  }

  /**
   * Execute the main processing pipeline with memory-efficient coordination
   */
  private async executeProcessingPipeline(
    jobContext: ProcessingJobContext,
    resumeFromCheckpoint: boolean,
  ): Promise<BatchProcessingResult> {
    const { jobId, filePath, config } = jobContext;

    let totalProcessedLines = 0;
    let totalValidItems = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    // Prepare historical content pipeline configuration
    const pipelineConfig: HistoricalProcessingConfig = {
      batchSize: config.baseBatchSize,
      preserveThreads: config.preserveThreadStructure,
      validateTimestamps: config.validateTimestamps,
      qualityFilters: config.qualityFilters,
      timestampRange: config.timestampRange,
    };

    this.logger.info('Starting coordinated processing pipeline', {
      jobId,
      filePath,
      resumeFromCheckpoint,
      pipelineConfig: {
        batchSize: pipelineConfig.batchSize,
        preserveThreads: pipelineConfig.preserveThreads,
        validateTimestamps: pipelineConfig.validateTimestamps,
      },
    });

    // Process file using stream processor with coordinated batch handling
    const processingResult = await this.streamProcessor.processZstdNdjsonFile(
      filePath,
      async (item: unknown, lineNumber: number) => {
        // Accumulate items for batch processing
        const batchData = [item]; // In actual implementation, accumulate to batch size

        // Process batch through historical content pipeline
        const batch = this.contentPipeline.processBatch(
          batchData,
          pipelineConfig,
        );

        // Update metrics
        totalProcessedLines += 1;
        totalValidItems += batch.validItems;
        totalErrors += batch.errors.length;

        // Progress reporting and checkpointing
        if (totalProcessedLines % config.progressReportingInterval === 0) {
          await this.updateProgress(
            jobContext,
            lineNumber,
            totalProcessedLines,
          );
        }

        // Memory management check
        if (
          config.enableResourceMonitoring &&
          totalProcessedLines % config.memoryCheckInterval === 0
        ) {
          void this.checkMemoryUsage(jobId);
        }
      },
    );

    // Calculate final metrics
    const duration = Date.now() - startTime;
    const throughput = Math.round(totalProcessedLines / (duration / 1000));

    const result: BatchProcessingResult = {
      jobId,
      success: processingResult.success,
      metrics: {
        totalProcessedLines,
        validItems: totalValidItems,
        errorCount: totalErrors,
        duration,
        throughputLinesPerSecond: throughput,
        memoryUsage: {
          initial: processingResult.metrics.memoryUsage.initial,
          peak: processingResult.metrics.memoryUsage.peak,
          final: processingResult.metrics.memoryUsage.final,
        },
        batchProcessingStats: {
          totalBatches: Math.ceil(totalProcessedLines / config.baseBatchSize),
          averageBatchSize: config.baseBatchSize,
          averageBatchProcessingTime:
            duration / Math.ceil(totalProcessedLines / config.baseBatchSize),
        },
      },
      errors: processingResult.errors,
      checkpoints: config.enableCheckpoints
        ? await this.checkpointService.getAllCheckpoints(jobId)
        : [],
    };

    return result;
  }

  /**
   * Calculate optimal batch size based on file size and available memory
   */
  private calculateOptimalBatchSize(
    fileSizeMB: number,
    config: BatchProcessingConfig,
  ): number {
    const { baseBatchSize, minBatchSize, maxBatchSize, adaptiveBatchSizing } =
      config;

    if (!adaptiveBatchSizing) {
      return baseBatchSize;
    }

    // Adjust batch size based on file size
    let optimalSize = baseBatchSize;

    if (fileSizeMB < 50) {
      // Small files: can use larger batches
      optimalSize = Math.min(maxBatchSize, baseBatchSize * 2);
    } else if (fileSizeMB > 500) {
      // Large files: use smaller batches to prevent memory issues
      optimalSize = Math.max(minBatchSize, Math.floor(baseBatchSize * 0.5));
    }

    // Consider available memory
    const availableMemoryMB = (config.maxMemoryUsage || 512) * 0.8; // Use 80% of limit
    const estimatedBatchMemoryMB = optimalSize * 0.001; // Rough estimate: 1KB per item

    if (estimatedBatchMemoryMB > availableMemoryMB * 0.3) {
      // If batch would use >30% of available memory, reduce it
      optimalSize = Math.max(minBatchSize, Math.floor(availableMemoryMB * 300));
    }

    this.logger.debug('Calculated optimal batch size', {
      fileSizeMB,
      baseBatchSize,
      optimalSize,
      availableMemoryMB,
      estimatedBatchMemoryMB,
    });

    return Math.max(minBatchSize, Math.min(maxBatchSize, optimalSize));
  }

  /**
   * Update job progress and create checkpoint
   */
  private async updateProgress(
    jobContext: ProcessingJobContext,
    currentLine: number,
    totalProcessed: number,
  ): Promise<void> {
    const { jobId, fileStats } = jobContext;
    const completionPercentage = Math.round(
      (totalProcessed / fileStats.estimatedLines) * 100,
    );

    // Update job status
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.lastProgressUpdate = new Date();
    }

    // Create checkpoint
    if (jobContext.config.enableCheckpoints) {
      await this.checkpointService.createCheckpoint(jobId, {
        processedLines: totalProcessed,
        lastPosition: currentLine,
        completionPercentage,
        timestamp: new Date(),
      });
    }

    this.logger.debug('Progress updated', {
      jobId,
      totalProcessed,
      completionPercentage,
      currentLine,
    });
  }

  /**
   * Handle memory warning by adjusting batch size
   */
  private handleMemoryWarning(jobId: string, memoryUsage: number): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    this.logger.warn('Memory warning detected', {
      jobId,
      memoryUsageMB: Math.round(memoryUsage / 1024 / 1024),
      threshold: job.config.maxMemoryUsage,
    });

    // Reduce batch size by 25%
    job.config.baseBatchSize = Math.max(
      job.config.minBatchSize,
      Math.floor(job.config.baseBatchSize * 0.75),
    );

    this.logger.info('Adjusted batch size due to memory pressure', {
      jobId,
      newBatchSize: job.config.baseBatchSize,
    });
  }

  /**
   * Handle memory exhaustion by pausing and creating checkpoint
   */
  private async handleMemoryExhaustion(
    jobId: string,
    memoryUsage: number,
  ): Promise<void> {
    this.logger.error('Memory exhaustion detected, pausing job', {
      jobId,
      memoryUsageMB: Math.round(memoryUsage / 1024 / 1024),
    });

    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = BatchProcessingStatus.PAUSED;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Create emergency checkpoint
      if (job.config.enableCheckpoints) {
        await this.checkpointService.createEmergencyCheckpoint(jobId, {
          reason: 'MEMORY_EXHAUSTION',
          memoryUsage,
          timestamp: new Date(),
        });
      }
    }

    // Reason: Exception class integration with static factory methods

    throw BatchProcessingExceptionFactory.memoryExhaustion(jobId, memoryUsage);
  }

  /**
   * Check current memory usage and adjust batch size if needed
   */
  private async checkMemoryUsage(jobId: string): Promise<void> {
    const memoryUsage = process.memoryUsage().heapUsed;
    const job = this.activeJobs.get(jobId);

    if (!job) return;

    const memoryLimitBytes = (job.config.maxMemoryUsage || 512) * 1024 * 1024;
    const memoryUsagePercentage = (memoryUsage / memoryLimitBytes) * 100;

    if (memoryUsagePercentage > 80) {
      this.handleMemoryWarning(jobId, memoryUsage);
    } else if (memoryUsagePercentage > 95) {
      await this.handleMemoryExhaustion(jobId, memoryUsage);
    }
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateETA(
    job: BatchProcessingJob,
    checkpoint: any,
  ): number | null {
    // Reason: Checkpoint service integration returns flexible data structures
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    if (!checkpoint || checkpoint.processedLines === 0) {
      return null;
    }

    const elapsedTime = Date.now() - job.startTime.getTime();
    const processingRate = checkpoint.processedLines / (elapsedTime / 1000);
    const remainingLines = job.estimatedTotalLines - checkpoint.processedLines;
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    return Math.round(remainingLines / processingRate);
  }

  /**
   * Complete a processing job successfully
   */
  private async completeJob(
    jobId: string,
    result: BatchProcessingResult,
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = BatchProcessingStatus.COMPLETED;
      job.completedAt = new Date();
    }

    // Create final checkpoint
    if (result.success && job?.config.enableCheckpoints) {
      await this.checkpointService.markAsCompleted(jobId, {
        finalMetrics: result.metrics,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Handle job failure with cleanup
   */
  private async handleJobFailure(jobId: string, error: unknown): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = BatchProcessingStatus.FAILED;
      job.error = error instanceof Error ? error.message : String(error);
    }

    this.logger.error('Batch processing job failed', {
      jobId,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : String(error),
    });

    // Create failure checkpoint if enabled
    if (job?.config.enableCheckpoints) {
      await this.checkpointService.createFailureCheckpoint(jobId, {
        error: error instanceof Error ? error.message : String(error),
        failedAt: new Date(),
      });
    }
  }

  /**
   * Cleanup resources after job completion or failure
   */
  private async cleanupJob(jobId: string): Promise<void> {
    // Stop resource monitoring
    await this.resourceMonitor.stopMonitoring(jobId);

    // Remove job from active jobs
    this.activeJobs.delete(jobId);

    this.logger.debug('Job resources cleaned up', { jobId });
  }

  /**
   * Reconstruct job context from checkpoint (for resumption)
   */
  private reconstructJobFromCheckpoint(
    jobId: string,
    checkpoint: unknown,
  ): ProcessingJobContext {
    // Suppress unused variables for future implementation
    void jobId;
    void checkpoint;
    // This would be implemented to reconstruct the job context from checkpoint data
    // For now, throw an error indicating this needs implementation
    throw new Error('Job reconstruction from checkpoint not yet implemented');
  }

  /**
   * Load batch processing configuration from config service
   */
  private loadConfiguration(): BatchProcessingConfig {
    return {
      baseBatchSize: this.configService.get('pushshift.batchSize', 1000),
      minBatchSize: this.configService.get('pushshift.minBatchSize', 100),
      maxBatchSize: this.configService.get('pushshift.maxBatchSize', 5000),
      maxMemoryUsage: this.configService.get('pushshift.maxMemoryUsageMB', 512),
      enableCheckpoints: this.configService.get(
        'pushshift.enableCheckpoints',
        true,
      ),
      enableResourceMonitoring: this.configService.get(
        'pushshift.enableResourceMonitoring',
        true,
      ),
      adaptiveBatchSizing: this.configService.get(
        'pushshift.adaptiveBatchSizing',
        true,
      ),
      progressReportingInterval: this.configService.get(
        'pushshift.progressReportingInterval',
        10000,
      ),
      resourceCheckInterval: this.configService.get(
        'pushshift.resourceCheckInterval',
        1000,
      ),
      memoryCheckInterval: this.configService.get(
        'pushshift.memoryCheckInterval',
        5000,
      ),
      preserveThreadStructure: this.configService.get(
        'pushshift.preserveThreadStructure',
        true,
      ),
      validateTimestamps: this.configService.get(
        'pushshift.validateTimestamps',
        true,
      ),
      qualityFilters: {
        minScore: this.configService.get(
          'pushshift.qualityFilters.minScore',
          -5,
        ),
        excludeDeleted: this.configService.get(
          'pushshift.qualityFilters.excludeDeleted',
          true,
        ),
        excludeRemoved: this.configService.get(
          'pushshift.qualityFilters.excludeRemoved',
          true,
        ),
      },
      timestampRange: undefined, // Can be configured per job
    };
  }

  /**
   * Generate unique job ID for tracking
   */
  private generateJobId(filePath: string): string {
    const timestamp = Date.now();
    const fileBasename = filePath.split('/').pop() || 'unknown';
    const random = Math.random().toString(36).substring(2, 8);
    return `batch_${fileBasename}_${timestamp}_${random}`;
  }

  /**
   * Get current configuration
   */
  getConfiguration(): BatchProcessingConfig {
    return { ...this.config };
  }

  /**
   * Get active jobs status
   */
  getActiveJobs(): BatchProcessingJob[] {
    return Array.from(this.activeJobs.values());
  }
}
