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

/**
 * The `[CAMORIGIN-*]` return-to-origin CAMERA probe (D56 / F1516) — same family, same
 * shape, but DEFAULT ON in `__DEV__` for now.
 *
 * D56 moved the camera onto the OriginSnapshot: captured at push commit inside the
 * existing origin seam, restored per-pop through the CameraIntentArbiter. Three edges
 * carry the whole story and each has exactly one probe:
 *   `[CAMORIGIN-capture]` — the push-commit read (source: arbiter target vs live viewport)
 *   `[CAMORIGIN-restore]` — the origin restorer committing (or declining) a camera
 *   `[CAMORIGIN-pop]`     — popToEntry/popToRoot staging, the F1505 half-pop tripwire
 * RED reads: a capture whose center is not where the finger was; a pop line with no
 * matching restore line; a restore with `camera=null` on a flow that should carry one.
 *
 * Signed off on the rig 2026-08-04: all five D56 verification points passed
 * ([CAMORIGIN-capture] timing, in-flight fitAll arbiterTarget, home-shelf byte-identity,
 * profile-pop restore byte+pixel match, and the F1505 tripwire — which needed the
 * closeActive leg of the `pop` probe added before it could arm at all; see F1714-F1717).
 * DEFAULT OFF now, one edit to flip when debugging the camera lane (the open F1717
 * stuck-map thread is the likely reason to).
 */
export const CAMORIGIN_DEBUG_ENABLED = false;

export const isCameraOriginDebugEnabled = (): boolean => __DEV__ && CAMORIGIN_DEBUG_ENABLED;

export const logCameraOriginDebug = (tag: string, data: Record<string, unknown>): void => {
  if (!isCameraOriginDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[CAMORIGIN-${tag}] ${JSON.stringify({ ...data, ts: Date.now() })}`);
};

/**
 * The `[CAMCOMMIT-path]` writer-attribution probe (F1716/D61) — same family, same shape.
 *
 * Names WHICH leg carried (or held) a committed camera intent: `ref` (the mounted
 * camera executed it), `parked` (no writer — the arbiter is holding the intent),
 * `replayed` (the camera host returned and the parked intent re-committed),
 * `watchdogRecommit` (completion never arrived and the composite is off-target — one
 * bounded re-commit), `surrendered` (the re-commit also failed; the lane gave up LOUDLY —
 * this leg additionally barks ungated in __DEV__ and breadcrumbs in prod, because a
 * surrender is a defect signature, not routine telemetry).
 * RED reads: a `parked` with no later `replayed`/superseding commit; any `surrendered`.
 */
export const CAMCOMMIT_PATH_DEBUG_ENABLED = false;

export const isCameraCommitPathDebugEnabled = (): boolean => __DEV__ && CAMCOMMIT_PATH_DEBUG_ENABLED;

export const logCameraCommitPath = (leg: string, data?: Record<string, unknown>): void => {
  if (!isCameraCommitPathDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[CAMCOMMIT-path] ${leg}${data ? ` ${JSON.stringify(data)}` : ''}`);
};

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

/**
 * [FITALL] routine per-commit trace (S11/D58-X9 reconciliation): the fit-all
 * COMMIT log is high-frequency diagnostics and lives behind this flag; the
 * companion console.error (arbiter refused the fit decree) stays UNGATED in
 * __DEV__ — a violation bark must be loud, and it is what makes the
 * instrument RED-capable (F1332).
 */
export const FITALL_COMMIT_DEBUG_ENABLED = false;
export const isFitAllCommitDebugEnabled = (): boolean => __DEV__ && FITALL_COMMIT_DEBUG_ENABLED;

/** The ONE emit site for routine [FITALL] traces — submit-runtime files must
 *  not carry console literals (S11); the flag module owns the console call. */
export const emitFitAllTrace = (message: string): void => {
  if (isFitAllCommitDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.log(message);
  }
};
