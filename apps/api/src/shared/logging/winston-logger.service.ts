import { Injectable, Inject } from '@nestjs/common';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import {
  isHttpError,
  getErrorMessage,
  getErrorCode,
} from '../types/error-interfaces';
import { LoggerService, LogMetadata } from './logger.interface';
import { createWinstonConfig } from './winston.config';

@Injectable()
export class WinstonLoggerService extends LoggerService {
  private logger: winston.Logger;
  private readonly serviceName: string;
  private readonly environmentName: string;
  private contextName?: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development';
    this.serviceName = process.env.LOG_SERVICE_NAME ?? 'crave-search-api';
    this.environmentName = nodeEnv;
    const loggerOptions = createWinstonConfig(nodeEnv);
    this.logger = winston.createLogger(loggerOptions);
  }

  setContext(context: string): LoggerService {
    return this.child({ context });
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: unknown, metadata?: LogMetadata): void {
    const errorMetadata = this.buildErrorMetadata(error, metadata);
    this.log('error', message, errorMetadata);
  }

  http(
    message: string,
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    metadata?: LogMetadata,
  ): void {
    this.log('http', message, {
      ...metadata,
      method,
      url,
      statusCode,
      duration,
    });
  }

  database(
    operation: string,
    entityType: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void {
    const level = success ? 'debug' : 'error';
    const message = `Database ${operation} on ${entityType} ${
      success ? 'completed' : 'failed'
    } (${duration}ms)`;
    this.log(level, message, {
      ...metadata,
      operation,
      entityType,
      duration,
      success,
    });
  }

  performance(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void {
    const level = duration > 1000 ? 'warn' : 'info';
    const message = `Performance: ${operation} took ${duration}ms`;
    this.log(level, message, {
      ...metadata,
      operation,
      duration,
      success,
    });
  }

  audit(
    action: string,
    userId?: string,
    entityType?: string,
    entityId?: string,
    metadata?: LogMetadata,
  ): void {
    this.log('info', `Audit: ${action}`, {
      ...metadata,
      action,
      userId,
      entityType,
      entityId,
      auditLog: true,
    });
  }

  child(context: Partial<LogMetadata>): LoggerService {
    const sanitizedContext = this.sanitizeMetadata(context, {
      includeBase: false,
    });
    const childLogger = this.logger.child(sanitizedContext ?? {});
    const resolvedContext =
      (sanitizedContext?.context as string | undefined) ?? this.contextName;

    const derived = Object.create(this) as WinstonLoggerService;
    derived.logger = childLogger;
    derived.contextName = resolvedContext;
    return derived;
  }

  private log(level: string, message: string, metadata?: LogMetadata): void {
    const sanitized = this.sanitizeMetadata(metadata);
    this.logger.log(level, message, sanitized);
  }

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

  private buildErrorMetadata(
    error?: unknown,
    metadata?: LogMetadata,
  ): LogMetadata {
    const errorMetadata: LogMetadata = { ...metadata };

    if (!error) {
      return errorMetadata;
    }

    const message = getErrorMessage(error);
    const code = getErrorCode(error);
    errorMetadata.error = {
      message,
      code,
    };

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

    if (isHttpError(error)) {
      if (!errorMetadata.error.code) {
        errorMetadata.error.code = String(
          error.status || error.statusCode || 500,
        );
      }
    }

    return errorMetadata;
  }

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
      'cookie',
      'session',
    ];

    sensitiveFields.forEach((field) => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    Object.keys(sanitized).forEach((key) => {
      const value = sanitized[key];
      if (value === undefined || value === null) {
        delete sanitized[key];
        return;
      }

      if (typeof value === 'object') {
        sanitized[key] = this.sanitizeNestedObject(value);
      }
    });

    return sanitized as Record<string, unknown>;
  }
}
