/**
 * THE completion-work timer (2026-08-31 cron audit, extracted 2026-09-03).
 *
 * THE LAW: `CRONS_ENABLED` means "do not START new discretionary work
 * unattended". A pass that COMPLETES, COLLECTS or RECONCILES work already
 * dispatched and paid for is not discretionary — hiding it behind that
 * switch silently abandons bought work (the Gemini batch poller's 45 paid
 * jobs uncollected for 13.7h; the 47,850 orphaned coverage claims the
 * collection reconciler never reaped on staging). Such passes own their
 * OWN interval instead of an @Cron, and four services grew the identical
 * block by hand: collection-evidence, collector-pacer (the reconciler
 * half of its split), notification-dispatcher, photo-reconciliation.
 * This is that block, stated once.
 *
 * The five obligations (encoded in completion-work-aliveness.spec.ts):
 *   1. WORKER RUNTIME only (isWorkerRuntime — the worker owns background
 *      work; the api process must not race it for the same leases).
 *   2. OWN EXPLICIT OFF-SWITCH — one env var per pass, opt-down
 *      (isEnvFlagExplicitlyDisabled), never CRONS_ENABLED.
 *   3. unref()'d interval, so a script booting the full graph still exits.
 *   4. BOOT ARM — one immediate pass at start, so a backlog that opened
 *      while the loop was dead is visible within one boot, not one cadence.
 *   5. CLEARED ON SHUTDOWN — stop() ends the interval; nothing ticks after
 *      destroy.
 *
 * The pass itself stays the service's: its in-flight guard and
 * backlog-scream alerts (the sixth obligation lives in the pass, where the
 * numbers are) are domain behavior, not timer plumbing. FAILURE OWNERSHIP
 * is the timer's (2026-09-04, CI red for 25 days behind a doc gate; the
 * first green-path run died here): `void run()` let a rejecting pass
 * become an unhandledRejection and KILL THE HOST PROCESS — the jest worker
 * in CI, and exactly as surely the worker dyno in production. A pass that
 * "must never throw" is a convention; a timer that cannot propagate a
 * rejection is a fact. Every caller names where a failure goes.
 */
import { isEnvFlagExplicitlyDisabled } from './config/env-flag';
import { isWorkerRuntime } from './utils/process-role';

export interface CompletionWorkTimerHandle {
  stop(): void;
}

export interface CompletionWorkTimerOptions {
  intervalMs: number;
  /** The pass's OWN opt-down switch (e.g. COLLECTION_RECONCILE_ENABLED). */
  offSwitchEnv: string;
  /** The pass. Keeps its own in-flight guard; a throw or rejection is
   *  routed to `onFailure` by the timer and never escapes the tick. */
  run: () => void | Promise<void>;
  /** Where a failing tick is reported — the owning service's logger. The
   *  timer never lets a rejection reach the process. */
  onFailure: (error: unknown) => void;
}

/**
 * Arms the interval and boot-arms one immediate pass. Returns null when the
 * gate says no (explicit off-switch, or not a worker runtime) — callers
 * store the handle in the field their aliveness test inspects, so "armed"
 * and "not armed" stay observable facts.
 */
export function startCompletionWorkTimer(
  options: CompletionWorkTimerOptions,
): CompletionWorkTimerHandle | null {
  if (isEnvFlagExplicitlyDisabled(process.env[options.offSwitchEnv])) {
    return null;
  }
  if (!isWorkerRuntime()) return null;
  const tick = (): void => {
    try {
      const result = options.run();
      if (result && typeof result.then === 'function') {
        result.catch(options.onFailure);
      }
    } catch (error) {
      options.onFailure(error);
    }
  };
  const timer = setInterval(tick, options.intervalMs);
  timer.unref();
  // BOOT ARM, deliberately outside the interval: a restart is enough to
  // surface (and drain) whatever accumulated while the loop was dead.
  tick();
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
