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
 * Logger service interface
 */
export abstract class LoggerService {
  abstract setContext(context: string): LoggerService;
  abstract debug(message: string, metadata?: LogMetadata): void;
  abstract info(message: string, metadata?: LogMetadata): void;
  abstract warn(message: string, metadata?: LogMetadata): void;
  abstract error(message: string, error?: unknown, metadata?: LogMetadata): void;
  abstract http(
    message: string,
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    metadata?: LogMetadata,
  ): void;
  abstract database(
    operation: string,
    entityType: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void;
  abstract performance(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: LogMetadata,
  ): void;
  abstract audit(
    action: string,
    userId?: string,
    entityType?: string,
    entityId?: string,
    metadata?: LogMetadata,
  ): void;
  abstract child(context: Partial<LogMetadata>): LoggerService;
}