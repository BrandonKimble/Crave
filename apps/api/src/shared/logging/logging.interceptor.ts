import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyRequest, FastifyReply } from 'fastify';
import { LoggerService } from './logger.service';
import { CorrelationUtils, RequestContext } from './correlation.utils';

/**
 * Logging interceptor for HTTP requests and responses
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Only handle HTTP requests
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startTime = Date.now();

    // Create request context for correlation tracking
    const requestContext: RequestContext =
      CorrelationUtils.createRequestContext(
        request.method,
        request.url,
        request.headers as Record<string, string>,
        request.ip,
      );

    // Extract user ID from JWT if present
    const userId = CorrelationUtils.extractUserIdFromToken(
      request.headers as Record<string, string>,
    );
    if (userId) {
      requestContext.userId = userId;
    }

    // Set correlation ID in response headers
    response.header('x-correlation-id', requestContext.correlationId);

    // Set the request context for the duration of the request
    return new Observable((subscriber) => {
      CorrelationUtils.runWithContext(requestContext, () => {
        // Log incoming request
        this.logRequest(request, requestContext);

        // Handle the request
        const result = next.handle();

        result.subscribe({
          next: (data) => {
            subscriber.next(data);
          },
          error: (error) => {
            this.logError(request, response, error, startTime, requestContext);
            subscriber.error(error);
          },
          complete: () => {
            this.logResponse(request, response, startTime, requestContext);
            subscriber.complete();
          },
        });
      });
    });
  }

  /**
   * Log incoming HTTP request
   */
  private logRequest(request: FastifyRequest, context: RequestContext): void {
    // Skip logging for health check endpoints
    if (this.shouldSkipLogging(request.url)) {
      return;
    }

    this.logger.http(
      `Incoming ${request.method} ${request.url}`,
      request.method,
      request.url,
      undefined,
      undefined,
      {
        correlationId: context.correlationId,
        userId: context.userId,
        userAgent: context.userAgent,
        ip: context.ip,
        query: request.query,
        params: request.params,
        // Log body for non-GET requests (with size limit)
        body: this.shouldLogBody(request)
          ? this.sanitizeBody(request.body)
          : undefined,
      },
    );
  }

  /**
   * Log HTTP response
   */
  private logResponse(
    request: FastifyRequest,
    response: FastifyReply,
    startTime: number,
    context: RequestContext,
  ): void {
    // Skip logging for health check endpoints
    if (this.shouldSkipLogging(request.url)) {
      return;
    }

    const duration = Date.now() - startTime;
    const statusCode = response.statusCode;

    this.logger.http(
      `Response ${request.method} ${request.url} - ${statusCode}`,
      request.method,
      request.url,
      statusCode,
      duration,
      {
        correlationId: context.correlationId,
        userId: context.userId,
        responseTime: duration,
        statusCode,
        contentLength: response.getHeader('content-length'),
      },
    );

    // Log performance warnings for slow requests
    if (duration > 1000) {
      this.logger.warn(
        `Slow request detected: ${request.method} ${request.url} took ${duration}ms`,
        {
          correlationId: context.correlationId,
          operation: `${request.method} ${request.url}`,
          duration,
          statusCode,
        },
      );
    }
  }

  /**
   * Log HTTP errors
   */
  private logError(
    request: FastifyRequest,
    response: FastifyReply,
    error: any,
    startTime: number,
    context: RequestContext,
  ): void {
    const duration = Date.now() - startTime;
    const statusCode = response.statusCode || 500;

    this.logger.error(
      `Error ${request.method} ${request.url} - ${statusCode}`,
      error,
      {
        correlationId: context.correlationId,
        userId: context.userId,
        method: request.method,
        url: request.url,
        statusCode,
        duration,
        userAgent: context.userAgent,
        ip: context.ip,
        query: request.query,
        params: request.params,
      },
    );
  }

  /**
   * Determine if logging should be skipped for certain endpoints
   */
  private shouldSkipLogging(url: string): boolean {
    const skipPatterns = ['/health', '/metrics', '/favicon.ico', '/_status'];
    return skipPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Determine if request body should be logged
   */
  private shouldLogBody(request: FastifyRequest): boolean {
    // Don't log body for GET requests or large payloads
    if (request.method === 'GET') return false;

    const contentLength = request.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 10240) {
      // Skip bodies larger than 10KB
      return false;
    }

    return true;
  }

  /**
   * Sanitize request body for logging (remove sensitive fields)
   */
  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...(body as Record<string, unknown>) };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'creditCard',
      'ssn',
      'email',
    ];

    sensitiveFields.forEach((field) => {
      if (field in sanitized && sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
