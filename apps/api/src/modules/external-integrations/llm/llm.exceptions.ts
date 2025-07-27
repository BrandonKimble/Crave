import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared';

/**
 * Exception thrown when LLM API authentication fails
 */
export class LLMAuthenticationError extends AppException {
  readonly errorCode = 'LLM_AUTHENTICATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, details?: string) {
    super(message, HttpStatus.UNAUTHORIZED, { details });
    this.name = 'LLMAuthenticationError';
  }
}

/**
 * Exception thrown when LLM configuration is invalid
 */
export class LLMConfigurationError extends AppException {
  readonly errorCode = 'LLM_CONFIGURATION_ERROR';
  readonly isOperational = true;

  constructor(message: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, {});
    this.name = 'LLMConfigurationError';
  }
}

/**
 * Exception thrown when LLM API rate limits are hit
 */
export class LLMRateLimitError extends AppException {
  readonly errorCode = 'LLM_RATE_LIMIT_ERROR';
  readonly isOperational = true;

  constructor(resetTime?: number) {
    super('LLM API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS, {
      resetTime,
    });
    this.name = 'LLMRateLimitError';
  }
}

/**
 * Exception thrown when LLM network requests fail
 */
export class LLMNetworkError extends AppException {
  readonly errorCode = 'LLM_NETWORK_ERROR';
  readonly isOperational = true;

  constructor(message: string, originalError: Error) {
    super(
      message,
      HttpStatus.BAD_GATEWAY,
      { originalError: originalError.message },
      originalError,
    );
    this.name = 'LLMNetworkError';
  }
}

/**
 * Exception thrown when LLM API returns errors
 */
export class LLMApiError extends AppException {
  readonly errorCode = 'LLM_API_ERROR';
  readonly isOperational = true;

  constructor(message: string, statusCode?: number, responseData?: string) {
    super(message, HttpStatus.BAD_GATEWAY, { statusCode, responseData });
    this.name = 'LLMApiError';
  }
}

/**
 * Exception thrown when LLM response parsing fails
 */
export class LLMResponseParsingError extends AppException {
  readonly errorCode = 'LLM_RESPONSE_PARSING_ERROR';
  readonly isOperational = true;

  constructor(message: string, originalResponse?: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, { originalResponse });
    this.name = 'LLMResponseParsingError';
  }
}
