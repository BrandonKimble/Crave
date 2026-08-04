import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting (2026-07-25) — the mobile half of the one-seam design
 * (API half: LoggerService.error → Sentry in apps/api).
 *
 * PRIVACY CONTRACT (App Store label: Diagnostics, NOT linked to identity):
 * - No Sentry.setUser anywhere in the app — events carry an install-random
 *   Sentry ID only. Adding identity would flip the privacy label to
 *   "Crash Data linked to you"; don't do it casually.
 * - sendDefaultPii stays false (no IP persistence, no default PII).
 * - Crash-only scope: tracing/profiling/replay are OFF. Turning any of them
 *   on is a product decision with label + cost consequences, not a tweak.
 *
 * DSN comes from EXPO_PUBLIC_SENTRY_DSN (inlined at Metro/bundle start — a
 * changed value needs a Metro restart, same law as every EXPO_PUBLIC_* var).
 * Without it, everything here is a strict no-op — dev machines without the
 * var lose nothing.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isCrashReportingEnabled = Boolean(dsn);

export function initializeCrashReporting(): void {
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : 'production'),
    sendDefaultPii: false,
    // Crash-only: no perf tracing, no session replay.
    tracesSampleRate: 0,
    // Breadcrumbs are the "what led up to it" record — keep the cheap
    // automatic ones (navigation, touch, console, fetch status lines).
    maxBreadcrumbs: 60,
    beforeSend(event) {
      // Belt-and-braces: strip anything user-shaped that a future dependency
      // might attach. The contract is anonymous events.
      delete event.user;
      return event;
    },
  });
}

/** Wraps the root component (touch breadcrumbs + JS error boundary). */
export const wrapRootComponent = Sentry.wrap;

/**
 * Manual capture for caught-but-broken states (the JS-side analogue of the
 * API's logger seam). Use where the app swallows an error to keep the UI
 * alive but the failure is real — a silent catch plus captureHandledError
 * beats a silent catch alone.
 */
export function captureHandledError(error: unknown, context?: Record<string, unknown>): void {
  if (!isCrashReportingEnabled) {
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * The LOG BREADCRUMB seam (F1552) — `utils/logger`'s production half.
 *
 * The house logger used to reach production by calling `console.info/warn/error`
 * unconditionally, over the RN bridge. Console emission is now `__DEV__`-only and the
 * production record lives here instead: an info/warn/error line becomes a levelled Sentry
 * breadcrumb, so it is attached to whatever event follows it rather than shouted into a
 * release build's console. No-op when crash reporting is disabled (no DSN), like everything
 * else in this file. `debug` deliberately does NOT come here — it is the high-frequency
 * level, and the breadcrumb ring is 60 entries deep.
 */
export function recordLogBreadcrumb(
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: unknown
): void {
  if (!isCrashReportingEnabled) {
    return;
  }
  Sentry.addBreadcrumb({
    category: 'log',
    level: level === 'warn' ? 'warning' : level,
    message,
    data:
      metadata != null && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : metadata !== undefined
          ? { value: metadata }
          : undefined,
  });
}
