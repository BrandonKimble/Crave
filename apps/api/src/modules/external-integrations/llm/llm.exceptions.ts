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

  constructor(
    resetTime?: number,
    options?: {
      kind?: 'rpm' | 'tpm' | 'daily_quota' | 'unknown';
      providerStatusCode?: number;
      providerStatus?: string;
      providerMessage?: string;
      quotaMetric?: string;
    },
  ) {
    super('LLM API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS, {
      resetTime,
      kind: options?.kind ?? 'unknown',
      providerStatusCode: options?.providerStatusCode,
      providerStatus: options?.providerStatus,
      providerMessage: options?.providerMessage,
      quotaMetric: options?.quotaMetric,
    });
    this.name = 'LLMRateLimitError';
  }
}

/**
 * Exception thrown when we intentionally abort after repeated rate limits.
 * Intended for dev/test to avoid burning quota during long-running pipelines.
 */
export class LLMRateLimitAbortError extends AppException {
  readonly errorCode = 'LLM_RATE_LIMIT_ABORT_ERROR';
  readonly isOperational = true;

  constructor(message: string, resetTime?: number) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, { resetTime });
    this.name = 'LLMRateLimitAbortError';
  }
}

/**
 * Exception thrown when LLM-powered user-facing functionality is unavailable.
 * Intended for request/response paths where we prefer a fast, explicit failure.
 */
export class LLMUnavailableError extends AppException {
  readonly errorCode = 'LLM_UNAVAILABLE';
  readonly isOperational = true;

  constructor(
    message = 'Search is temporarily unavailable. Please try again.',
    details?: string,
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, { details });
    this.name = 'LLMUnavailableError';
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
