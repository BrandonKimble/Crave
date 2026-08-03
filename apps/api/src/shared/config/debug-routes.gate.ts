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
 * This lives in its own tiny file so the decision is directly unit-testable.
 * Reaching it through app.module drags in the entire dependency graph, which
 * is how a gate like this ends up untested. Its only imports are the two pure,
 * already-unit-tested readers below.
 *
 * ONE READER PER QUESTION (audit 2026-08-02, F402). The gate used to compare
 * raw literals — `APP_ENV === 'prod' || APP_ENV === 'staging'` and
 * `NODE_ENV === 'production'` — while `normalizeAppEnv`, which the rest of the
 * codebase uses, also accepts `production`, `PROD`, `stage` and `STAGING`. So
 * four ordinary spellings of a deployed environment DEFEATED a fail-closed
 * gate and exposed the error-injection routes; the spec asserted only the
 * exact literals, so the hole was invisible. `resolveAppEnv` also folds in the
 * NODE_ENV inference, which is why that clause is gone rather than kept.
 * Likewise `ENABLE_DEBUG_ROUTES` was a fifth flag dialect where `=1` was a
 * silent no-op; it now reads through `isEnvFlagEnabled` like every other flag
 * (absent ⇒ OFF, which is the fail-closed default this file exists for).
 */
import { isDeployedEnv, resolveAppEnv } from './app-env';
import { isEnvFlagEnabled } from './env-flag';

export function isDebugRoutesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isDeployedEnv(resolveAppEnv(env))) return false;
  return isEnvFlagEnabled(env.ENABLE_DEBUG_ROUTES);
}
