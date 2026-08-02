/**
 * Whether the debug/error-injection routes are exposed.
 *
 * OPT IN, NEVER OPT OUT (audit 2026-08-01). These endpoints throw errors and
 * write CALLER-SUPPLIED text into Sentry, so exposing them is a free way to
 * burn a metered event quota and to bury a real incident under
 * attacker-authored noise.
 *
 * The previous gate was `NODE_ENV !== 'production'`, which FAILS OPEN: any
 * container that never set NODE_ENV — a new service, a preview deploy, a
 * misconfigured env — served them publicly. Absence of configuration must
 * never grant exposure.
 *
 * This lives in its own import-free file so the decision is directly
 * unit-testable. Reaching it through app.module drags in the entire
 * dependency graph, which is how a gate like this ends up untested.
 */
export function isDebugRoutesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false;
  if (env.APP_ENV === 'prod' || env.APP_ENV === 'staging') return false;
  return env.ENABLE_DEBUG_ROUTES === 'true';
}
