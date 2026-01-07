import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryExceptionFilter } from './sentry.filter';
import { SentryInterceptor } from './sentry.interceptor';

/**
 * Sentry Module
 *
 * Provides global error tracking and performance monitoring via Sentry.
 *
 * Features:
 * - Automatic exception capture with user/request context
 * - Performance monitoring with request spans
 * - Breadcrumbs for debugging
 * - Filters out 4xx client errors (expected behavior)
 *
 * Configuration:
 * - SENTRY_DSN: Your Sentry project DSN
 * - SENTRY_ENVIRONMENT: production, staging, development
 * - SENTRY_RELEASE: Version string for release tracking
 *
 * Note: Sentry.init() is called in main.ts before the app starts.
 */
@Global()
@Module({
  providers: [
    // Exception filter to capture errors
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
    // Interceptor for performance monitoring
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
})
export class SentryModule {}
