/**
 * The `[pageswitch]` instrumentation OFF SWITCH (F1351).
 *
 * The page-switch attribution probes (PF flush, per-scene activity, body activity,
 * motion dispatch, snap reseat, polls bootstrap, controller-replaced) were gated on
 * `__DEV__` alone, across 8 files. `__DEV__` is not a switch — it is "am I a dev
 * build", which is true for every one of them, all the time. The result: the
 * highest-frequency path in the router logged on EVERY presentation-frame flush and
 * EVERY scene-activity change, so any other dev signal was drowned, and turning the
 * cost off meant editing 8 files.
 *
 * This is the shape CLAUDE.md already records as correct, from the map saga:
 * `static let lodDebugLoggingEnabled = false` — a NAMED flag, DEFAULT OFF, that costs
 * nothing sitting there and is one edit to flip when you are actually debugging that
 * subsystem. The probes are not deleted: they are hard-won attribution scaffolding
 * (page-switch-master-plan.md §3/§9.5 keeps them as the regression tripwire). They are
 * simply no longer on by default.
 *
 * `__DEV__` stays in the conjunction, so flipping this flag can never ship logging to
 * a release build.
 */

/** Flip to `true` to re-enable the `[pageswitch]` JSONL probes in a dev build. */
export const PAGESWITCH_DEBUG_ENABLED = false;

export const isPageSwitchDebugEnabled = (): boolean => __DEV__ && PAGESWITCH_DEBUG_ENABLED;

/**
 * The one emit site. Every probe routes through here, so the JSONL shape
 * (`[pageswitch] <tag> <json>`) is defined once rather than re-spelled at 8 call sites.
 */
export const logPageSwitchDebug = (tag: string, data: Record<string, unknown>): void => {
  if (!isPageSwitchDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[pageswitch] ${tag} ${JSON.stringify(data)}`);
};

/**
 * The `[COMMITDBG]` per-leg commit-cost probe (F1451) — same family, same treatment.
 *
 * The L4 return-from-child attribution probe in BottomSheetSceneStackHost wrapped both
 * scene legs in a `React.Profiler` and logged any commit over the threshold. Its own
 * comment said TEMPORARY, but it was gated on `__DEV__` alone — i.e. always on in every
 * dev build, exactly the condition F1351 named — and, unlike the sibling
 * `useSearchOverlayProfilerRender` sinks in the same file (which mount their Profiler
 * only when a sink exists), the wrappers themselves were unconditional.
 *
 * Now: a NAMED flag, DEFAULT OFF, and the host mounts the Profilers only when it is on,
 * so the flag-off build pays nothing at all — not even the Profiler tree.
 */

/** Flip to `true` to re-enable the `[COMMITDBG]` per-leg commit probe in a dev build. */
export const SLOW_LEG_COMMIT_DEBUG_ENABLED = false;

export const isSlowLegCommitDebugEnabled = (): boolean => __DEV__ && SLOW_LEG_COMMIT_DEBUG_ENABLED;

/** A leg render slower than this (ms) in one commit is worth a line. */
export const SLOW_LEG_COMMIT_THRESHOLD_MS = 8;

export const logSlowLegCommitDebug = (id: string, phase: string, actualMs: number): void => {
  if (!isSlowLegCommitDebugEnabled() || actualMs <= SLOW_LEG_COMMIT_THRESHOLD_MS) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[COMMITDBG] ${id} phase=${phase} actualMs=${actualMs.toFixed(1)}`);
};
