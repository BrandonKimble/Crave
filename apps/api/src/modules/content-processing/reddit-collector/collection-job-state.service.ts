import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { ScheduledCollectionExceptionFactory } from './scheduled-collection.exceptions';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface JobState {
  jobId: string;
  jobType: 'chronological' | 'keyword-search';
  subreddits: string[];
  status: 'running' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  lastUpdateTime: Date;
  progress: {
    currentSubreddit?: string;
    lastProcessedTimestamp?: number;
    postsProcessed: number;
    currentRetryCount: number;
  };
  error?: string;
  metadata?: Record<string, any>;
}

export interface JobStateConfig {
  enablePersistence: boolean;
  stateDirectory: string;
  retentionDays: number;
  autoCleanup: boolean;
}

/**
 * Collection Job State Service
 *
 * Implements PRD Section 5.1.2: Job state persistence and resume capability for
 * scheduled collection jobs. Provides reliable job state management for resuming
 * interrupted or failed collection operations.
 *
 * Key responsibilities:
 * - Persist job state to disk for durability
 * - Enable resumption of interrupted collection jobs
 * - Track job progress and checkpoints
 * - Handle job state cleanup and retention
 * - Provide job state querying and recovery
 * - Integrate with existing checkpoint patterns
 */
@Injectable()
export class CollectionJobStateService implements OnModuleInit {
  private logger!: LoggerService;
  private config!: JobStateConfig;
  private jobStates = new Map<string, JobState>();
  private cleanupTimer?: NodeJS.Timeout;

  // Default configuration
  private readonly DEFAULT_CONFIG: JobStateConfig = {
    enablePersistence: true,
    stateDirectory: path.join(process.cwd(), 'data', 'job-states'),
    retentionDays: 7,
    autoCleanup: true,
  };

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('CollectionJobState');
    this.config = this.loadConfiguration();

