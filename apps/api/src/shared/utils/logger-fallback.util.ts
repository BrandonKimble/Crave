import { LoggerService } from '../logging/logger.service';

/**
 * Interface for a safe logger that can fall back to console when LoggerService isn't ready
 */
export interface SafeLogger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  setContext(context: string): SafeLogger;
}

/**
 * Console fallback logger implementation
 */
class ConsoleFallbackLogger implements SafeLogger {
  constructor(private readonly context: string) {
    console.log(`${this.context}: LoggerService not ready, using console fallback`);
  }

  info(message: string, meta?: any): void {
    console.log(`[${this.context}] INFO:`, message, meta ? JSON.stringify(meta) : '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`[${this.context}] WARN:`, message, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, meta?: any): void {
    console.error(`[${this.context}] ERROR:`, message, meta ? JSON.stringify(meta) : '');
  }

  debug(message: string, meta?: any): void {
    console.debug(`[${this.context}] DEBUG:`, message, meta ? JSON.stringify(meta) : '');
  }

  setContext(context: string): SafeLogger {
    return new ConsoleFallbackLogger(context);
  }
}

/**
 * Wrapper for LoggerService that provides safe fallback behavior
 */
class SafeLoggerWrapper implements SafeLogger {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly context: string
  ) {}

  info(message: string, meta?: any): void {
    this.loggerService.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.loggerService.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    this.loggerService.error(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.loggerService.debug(message, meta);
  }

  setContext(context: string): SafeLogger {
    const contextLogger = this.loggerService.setContext(context);
    return new SafeLoggerWrapper(contextLogger, context);
  }
}

/**
 * Creates a safe logger that falls back to console when LoggerService isn't ready
 * 
 * @param loggerService - The LoggerService instance (may be undefined during DI initialization)
 * @param context - The logging context (service name)
 * @returns A safe logger that works even when LoggerService isn't ready
 */
export function createSafeLogger(
  loggerService: LoggerService | undefined | null,
  context: string
): SafeLogger {
  if (loggerService && typeof loggerService.setContext === 'function') {
    try {
      const contextLogger = loggerService.setContext(context);
      return new SafeLoggerWrapper(contextLogger, context);
    } catch (error) {
      // LoggerService exists but setContext failed, use console fallback
      return new ConsoleFallbackLogger(context);
    }
  }

  // LoggerService not ready, use console fallback
  return new ConsoleFallbackLogger(context);
}