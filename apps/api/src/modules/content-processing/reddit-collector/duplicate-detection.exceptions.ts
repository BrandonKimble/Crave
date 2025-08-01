/**
 * Duplicate Detection Exceptions
 *
 * Comprehensive exception handling for duplicate detection operations.
 * Follows established patterns from DataMergeException for consistency.
 *
 * Implements PRD Section 5.1.2 error handling requirements for duplicate detection.
 */

import { AppException } from '../../../shared/exceptions/app-exception.base';
import { HttpStatus } from '@nestjs/common';
import { DataSourceType } from './data-merge.types';

/**
 * Base exception for duplicate detection operations
 * Provides consistent error handling across duplicate detection pipeline
 */
export class DuplicateDetectionException extends AppException {
  readonly errorCode = 'DUPLICATE_DETECTION_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }

  static contentIdentifierGeneration(
    itemId: string,
    itemType: string,
    reason: string,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Failed to generate content identifier for duplicate detection',
      {
        itemId,
        itemType,
        reason,
        phase: 'identifier_generation',
        operation: 'duplicate_detection',
      },
    );
  }

  static lookupFailure(
    identifier: string,
    sourceType: DataSourceType,
    reason: string,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Failed to perform duplicate lookup operation',
      {
        identifier,
        sourceType,
        reason,
        phase: 'duplicate_lookup',
        operation: 'duplicate_detection',
      },
    );
  }

  static batchProcessingFailure(
    batchSize: number,
    processedCount: number,
    reason: string,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Failed to process duplicate detection batch',
      {
        batchSize,
        processedCount,
        reason,
        phase: 'batch_processing',
        operation: 'duplicate_detection',
      },
    );
  }
}

/**
 * Exception for duplicate validation errors
 * Handles validation failures during duplicate detection
 */
export class DuplicateValidationException extends AppException {
  readonly errorCode = 'DUPLICATE_VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.BAD_REQUEST, context, cause);
  }

  static invalidConfiguration(
    configField: string,
    providedValue: unknown,
    expectedFormat: string,
  ): DuplicateValidationException {
    return new DuplicateValidationException(
      'Invalid duplicate detection configuration provided',
      {
        configField,
        providedValue,
        expectedFormat,
        phase: 'configuration_validation',
        operation: 'duplicate_detection',
      },
    );
  }

  static invalidItemFormat(
    itemId: string,
    expectedFormat: string,
    providedFormat: string,
  ): DuplicateValidationException {
    return new DuplicateValidationException(
      'Item format does not match expected structure for duplicate detection',
      {
        itemId,
        expectedFormat,
        providedFormat,
        phase: 'item_validation',
        operation: 'duplicate_detection',
      },
    );
  }

  static invalidBatchSize(
    providedSize: number,
    maxAllowedSize: number,
  ): DuplicateValidationException {
    return new DuplicateValidationException(
      'Batch size exceeds maximum allowed limit for duplicate detection',
      {
        providedSize,
        maxAllowedSize,
        phase: 'batch_validation',
        operation: 'duplicate_detection',
      },
    );
  }
}

/**
 * Exception for duplicate detection performance issues
 * Handles performance-related failures and resource constraints
 */
export class DuplicatePerformanceException extends AppException {
  readonly errorCode = 'DUPLICATE_PERFORMANCE_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, context, cause);
  }

  static memoryLimitExceeded(
    currentMemoryMB: number,
    maxAllowedMB: number,
    itemsProcessed: number,
  ): DuplicatePerformanceException {
    return new DuplicatePerformanceException(
      'Memory limit exceeded during duplicate detection processing',
      {
        currentMemoryMB,
        maxAllowedMB,
        itemsProcessed,
        phase: 'memory_monitoring',
        operation: 'duplicate_detection',
        recommendedAction: 'Reduce batch size or enable memory-efficient mode',
      },
    );
  }

  static processingTimeout(
    timeoutMs: number,
    itemsProcessed: number,
    totalItems: number,
  ): DuplicatePerformanceException {
    return new DuplicatePerformanceException(
      'Duplicate detection processing exceeded timeout limit',
      {
        timeoutMs,
        itemsProcessed,
        totalItems,
        completionPercentage: Math.round((itemsProcessed / totalItems) * 100),
        phase: 'processing_timeout',
        operation: 'duplicate_detection',
        recommendedAction: 'Increase timeout or optimize processing algorithm',
      },
    );
  }

  static cacheSizeExceeded(
    currentCacheSize: number,
    maxCacheSize: number,
  ): DuplicatePerformanceException {
    return new DuplicatePerformanceException(
      'Duplicate detection cache size exceeded maximum limit',
      {
        currentCacheSize,
        maxCacheSize,
        phase: 'cache_management',
        operation: 'duplicate_detection',
        recommendedAction: 'Increase cache size limit or enable cache eviction',
      },
    );
  }
}

/**
 * Factory class for creating duplicate detection exceptions
 * Provides convenient methods for common exception scenarios
 */
export class DuplicateDetectionExceptionFactory {
  static identifierGenerationFailed(
    itemId: string,
    itemType: string,
    underlyingError?: Error,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Content identifier generation failed during duplicate detection',
      {
        itemId,
        itemType,
        phase: 'identifier_generation',
        operation: 'duplicate_detection',
        underlyingError: underlyingError?.message,
      },
      underlyingError,
    );
  }

  static batchAnalysisFailed(
    batchId: string,
    itemCount: number,
    errorPhase: string,
    underlyingError?: Error,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Batch duplicate analysis operation failed',
      {
        batchId,
        itemCount,
        errorPhase,
        phase: 'batch_analysis',
        operation: 'duplicate_detection',
        underlyingError: underlyingError?.message,
      },
      underlyingError,
    );
  }

  static overlapAnalysisFailed(
    sourceTypes: string[],
    itemCount: number,
    underlyingError?: Error,
  ): DuplicateDetectionException {
    return new DuplicateDetectionException(
      'Source overlap analysis failed during duplicate detection',
      {
        sourceTypes,
        itemCount,
        phase: 'overlap_analysis',
        operation: 'duplicate_detection',
        underlyingError: underlyingError?.message,
      },
      underlyingError,
    );
  }

  static performanceMonitoringFailed(
    monitoringType: string,
    reason: string,
    underlyingError?: Error,
  ): DuplicatePerformanceException {
    return new DuplicatePerformanceException(
      'Performance monitoring failed during duplicate detection',
      {
        monitoringType,
        reason,
        phase: 'performance_monitoring',
        operation: 'duplicate_detection',
        underlyingError: underlyingError?.message,
      },
      underlyingError,
    );
  }

  static configurationValidationFailed(
    configErrors: string[],
    providedConfig: Record<string, any>,
  ): DuplicateValidationException {
    return new DuplicateValidationException(
      'Duplicate detection configuration validation failed',
      {
        configErrors,
        providedConfig,
        phase: 'configuration_validation',
        operation: 'duplicate_detection',
        recommendedAction:
          'Review configuration parameters and provide valid values',
      },
    );
  }
}
