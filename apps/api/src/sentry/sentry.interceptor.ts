import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as Sentry from '@sentry/nestjs';
import type { FastifyRequest } from 'fastify';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId?: string;
  };
}

/**
 * Sentry Performance Interceptor
 *
 * Creates spans for each HTTP request to track performance in Sentry.
 * This enables the Performance tab in Sentry with endpoint latency data.
 */
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url } = request;

    // F2221: NEVER ship the raw url — it carries the query string (and thus any
    // `?token=…`/free-text params) into Sentry as a span attribute and an error
    // breadcrumb, the one place the deliberate `normalizeUrl` query-strip is
    // bypassed. Normalize ONCE here and use it everywhere below. (Defense in
    // depth on the tracing path — `beforeSendTransaction`/`beforeSendSpan` in
    // main.ts's Sentry.init — is the belt to this suspenders.)
    const safeUrl = this.normalizeUrl(url);

    // User context = the opaque userId ONLY (support lookup key) — never
    // email or any other PII.
    if (request.user) {
      Sentry.setUser({ id: request.user.userId });
    }

    // Start a span for this request
    return Sentry.startSpan(
      {
        name: `${method} ${safeUrl}`,
        op: 'http.server',
        attributes: {
          'http.method': method,
          'http.url': safeUrl,
        },
      },
      () => {
        return next.handle().pipe(
          tap({
            error: (error) => {
              // Errors are captured by the filter, but we can add breadcrumbs
              Sentry.addBreadcrumb({
                category: 'http',
                message: `${method} ${safeUrl} failed`,
                level: 'error',
                data: {
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                },
              });
            },
          }),
        );
      },
    );
  }

  /**
   * Normalize URL by replacing dynamic segments with placeholders
   * e.g., /users/123/posts/456 -> /users/:id/posts/:id
   */
  private normalizeUrl(url: string): string {
    return url
      .split('?')[0] // Remove query params
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '/:uuid',
      ) // UUIDs
      .replace(/\/\d+/g, '/:id'); // Numeric IDs
  }
}
