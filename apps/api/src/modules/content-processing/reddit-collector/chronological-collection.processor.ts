import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  ChronologicalCollectionService,
  ChronologicalCollectionResult,
} from './chronological-collection.service';
import { CollectionSchedulingService } from './collection-scheduling.service';

export interface ChronologicalCollectionJobData {
  subreddits: string[];
  jobId: string;
  triggeredBy: 'scheduled' | 'manual' | 'gap_detection';
  options?: {
    lastProcessedTimestamp?: number;
    limit?: number;
    retryCount?: number;
  };
}

export interface ChronologicalCollectionJobResult {
  success: boolean;
  jobId: string;
  results?: Record<string, ChronologicalCollectionResult>;
  totalPostsCollected: number;
  processingTime: number;
  error?: string;
  nextScheduledCollection?: Date;
}

/**
 * Chronological Collection Processor
 *
 * Implements PRD Section 5.1.2: Background job processing for chronological collection cycles
 * Handles Bull queue jobs for scheduled Reddit data collection with error handling and retry logic.
 *
 * Key responsibilities:
 * - Process scheduled chronological collection jobs
 * - Handle retry logic for failed collections
 * - Update scheduling configurations based on results
 * - Provide comprehensive error handling and logging
 * - Ensure collection continuity with last_processed_timestamp tracking
 */
@Processor('chronological-collection')
@Injectable()
export class ChronologicalCollectionProcessor implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly chronologicalCollection: ChronologicalCollectionService,
    private readonly schedulingService: CollectionSchedulingService,
    private readonly loggerService: LoggerService,
  
  ) {} 

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ChronologicalCollectionProcessor');
  }

  /**
   * Process chronological collection job
   * Implements error handling and retry logic for collection failures
   */
  @Process('execute-chronological-collection')
  async processChronologicalCollection(
    job: Job<ChronologicalCollectionJobData>,
  ): Promise<ChronologicalCollectionJobResult> {
    const { subreddits, jobId, triggeredBy, options = {} } = job.data;
    const correlationId = CorrelationUtils.generateCorrelationId();
    const startTime = Date.now();

    this.logger.info('Processing chronological collection job', {
      correlationId,
      operation: 'process_chronological_job',
      jobId,
      subreddits,
      triggeredBy,
      options,
    });

    try {
      // Execute chronological collection
      const collectionResult =
        await this.chronologicalCollection.executeCollection(subreddits, {
          lastProcessedTimestamp: options.lastProcessedTimestamp,
          limit: options.limit || 100,
          includeComments: true,
        });

      // Update scheduling configurations based on collection results
      this.updateSchedulingFromResults(subreddits, collectionResult.results);

      // Calculate next scheduled collection times
      const nextScheduledCollection =
        this.getEarliestNextCollection(subreddits);

      const result: ChronologicalCollectionJobResult = {
        success: true,
        jobId,
        results: collectionResult.results,
        totalPostsCollected: collectionResult.totalPostsCollected,
        processingTime: Date.now() - startTime,
        nextScheduledCollection,
      };

      this.logger.info('Chronological collection job completed successfully', {
        correlationId,
        result: {
          ...result,
          results: undefined, // Exclude detailed results from log for brevity
        },
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
        subreddits,
      });

      // Implement retry logic
      if (retryCount < 3) {
        // Max 3 retries
        this.logger.info('Scheduling retry for failed collection job', {
          correlationId,
          jobId,
          retryCount: retryCount + 1,
        });

        // Update job data with incremented retry count for next attempt
        job.data.options = {
          ...options,
          retryCount: retryCount + 1,
        };

        // Throw error to trigger Bull's built-in retry mechanism
        throw error;
      }

      const result: ChronologicalCollectionJobResult = {
        success: false,
        jobId,
        totalPostsCollected: 0,
        processingTime: Date.now() - startTime,
        error: errorMessage,
      };

      return result;
    }
  }

  /**
   * Update scheduling configurations based on collection results
   * Adjusts posting volume estimates for better future scheduling
   */
  private updateSchedulingFromResults(
    subreddits: string[],
    results: Record<string, ChronologicalCollectionResult>,
  ): void {
    for (const subreddit of subreddits) {
      const result = results[subreddit];
      if (!result || !result.postsCollected) {
        continue;
      }

      // Calculate observed posts per day based on collection timeframe
      const timeRange = result.timeRange;
      if (timeRange && timeRange.latest > timeRange.earliest) {
        const timeSpanDays =
          (timeRange.latest - timeRange.earliest) / (24 * 60 * 60);
        const observedPostsPerDay =
          result.postsCollected / Math.max(timeSpanDays, 1);

        // Update scheduling service with observed data
        if (observedPostsPerDay > 0) {
          this.schedulingService.updatePostingVolume(
            subreddit,
            observedPostsPerDay,
          );
        }
      }
    }
  }

  /**
   * Get earliest next collection time among specified subreddits
   */
  private getEarliestNextCollection(subreddits: string[]): Date | undefined {
    let earliestTime: Date | null = null;

    for (const subreddit of subreddits) {
      const config = this.schedulingService.getSchedulingConfig(subreddit);
      if (config && config.nextCollectionDue) {
        if (!earliestTime || config.nextCollectionDue < earliestTime) {
          earliestTime = config.nextCollectionDue;
        }
      }
    }

    return earliestTime || undefined;
  }

  /**
   * Handle job failure events
   */
  @Process('handle-collection-failure')
  handleCollectionFailure(
    job: Job<{ jobId: string; error: string; subreddits: string[] }>,
  ): void {
    const { jobId, error, subreddits } = job.data;

    this.logger.error('Handling collection failure', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'handle_collection_failure',
      jobId,
      error,
      subreddits,
    });

    // Here we could implement failure recovery strategies:
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
        totalPostsCollected: result.totalPostsCollected,
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
