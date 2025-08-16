import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { CollectionSchedulingService } from './collection-scheduling.service';
import {
  ChronologicalCollectionJobData,
  ChronologicalCollectionJobResult,
} from './chronological-collection.processor';
import {
  ScheduledCollectionExceptionFactory,
  JobSchedulingException,
} from './scheduled-collection.exceptions';

export interface JobScheduleConfig {
  enabled: boolean;
  subreddits: string[];
  maxRetries?: number;
  retryBackoffMs?: number;
  jobOptions?: {
    removeOnComplete?: number;
    removeOnFail?: number;
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
  };
}

export interface ScheduledJobInfo {
  jobId: string;
  jobType: 'chronological' | 'keyword-search';
  subreddit: string;
  scheduledTime: Date;
  status: 'scheduled' | 'running' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  lastError?: string;
  nextRetry?: Date;
}

/**
 * Collection Job Scheduler Service
 *
 * Implements PRD Section 5.1.2: Reliable scheduled collection jobs with comprehensive
 * error handling and retry logic. Orchestrates both chronological and keyword entity
 * search cycles using Bull queue infrastructure.
 *
 * Key responsibilities:
 * - Schedule chronological collection jobs based on dynamic intervals
 * - Schedule monthly keyword entity search cycles with offset timing
 * - Implement exponential backoff retry logic for failed jobs
 * - Provide job monitoring and health tracking
 * - Handle job state persistence and resumption
 * - Coordinate API usage across different collection strategies
 */
