/* eslint-disable no-console */
import { recordLogBreadcrumb } from '../observability/crash-reporting';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * THE HOUSE LOGGER (F1552).
 *
 * It used to gate `debug` on `__DEV__` and ship `info`, `warn` and `error` to
 * `console.*` UNCONDITIONALLY — in release builds, over the RN bridge. The call sites were
 * written as if this were dev instrumentation: the toggle engine emitted three
 * object-serializing console calls per press, the resolver narrates every world resolution,
 * `use-auth-controller` printed the redirect URI. A level that is on everywhere is not a
 * level, and in a gesture-response path it is an allocation + bridge cost per frame.
 *
 * Two things are true at once, so the fix does both rather than choosing:
 *  • CONSOLE emission is a DEV concern — every level is `__DEV__`-gated now. Nothing crosses
 *    the bridge in a release build.
 *  • the "what led up to the crash" record is a PRODUCTION concern, and that is what the
 *    crash-reporting seam's breadcrumbs are for. `info` / `warn` / `error` become breadcrumbs
 *    at the matching Sentry level, so the production breadcrumbs the old `console.info` was
 *    standing in for get BETTER (attached to the event, levelled, not a bridge write) rather
 *    than disappearing. `debug` stays dev-only end to end — it is the high-frequency level.
 *
 * A caller that writes `logger.info('[TOGGLE] begin', …)` is therefore correct without knowing
 * anything about builds. High-frequency subsystem narration should still go behind a NAMED
 * default-off flag (the `pageswitch-debug-flag` pattern) — a breadcrumb ring is 60 entries
 * deep, and a probe that fires per frame evicts everything else in it.
 */
const log = (level: LogLevel, message: string, metadata?: unknown) => {
  if (level !== 'debug') {
    recordLogBreadcrumb(level, message, metadata);
  }

  if (!__DEV__) {
    return;
  }

  const payload = metadata
    ? [`[${level.toUpperCase()}] ${message}`, metadata]
    : [`[${level.toUpperCase()}] ${message}`];

  switch (level) {
    case 'debug':
      console.debug(...payload);
      break;
    case 'info':
      console.info(...payload);
      break;
    case 'warn':
      console.warn(...payload);
      break;
    case 'error':
      console.error(...payload);
      break;
    default:
      console.log(...payload);
  }
};

export const logger = {
  debug: (message: string, metadata?: unknown) => log('debug', message, metadata),
  info: (message: string, metadata?: unknown) => log('info', message, metadata),
  warn: (message: string, metadata?: unknown) => log('warn', message, metadata),
  error: (message: string, metadata?: unknown) => log('error', message, metadata),
};
