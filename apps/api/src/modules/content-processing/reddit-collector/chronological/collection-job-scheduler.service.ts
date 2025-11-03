import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ChronologicalCollectionJobData } from './chronological-collection.worker';
import { ScheduledCollectionExceptionFactory } from '../scheduled-collection.exceptions';

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

  // Default configuration following PRD requirements
  private readonly DEFAULT_CONFIG: JobScheduleConfig = {
    enabled: true,
    subreddits: [], // Subreddits loaded dynamically from database
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
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

    // Database-driven scheduling - no dependency on old scheduling service

    // Load active subreddits from database and initialize scheduling
    const activeSubreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    this.scheduleConfig.subreddits = activeSubreddits.map((s) => s.name);

    this.logger.info('Loaded active subreddits from database', {
      activeSubreddits: this.scheduleConfig.subreddits,
      count: this.scheduleConfig.subreddits.length,
    });

    // All scheduling configuration now stored in database

    // Start the scheduling loop
    await this.startScheduling();
  }

  /**
   * Initialize event-driven scheduling using Bull delayed jobs
   */
  private async startScheduling(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Starting event-driven collection job scheduling', {
      correlationId,
      operation: 'start_event_driven_scheduling',
    });

    // Schedule delayed jobs for all active subreddits that are due or overdue
    await this.initializeDelayedJobs();
  }

  /**
   * Initialize delayed jobs for all active subreddits
   * Replaces the 30-minute polling approach with precise event-driven scheduling
   */
  private async initializeDelayedJobs(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Initializing delayed jobs for active subreddits', {
      correlationId,
      operation: 'initialize_delayed_jobs',
    });

    // Get all active subreddits with their timing data
    const allActiveSubreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: {
        name: true,
        safeIntervalDays: true,
        lastProcessed: true,
      },
    });

    const now = Date.now();

    for (const subreddit of allActiveSubreddits) {
      const nextDueTime = this.calculateNextDueTime(subreddit, now);

      if (nextDueTime <= now) {
        // Due now or overdue - schedule immediately
        this.logger.info('Subreddit is due for immediate collection', {
          correlationId,
          subreddit: subreddit.name,
          lastProcessed: subreddit.lastProcessed,
          safeIntervalDays: subreddit.safeIntervalDays,
        });

        const lastProcessedTimestamp = subreddit.lastProcessed
          ? Math.floor(subreddit.lastProcessed.getTime() / 1000)
          : Math.floor(
              (now - subreddit.safeIntervalDays * 24 * 60 * 60 * 1000) / 1000,
            );

        await this.scheduleChronologicalCollection(subreddit.name, {
          lastProcessedTimestamp,
          triggeredBy: 'startup_due',
        });
      } else {
        // Schedule for future execution
        const delayMs = nextDueTime - now;

        this.logger.info('Scheduling delayed job for subreddit', {
          correlationId,
          subreddit: subreddit.name,
          nextDueTime: new Date(nextDueTime).toISOString(),
          delayMs,
          delayHours: Math.round(delayMs / (60 * 60 * 1000)),
        });

        await this.scheduleDelayedCollection(subreddit.name, delayMs);
      }
    }
  }

  /**
   * Calculate when a subreddit is next due for collection
   */
  private calculateNextDueTime(
    subreddit: { lastProcessed: Date | null; safeIntervalDays: number },
    now: number,
  ): number {
    if (!subreddit.lastProcessed) {
      return now; // Never processed, due immediately
    }

    return (
      subreddit.lastProcessed.getTime() +
      subreddit.safeIntervalDays * 24 * 60 * 60 * 1000
    );
  }

  /**
   * Schedule a delayed collection job using Bull's built-in delay feature
   */
  private async scheduleDelayedCollection(
    subreddit: string,
    delayMs: number,
  ): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const jobId = this.generateJobId('chronological-delayed', [subreddit]);

    // Get fresh data when the job actually runs
    const jobData: ChronologicalCollectionJobData = {
      subreddit,
      jobId,
      triggeredBy: 'delayed_schedule',
      options: {
        limit: 1000,
        retryCount: 0,
        // Don't set lastProcessedTimestamp here - let the processor calculate it fresh
      },
    };

    const bullJobOptions = {
      ...this.scheduleConfig.jobOptions,
      delay: delayMs,
      jobId,
    };

    await this.chronologicalQueue.add(
      'execute-chronological-collection',
      jobData,
      bullJobOptions,
    );

    this.logger.info('Scheduled delayed collection job', {
      correlationId,
      jobId,
      subreddit,
      delayMs,
      executeAt: new Date(Date.now() + delayMs).toISOString(),
    });
  }

  /**
   * Check for due collections and schedule jobs
   * DEPRECATED: Replaced by event-driven scheduling
   * Kept for manual triggers and testing
   */
  private async checkAndScheduleJobs(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Checking for due collections', {
      correlationId,
      operation: 'check_due_collections',
    });

    // Query database for subreddits that are due for collection
    // We'll filter in code since we need to use each subreddit's individual safeIntervalDays
    const allActiveSubreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: {
        name: true,
        safeIntervalDays: true,
        lastProcessed: true,
      },
    });

    const now = Date.now();
    const dueSubreddits = allActiveSubreddits.filter((subreddit) => {
      if (!subreddit.lastProcessed) {
        return true; // Never processed before, so it's due
      }

      const timeSinceLastProcessed = now - subreddit.lastProcessed.getTime();
      const safeIntervalMs = subreddit.safeIntervalDays * 24 * 60 * 60 * 1000;

      return timeSinceLastProcessed >= safeIntervalMs;
    });

    if (dueSubreddits.length > 0) {
      this.logger.info('Found subreddits due for chronological collection', {
        correlationId,
        dueSubreddits: dueSubreddits.map((s) => ({
          name: s.name,
          safeIntervalDays: s.safeIntervalDays,
          lastProcessed: s.lastProcessed,
        })),
        count: dueSubreddits.length,
      });

      // Schedule each subreddit independently
      for (const subreddit of dueSubreddits) {
        // Calculate lastProcessedTimestamp with fallback
        const lastProcessedTimestamp = subreddit.lastProcessed
          ? Math.floor(subreddit.lastProcessed.getTime() / 1000)
          : Math.floor(
              (Date.now() - subreddit.safeIntervalDays * 24 * 60 * 60 * 1000) /
                1000,
            );

        await this.scheduleChronologicalCollection(subreddit.name, {
          lastProcessedTimestamp,
          triggeredBy: 'scheduled',
        });
      }
    }

    // TODO: Check for monthly keyword search cycles (T09_S02)
    // This will be implemented when keyword entity search priority scoring is available
  }

  /**
   * Schedule the next collection for a subreddit after job completion
   * Called by the processor after successful collection
   */
  async scheduleNextCollection(subreddit: string): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Scheduling next collection after job completion', {
      correlationId,
      operation: 'schedule_next_collection',
      subreddit,
    });

    // Get updated subreddit data from database
    const subredditData = await this.prisma.subreddit.findUnique({
      where: { name: subreddit.toLowerCase() },
      select: {
        name: true,
        safeIntervalDays: true,
        lastProcessed: true,
      },
    });

    if (!subredditData) {
      this.logger.warn('Subreddit not found for next collection scheduling', {
        correlationId,
        subreddit,
      });
      return;
    }

    // Calculate next collection time
    const now = Date.now();
    const nextDueTime = this.calculateNextDueTime(subredditData, now);
    const delayMs = nextDueTime - now;

    this.logger.info('Scheduling next delayed collection', {
      correlationId,
      subreddit: subredditData.name,
      nextDueTime: new Date(nextDueTime).toISOString(),
      delayMs,
      delayDays: Math.round(delayMs / (24 * 60 * 60 * 1000)),
    });

    await this.scheduleDelayedCollection(subredditData.name, delayMs);
  }

  /**
   * Schedule chronological collection job for a single subreddit
   * Updated to process one subreddit per job for better isolation and monitoring
   */
  async scheduleChronologicalCollection(
    subreddit: string,
    options?: {
      delay?: number;
      priority?: number;
      triggeredBy?:
        | 'scheduled'
        | 'manual'
        | 'gap_detection'
        | 'startup_due'
        | 'delayed_schedule';
      limit?: number;
      lastProcessedTimestamp?: number;
    },
  ): Promise<string> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const jobId = this.generateJobId('chronological', [subreddit]);
    const triggeredBy = options?.triggeredBy || 'scheduled';

    this.logger.info('Scheduling chronological collection job', {
      correlationId,
      operation: 'schedule_chronological',
      jobId,
      subreddit,
      triggeredBy,
      options,
    });

    try {
      const jobData: ChronologicalCollectionJobData = {
        subreddit, // Single subreddit per job for better isolation
        jobId,
        triggeredBy,
        options: {
          limit:
            typeof options?.limit === 'number' && options.limit > 0
              ? Math.floor(options.limit)
              : 1000, // Default to Reddit max when no override provided
          retryCount: 0,
          lastProcessedTimestamp: options?.lastProcessedTimestamp,
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
        subreddit,
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
        subreddit,
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
   * Updated to handle single subreddit per job
   */
  async scheduleManualCollection(
    subreddit: string,
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
      subreddit,
      options,
    });

    return this.scheduleChronologicalCollection(subreddit, {
      priority: options?.priority || 10, // Higher priority than scheduled jobs
      triggeredBy: 'manual',
      limit: options?.limit,
      lastProcessedTimestamp: options?.lastProcessedTimestamp,
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

    // Event-driven scheduling - no timer to clear

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
   * Get calculated timing information for a subreddit (for testing and validation)
   */
  async getSubredditTiming(subreddit: string): Promise<{
    lastProcessedTimestamp: number;
    safeIntervalDays: number;
    nextDueTime: number;
    isDue: boolean;
  }> {
    const subredditData = await this.prisma.subreddit.findUnique({
      where: { name: subreddit.toLowerCase() },
      select: { name: true, safeIntervalDays: true, lastProcessed: true },
    });

    if (!subredditData) {
      throw new Error(`Subreddit ${subreddit} not found in database`);
    }

    const now = Date.now();
    let lastProcessedTimestamp: number;

    if (subredditData.lastProcessed) {
      lastProcessedTimestamp = Math.floor(
        subredditData.lastProcessed.getTime() / 1000,
      );
    } else {
      // Use safe interval to calculate starting point for first collection
      lastProcessedTimestamp =
        Math.floor(now / 1000) - subredditData.safeIntervalDays * 24 * 60 * 60;
    }

    const nextDueTime = this.calculateNextDueTime(subredditData, now);
    const isDue = nextDueTime <= now;

    return {
      lastProcessedTimestamp,
      safeIntervalDays: subredditData.safeIntervalDays,
      nextDueTime,
      isDue,
    };
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
    const enabledRaw =
      this.configService.get<string>('COLLECTION_SCHEDULER_ENABLED') ??
      process.env.COLLECTION_SCHEDULER_ENABLED;
    const enabled =
      typeof enabledRaw === 'string'
        ? enabledRaw.toLowerCase() === 'true'
        : true;

    return {
      ...this.DEFAULT_CONFIG,
      enabled,
    };
  }
}
