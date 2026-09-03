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
 * The pass itself stays the service's: its in-flight guard, error logging
 * and backlog-scream alerts (the sixth obligation lives in the pass, where
 * the numbers are) are domain behavior, not timer plumbing.
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
  /** The pass. Must never throw and never stack — services keep their own
   *  in-flight guard + catch inside it. */
  run: () => void | Promise<void>;
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
  const timer = setInterval(() => void options.run(), options.intervalMs);
  timer.unref();
  // BOOT ARM, deliberately outside the interval: a restart is enough to
  // surface (and drain) whatever accumulated while the loop was dead.
  void options.run();
  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
