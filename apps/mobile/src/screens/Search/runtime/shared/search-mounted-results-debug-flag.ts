/**
 * The `[REVEALSYNC]` / `[SRINULL]` instrumentation OFF SWITCH (F1044 remainder).
 *
 * Both probes lived as raw `console.log` calls gated on `__DEV__` alone inside
 * `search-mounted-results-data-store.ts` — the same always-on-in-dev shape CLAUDE.md
 * already records as wrong (see `apps/mobile/src/navigation/runtime/pageswitch-debug-flag.ts`,
 * F1351): `__DEV__` is "am I a dev build", not a switch, so the probes fired on every
 * prepared-rows publish / rows-admission transition / data-store clear, all the time.
 *
 * This module is the search-runtime-local counterpart of that pattern (kept out of
 * `apps/mobile/src/navigation/runtime/` — that module is off-limits to this lane): a
 * NAMED flag, DEFAULT OFF, one emit site per probe family, `__DEV__` still in the
 * conjunction so flipping the flag can never ship logging to a release build.
 */

/** Flip to `true` to re-enable the `[REVEALSYNC]` prepared-rows / admission probes. */
export const REVEALSYNC_DEBUG_ENABLED = false;

export const isRevealSyncDebugEnabled = (): boolean => __DEV__ && REVEALSYNC_DEBUG_ENABLED;

/** The one emit site for `[REVEALSYNC]` traces. */
export const logRevealSyncDebug = (message: string): void => {
  if (!isRevealSyncDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[REVEALSYNC] ${message}`);
};

/** Flip to `true` to re-enable the `[SRINULL]` mounted-results-clear attribution probe. */
export const SRINULL_DEBUG_ENABLED = false;

export const isSrinullDebugEnabled = (): boolean => __DEV__ && SRINULL_DEBUG_ENABLED;

/** The one emit site for `[SRINULL]` traces. */
export const logSrinullDebug = (message: string): void => {
  if (!isSrinullDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[SRINULL] ${message}`);
};
