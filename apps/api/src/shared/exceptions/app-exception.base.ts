import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base application exception class that all custom exceptions should extend.
 * Provides consistent error handling across the entire application.
 */
export abstract class AppException extends HttpException {
  abstract readonly errorCode: string;
  abstract readonly isOperational: boolean;

  constructor(
    message: string,
    status: HttpStatus,
    public readonly context?: Record<string, any>,
    cause?: Error,
  ) {
    super(message, status, { cause });
  }

  /**
   * Get sanitized error details for client response
   */
  getClientSafeMessage(isProd = false): string {
    if (isProd && !this.isOperational) {
      return 'An internal error occurred';
    }
    return this.message;
  }

  /**
   * Get full error context for logging
   */
  getLogContext(): Record<string, any> {
    return {
      errorCode: this.errorCode,
      status: this.getStatus(),
      context: this.context,
      isOperational: this.isOperational,
      stack: this.stack,
    };
  }
}
