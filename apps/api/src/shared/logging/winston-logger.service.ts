import { Injectable, Inject } from '@nestjs/common';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import {
  isHttpError,
  getErrorMessage,
  getErrorCode,
} from '../types/error-interfaces';
import { LoggerService, LogMetadata } from './logger.interface';

/**
 * Winston Logger Service - Direct implementation without nest-winston
 * Provides structured logging with context support
 */
@Injectable()
export class WinstonLoggerService extends LoggerService {
  private readonly logger: winston.Logger;
  private context?: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    const isDevelopment =
      this.configService.get<string>('NODE_ENV') !== 'production';

    // Create Winston logger with appropriate configuration
    this.logger = winston.createLogger({
      level: isDevelopment ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.metadata({
          fillExcept: ['message', 'level', 'timestamp', 'label'],
        }),
      ),
      defaultMeta: { service: 'crave-search-api' },
      transports: [
        new winston.transports.Console({
          format: isDevelopment
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(
                  ({ timestamp, level, message, label, metadata }) => {
                    const prefix = label ? `[${label}]` : '';
                    const meta =
                      metadata && Object.keys(metadata).length
                        ? ` ${JSON.stringify(metadata)}`
                        : '';
                    return `${timestamp} ${level} ${prefix} ${message}${meta}`;
                  },
                ),
              )
            : winston.format.json(),
        }),
      ],
    });

    // Add file transport in production
    if (!isDevelopment) {
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.json(),
        }),
      );
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.json(),
        }),
      );
    }
  }

  /**
   * Create a new instance with a specific context
   */
  setContext(context: string): LoggerService {
    const contextualLogger = Object.create(this);
    contextualLogger.context = context;
    // Create a child logger with the context as a label
    contextualLogger.logger = this.logger.child({ label: context });
    return contextualLogger;
  }

  /**
   * Log debug level messages with structured metadata
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log info level messages with structured metadata
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log('info', message, metadata);
  }

  /**
   * Log warning level messages with structured metadata
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log error level messages with structured metadata
   */
  error(message: string, error?: unknown, metadata?: LogMetadata): void {
    const errorMetadata = this.buildErrorMetadata(error, metadata);
    this.log('error', message, errorMetadata);
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
    this.log('http', message, httpMetadata);
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

    this.log(level, message, dbMetadata);
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

    const level = duration > 1000 ? 'warn' : 'info';
    const message = `Performance: ${operation} took ${duration}ms`;

    this.log(level, message, perfMetadata);
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

    this.log('info', `Audit: ${action}`, auditMetadata);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Partial<LogMetadata>): LoggerService {
    const childInstance = Object.create(this);
    childInstance.logger = this.logger.child(context);
    return childInstance;
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, metadata?: LogMetadata): void {
    const sanitized = this.sanitizeMetadata(metadata);

    if (this.context && !this.logger.defaultMeta?.label) {
      // If we have context but no child logger, add it to metadata
      this.logger.log(level, message, { label: this.context, ...sanitized });
    } else {
      this.logger.log(level, message, sanitized);
    }
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
  private sanitizeMetadata(metadata?: LogMetadata): LogMetadata | undefined {
    if (!metadata) return undefined;

    const sanitized = { ...metadata };

    // Remove or mask sensitive fields
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
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Sanitize nested objects
    Object.keys(sanitized).forEach((key) => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeNestedObject(sanitized[key]);
      }
    });

    return sanitized;
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
