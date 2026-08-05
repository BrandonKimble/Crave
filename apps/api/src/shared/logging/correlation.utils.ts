import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context interface for correlation tracking
 */
export interface RequestContext {
  correlationId: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  startTime: number;
  method?: string;
  url?: string;
}

/**
 * Async local storage for request context
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Correlation utilities for request tracking and context management
 */
export class CorrelationUtils {
  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Set the current request context
   */
  static setContext(context: RequestContext): void {
    requestContextStorage.enterWith(context);
  }

  /**
   * Get the current request context
   */
  static getContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
  }

  /**
   * Get the current correlation ID
   */
  static getCorrelationId(): string | undefined {
    return requestContextStorage.getStore()?.correlationId;
  }

  /**
   * Get the current user ID from context
   */
  static getUserId(): string | undefined {
    return requestContextStorage.getStore()?.userId;
  }

  /**
   * Get request duration in milliseconds
   */
  static getRequestDuration(): number | undefined {
    const context = requestContextStorage.getStore();
    if (!context?.startTime) return undefined;
    return Date.now() - context.startTime;
  }

  /**
   * Run a function within a specific request context
   */
  static runWithContext<T>(context: RequestContext, fn: () => T): T {
    return requestContextStorage.run(context, fn);
  }

  /**
   * Create request context from HTTP request
   */
  static createRequestContext(
    method: string,
    url: string,
    headers: Record<string, string | string[]>,
    ip?: string,
  ): RequestContext {
    const correlationId =
      (Array.isArray(headers['x-correlation-id'])
        ? headers['x-correlation-id'][0]
        : headers['x-correlation-id']) || this.generateCorrelationId();

    const userAgent = Array.isArray(headers['user-agent'])
      ? headers['user-agent'][0]
      : headers['user-agent'];

    return {
      correlationId,
      userAgent,
      ip,
      startTime: Date.now(),
      method,
      url,
    };
  }

  // extractUserIdFromToken was deleted (F408, 2026-08-04): it base64-decoded
  // the JWT payload segment with NO signature verification and stamped the
  // result into every request log line — an attacker could author an
  // arbitrary `Authorization: Bearer x.<base64 json>.x` and forge the
  // server's own audit trail. The only trustworthy userId is the one
  // ClerkAuthGuard verified and placed on `request.user.userId`; callers now
  // read that directly (see LoggingInterceptor / GlobalExceptionFilter).
}
