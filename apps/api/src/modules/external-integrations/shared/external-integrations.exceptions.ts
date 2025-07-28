import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions';

/**
 * Base External API Exception
 *
 * Common exception class for all external API integrations
 * Implements PRD section 9.2.2: "graceful error handling"
 */
export abstract class BaseExternalApiException extends AppException {
  abstract readonly errorCode: string;
  readonly isOperational = true;

  constructor(
    message: string,
    httpStatus: HttpStatus = HttpStatus.SERVICE_UNAVAILABLE,
    public readonly service: string,
    public readonly operation?: string,
    public readonly retryAfter?: number,
  ) {
    super(message, httpStatus);
    this.name = this.constructor.name;
  }
}

/**
 * Rate limiting exception for external APIs
 */
export class ExternalApiRateLimitException extends BaseExternalApiException {
  readonly errorCode = 'EXTERNAL_API_RATE_LIMIT';

  constructor(
    service: string,
    operation: string,
    retryAfter: number,
    message = `Rate limit exceeded for ${service} service`,
  ) {
    super(
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      service,
      operation,
      retryAfter,
    );
  }
}

/**
 * Configuration error for external APIs
 */
export class ExternalApiConfigurationException extends BaseExternalApiException {
  readonly errorCode = 'EXTERNAL_API_CONFIGURATION';

  constructor(
    service: string,
    configField: string,
    message = `Configuration error for ${service}: ${configField}`,
  ) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, service);
  }
}

/**
 * Network error for external APIs
 */
export class ExternalApiNetworkException extends BaseExternalApiException {
  readonly errorCode = 'EXTERNAL_API_NETWORK';

  constructor(
    service: string,
    operation: string,
    originalError?: Error,
    message = `Network error for ${service} service`,
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, service, operation);
    if (originalError) {
      this.cause = originalError;
    }
  }
}

/**
 * Authentication error for external APIs
 */
export class ExternalApiAuthenticationException extends BaseExternalApiException {
  readonly errorCode = 'EXTERNAL_API_AUTHENTICATION';

  constructor(
    service: string,
    message = `Authentication failed for ${service} service`,
  ) {
    super(message, HttpStatus.UNAUTHORIZED, service);
  }
}

/**
 * Generic API error for external services
 */
export class ExternalApiException extends BaseExternalApiException {
  readonly errorCode = 'EXTERNAL_API_ERROR';

  constructor(
    service: string,
    operation: string,
    statusCode: number,
    message = `API error for ${service} service`,
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, service, operation);
  }
}
