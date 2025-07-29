import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app-exception.base';

/**
 * Historical Content Pipeline Exception
 *
 * Custom exception for historical content processing errors with detailed context
 * Follows established StreamProcessorException patterns
 */
export class HistoricalContentPipelineException extends AppException {
  readonly errorCode: string;
  readonly isOperational = true;

  constructor(
    errorCode: string,
    message: string,
    context?: Record<string, unknown>,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message, status, context);
    this.errorCode = errorCode;
    this.name = 'HistoricalContentPipelineException';
  }

  /**
   * Factory method for extraction errors
   */
  static extraction(
    itemType: 'submission' | 'comment',
    itemId: string,
    error: string,
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'CONTENT_EXTRACTION_ERROR',
      `Failed to extract ${itemType}: ${itemId}`,
      { itemType, itemId, originalError: error },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  /**
   * Factory method for validation errors
   */
  static validation(
    itemType: 'submission' | 'comment',
    itemId: string,
    issues: string[],
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'CONTENT_VALIDATION_ERROR',
      `Content validation failed for ${itemType}: ${issues.join(', ')}`,
      { itemType, itemId, validationIssues: issues },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Factory method for timestamp processing errors
   */
  static timestamp(
    itemId: string,
    timestamp: unknown,
    error: string,
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'TIMESTAMP_PROCESSING_ERROR',
      `Invalid timestamp format for item ${itemId}`,
      { itemId, timestamp, originalError: error },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Factory method for thread relationship errors
   */
  static threadRelationship(
    commentId: string,
    parentId: string,
    error: string,
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'THREAD_RELATIONSHIP_ERROR',
      `Failed to preserve thread relationship for comment ${commentId}`,
      { commentId, parentId, originalError: error },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Factory method for LLM format conversion errors
   */
  static llmFormatConversion(
    batchId: string,
    error: string,
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'LLM_FORMAT_CONVERSION_ERROR',
      `Failed to convert batch ${batchId} to LLM format`,
      { batchId, originalError: error },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Factory method for batch processing errors
   */
  static batchProcessing(
    batchId: string,
    processedCount: number,
    totalCount: number,
    error: string,
  ): HistoricalContentPipelineException {
    return new HistoricalContentPipelineException(
      'BATCH_PROCESSING_ERROR',
      `Batch processing failed for ${batchId} after ${processedCount}/${totalCount} items`,
      { batchId, processedCount, totalCount, originalError: error },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
