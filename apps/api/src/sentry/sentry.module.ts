import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SentryInterceptor } from './sentry.interceptor';

/**
 * Sentry Module — performance spans only.
 *
 * ERROR CAPTURE DOES NOT LIVE HERE. The one capture seam is
 * WinstonLoggerService.error (shared/logging/winston-logger.service.ts) — the
 * class DI binds to the `LoggerService` token: HTTP 5xx reach it
 * via GlobalExceptionFilter's logError, cron/background failures via their
 * own catch-and-log. A second global @Catch() filter used to sit here — it
 * was DEAD CODE (Nest runs exactly one matching global filter, and
 * GlobalExceptionFilter won) and its "re-throw to the next filter" design
 * described a chain Nest doesn't have. Do not reintroduce a Sentry filter.
 *
 * Sentry.init() runs in main.ts before the app starts (SENTRY_DSN-gated).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
})
export class SentryModule {}
