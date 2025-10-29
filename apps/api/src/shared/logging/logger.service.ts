import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';
import {
  isHttpError,
  getErrorMessage,
  getErrorCode,
} from '../types/error-interfaces';

/**
 * Structured logging metadata interface
 */
export interface LogMetadata {
  correlationId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  entityId?: string;
  entityType?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string | number;
    name?: string;
    cause?: string;
  };
  [key: string]: unknown;
}

/**
 * Enhanced logger service providing structured logging with Winston integration
 */
@Injectable()
export class LoggerService {
  private readonly serviceName =
    process.env.LOG_SERVICE_NAME ?? 'crave-search-api';
  private readonly environmentName = process.env.NODE_ENV ?? 'development';

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
    private readonly contextName?: string,
  ) {}

  private buildBaseMetadata(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      service: this.serviceName,
      environment: this.environmentName,
    };

    if (this.contextName) {
      base.context = this.contextName;
    }

    return base;
  }

  /**
   * Set context for all subsequent log entries from this service instance
   */
  setContext(context: string): LoggerService {
    return this.child({ context });
  }

  /**
   * Log debug level messages with structured metadata
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, this.sanitizeMetadata(metadata));
  }

  /**
   * Log info level messages with structured metadata
   */
  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, this.sanitizeMetadata(metadata));
  }

  /**
   * Log warning level messages with structured metadata
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, this.sanitizeMetadata(metadata));
  }

  /**
   * Log error level messages with structured metadata
   */
  error(message: string, error?: unknown, metadata?: LogMetadata): void {
    const errorMetadata = this.buildErrorMetadata(error, metadata);
    this.logger.error(message, this.sanitizeMetadata(errorMetadata));
  }

  /**
   * Log HTTP request/response information
   */
  http(
    message: string,
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    metadata?: LogMetadata,
  ): void {
    const httpMetadata: LogMetadata = {
      ...metadata,
      method,
      url,
      statusCode,
      duration,
    };
    this.logger.http(message, this.sanitizeMetadata(httpMetadata));
  }

  /**
   * Log database operation with timing and context
   */
  database(
    operation: string,
    entityType: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void {
    const dbMetadata: LogMetadata = {
      ...metadata,
      operation,
      entityType,
      duration,
      success,
    };

    const level = success ? 'debug' : 'error';
    const message = `Database ${operation} on ${entityType} ${
      success ? 'completed' : 'failed'
    } (${duration}ms)`;

    this.logger.log(level, message, this.sanitizeMetadata(dbMetadata));
  }

  /**
   * Log performance metrics for operations
   */
  performance(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void {
    const perfMetadata: LogMetadata = {
      ...metadata,
      operation,
      duration,
      success,
    };

    const level = duration > 1000 ? 'warn' : 'info'; // Warn for operations > 1 second
    const message = `Performance: ${operation} took ${duration}ms`;

    this.logger.log(level, message, this.sanitizeMetadata(perfMetadata));
  }

  /**
   * Log audit trail events (user actions, security events)
   */
  audit(
    action: string,
    userId?: string,
    entityType?: string,
    entityId?: string,
    metadata?: LogMetadata,
  ): void {
    const auditMetadata: LogMetadata = {
      ...metadata,
      action,
      userId,
      entityType,
      entityId,
      auditLog: true,
    };

    this.logger.info(`Audit: ${action}`, this.sanitizeMetadata(auditMetadata));
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Partial<LogMetadata>): LoggerService {
    const sanitizedContext = this.sanitizeMetadata(context, {
      includeBase: false,
    });
    const childLogger = this.logger.child(sanitizedContext ?? {});
    const inheritedContext =
      (sanitizedContext?.context as string | undefined) ?? this.contextName;
    return new LoggerService(childLogger, inheritedContext);
  }

  /**
   * Build error metadata from error object
   */
  private buildErrorMetadata(
    error?: unknown,
    metadata?: LogMetadata,
  ): LogMetadata {
    const errorMetadata: LogMetadata = { ...metadata };

    if (error) {
      const message = getErrorMessage(error);
      const code = getErrorCode(error);

      errorMetadata.error = {
        message,
        code,
      };

      // Add stack trace if it's an Error object
      if (error instanceof Error) {
        errorMetadata.error.stack = error.stack;
        errorMetadata.error.name = error.name;
        if (error.cause) {
          if (typeof error.cause === 'string') {
            errorMetadata.error.cause = error.cause;
          } else if (error.cause instanceof Error) {
            errorMetadata.error.cause = error.cause.message;
          } else {
            errorMetadata.error.cause = '[Complex cause object - see details]';
          }
        }
      }

      // Add HTTP-specific properties if available
      if (isHttpError(error)) {
        if (!errorMetadata.error.code) {
          errorMetadata.error.code = String(
            error.status || error.statusCode || 500,
          );
        }
      }
    }

    return errorMetadata;
  }

  /**
   * Sanitize metadata to prevent logging sensitive information
   */
  private sanitizeMetadata(
    metadata?: LogMetadata,
    options: { includeBase?: boolean } = {},
  ): Record<string, unknown> | undefined {
    const includeBase = options.includeBase ?? true;
    const merged: Record<string, unknown> = {
      ...(includeBase ? this.buildBaseMetadata() : {}),
      ...(metadata ?? {}),
    };

    if (!merged.context && this.contextName && includeBase) {
      merged.context = this.contextName;
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session',
    ];

    sensitiveFields.forEach((field) => {
      if (field in merged) {
        merged[field] = '[REDACTED]';
      }
    });

    Object.keys(merged).forEach((key) => {
      const value = merged[key];
      if (value === undefined || value === null) {
        delete merged[key];
        return;
      }

      if (typeof value === 'object') {
        merged[key] = this.sanitizeNestedObject(value);
      }
    });

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Recursively sanitize nested objects
   */
  private sanitizeNestedObject(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item): unknown =>
        typeof item === 'object' && item !== null
          ? this.sanitizeNestedObject(item)
          : item,
      );
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized = { ...(obj as Record<string, unknown>) };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
    ];

    sensitiveFields.forEach((field) => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized as Record<string, unknown>;
  }
}
