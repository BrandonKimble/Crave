import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app-exception.base';

/**
 * Scheduled Collection Exceptions
 *
 * Custom exceptions for scheduled collection system errors following established
 * application exception patterns.
 */

/**
 * Base exception for all scheduled collection errors
 */
export abstract class ScheduledCollectionException extends AppException {
  abstract readonly errorCode: string;
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }
}

/**
 * Job scheduling failed
 */
export class JobSchedulingException extends ScheduledCollectionException {
  readonly errorCode = 'SCHEDULED_JOB_SCHEDULING_FAILED';

  static create(
    jobType: string,
    scheduledTime: Date,
    reason: string,
  ): JobSchedulingException {
    return new JobSchedulingException(
      `Failed to schedule ${jobType} job for ${scheduledTime.toISOString()}: ${reason}`,
      { jobType, scheduledTime, reason },
    );
  }
}

/**
 * Job execution failed beyond retry limits
 */
export class JobExecutionException extends ScheduledCollectionException {
  readonly errorCode = 'SCHEDULED_JOB_EXECUTION_FAILED';

  static maxRetriesExceeded(
    jobId: string,
    jobType: string,
    attempts: number,
    lastError: string,
  ): JobExecutionException {
    return new JobExecutionException(
      `Job ${jobId} (${jobType}) failed after ${attempts} attempts. Last error: ${lastError}`,
      { jobId, jobType, attempts, lastError },
    );
  }

  static criticalFailure(
    jobId: string,
    jobType: string,
    reason: string,
  ): JobExecutionException {
    return new JobExecutionException(
      `Critical failure in job ${jobId} (${jobType}): ${reason}`,
      { jobId, jobType, reason },
    );
  }
}

/**
 * Job monitoring failure
 */
export class JobMonitoringException extends ScheduledCollectionException {
  readonly errorCode = 'SCHEDULED_JOB_MONITORING_FAILED';

  static metricsCollectionFailed(
    jobId: string,
    reason: string,
  ): JobMonitoringException {
    return new JobMonitoringException(
      `Failed to collect metrics for job ${jobId}: ${reason}`,
      { jobId, reason },
    );
  }

  static alertingFailed(
    alertType: string,
    reason: string,
  ): JobMonitoringException {
    return new JobMonitoringException(
      `Failed to send ${alertType} alert: ${reason}`,
      { alertType, reason },
    );
  }
}

/**
 * Configuration validation failed
 */
export class SchedulingConfigurationException extends ScheduledCollectionException {
  readonly errorCode = 'SCHEDULED_CONFIGURATION_INVALID';

  static invalidSchedule(
    schedule: string,
    reason: string,
  ): SchedulingConfigurationException {
    return new SchedulingConfigurationException(
      `Invalid schedule configuration '${schedule}': ${reason}`,
      { schedule, reason },
    );
  }

  static invalidRetryConfig(
    maxRetries: number,
    backoffMs: number,
  ): SchedulingConfigurationException {
    return new SchedulingConfigurationException(
      `Invalid retry configuration: maxRetries=${maxRetries}, backoffMs=${backoffMs}`,
      { maxRetries, backoffMs },
    );
  }

  static missingSubredditConfig(
    subreddit: string,
  ): SchedulingConfigurationException {
    return new SchedulingConfigurationException(
      `Missing scheduling configuration for subreddit: ${subreddit}`,
      { subreddit },
    );
  }
}

/**
 * Static factory methods for common scheduled collection exceptions
 */
export const ScheduledCollectionExceptionFactory = {
  jobSchedulingFailed(
    jobType: string,
    scheduledTime: Date,
    reason: string,
  ): JobSchedulingException {
    return JobSchedulingException.create(jobType, scheduledTime, reason);
  },

  maxRetriesExceeded(
    jobId: string,
    jobType: string,
    attempts: number,
    lastError: string,
  ): JobExecutionException {
    return JobExecutionException.maxRetriesExceeded(
      jobId,
      jobType,
      attempts,
      lastError,
    );
  },

  criticalJobFailure(
    jobId: string,
    jobType: string,
    reason: string,
  ): JobExecutionException {
    return JobExecutionException.criticalFailure(jobId, jobType, reason);
  },

  metricsCollectionFailed(
    jobId: string,
    reason: string,
  ): JobMonitoringException {
    return JobMonitoringException.metricsCollectionFailed(jobId, reason);
  },

  alertingFailed(alertType: string, reason: string): JobMonitoringException {
    return JobMonitoringException.alertingFailed(alertType, reason);
  },

  invalidSchedule(
    schedule: string,
    reason: string,
  ): SchedulingConfigurationException {
    return SchedulingConfigurationException.invalidSchedule(schedule, reason);
  },

  invalidRetryConfig(
    maxRetries: number,
    backoffMs: number,
  ): SchedulingConfigurationException {
    return SchedulingConfigurationException.invalidRetryConfig(
      maxRetries,
      backoffMs,
    );
  },

  missingSubredditConfig(subreddit: string): SchedulingConfigurationException {
    return SchedulingConfigurationException.missingSubredditConfig(subreddit);
  },
};
