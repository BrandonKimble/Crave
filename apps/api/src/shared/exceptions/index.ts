import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.base';

/**
 * Exception thrown when input validation fails
 */
export class ValidationException extends AppException {
  readonly errorCode = 'VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(
    validationErrors: string[] | string,
    context?: Record<string, any>,
  ) {
    const message = Array.isArray(validationErrors)
      ? `Validation failed: ${validationErrors.join(', ')}`
      : validationErrors;

    super(message, HttpStatus.BAD_REQUEST, {
      ...context,
      validationErrors: Array.isArray(validationErrors)
        ? validationErrors
        : [validationErrors],
    });
  }
}

/**
 * Exception thrown when database operations fail
 */
export class DatabaseException extends AppException {
  readonly errorCode = 'DATABASE_ERROR';
  readonly isOperational = true;

  constructor(
    operation: string,
    entityType?: string,
    originalError?: Error,
    context?: Record<string, any>,
  ) {
    const message = entityType
      ? `Database ${operation} failed for ${entityType}`
      : `Database ${operation} failed`;

    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        ...context,
        operation,
        entityType,
        originalError: originalError?.message,
      },
      originalError,
    );
  }
}

/**
 * Exception thrown when business logic validation fails
 */
export class BusinessLogicException extends AppException {
  readonly errorCode = 'BUSINESS_LOGIC_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    context?: Record<string, any>,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, statusCode, context);
  }
}

/**
 * Exception thrown when authorization fails
 */
export class AuthorizationException extends AppException {
  readonly errorCode = 'AUTHORIZATION_ERROR';
  readonly isOperational = true;

  constructor(message = 'Access denied', context?: Record<string, any>) {
    super(message, HttpStatus.FORBIDDEN, context);
  }
}

/**
 * Exception thrown when external API calls fail
 */
export class ExternalServiceException extends AppException {
  readonly errorCode = 'EXTERNAL_SERVICE_ERROR';
  readonly isOperational = true;

  constructor(
    serviceName: string,
    operation: string,
    originalError?: Error,
    context?: Record<string, any>,
  ) {
    const message = `${serviceName} service error during ${operation}`;

    super(
      message,
      HttpStatus.BAD_GATEWAY,
      {
        ...context,
        serviceName,
        operation,
        originalError: originalError?.message,
      },
      originalError,
    );
  }
}

/**
 * Exception thrown for rate limiting
 */
export class RateLimitException extends AppException {
  readonly errorCode = 'RATE_LIMIT_ERROR';
  readonly isOperational = true;

  constructor(resetTime?: Date, context?: Record<string, any>) {
    const message = resetTime
      ? `Rate limit exceeded. Try again after ${resetTime.toISOString()}`
      : 'Rate limit exceeded';

    super(message, HttpStatus.TOO_MANY_REQUESTS, {
      ...context,
      resetTime: resetTime?.toISOString(),
    });
  }
}

// Export base class and all exception types
export { AppException } from './app-exception.base';
