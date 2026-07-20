import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { ChronologicalCollectionJobData } from './chronological-collection.worker';
import { ScheduledCollectionExceptionFactory } from '../scheduled-collection.exceptions';

interface ChronologicalJobOptions {
  removeOnComplete: number;
  removeOnFail: number;
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

/**
 * Chronological collection DISPATCH provider.
 *
 * Planning (WHEN a community is collected) lives solely in
 * CollectionSchedulerService via collection_schedules rows
 * (plans/collection-scheduler-consolidation.md). This service only knows HOW
 * to enqueue a chronological collection job; it never plans its own cadence
 * and workers never self-schedule successors through it.
 */
@Injectable()
export class CollectionJobSchedulerService implements OnModuleInit {
  private logger!: LoggerService;

  private readonly JOB_OPTIONS: ChronologicalJobOptions = {
    // Wide completed window: tick jobIds are deterministic, and the lingering
    // completed job is the dedupe that makes a re-dispatch of the same tick
    // (row-advance failure / second instance) a no-op. 10 was small enough to
    // evict within a cycle at fleet scale.
    removeOnComplete: 100,
    removeOnFail: 20, // Keep last 20 failed jobs for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  };

  constructor(
    @InjectQueue('chronological-collection')
    private readonly chronologicalQueue: Queue,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('CollectionJobScheduler');
  }

  /**
   * Enqueue a chronological collection job for a single subreddit.
   * The sole dispatch entry — called by CollectionSchedulerService when a
   * chronological cadence row comes due (or manually from scripts).
   */
  async scheduleChronologicalCollection(
    subreddit: string,
    options?: {
      delay?: number;
      priority?: number;
      triggeredBy?: 'scheduled' | 'manual' | 'gap_detection';
      limit?: number;
      lastProcessedTimestamp?: number;
      /** §10 source identity: the worker reads/advances the lane-row cursor
       *  and reports its output heartbeat against this source. */
      sourceId?: string;
      /** The pacer's reserved reddit-pool estimate — the worker mirrors the
       *  actual request count against it (§14.2 declared-vs-actual). */
      declaredRequests?: number;
      /** Deterministic per-cadence-tick key (the planner passes the row's
       *  due time). Duplicate dispatches of the same tick — crash between
       *  enqueue and row-advance, or a second planner instance — dedupe at
       *  Bull instead of double-collecting. */
      dedupeKey?: string;
    },
  ): Promise<string> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const triggeredBy = options?.triggeredBy || 'scheduled';
    const subredditKey = subreddit.trim().toLowerCase();
    const jobId =
      triggeredBy === 'manual' || !options?.dedupeKey
        ? `chronological-${subredditKey}-${Date.now()}`
        : `chronological-now:${subredditKey}:${options.dedupeKey}`;

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
        sourceId: options?.sourceId,
        declaredRequests: options?.declaredRequests,
        options: {
          limit:
            typeof options?.limit === 'number' && options.limit > 0
              ? Math.floor(options.limit)
              : 1000, // Default to Reddit max when no override provided
          retryCount: 0,
          lastProcessedTimestamp: options?.lastProcessedTimestamp,
        },
      };

      const job = await this.chronologicalQueue.add(
        'execute-chronological-collection',
        jobData,
        {
          ...this.JOB_OPTIONS,
          delay: options?.delay || 0,
          priority: options?.priority || 0,
          jobId,
        },
      );

      this.logger.info('Chronological collection job scheduled successfully', {
        correlationId,
        jobId,
        bullJobId: job.id,
        subreddit,
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
}
