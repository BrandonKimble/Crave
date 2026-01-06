import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { FastifyRequest, FastifyReply } from 'fastify';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId?: string;
    email?: string;
  };
}

/**
 * Sentry Exception Filter
 * 
 * Captures all exceptions and sends them to Sentry with rich context.
 * This filter runs BEFORE the GlobalExceptionFilter to capture the error,
 * then re-throws so GlobalExceptionFilter can format the response.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<AuthenticatedRequest>();
    const response = ctx.getResponse<FastifyReply>();

    // Don't capture 4xx client errors (they're expected)
    if (exception instanceof HttpException) {
      const status = (exception as HttpException).getStatus();
      if (status >= 400 && status < 500) {
        // Still throw so GlobalExceptionFilter handles response
        throw exception;
      }
    }

    // Set user context if available
    if (request.user) {
      Sentry.setUser({
        id: request.user.userId,
        email: request.user.email,
      });
    }

    // Add request context
    Sentry.setContext('request', {
      url: request.url,
      method: request.method,
      headers: this.sanitizeHeaders(request.headers),
      query: request.query,
      correlationId: request.headers['x-correlation-id'],
    });

    // Add extra tags for filtering in Sentry
    Sentry.setTags({
      endpoint: request.url?.split('?')[0],
      method: request.method,
    });

    // Capture the exception
    Sentry.captureException(exception);

    // Re-throw to let GlobalExceptionFilter handle the response
    throw exception;
  }

  private sanitizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string | string[] | undefined> {
    const sanitized = { ...headers };
    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }
}
