import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { WinstonModuleOptions } from 'nest-winston';

const DEFAULT_SERVICE_NAME = process.env.LOG_SERVICE_NAME ?? 'crave-search-api';

const flattenMetadata = winston.format((info) => {
  const metadata = (info as Record<string, unknown>).metadata;
  if (metadata && typeof metadata === 'object') {
    Object.entries(metadata as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (value !== undefined) {
          (info as Record<string, unknown>)[key] = value;
        }
      },
    );
    delete (info as Record<string, unknown>).metadata;
  }

  if (
    !('context' in info) &&
    typeof (info as Record<string, unknown>).label === 'string'
  ) {
    (info as Record<string, unknown>).context = (
      info as Record<string, unknown>
    ).label;
  }
  delete (info as Record<string, unknown>).label;

  if (!(info as Record<string, unknown>).service) {
    (info as Record<string, unknown>).service = DEFAULT_SERVICE_NAME;
  }

  return info;
});

const baseFormats = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  flattenMetadata(),
];

const prettyFormat = winston.format.combine(
  ...baseFormats,
  winston.format.colorize({ level: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...rest }) => {
    const renderedMessage = stack ?? message;
    const { service, context, correlationId, ...extras } = rest;
    const orderedPayload = {
      service,
      context,
      correlationId,
      ...extras,
    };
    const serializedPayload = Object.values(orderedPayload).some(
      (value) => value !== undefined,
    )
      ? ` ${JSON.stringify(
          Object.fromEntries(
            Object.entries(orderedPayload).filter(
              ([, value]) => value !== undefined,
            ),
          ),
        )}`
      : '';
    return `${String(timestamp)} [${String(level)}] ${String(
      renderedMessage,
    )}${serializedPayload}`;
  }),
);

const jsonFormat = winston.format.combine(
  ...baseFormats,
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
  const forceJson =
    (process.env.LOG_FORMAT || '').toLowerCase() === 'json' ? true : false;
  const useJsonFormat = forceJson || !isDevelopment;
  const allowedLevels = [
    'error',
    'warn',
    'info',
    'http',
    'verbose',
    'debug',
    'silly',
  ];
  const defaultLevel = isDevelopment ? 'debug' : 'info';
  const requestedLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  const resolvedLevel = allowedLevels.includes(requestedLevel)
    ? requestedLevel
    : defaultLevel;

  // Base transports
  const transports: winston.transport[] = [];

  // Console transport (always enabled in development, optional in production)
  if (isDevelopment || process.env.LOG_CONSOLE === 'true') {
    transports.push(
      new winston.transports.Console({
        level: resolvedLevel,
        format: useJsonFormat ? jsonFormat : prettyFormat,
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
        level: resolvedLevel,
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
    level: resolvedLevel,
    format: useJsonFormat ? jsonFormat : prettyFormat,
    defaultMeta: {
      service: DEFAULT_SERVICE_NAME,
      environment: nodeEnv,
    },
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
