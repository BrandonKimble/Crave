import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app-exception.base';

/**
 * Stream Processor Exception
 *
 * Custom exception for stream processing errors with detailed context
 */
export class StreamProcessorException extends AppException {
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
    this.name = 'StreamProcessorException';
  }

  /**
   * Factory method for decompression errors
   */
  static decompression(
    filePath: string,
    error: string,
  ): StreamProcessorException {
    return new StreamProcessorException(
      'DECOMPRESSION_ERROR',
      `Failed to decompress file: ${filePath}`,
      { filePath, originalError: error },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Factory method for file access errors
   */
  static fileAccess(filePath: string, error: string): StreamProcessorException {
    return new StreamProcessorException(
      'FILE_ACCESS_ERROR',
      `Cannot access file: ${filePath}`,
      { filePath, originalError: error },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Factory method for processing timeout errors
   */
  static timeout(
    filePath: string,
    timeoutMs: number,
  ): StreamProcessorException {
    return new StreamProcessorException(
      'PROCESSING_TIMEOUT',
      `Processing timeout after ${timeoutMs}ms`,
      { filePath, timeout: timeoutMs },
      HttpStatus.REQUEST_TIMEOUT,
    );
  }

  /**
   * Factory method for validation errors
   */
  static validation(
    filePath: string,
    issues: string[],
  ): StreamProcessorException {
    return new StreamProcessorException(
      'VALIDATION_ERROR',
      `File validation failed: ${issues.join(', ')}`,
      { filePath, validationIssues: issues },
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Factory method for memory errors
   */
  static memory(
    filePath: string,
    memoryUsage: number,
  ): StreamProcessorException {
    return new StreamProcessorException(
      'MEMORY_ERROR',
      `Memory usage exceeded limits during processing`,
      { filePath, memoryUsageMB: Math.round(memoryUsage / 1024 / 1024) },
      HttpStatus.INSUFFICIENT_STORAGE,
    );
  }
}