@Injectable()
export class CollectionJobSchedulerService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly scheduleConfig: JobScheduleConfig;
  private scheduledJobs = new Map<string, ScheduledJobInfo>();
  private scheduleTimer?: NodeJS.Timeout;

  // Default configuration following PRD requirements
  private readonly DEFAULT_CONFIG: JobScheduleConfig = {
    enabled: true,
    subreddits: ['austinfood', 'FoodNYC'], // PRD example subreddits
    maxRetries: 3,
    retryBackoffMs: 5000, // 5 seconds base delay
    jobOptions: {
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 20, // Keep last 20 failed jobs for debugging
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  };

  constructor(
    @InjectQueue('chronological-collection')
    private readonly chronologicalQueue: Queue,
    private readonly schedulingService: CollectionSchedulingService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {
    this.scheduleConfig = this.loadConfiguration();
  }

  /**
   * Initialize scheduling on module startup
   */
  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('CollectionJobScheduler');
    this.logger.info('Initializing collection job scheduler', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'scheduler_init',
      config: this.scheduleConfig,
    });

    if (!this.scheduleConfig.enabled) {
      this.logger.warn('Collection job scheduler is disabled');
      return;
    }

    // Skip initialization if schedulingService is not available (e.g., in tests)
    if (!this.schedulingService) {
      this.logger.warn(
        'Scheduling service not available, skipping initialization',
      );
      return;
    }

    // Initialize scheduling for configured subreddits
    for (const subreddit of this.scheduleConfig.subreddits) {
      this.schedulingService.initializeSubredditScheduling(subreddit);
    }

    // Start the scheduling loop
    await this.startScheduling();
  }

  /**
   * Start the scheduling loop that checks for due collections
   */
  private async startScheduling(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Starting collection scheduling loop', {
      correlationId,
      operation: 'start_scheduling',
    });

    // Initial schedule check
    await this.checkAndScheduleJobs();

    // Set up periodic scheduling checks (every 30 minutes)
    this.scheduleTimer = setInterval(
      async () => {
        try {
          await this.checkAndScheduleJobs();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error('Error in scheduling loop', {
            correlationId: CorrelationUtils.generateCorrelationId(),
            operation: 'scheduling_loop_error',
            error: errorMessage,
          });
        }
      },
      30 * 60 * 1000,
    ); // 30 minutes
  }

  /**
   * Check for due collections and schedule jobs
   */
  private async checkAndScheduleJobs(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Checking for due collections', {
      correlationId,
      operation: 'check_due_collections',
    });

    // Check chronological collections
    const dueSubreddits =
      this.schedulingService.getSubredditsDueForCollection();

    if (dueSubreddits.length > 0) {
      this.logger.info('Found subreddits due for chronological collection', {
        correlationId,
        dueSubreddits,
        count: dueSubreddits.length,
      });

      await this.scheduleChronologicalCollection(dueSubreddits);
    }

    // TODO: Check for monthly keyword search cycles (T09_S02)
    // This will be implemented when keyword entity search priority scoring is available
  }

  /**
   * Schedule chronological collection job for specified subreddits
   */
  async scheduleChronologicalCollection(
    subreddits: string[],
    options?: {
      delay?: number;
      priority?: number;
      triggeredBy?: 'scheduled' | 'manual' | 'gap_detection';
    },
  ): Promise<string> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const jobId = this.generateJobId('chronological', subreddits);
    const triggeredBy = options?.triggeredBy || 'scheduled';

    this.logger.info('Scheduling chronological collection job', {
      correlationId,
      operation: 'schedule_chronological',
      jobId,
      subreddits,
      triggeredBy,
      options,
    });

    try {
      const jobData: ChronologicalCollectionJobData = {
        subreddits,
        jobId,
        triggeredBy,
        options: {
          limit: 100,
          retryCount: 0,
        },
      };

      const bullJobOptions = {
        ...this.scheduleConfig.jobOptions,
        delay: options?.delay || 0,
        priority: options?.priority || 0,
        jobId, // Use our job ID for Bull
      };

      // Add job to Bull queue
      const job = await this.chronologicalQueue.add(
        'execute-chronological-collection',
        jobData,
        bullJobOptions,
      );

      // Track scheduled job
      const scheduledJob: ScheduledJobInfo = {
        jobId,
        jobType: 'chronological',
        subreddit: subreddits.join(','),
        scheduledTime: new Date(Date.now() + (options?.delay || 0)),
        status: 'scheduled',
        attempts: 0,
      };

      this.scheduledJobs.set(jobId, scheduledJob);

      this.logger.info('Chronological collection job scheduled successfully', {
        correlationId,
        jobId,
        bullJobId: job.id,
        scheduledJob,
      });

      return jobId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to schedule chronological collection job', {
        correlationId,
        jobId,
        error: errorMessage,
        subreddits,
      });

      throw ScheduledCollectionExceptionFactory.jobSchedulingFailed(
        'chronological',
        new Date(),
        errorMessage,
      );
    }
  }

  /**
   * Schedule manual collection job (for testing or emergency collection)
   */
  async scheduleManualCollection(
    subreddits: string[],
    options?: {
      priority?: number;
      lastProcessedTimestamp?: number;
      limit?: number;
    },
  ): Promise<string> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Scheduling manual collection job', {
      correlationId,
      operation: 'schedule_manual',
      subreddits,
      options,
    });

    return this.scheduleChronologicalCollection(subreddits, {
      priority: options?.priority || 10, // Higher priority than scheduled jobs
      triggeredBy: 'manual',
    });
  }

  /**
   * Get information about scheduled and running jobs
   */
  getScheduledJobs(): ScheduledJobInfo[] {
    return Array.from(this.scheduledJobs.values());
  }

  /**
   * Get job information by ID
   */
  getJobInfo(jobId: string): ScheduledJobInfo | undefined {
    return this.scheduledJobs.get(jobId);
  }

  /**
   * Update job status (called by monitoring service)
   */
  updateJobStatus(
    jobId: string,
    status: ScheduledJobInfo['status'],
    details?: {
      attempts?: number;
      lastError?: string;
      nextRetry?: Date;
    },
  ): void {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      this.logger.warn('Attempted to update status for unknown job', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        jobId,
        status,
        details,
      });
      return;
    }

    job.status = status;
    if (details?.attempts !== undefined) job.attempts = details.attempts;
    if (details?.lastError) job.lastError = details.lastError;
    if (details?.nextRetry) job.nextRetry = details.nextRetry;

    this.scheduledJobs.set(jobId, job);

    this.logger.debug('Job status updated', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      jobId,
      status,
      updatedJob: job,
    });
  }

  /**
   * Clean up completed or failed jobs older than retention period
   */
  cleanupOldJobs(retentionHours = 24): number {
    const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [jobId, job] of this.scheduledJobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.scheduledTime < cutoffTime
      ) {
        this.scheduledJobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up old jobs', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        operation: 'cleanup_old_jobs',
        cleanedCount,
        retentionHours,
      });
    }

    return cleanedCount;
  }

  /**
   * Stop scheduling (for graceful shutdown)
   */
  async stopScheduling(): Promise<void> {
    this.logger.info('Stopping collection job scheduler', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'stop_scheduler',
    });

    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = undefined;
    }

    // Wait for current jobs to complete (with timeout)
    const runningJobs = Array.from(this.scheduledJobs.values()).filter(
      (job) => job.status === 'running',
    );

    if (runningJobs.length > 0) {
      this.logger.info('Waiting for running jobs to complete', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        runningJobCount: runningJobs.length,
      });

      // Wait up to 2 minutes for jobs to complete
      const timeout = 2 * 60 * 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const stillRunning = Array.from(this.scheduledJobs.values()).filter(
          (job) => job.status === 'running',
        );

        if (stillRunning.length === 0) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
      }
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(type: string, subreddits: string[]): string {
    const timestamp = Date.now();
    const subredditKey = subreddits.sort().join('-');
    return `${type}-${subredditKey}-${timestamp}`;
  }

  /**
   * Load configuration from environment/config service
   */
  private loadConfiguration(): JobScheduleConfig {
    // Use default configuration for now
    // In the future, this could load from ConfigService
    return { ...this.DEFAULT_CONFIG };
  }
}
