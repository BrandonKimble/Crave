/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-misused-promises */
// Reason: Service integration with exception factories and Promise handling patterns

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  ProcessingCheckpoint,
  CheckpointServiceConfig,
  BatchProcessingConfig,
} from './batch-processing.types';
import { BatchProcessingExceptionFactory } from './batch-processing.exceptions';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Processing Checkpoint Service
 *
 * Implements PRD Section 5.1.1 requirement for processing resumption capabilities.
 * Provides checkpoint and resumption system for interrupted processing jobs
 * to handle realistic archive file sizes without starting from scratch.
 *
 * Key responsibilities:
 * - Create and manage processing checkpoints
 * - Enable resumption from last successful checkpoint
 * - Store processing state with file positions and completion status
 * - Handle checkpoint persistence and cleanup
 * - Provide checkpoint history and recovery options
 */
@Injectable()
export class ProcessingCheckpointService {
  private readonly logger: LoggerService;
  private readonly config: CheckpointServiceConfig;
  private checkpoints = new Map<string, ProcessingCheckpoint[]>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.setContext('ProcessingCheckpoint');
    this.config = this.loadConfiguration();

    // Start cleanup timer if persistence is enabled
    if (this.config.enablePersistence) {
      this.startCleanupTimer();
    }
  }

  /**
   * Create initial checkpoint for a new job
   * Implements PRD requirement: Establish processing state baseline
   *
   * @param jobId Unique job identifier
   * @param jobInfo Initial job information
   */
  async createInitialCheckpoint(
    jobId: string,
    jobInfo: {
      filePath: string;
      totalEstimatedLines: number;
      config: BatchProcessingConfig;
    },
  ): Promise<ProcessingCheckpoint> {
    this.logger.info('Creating initial checkpoint', {
      jobId,
      filePath: jobInfo.filePath,
      totalEstimatedLines: jobInfo.totalEstimatedLines,
    });

    const checkpoint: ProcessingCheckpoint = {
      checkpointId: this.generateCheckpointId(jobId, 0),
      jobId,
      processedLines: 0,
      lastPosition: 0,
      completionPercentage: 0,
      timestamp: new Date(),
      completed: false,
      config: jobInfo.config,
      metadata: {
        filePath: jobInfo.filePath,
        totalEstimatedLines: jobInfo.totalEstimatedLines,
        checkpointType: 'initial',
      },
    };

    await this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  /**
   * Create progress checkpoint during processing
   * Implements PRD requirement: Track progress for resumption
   *
   * @param jobId Unique job identifier
   * @param progress Current processing progress
   */
  async createCheckpoint(
    jobId: string,
    progress: {
      processedLines: number;
      lastPosition: number;
      completionPercentage: number;
      timestamp: Date;
    },
  ): Promise<ProcessingCheckpoint> {
    const existingCheckpoints = this.checkpoints.get(jobId) || [];
    const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];

    if (!lastCheckpoint) {
      throw BatchProcessingExceptionFactory.checkpointSaveFailed(
        jobId,
        'No initial checkpoint found',
      );
    }

    const checkpoint: ProcessingCheckpoint = {
      checkpointId: this.generateCheckpointId(
        jobId,
        existingCheckpoints.length,
      ),
      jobId,
      processedLines: progress.processedLines,
      lastPosition: progress.lastPosition,
      completionPercentage: progress.completionPercentage,
      timestamp: progress.timestamp,
      completed: false,
      config: lastCheckpoint.config,
      metadata: {
        ...lastCheckpoint.metadata,
        checkpointType: 'progress',
        progressSinceLastCheckpoint:
          progress.processedLines - lastCheckpoint.processedLines,
      },
    };

    await this.saveCheckpoint(checkpoint);

    this.logger.debug('Progress checkpoint created', {
      jobId,
      checkpointId: checkpoint.checkpointId,
      processedLines: progress.processedLines,
      completionPercentage: progress.completionPercentage,
    });

    return checkpoint;
  }

  /**
   * Create completion checkpoint when job finishes
   * Implements PRD requirement: Mark successful completion
   *
   * @param jobId Unique job identifier
   * @param completionInfo Final job metrics
   */
  async markAsCompleted(
    jobId: string,
    completionInfo: {
      finalMetrics: any;
      completedAt: Date;
    },
  ): Promise<ProcessingCheckpoint> {
    const existingCheckpoints = this.checkpoints.get(jobId) || [];
    const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];

    if (!lastCheckpoint) {
      throw BatchProcessingExceptionFactory.checkpointSaveFailed(
        jobId,
        'No checkpoint found to mark as completed',
      );
    }

    const completionCheckpoint: ProcessingCheckpoint = {
      checkpointId: this.generateCheckpointId(
        jobId,
        existingCheckpoints.length,
      ),
      jobId,
      processedLines: lastCheckpoint.processedLines,
      lastPosition: lastCheckpoint.lastPosition,
      completionPercentage: 100,
      timestamp: completionInfo.completedAt,
      completed: true,
      config: lastCheckpoint.config,
      metadata: {
        ...lastCheckpoint.metadata,
        checkpointType: 'completion',
        finalMetrics: completionInfo.finalMetrics,
        completedAt: completionInfo.completedAt.toISOString(),
      },
    };

    await this.saveCheckpoint(completionCheckpoint);

    this.logger.info('Job marked as completed', {
      jobId,
      checkpointId: completionCheckpoint.checkpointId,
      totalCheckpoints: existingCheckpoints.length + 1,
    });

    return completionCheckpoint;
  }

  /**
   * Create emergency checkpoint for error recovery
   * Implements PRD requirement: Graceful degradation and recovery
   *
   * @param jobId Unique job identifier
   * @param emergencyInfo Emergency context information
   */
  async createEmergencyCheckpoint(
    jobId: string,
    emergencyInfo: {
      reason: string;
      memoryUsage?: number;
      timestamp: Date;
    },
  ): Promise<ProcessingCheckpoint> {
    const existingCheckpoints = this.checkpoints.get(jobId) || [];
    const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];

    if (!lastCheckpoint) {
      this.logger.warn(
        'Creating emergency checkpoint without previous checkpoint',
        {
          jobId,
          reason: emergencyInfo.reason,
        },
      );
    }

    const emergencyCheckpoint: ProcessingCheckpoint = {
      checkpointId: this.generateCheckpointId(
        jobId,
        existingCheckpoints.length,
      ),
      jobId,
      processedLines: lastCheckpoint?.processedLines || 0,
      lastPosition: lastCheckpoint?.lastPosition || 0,
      completionPercentage: lastCheckpoint?.completionPercentage || 0,
      timestamp: emergencyInfo.timestamp,
      completed: false,
      config: lastCheckpoint?.config || ({} as BatchProcessingConfig),
      metadata: {
        ...lastCheckpoint?.metadata,
        checkpointType: 'emergency',
        emergencyReason: emergencyInfo.reason,
        memoryUsage: emergencyInfo.memoryUsage,
      },
    };

    await this.saveCheckpoint(emergencyCheckpoint);

    this.logger.warn('Emergency checkpoint created', {
      jobId,
      checkpointId: emergencyCheckpoint.checkpointId,
      reason: emergencyInfo.reason,
      memoryUsage: emergencyInfo.memoryUsage,
    });

    return emergencyCheckpoint;
  }

  /**
   * Create failure checkpoint when job fails
   * Implements PRD requirement: Error handling and recovery information
   *
   * @param jobId Unique job identifier
   * @param failureInfo Failure context information
   */
  async createFailureCheckpoint(
    jobId: string,
    failureInfo: {
      error: string;
      failedAt: Date;
    },
  ): Promise<ProcessingCheckpoint> {
    const existingCheckpoints = this.checkpoints.get(jobId) || [];
    const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];

    const failureCheckpoint: ProcessingCheckpoint = {
      checkpointId: this.generateCheckpointId(
        jobId,
        existingCheckpoints.length,
      ),
      jobId,
      processedLines: lastCheckpoint?.processedLines || 0,
      lastPosition: lastCheckpoint?.lastPosition || 0,
      completionPercentage: lastCheckpoint?.completionPercentage || 0,
      timestamp: failureInfo.failedAt,
      completed: false,
      config: lastCheckpoint?.config || ({} as BatchProcessingConfig),
      metadata: {
        ...lastCheckpoint?.metadata,
        checkpointType: 'failure',
        errorMessage: failureInfo.error,
        failedAt: failureInfo.failedAt.toISOString(),
      },
    };

    await this.saveCheckpoint(failureCheckpoint);

    this.logger.error('Failure checkpoint created', {
      jobId,
      checkpointId: failureCheckpoint.checkpointId,
      error: failureInfo.error,
    });

    return failureCheckpoint;
  }

  /**
   * Get the most recent checkpoint for a job
   * Implements PRD requirement: Resumption from last successful checkpoint
   *
   * @param jobId Unique job identifier
   * @returns Latest checkpoint or null if none exists
   */
  async getLatestCheckpoint(
    jobId: string,
  ): Promise<ProcessingCheckpoint | null> {
    const jobCheckpoints = this.checkpoints.get(jobId) || [];

    if (jobCheckpoints.length === 0) {
      // Try to load from persistent storage if enabled
      if (this.config.enablePersistence) {
        await this.loadCheckpointsFromStorage(jobId);
        const reloadedCheckpoints = this.checkpoints.get(jobId) || [];
        return reloadedCheckpoints.length > 0
          ? reloadedCheckpoints[reloadedCheckpoints.length - 1]
          : null;
      }
      return null;
    }

    return jobCheckpoints[jobCheckpoints.length - 1];
  }

  /**
   * Get all checkpoints for a job
   * Implements PRD requirement: Checkpoint history for analysis
   *
   * @param jobId Unique job identifier
   * @returns Array of all checkpoints for the job
   */
  async getAllCheckpoints(jobId: string): Promise<ProcessingCheckpoint[]> {
    const jobCheckpoints = this.checkpoints.get(jobId) || [];

    if (jobCheckpoints.length === 0 && this.config.enablePersistence) {
      await this.loadCheckpointsFromStorage(jobId);
    }

    return this.checkpoints.get(jobId) || [];
  }

  /**
   * Get checkpoint by specific ID
   *
   * @param jobId Unique job identifier
   * @param checkpointId Specific checkpoint identifier
   * @returns Checkpoint or null if not found
   */
  async getCheckpointById(
    jobId: string,
    checkpointId: string,
  ): Promise<ProcessingCheckpoint | null> {
    const jobCheckpoints = await this.getAllCheckpoints(jobId);
    return (
      jobCheckpoints.find((cp) => cp.checkpointId === checkpointId) || null
    );
  }

  /**
   * Delete all checkpoints for a job
   * Implements PRD requirement: Cleanup completed jobs
   *
   * @param jobId Unique job identifier
   */
  async deleteCheckpoints(jobId: string): Promise<void> {
    this.logger.debug('Deleting checkpoints', { jobId });

    // Remove from memory
    this.checkpoints.delete(jobId);

    // Remove from persistent storage if enabled
    if (this.config.enablePersistence) {
      await this.deleteCheckpointsFromStorage(jobId);
    }

    this.logger.debug('Checkpoints deleted', { jobId });
  }

  /**
   * Get checkpoint statistics for monitoring
   *
   * @returns Checkpoint system statistics
   */
  getCheckpointStatistics(): {
    activeJobs: number;
    totalCheckpoints: number;
    storageLocation: string;
    enablePersistence: boolean;
  } {
    const totalCheckpoints = Array.from(this.checkpoints.values()).reduce(
      (sum, checkpoints) => sum + checkpoints.length,
      0,
    );

    return {
      activeJobs: this.checkpoints.size,
      totalCheckpoints,
      storageLocation: this.config.storageLocation,
      enablePersistence: this.config.enablePersistence,
    };
  }

  /**
   * Save checkpoint to memory and optionally to persistent storage
   */
  private async saveCheckpoint(
    checkpoint: ProcessingCheckpoint,
  ): Promise<void> {
    try {
      // Store in memory
      const jobCheckpoints = this.checkpoints.get(checkpoint.jobId) || [];
      jobCheckpoints.push(checkpoint);
      this.checkpoints.set(checkpoint.jobId, jobCheckpoints);

      // Limit number of checkpoints per job
      if (jobCheckpoints.length > this.config.maxCheckpointsPerJob) {
        const excessCount =
          jobCheckpoints.length - this.config.maxCheckpointsPerJob;
        jobCheckpoints.splice(0, excessCount);
        this.logger.debug('Trimmed excess checkpoints', {
          jobId: checkpoint.jobId,
          removedCount: excessCount,
          remainingCount: jobCheckpoints.length,
        });
      }

      // Save to persistent storage if enabled
      if (this.config.enablePersistence) {
        await this.saveCheckpointToStorage(checkpoint);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw BatchProcessingExceptionFactory.checkpointSaveFailed(
        checkpoint.jobId,
        errorMessage,
      );
    }
  }

  /**
   * Save checkpoint to persistent storage
   */
  private async saveCheckpointToStorage(
    checkpoint: ProcessingCheckpoint,
  ): Promise<void> {
    try {
      const checkpointDir = path.join(
        this.config.storageLocation,
        checkpoint.jobId,
      );
      await fs.mkdir(checkpointDir, { recursive: true });

      const checkpointFile = path.join(
        checkpointDir,
        `${checkpoint.checkpointId}.json`,
      );
      const checkpointData = JSON.stringify(checkpoint, null, 2);

      await fs.writeFile(checkpointFile, checkpointData, 'utf8');

      this.logger.debug('Checkpoint saved to storage', {
        jobId: checkpoint.jobId,
        checkpointId: checkpoint.checkpointId,
        filePath: checkpointFile,
      });
    } catch (error) {
      this.logger.error('Failed to save checkpoint to storage', {
        jobId: checkpoint.jobId,
        checkpointId: checkpoint.checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw here - persistent storage failure shouldn't break the job
    }
  }

  /**
   * Load checkpoints from persistent storage
   */
  private async loadCheckpointsFromStorage(jobId: string): Promise<void> {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      const checkpointDir = path.join(this.config.storageLocation, jobId);

      try {
        await fs.access(checkpointDir);
      } catch {
        // Directory doesn't exist - no checkpoints to load
        return;
      }

      const files = await fs.readdir(checkpointDir);
      const checkpointFiles = files.filter((f) => f.endsWith('.json'));

      const checkpoints: ProcessingCheckpoint[] = [];

      for (const file of checkpointFiles) {
        try {
          const filePath = path.join(checkpointDir, file);
          const checkpointData = await fs.readFile(filePath, 'utf8');
          const checkpoint = JSON.parse(checkpointData) as ProcessingCheckpoint;

          // Convert timestamp string back to Date object
          checkpoint.timestamp = new Date(checkpoint.timestamp);

          checkpoints.push(checkpoint);
        } catch (error) {
          this.logger.warn('Failed to load checkpoint file', {
            jobId,
            file,
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                  }
                : { message: String(error) },
          });
        }
      }

      // Sort checkpoints by timestamp
      checkpoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      this.checkpoints.set(jobId, checkpoints);

      this.logger.debug('Checkpoints loaded from storage', {
        jobId,
        checkpointCount: checkpoints.length,
      });
    } catch (error) {
      this.logger.error('Failed to load checkpoints from storage', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - loading failure shouldn't prevent job execution
    }
  }

  /**
   * Delete checkpoints from persistent storage
   */
  private async deleteCheckpointsFromStorage(jobId: string): Promise<void> {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      const checkpointDir = path.join(this.config.storageLocation, jobId);

      try {
        await fs.access(checkpointDir);
        await fs.rm(checkpointDir, { recursive: true, force: true });

        this.logger.debug('Checkpoint directory deleted from storage', {
          jobId,
          directory: checkpointDir,
        });
      } catch {
        // Directory doesn't exist - nothing to delete
      }
    } catch (error) {
      this.logger.error('Failed to delete checkpoints from storage', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - cleanup failure shouldn't break other operations
    }
  }

  /**
   * Start cleanup timer for expired checkpoints
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredCheckpoints();
    }, this.config.cleanupInterval);

    this.logger.debug('Checkpoint cleanup timer started', {
      interval: this.config.cleanupInterval,
      retentionPeriod: this.config.retentionPeriod,
    });
  }

  /**
   * Clean up expired checkpoints
   */
  private async cleanupExpiredCheckpoints(): Promise<void> {
    const now = Date.now();
    const expirationTime = now - this.config.retentionPeriod;
    let totalCleaned = 0;

    this.logger.debug('Starting checkpoint cleanup', {
      currentTime: new Date(now).toISOString(),
      expirationTime: new Date(expirationTime).toISOString(),
    });

    for (const [jobId, checkpoints] of this.checkpoints.entries()) {
      const validCheckpoints = checkpoints.filter((cp) => {
        const checkpointTime = cp.timestamp.getTime();
        return checkpointTime > expirationTime;
      });

      if (validCheckpoints.length !== checkpoints.length) {
        const cleanedCount = checkpoints.length - validCheckpoints.length;
        totalCleaned += cleanedCount;

        if (validCheckpoints.length === 0) {
          this.checkpoints.delete(jobId);

          // Also clean up from persistent storage
          if (this.config.enablePersistence) {
            await this.deleteCheckpointsFromStorage(jobId);
          }
        } else {
          this.checkpoints.set(jobId, validCheckpoints);
        }

        this.logger.debug('Cleaned up expired checkpoints', {
          jobId,
          cleanedCount,
          remainingCount: validCheckpoints.length,
        });
      }
    }

    if (totalCleaned > 0) {
      this.logger.info('Checkpoint cleanup completed', {
        totalCleaned,
        activeJobs: this.checkpoints.size,
      });
    }
  }

  /**
   * Generate unique checkpoint identifier
   */
  private generateCheckpointId(jobId: string, sequenceNumber: number): string {
    const timestamp = Date.now();
    return `checkpoint_${jobId}_${sequenceNumber
      .toString()
      .padStart(4, '0')}_${timestamp}`;
  }

  /**
   * Load checkpoint service configuration
   */
  private loadConfiguration(): CheckpointServiceConfig {
    return {
      enablePersistence: process.env.CHECKPOINT_ENABLE_PERSISTENCE !== 'false',
      storageLocation:
        process.env.CHECKPOINT_STORAGE_LOCATION || './data/checkpoints',
      maxCheckpointsPerJob: parseInt(
        process.env.CHECKPOINT_MAX_PER_JOB || '50',
        10,
      ),
      cleanupInterval: parseInt(
        process.env.CHECKPOINT_CLEANUP_INTERVAL || '3600000',
        10,
      ), // 1 hour
      retentionPeriod: parseInt(
        process.env.CHECKPOINT_RETENTION_PERIOD || '604800000',
        10,
      ), // 7 days
    };
  }

  /**
   * Cleanup resources on service destroy
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
