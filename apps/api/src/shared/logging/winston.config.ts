import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { WinstonModuleOptions } from 'nest-winston';

// Create custom log format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    const metaString =
      metadata &&
      typeof metadata === 'object' &&
      Object.keys(metadata).length > 0
        ? ` ${JSON.stringify(metadata)}`
        : '';
    return `${String(timestamp)} [${String(level).toUpperCase()}] ${String(
      message,
    )}${metaString}`;
  }),
);

// Create JSON format for production
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json(),
);

/**
 * Winston logger configuration for the application
 */
export function createWinstonConfig(
  nodeEnv = 'development',
): WinstonModuleOptions {
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  // Base transports
  const transports: winston.transport[] = [];

  // Console transport (always enabled in development, optional in production)
  if (isDevelopment || process.env.LOG_CONSOLE === 'true') {
    transports.push(
      new winston.transports.Console({
        level: isDevelopment ? 'debug' : 'info',
        format: isDevelopment ? logFormat : jsonFormat,
      }),
    );
  }

  // File transports for production and testing
  if (!isDevelopment || process.env.LOG_FILES === 'true') {
    // Error log file
    transports.push(
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: jsonFormat,
        maxSize: '20m',
        maxFiles: '30d',
        zippedArchive: true,
      }),
    );

    // Combined log file
    transports.push(
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: isProduction ? 'info' : 'debug',
        format: jsonFormat,
        maxSize: '50m',
        maxFiles: '30d',
        zippedArchive: true,
      }),
    );

    // HTTP access log file
    transports.push(
      new DailyRotateFile({
        filename: 'logs/access-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'http',
        format: jsonFormat,
        maxSize: '100m',
        maxFiles: '14d',
        zippedArchive: true,
      }),
    );
  }

  return {
    level: isDevelopment ? 'debug' : 'info',
    format: isDevelopment ? logFormat : jsonFormat,
    transports,
    // Handle uncaught exceptions
    exceptionHandlers: isProduction
      ? [
          new DailyRotateFile({
            filename: 'logs/exceptions-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            format: jsonFormat,
            maxSize: '20m',
            maxFiles: '30d',
          }),
        ]
      : [],
    // Handle unhandled promise rejections
    rejectionHandlers: isProduction
      ? [
          new DailyRotateFile({
            filename: 'logs/rejections-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            format: jsonFormat,
            maxSize: '20m',
            maxFiles: '30d',
          }),
        ]
      : [],
    // Exit on error is false to keep the process running
    exitOnError: false,
  };
}

/**
 * Request logging middleware configuration
 */
export const requestLoggingConfig = {
  // Log all requests at HTTP level
  level: 'http',
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}}',
  expressFormat: true,
  colorize: false,
  // Skip logging for health check endpoints
  skip: (req: { url?: string }) => {
    return req.url?.includes('/health') || req.url?.includes('/metrics');
  },
  // Custom request/response logging
  requestWhitelist: ['url', 'method', 'httpVersion', 'originalUrl', 'query'],
  responseWhitelist: ['statusCode'],
  dynamicMeta: (
    req: {
      ip?: string;
      get?: (header: string) => string;
      headers?: Record<string, string>;
    },
    res: { responseTime?: number; get?: (header: string) => string },
  ) => ({
    ip: req.ip,
    userAgent: req.get?.('User-Agent'),
    responseTime: res.responseTime,
    correlationId:
      req.headers?.['x-correlation-id'] || res.get?.('x-correlation-id'),
  }),
};
