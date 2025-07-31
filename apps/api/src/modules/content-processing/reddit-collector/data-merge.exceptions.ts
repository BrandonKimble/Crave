/**
 * Data Merge Exceptions
 *
 * Comprehensive exception handling for temporal data merge operations.
 * Follows established patterns from existing pipeline services for consistency.
 *
 * Implements PRD Section 5.1.2 error handling requirements for data merge operations.
 */

import { AppException } from '../../../shared/exceptions/app-exception.base';
import { HttpStatus } from '@nestjs/common';
import { DataSourceType, GapAnalysisResult } from './data-merge.types';

/**
 * Base exception for data merge operations
 * Provides consistent error handling across merge pipeline
 */
export class DataMergeException extends AppException {
  readonly errorCode = 'DATA_MERGE_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }

  static timestampNormalization(
    rawTimestamp: unknown,
    sourceType: DataSourceType,
    itemId: string,
  ): DataMergeException {
    return new DataMergeException(
      'Failed to normalize timestamp for temporal merge',
      {
        rawTimestamp,
        sourceType,
        itemId,
        phase: 'timestamp_normalization',
      },
    );
  }

  static sourceAttribution(
    itemId: string,
    sourceType: DataSourceType,
    reason: string,
  ): DataMergeException {
    return new DataMergeException(
      'Failed to create source attribution metadata',
      {
        itemId,
        sourceType,
        reason,
        phase: 'source_attribution',
      },
    );
  }

  static temporalOrdering(items: number, reason: string): DataMergeException {
    return new DataMergeException(
      'Failed to establish temporal ordering for merge batch',
      {
        itemCount: items,
        reason,
        phase: 'temporal_ordering',
      },
    );
  }

  static gapDetection(
    startTimestamp: number,
    endTimestamp: number,
    reason: string,
  ): DataMergeException {
    return new DataMergeException(
      'Failed to analyze temporal gaps between data sources',
      {
        startTimestamp,
        endTimestamp,
        reason,
        phase: 'gap_detection',
      },
    );
  }
}

/**
 * Exception for merge validation failures
 * Thrown when merged data fails quality validation
 */
export class MergeValidationException extends AppException {
  readonly errorCode = 'MERGE_VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.BAD_REQUEST, context, cause);
  }

  static qualityThreshold(
    actualScore: number,
    requiredScore: number,
    issues: string[],
  ): MergeValidationException {
    return new MergeValidationException(
      'Merged data quality score below required threshold',
      {
        actualScore,
        requiredScore,
        issues,
        phase: 'quality_validation',
      },
    );
  }

  static temporalConsistency(
    inconsistentItems: number,
    totalItems: number,
    details: string,
  ): MergeValidationException {
    return new MergeValidationException(
      'Temporal consistency validation failed for merged batch',
      {
        inconsistentItems,
        totalItems,
        details,
        phase: 'temporal_consistency',
      },
    );
  }

  static sourceIntegrity(
    missingAttribution: number,
    sourceBreakdown: Record<DataSourceType, number>,
  ): MergeValidationException {
    return new MergeValidationException(
      'Source attribution integrity validation failed',
      {
        missingAttribution,
        sourceBreakdown,
        phase: 'source_integrity',
      },
    );
  }
}

/**
 * Exception for temporal gap detection issues
 * Thrown when gap analysis encounters critical problems
 */
export class GapAnalysisException extends AppException {
  readonly errorCode = 'GAP_ANALYSIS_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }

  static criticalGap(
    gaps: GapAnalysisResult[],
    totalCoverage: number,
  ): GapAnalysisException {
    return new GapAnalysisException(
      'Critical temporal gaps detected that may affect data quality',
      {
        gapCount: gaps.length,
        totalCoverage,
        criticalGaps: gaps.filter((g) => g.severity === 'high'),
        phase: 'gap_analysis',
      },
    );
  }

  static analysisFailure(
    timeRange: { start: number; end: number },
    reason: string,
  ): GapAnalysisException {
    return new GapAnalysisException(
      'Failed to complete gap analysis for temporal range',
      {
        timeRange,
        reason,
        phase: 'gap_computation',
      },
    );
  }
}

/**
 * Exception factory for creating typed merge exceptions
 * Provides consistent exception creation patterns
 */
export class DataMergeExceptionFactory {
  static timestampNormalizationFailed(
    rawTimestamp: unknown,
    sourceType: DataSourceType,
    itemId: string,
    cause?: Error,
  ): DataMergeException {
    return new DataMergeException(
      `Timestamp normalization failed for ${sourceType} item ${itemId}`,
      { rawTimestamp, sourceType, itemId },
      cause,
    );
  }

  static temporalOrderingFailed(
    batchSize: number,
    reason: string,
    cause?: Error,
  ): DataMergeException {
    return new DataMergeException(
      `Temporal ordering failed for batch of ${batchSize} items: ${reason}`,
      { batchSize, reason },
      cause,
    );
  }

  static mergeValidationFailed(
    validationErrors: string[],
    qualityScore: number,
    cause?: Error,
  ): MergeValidationException {
    return new MergeValidationException(
      `Merge validation failed with quality score ${qualityScore}`,
      { validationErrors, qualityScore },
      cause,
    );
  }

  static gapAnalysisFailed(
    timespan: number,
    reason: string,
    cause?: Error,
  ): GapAnalysisException {
    return new GapAnalysisException(
      `Gap analysis failed for ${timespan}h timespan: ${reason}`,
      { timespan, reason },
      cause,
    );
  }
}
