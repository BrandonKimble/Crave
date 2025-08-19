import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app-exception.base';

/**
 * Batch Processing Exceptions
 *
 * Custom exceptions for batch processing system errors following established
 * application exception patterns.
 */

/**
 * Base exception for all batch processing errors
 */
export abstract class BatchProcessingException extends AppException {
  abstract readonly errorCode: string;
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }
}

/**
 * Job initialization failed
 */
export class JobInitializationException extends BatchProcessingException {
  readonly errorCode = 'BATCH_JOB_INITIALIZATION_FAILED';

  static create(
    jobId: string,
    filePath: string,
    reason: string,
  ): JobInitializationException {
    return new JobInitializationException(
      `Failed to initialize batch processing job: ${reason}`,
      { jobId, filePath, reason },
    );
  }
}

/**
 * Memory exhaustion during processing
 */
export class MemoryExhaustionException extends BatchProcessingException {
  readonly errorCode = 'BATCH_MEMORY_EXHAUSTION';

  static create(
    jobId: string,
    memoryUsage: number,
    limit: number,
  ): MemoryExhaustionException {
    const memoryUsageMB = Math.round(memoryUsage / 1024 / 1024);
    return new MemoryExhaustionException(
      `Memory exhaustion detected: ${memoryUsageMB}MB used, limit: ${limit}MB`,
      { jobId, memoryUsage, memoryUsageMB, limit },
    );
  }
}

/**
 * Checkpoint operation failed
 */
export class CheckpointException extends BatchProcessingException {
  readonly errorCode = 'BATCH_CHECKPOINT_FAILED';

  static notFound(jobId: string): CheckpointException {
    return new CheckpointException(`No checkpoint found for job: ${jobId}`, {
      jobId,
      operation: 'retrieve',
    });
  }

  static saveFailed(jobId: string, reason: string): CheckpointException {
    return new CheckpointException(
      `Failed to save checkpoint for job ${jobId}: ${reason}`,
      { jobId, operation: 'save', reason },
    );
  }

  static loadFailed(jobId: string, reason: string): CheckpointException {
    return new CheckpointException(
      `Failed to load checkpoint for job ${jobId}: ${reason}`,
      { jobId, operation: 'load', reason },
    );
  }
}

/**
 * Job already completed
 */
export class JobAlreadyCompletedException extends BatchProcessingException {
  readonly errorCode = 'BATCH_JOB_ALREADY_COMPLETED';

  static create(jobId: string): JobAlreadyCompletedException {
    return new JobAlreadyCompletedException(
      `Job ${jobId} has already been completed`,
      { jobId },
    );
  }
}

/**
 * Resource monitoring failed
 */
export class ResourceMonitoringException extends BatchProcessingException {
  readonly errorCode = 'BATCH_RESOURCE_MONITORING_FAILED';

  static monitoringStartFailed(
    jobId: string,
    reason: string,
  ): ResourceMonitoringException {
    return new ResourceMonitoringException(
      `Failed to start resource monitoring for job ${jobId}: ${reason}`,
      { jobId, operation: 'start', reason },
    );
  }

  static monitoringCheckFailed(
    jobId: string,
    reason: string,
  ): ResourceMonitoringException {
    return new ResourceMonitoringException(
      `Resource monitoring check failed for job ${jobId}: ${reason}`,
      { jobId, operation: 'check', reason },
    );
  }
}

/**
 * Job coordination failed
 */
export class JobCoordinationException extends BatchProcessingException {
  readonly errorCode = 'BATCH_JOB_COORDINATION_FAILED';

  static pipelineCoordinationFailed(
    jobId: string,
    stage: string,
    reason: string,
  ): JobCoordinationException {
    return new JobCoordinationException(
      `Pipeline coordination failed at stage ${stage} for job ${jobId}: ${reason}`,
      { jobId, stage, reason },
    );
  }
}

/**
 * Configuration validation failed
 */
export class ConfigurationException extends BatchProcessingException {
  readonly errorCode = 'BATCH_CONFIGURATION_INVALID';

  static invalidBatchSize(
    batchSize: number,
    min: number,
    max: number,
  ): ConfigurationException {
    return new ConfigurationException(
      `Invalid batch size ${batchSize}: must be between ${min} and ${max}`,
      { batchSize, min, max },
    );
  }

  static invalidMemoryLimit(memoryLimit: number): ConfigurationException {
    return new ConfigurationException(
      `Invalid memory limit ${memoryLimit}MB: must be greater than 0`,
      { memoryLimit },
    );
  }

  static missingRequiredConfig(configKey: string): ConfigurationException {
    return new ConfigurationException(
      `Missing required configuration: ${configKey}`,
      { configKey },
    );
  }
}

/**
 * Static factory methods for common batch processing exceptions
 */
export const BatchProcessingExceptionFactory = {
  jobInitialization(
    jobId: string,
    filePath: string,
    reason: string,
  ): JobInitializationException {
    return JobInitializationException.create(jobId, filePath, reason);
  },

  memoryExhaustion(
    jobId: string,
    memoryUsage: number,
    limit = 512,
  ): MemoryExhaustionException {
    return MemoryExhaustionException.create(jobId, memoryUsage, limit);
  },

  checkpointNotFound(jobId: string): CheckpointException {
    return CheckpointException.notFound(jobId);
  },

  checkpointSaveFailed(jobId: string, reason: string): CheckpointException {
    return CheckpointException.saveFailed(jobId, reason);
  },

  checkpointLoadFailed(jobId: string, reason: string): CheckpointException {
    return CheckpointException.loadFailed(jobId, reason);
  },

  jobAlreadyCompleted(jobId: string): JobAlreadyCompletedException {
    return JobAlreadyCompletedException.create(jobId);
  },

  resourceMonitoringStartFailed(
    jobId: string,
    reason: string,
  ): ResourceMonitoringException {
    return ResourceMonitoringException.monitoringStartFailed(jobId, reason);
  },

  resourceMonitoringCheckFailed(
    jobId: string,
    reason: string,
  ): ResourceMonitoringException {
    return ResourceMonitoringException.monitoringCheckFailed(jobId, reason);
  },

  pipelineCoordinationFailed(
    jobId: string,
    stage: string,
    reason: string,
  ): JobCoordinationException {
    return JobCoordinationException.pipelineCoordinationFailed(
      jobId,
      stage,
      reason,
    );
  },

  invalidBatchSize(
    batchSize: number,
    min: number,
    max: number,
  ): ConfigurationException {
    return ConfigurationException.invalidBatchSize(batchSize, min, max);
  },

  invalidMemoryLimit(memoryLimit: number): ConfigurationException {
    return ConfigurationException.invalidMemoryLimit(memoryLimit);
  },

  missingRequiredConfig(configKey: string): ConfigurationException {
    return ConfigurationException.missingRequiredConfig(configKey);
  },
};
