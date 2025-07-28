import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared';

/**
 * Exception thrown when Google Places API authentication fails
 */
export class GooglePlacesAuthenticationError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_AUTHENTICATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, details?: string) {
    super(message, HttpStatus.UNAUTHORIZED, { details });
    this.name = 'GooglePlacesAuthenticationError';
  }
}

/**
 * Exception thrown when Google Places configuration is invalid
 */
export class GooglePlacesConfigurationError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_CONFIGURATION_ERROR';
  readonly isOperational = true;

  constructor(message: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, {});
    this.name = 'GooglePlacesConfigurationError';
  }
}

/**
 * Exception thrown when Google Places API rate limits are hit
 */
export class GooglePlacesRateLimitError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_RATE_LIMIT_ERROR';
  readonly isOperational = true;

  constructor(resetTime?: number) {
    super(
      'Google Places API rate limit exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
      {
        resetTime,
      },
    );
    this.name = 'GooglePlacesRateLimitError';
  }
}

/**
 * Exception thrown when Google Places network requests fail
 */
export class GooglePlacesNetworkError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_NETWORK_ERROR';
  readonly isOperational = true;

  constructor(message: string, originalError: Error) {
    super(
      message,
      HttpStatus.BAD_GATEWAY,
      { originalError: originalError.message },
      originalError,
    );
    this.name = 'GooglePlacesNetworkError';
  }
}

/**
 * Exception thrown when Google Places API returns errors
 */
export class GooglePlacesApiError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_API_ERROR';
  readonly isOperational = true;

  constructor(message: string, statusCode?: number, responseData?: string) {
    super(message, HttpStatus.BAD_GATEWAY, { statusCode, responseData });
    this.name = 'GooglePlacesApiError';
  }
}

/**
 * Exception thrown when Google Places response parsing fails
 */
export class GooglePlacesResponseParsingError extends AppException {
  readonly errorCode = 'GOOGLE_PLACES_RESPONSE_PARSING_ERROR';
  readonly isOperational = true;

  constructor(message: string, originalResponse?: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, { originalResponse });
    this.name = 'GooglePlacesResponseParsingError';
  }
}
