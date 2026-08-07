import { isDeployedEnv, resolveAppEnv } from './app-env';

/**
 * BOOT-TIME CONFIG VALIDATION — a deployed process must REFUSE to boot when a
 * boot-critical secret is missing, rather than coming up "healthy" and failing
 * later, further away, wearing the failure as something else (F2075).
 *
 * The disease this closes: `JWT_SECRET`, `CLERK_SECRET_KEY`,
 * `STRIPE_SECRET_KEY`, `SIGNAL_AUDIT_HMAC_KEY` were bare `process.env.X` reads
 * with no assertion anywhere. An unset `SIGNAL_AUDIT_HMAC_KEY` silently omits
 * the vote-integrity HMACs, and the loss is permanent by the time a report says
 * "provenance: unknown"; an unset `CLERK_SECRET_KEY` runs the auth path against
 * nothing. On a laptop, running without these configured is a normal local
 * state, so the requirement is gated on `isDeployedEnv()` — the same distinction
 * `getDatabaseUrl()` (F2100) draws for the localhost fallback: a MISSING value
 * may pass silently in dev, never in staging/prod.
 *
 * This is deliberately NOT the full 197-var surface — only the secrets whose
 * ABSENCE is an incident. It is the boot-closed complement to the per-value
 * refusals `ceilingEnv` / `positiveIntEnv` already do for MALFORMED values.
 *
 * Wired as ConfigModule.forRoot({ validate }), so it runs during module init,
 * at boot, before anything reads a half-configured client.
 */
export const DEPLOYED_REQUIRED_SECRETS = [
  'JWT_SECRET',
  'CLERK_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SIGNAL_AUDIT_HMAC_KEY',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const appEnv = resolveAppEnv(config as NodeJS.ProcessEnv);
  if (!isDeployedEnv(appEnv)) {
    return config;
  }

  const missing = DEPLOYED_REQUIRED_SECRETS.filter((name) => {
    const value = config[name];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) in a deployed environment ` +
        `(APP_ENV=${appEnv}): ${missing.join(', ')}. Refusing to boot rather ` +
        `than starting with an unconfigured auth/integrity secret — a missing ` +
        `secret is a config error that fails later and looks like something else.`,
    );
  }

  return config;
}
