/**
 * The `[TOGGLE]` lifecycle probe OFF SWITCH (F1552) — the `pageswitch-debug-flag` pattern,
 * one family over.
 *
 * `toggle-interaction-engine` narrated every press through `logger.info`: `[TOGGLE] begin` on
 * every press, `[TOGGLE] settle:commit` on every commit, `[TOGGLE] finalize` on every
 * finalize — three object-serializing calls per tap, in the gesture-response path, and (until
 * F1552 fixed the logger) three bridge-crossing console writes in RELEASE builds too.
 *
 * These are attribution scaffolding for the toggle lifecycle, not breadcrumbs worth keeping in
 * the crash record: at press frequency they would evict the entire 60-entry breadcrumb ring.
 * So they get the shape CLAUDE.md records as correct (`static let lodDebugLoggingEnabled =
 * false`): a NAMED flag, DEFAULT OFF, costing nothing sitting there, one edit to flip when you
 * are actually debugging toggles. `__DEV__` stays in the conjunction, so flipping it can never
 * ship logging to a release build.
 */

/** Flip to `true` to re-enable the `[TOGGLE]` lifecycle probes in a dev build. */
export const TOGGLE_DEBUG_ENABLED = false;

export const isToggleDebugEnabled = (): boolean => __DEV__ && TOGGLE_DEBUG_ENABLED;

/** The one emit site — the probe shape is defined here, not re-spelled at each call site. */
export const logToggleDebug = (tag: string, data: Record<string, unknown>): void => {
  if (!isToggleDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[TOGGLE] ${tag} ${JSON.stringify(data)}`);
};
