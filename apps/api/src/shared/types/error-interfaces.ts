/**
 * Tier 2 Error Handling Interfaces
 *
 * This file provides typed interfaces for common error patterns that
 * currently use 'any' in the codebase. Use these interfaces to gradually
 * migrate away from unsafe any usage in error handling.
 *
 * Status: Template for gradual migration
 * Priority: Medium (implement when refactoring error handlers)
 */

/**
 * Prisma-specific error interface
 * Use for database operation error handling
 */
export interface PrismaError {
  code?: string;
  message: string;
  meta?: {
    target?: string[];
    field_name?: string;
    table?: string;
    constraint?: string;
    column?: string;
    [key: string]: unknown;
  };
  clientVersion?: string;
}

/**
 * HTTP error interface for external API responses
 */
export interface HttpError {
  status?: number;
  statusCode?: number;
  message: string;
  stack?: string;
  code?: string;
  name?: string;
  cause?: unknown;
}

/**
 * Generic API response error interface
 */
export interface ApiError {
  error: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
  statusCode?: number;
}

/**
 * Reddit API specific error interface
 */
export interface RedditApiError {
  error?: string;
  message?: string;
  error_type?: string;
  fields?: string[];
}

/**
 * LLM API error interface
 */
export interface LLMApiError {
  error?: {
    message: string;
    type: string;
    code?: string;
  };
  statusCode?: number;
}

/**
 * Database connection error interface
 */
export interface DatabaseConnectionError {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
  port?: number;
  message: string;
}

/**
 * Type guards for safe error checking
 */
export function isPrismaError(error: unknown): error is PrismaError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('status' in error || 'statusCode' in error)
  );
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as Record<string, unknown>).error === 'string'
  );
}

export function isRedditApiError(error: unknown): error is RedditApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('error' in error || 'message' in error)
  );
}

export function isLLMApiError(error: unknown): error is LLMApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as Record<string, unknown>).error === 'object'
  );
}

export function isDatabaseConnectionError(
  error: unknown,
): error is DatabaseConnectionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'errno' in error)
  );
}

/**
 * Utility function to safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isPrismaError(error)) {
    return error.message;
  }
  if (isHttpError(error)) {
    return error.message;
  }
  if (isApiError(error)) {
    return error.error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Utility function to safely extract error code from unknown error
 */
export function getErrorCode(error: unknown): string | undefined {
  if (isPrismaError(error) || isHttpError(error)) {
    return error.code;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'string' || typeof code === 'number') {
      return String(code);
    }
  }
  return undefined;
}

/**
 * Example usage in error handlers:
 *
 * ```typescript
 * import { isPrismaError, isHttpError, getErrorMessage } from '../shared/types/error-interfaces';
 *
 * protected handleError(error: unknown, operation: string): Error {
 *   if (isPrismaError(error)) {
 *     switch (error.code) {
 *       case 'P2002':
 *         return new UniqueConstraintException(this.entityName, error.meta?.target);
 *       case 'P2003':
 *         return new ForeignKeyConstraintException(this.entityName, error.meta?.field_name);
 *       default:
 *         return new DatabaseOperationException(operation, this.entityName, error);
 *     }
 *   }
 *
 *   if (isHttpError(error)) {
 *     return new HttpException(error.message, error.status || error.statusCode || 500);
 *   }
 *
 *   return new Error(getErrorMessage(error));
 * }
 * ```
 */
