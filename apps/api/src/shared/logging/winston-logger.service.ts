import { Injectable, Inject } from '@nestjs/common';
import * as winston from 'winston';
import * as Sentry from '@sentry/nestjs';
import { ConfigService } from '@nestjs/config';
import {
  isHttpError,
  getErrorMessage,
  getErrorCode,
} from '../types/error-interfaces';
import { LoggerService, LogMetadata } from './logger.interface';
import { createWinstonConfig } from './winston.config';
import { redactSensitiveDeep } from './redaction';

@Injectable()
export class WinstonLoggerService extends LoggerService {
  private logger: winston.Logger;
  private readonly serviceName: string;
  private readonly environmentName: string;
  private contextName?: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development';
    this.serviceName = process.env.LOG_SERVICE_NAME ?? 'crave-search-api';
    this.environmentName = nodeEnv;
    const loggerOptions = createWinstonConfig(nodeEnv);
    this.logger = winston.createLogger(loggerOptions);
  }

  setContext(context: string): LoggerService {
    return this.child({ context });
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: unknown, metadata?: LogMetadata): void {
    // See buildErrorMetadata: a metadata bag passed in the error slot is
    // shifted BEFORE both consumers, so Sentry capture sees the truth too.
    if (
      metadata === undefined &&
      error !== null &&
      typeof error === 'object' &&
      !(error instanceof Error) &&
      typeof (error as Record<string, unknown>).message !== 'string'
    ) {
      metadata = error as LogMetadata;
      error = undefined;
    }
    const errorMetadata = this.buildErrorMetadata(error, metadata);
    this.log('error', message, errorMetadata);
    this.captureToSentry(message, error, metadata);
  }

  /**
   * THE crash-reporting seam: everything the codebase considers an error-level
   * event — HTTP 5xx (GlobalExceptionFilter logs them here), cron/background
   * catches, boot failures — flows through this one method, so Sentry capture
   * lives here and nowhere else. No filter-ordering fragility, no per-callsite
   * wiring. No-op unless Sentry.init ran (SENTRY_DSN set in main.ts). Never
   * attaches email or request bodies — the context tag + structured metadata
   * are the debugging surface.
   *
   * WHY IT LIVES HERE (audit 2026-08-02, F400). It used to live on a SECOND,
   * orphaned class also called `LoggerService` (shared/logging/logger.service
   * .ts) that nothing imported except its own spec. The class DI actually
   * binds is this one, which had no Sentry code at all — so the API's crash
   * reporting had never worked, while three comments and a green spec all
   * asserted it did. A seam is not a seam because a comment says so; it is a
   * seam because the SHIPPED object goes through it. The orphan is deleted and
   * `logger-sentry-seam.spec.ts` now resolves its logger from a compiled
   * SharedModule, so it binds to the WIRING and can go red on this defect.
   */
  private captureToSentry(
    message: string,
    error?: unknown,
    metadata?: LogMetadata,
  ): void {
    try {
      if (!Sentry.isInitialized()) {
        return;
      }
      const extra: Record<string, unknown> = { ...(metadata ?? {}) };
      const tags: Record<string, string> = {};
      if (this.contextName) {
        tags.logger_context = this.contextName;
      }
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { ...extra, message }, tags });
      } else {
        if (error !== undefined) {
          extra.error = error;
        }
        Sentry.captureMessage(message, { level: 'error', extra, tags });
      }
    } catch {
      // Crash reporting must never take down the thing it reports on.
    }
  }

  http(
    message: string,
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    metadata?: LogMetadata,
  ): void {
    this.log('http', message, {
      ...metadata,
      method,
      url,
      statusCode,
      duration,
    });
  }

  child(context: Partial<LogMetadata>): LoggerService {
    const sanitizedContext = this.sanitizeMetadata(context, {
      includeBase: false,
    });
    const childLogger = this.logger.child(sanitizedContext ?? {});
    const resolvedContext =
      (sanitizedContext?.context as string | undefined) ?? this.contextName;

    const derived = Object.create(this) as WinstonLoggerService;
    derived.logger = childLogger;
    derived.contextName = resolvedContext;
    return derived;
  }

  private log(level: string, message: string, metadata?: LogMetadata): void {
    const sanitized = this.sanitizeMetadata(metadata);
    this.logger.log(level, message, sanitized);
  }

  private buildBaseMetadata(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      service: this.serviceName,
      environment: this.environmentName,
    };

    if (this.contextName) {
      base.context = this.contextName;
    }

    return base;
  }

  private buildErrorMetadata(
    error?: unknown,
    metadata?: LogMetadata,
  ): LogMetadata {
    // THE MISPLACED-METADATA SEAM (audit 2026-08-31). error() has two
    // adjacent object params, and callers all over the codebase write
    // `logger.error('msg', { table, error: { message } })` — their METADATA
    // lands in the `error` slot, getErrorMessage() finds no top-level
    // string `message`, and every structured error in the app logged as
    // "Unknown error occurred" (the spending-blind alarm and the
    // source-table census both hid their real causes behind it). The two
    // shapes are mechanically distinguishable: a real error is an Error, a
    // string, or carries a string `message`; a metadata bag is none of
    // those. error() shifts the bag before calling here (so Sentry sees the
    // truth too); this method is also reached via warn/fatal paths, so the
    // guard stays defensive. (The signature itself is the defect — the
    // rederivation to error(message, metadata) rides the Judge Contract
    // migration — but this seam fix makes existing call sites truthful.)
    if (
      metadata === undefined &&
      error !== null &&
      typeof error === 'object' &&
      !(error instanceof Error) &&
      typeof (error as Record<string, unknown>).message !== 'string'
    ) {
      metadata = error as LogMetadata;
      error = undefined;
    }
    const errorMetadata: LogMetadata = { ...metadata };

    if (!error) {
      return errorMetadata;
    }

    const message = getErrorMessage(error);
    const code = getErrorCode(error);
    errorMetadata.error = {
      message,
      code,
    };

    if (error instanceof Error) {
      errorMetadata.error.stack = error.stack;
      errorMetadata.error.name = error.name;
      if (error.cause) {
        if (typeof error.cause === 'string') {
          errorMetadata.error.cause = error.cause;
        } else if (error.cause instanceof Error) {
          errorMetadata.error.cause = error.cause.message;
        } else {
          errorMetadata.error.cause = '[Complex cause object - see details]';
        }
      }
    }

    if (isHttpError(error)) {
      if (!errorMetadata.error.code) {
        errorMetadata.error.code = String(
          error.status || error.statusCode || 500,
        );
      }
    }

    return errorMetadata;
  }

  private sanitizeMetadata(
    metadata?: LogMetadata,
    options: { includeBase?: boolean } = {},
  ): Record<string, unknown> | undefined {
    const includeBase = options.includeBase ?? true;
    const merged: Record<string, unknown> = {
      ...(includeBase ? this.buildBaseMetadata() : {}),
      ...(metadata ?? {}),
    };

    if (!merged.context && this.contextName && includeBase) {
      merged.context = this.contextName;
    }

    // F2603: was a hand-rolled recursion (`sanitizeNestedObject`) with NO
    // depth/cycle guard — a self-referential or deep object (a Fastify
    // request/reply, a Prisma client, an Axios error passed as `{ context }`)
    // stack-overflowed OUT of the logger into the caller, aborting the very
    // request the log line was describing. `redactSensitiveDeep` (F416) is the
    // one shared redactor and is depth-limited (32) precisely so "logging must
    // never be the reason a request hangs". Same key vocabulary
    // (`isSensitiveKey` substring match: `apiKey`/`accessToken`/`clientSecret`/
    // `sessionId` …) — this just adopts the bounded implementation.
    const redacted = redactSensitiveDeep(merged) as Record<string, unknown>;

    // Winston's historical null/undefined TOP-LEVEL key-drop, kept as a thin
    // post-pass: nested nulls are preserved by redactSensitiveDeep, but the
    // top-level metadata bag stays free of empty keys as before.
    for (const key of Object.keys(redacted)) {
      const value = redacted[key];
      if (value === undefined || value === null) {
        delete redacted[key];
      }
    }

    return Object.keys(redacted).length > 0 ? redacted : undefined;
  }
}