    // Initialize state directory and cleanup timer
    this.initializeService();
  }

  /**
   * Initialize service and start cleanup timer
   */
  private async initializeService(): Promise<void> {
    if (this.config.enablePersistence) {
      await this.ensureStateDirectory();
      await this.loadPersistedStates();

      if (this.config.autoCleanup) {
        this.startCleanupTimer();
      }
    }
  }

  /**
   * Save job state
   */
  async saveJobState(state: JobState): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Saving job state', {
      correlationId,
      operation: 'save_job_state',
      jobId: state.jobId,
      status: state.status,
    });

    try {
      // Update last update time
      state.lastUpdateTime = new Date();

      // Store in memory
      this.jobStates.set(state.jobId, state);

      // Persist to disk if enabled
      if (this.config.enablePersistence) {
        await this.persistStateToDisk(state);
      }

      this.logger.debug('Job state saved successfully', {
        correlationId,
        jobId: state.jobId,
        status: state.status,
        progress: state.progress,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to save job state', {
        correlationId,
        jobId: state.jobId,
        error: errorMessage,
      });

      throw ScheduledCollectionExceptionFactory.stateSaveFailed(
        state.jobId,
        errorMessage,
      );
    }
  }

  /**
   * Load job state
   */
  async loadJobState(jobId: string): Promise<JobState | null> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Loading job state', {
      correlationId,
      operation: 'load_job_state',
      jobId,
    });

    try {
      // Check memory first
      let state = this.jobStates.get(jobId);

      // If not in memory and persistence is enabled, try disk
      if (!state && this.config.enablePersistence) {
        state = await this.loadStateFromDisk(jobId);
        if (state) {
          this.jobStates.set(jobId, state);
        }
      }

      if (state) {
        this.logger.debug('Job state loaded successfully', {
          correlationId,
          jobId,
          status: state.status,
          lastUpdate: state.lastUpdateTime,
        });
      } else {
        this.logger.debug('Job state not found', {
          correlationId,
          jobId,
        });
      }

      return state || null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to load job state', {
        correlationId,
        jobId,
        error: errorMessage,
      });

      throw ScheduledCollectionExceptionFactory.stateLoadFailed(
        jobId,
        errorMessage,
      );
    }
  }

  /**
   * Create initial job state
   */
  async createJobState(
    jobId: string,
    jobType: 'chronological' | 'keyword-search',
    subreddits: string[],
    metadata?: Record<string, any>,
  ): Promise<JobState> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Creating initial job state', {
      correlationId,
      operation: 'create_job_state',
      jobId,
      jobType,
      subreddits,
    });

    const state: JobState = {
      jobId,
      jobType,
      subreddits,
      status: 'running',
      startTime: new Date(),
      lastUpdateTime: new Date(),
      progress: {
        postsProcessed: 0,
        currentRetryCount: 0,
      },
      metadata,
    };

    await this.saveJobState(state);
    return state;
  }

  /**
   * Update job progress
   */
  async updateJobProgress(
    jobId: string,
    progress: Partial<JobState['progress']>,
    status?: JobState['status'],
    error?: string,
  ): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Updating job progress', {
      correlationId,
      operation: 'update_job_progress',
      jobId,
      progress,
      status,
    });

    const existingState = await this.loadJobState(jobId);
    if (!existingState) {
      this.logger.warn('Attempted to update progress for non-existent job', {
        correlationId,
        jobId,
      });
      return;
    }

    // Update progress
    existingState.progress = {
      ...existingState.progress,
      ...progress,
    };

    // Update status if provided
    if (status) {
      existingState.status = status;
    }

    // Update error if provided
    if (error) {
      existingState.error = error;
    }

    await this.saveJobState(existingState);
  }

  /**
   * Mark job as completed
   */
  async markJobCompleted(
    jobId: string,
    finalProgress: Partial<JobState['progress']>,
  ): Promise<void> {
    await this.updateJobProgress(jobId, finalProgress, 'completed');
  }

  /**
   * Mark job as failed
   */
  async markJobFailed(
    jobId: string,
    error: string,
    finalProgress?: Partial<JobState['progress']>,
  ): Promise<void> {
    await this.updateJobProgress(jobId, finalProgress || {}, 'failed', error);
  }

  /**
   * Get resumable jobs (jobs that can be resumed)
   */
  async getResumableJobs(maxAgeHours = 24): Promise<JobState[]> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    this.logger.debug('Finding resumable jobs', {
      correlationId,
      operation: 'get_resumable_jobs',
      maxAgeHours,
    });

    // Load all states if persistence is enabled
    if (this.config.enablePersistence) {
      await this.loadPersistedStates();
    }

    const resumableJobs = Array.from(this.jobStates.values()).filter(
      (state) => {
        // Only running or paused jobs can be resumed
        if (!['running', 'paused'].includes(state.status)) {
          return false;
        }

        // Must be recent enough
        if (state.lastUpdateTime < cutoffTime) {
          return false;
        }

        return true;
      },
    );

    this.logger.info('Found resumable jobs', {
      correlationId,
      count: resumableJobs.length,
      jobIds: resumableJobs.map((job) => job.jobId),
    });

    return resumableJobs;
  }

  /**
   * Resume job from saved state
   */
  async resumeJob(jobId: string): Promise<JobState> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Resuming job from saved state', {
      correlationId,
      operation: 'resume_job',
      jobId,
    });

    try {
      const state = await this.loadJobState(jobId);
      if (!state) {
        throw new Error(`No saved state found for job ${jobId}`);
      }

      if (!['running', 'paused'].includes(state.status)) {
        throw new Error(
          `Job ${jobId} is in ${state.status} status and cannot be resumed`,
        );
      }

      // Reset to running status
      state.status = 'running';
      state.lastUpdateTime = new Date();

      await this.saveJobState(state);

      this.logger.info('Job resumed successfully', {
        correlationId,
        jobId,
        resumedFrom: state.progress,
      });

      return state;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to resume job', {
        correlationId,
        jobId,
        error: errorMessage,
      });

      throw ScheduledCollectionExceptionFactory.resumeFailed(
        jobId,
        errorMessage,
      );
    }
  }

  /**
   * Delete job state
   */
  async deleteJobState(jobId: string): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Deleting job state', {
      correlationId,
      operation: 'delete_job_state',
      jobId,
    });

    // Remove from memory
    this.jobStates.delete(jobId);

    // Remove from disk if persistence is enabled
    if (this.config.enablePersistence) {
      try {
        const filePath = this.getStateFilePath(jobId);
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, which is fine
        if (error.code !== 'ENOENT') {
          this.logger.warn('Failed to delete state file', {
            correlationId,
            jobId,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Get all job states
   */
  getAllJobStates(): JobState[] {
    return Array.from(this.jobStates.values());
  }

  /**
   * Clean up old job states
   */
  async cleanupOldStates(): Promise<number> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const cutoffTime = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000,
    );
    let cleanedCount = 0;

    this.logger.info('Cleaning up old job states', {
      correlationId,
      operation: 'cleanup_old_states',
      retentionDays: this.config.retentionDays,
      cutoffTime,
    });

    // Clean up memory
    for (const [jobId, state] of this.jobStates.entries()) {
      if (
        ['completed', 'failed'].includes(state.status) &&
        state.lastUpdateTime < cutoffTime
      ) {
        await this.deleteJobState(jobId);
        cleanedCount++;
      }
    }

    // Clean up disk files if persistence is enabled
    if (this.config.enablePersistence) {
      try {
        const files = await fs.readdir(this.config.stateDirectory);
        const stateFiles = files.filter((file) => file.endsWith('.json'));

        for (const file of stateFiles) {
          const filePath = path.join(this.config.stateDirectory, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffTime) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      } catch (error) {
        this.logger.warn('Error during disk cleanup', {
          correlationId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up old job states', {
        correlationId,
        cleanedCount,
      });
    }

    return cleanedCount;
  }

  /**
   * Persist state to disk
   */
  private async persistStateToDisk(state: JobState): Promise<void> {
    const filePath = this.getStateFilePath(state.jobId);
    const stateData = JSON.stringify(state, null, 2);
    await fs.writeFile(filePath, stateData, 'utf8');
  }

  /**
   * Load state from disk
   */
  private async loadStateFromDisk(
    jobId: string,
  ): Promise<JobState | undefined> {
    try {
      const filePath = this.getStateFilePath(jobId);
      const stateData = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(stateData) as JobState;

      // Convert date strings back to Date objects
      state.startTime = new Date(state.startTime);
      state.lastUpdateTime = new Date(state.lastUpdateTime);

      return state;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return undefined; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Load all persisted states from disk
   */
  private async loadPersistedStates(): Promise<void> {
    if (!this.config.enablePersistence) return;

    try {
      await this.ensureStateDirectory();
      const files = await fs.readdir(this.config.stateDirectory);
      const stateFiles = files.filter((file) => file.endsWith('.json'));

      for (const file of stateFiles) {
        const jobId = path.basename(file, '.json');
        if (!this.jobStates.has(jobId)) {
          const state = await this.loadStateFromDisk(jobId);
          if (state) {
            this.jobStates.set(jobId, state);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load persisted states', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Ensure state directory exists
   */
  private async ensureStateDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.stateDirectory, { recursive: true });
    } catch (error) {
      // Directory might already exist, which is fine
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get file path for job state
   */
  private getStateFilePath(jobId: string): string {
    return path.join(this.config.stateDirectory, `${jobId}.json`);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every 6 hours
    this.cleanupTimer = setInterval(
      async () => {
        try {
          await this.cleanupOldStates();
        } catch (error) {
          this.logger.error('Error in cleanup timer', {
            correlationId: CorrelationUtils.generateCorrelationId(),
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      },
      6 * 60 * 60 * 1000,
    );
  }

  /**
   * Load configuration
   */
  private loadConfiguration(): JobStateConfig {
    // Use default configuration for now
    // In the future, this could load from ConfigService
    return { ...this.DEFAULT_CONFIG };
  }

  /**
   * Stop service (for graceful shutdown)
   */
  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Final cleanup
    if (this.config.autoCleanup) {
      await this.cleanupOldStates();
    }
  }
}
