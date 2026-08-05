/**
 * THE app environment, and the two ORTHOGONAL questions asked of it.
 *
 * WHY THIS EXISTS (2026-08-02). The environment was a single boolean —
 * `isProductionAppEnv()` — and the codebase asked it two different questions
 * through that one answer:
 *
 *   1. "Is this a DEPLOYED environment?"  → a Railway database is legitimate,
 *      Swagger is off, error details are hidden, sampling is production-ish.
 *   2. "Is this PRODUCTION specifically?" → real money, real users, no dev
 *      bearer token, no debug routes, no test vendor keys.
 *
 * Staging needs YES to (1) and NO to (2). With one boolean it could not say
 * that, so it was configured as `APP_ENV=prod` and became indistinguishable
 * from production: same Sentry environment tag, same `crave:prod:*` Redis and
 * BullMQ namespaces, and — the reason this matters — the only thing keeping
 * staging's queues and caches out of production's was that Railway happens to
 * give each environment its own Redis instance. The isolation was an accident
 * of infrastructure, not a property of the code. Point them at one Redis and
 * staging workers immediately consume production jobs.
 *
 * Two questions, two predicates. Adding a fourth environment now means adding
 * it to one union, not auditing 37 call sites.
 */
export type AppEnv = 'dev' | 'staging' | 'prod';

export function normalizeAppEnv(raw: string | undefined): AppEnv {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'prod' || value === 'production') return 'prod';
  if (value === 'staging' || value === 'stage') return 'staging';
  return 'dev';
}

/**
 * Production ONLY. Use for anything where being wrong costs real money, real
 * users, or a real secret.
 */
export function isProdEnv(env: AppEnv): boolean {
  return env === 'prod';
}

/**
 * Production OR staging — "this runs on infrastructure, not on a laptop."
 * Use for hosted-database legitimacy, disabling docs, hiding error detail,
 * and sampling. Never use it to decide anything about money or secrets.
 */
export function isDeployedEnv(env: AppEnv): boolean {
  return env === 'prod' || env === 'staging';
}

/**
 * Resolve the environment from the process, INCLUDING the NODE_ENV fallback.
 *
 * `normalizeAppEnv` normalizes a value you already have. This resolves which
 * value to use: APP_ENV, else CRAVE_ENV, else infer from NODE_ENV. Five
 * services hand-rolled exactly this — each spelling `appEnv === 'prod' ||
 * nodeEnv === 'production'` slightly differently — and two of the strings
 * became Redis key prefixes (red team 2026-08-02).
 *
 * The inference can only ever yield dev or prod. Staging must name itself,
 * because "looks like production" is the guess that made staging
 * indistinguishable from prod in the first place.
 */
export function resolveAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const raw = env.APP_ENV || env.CRAVE_ENV;
  if (raw && raw.trim()) return normalizeAppEnv(raw);
  return env.NODE_ENV?.trim().toLowerCase() === 'production' ? 'prod' : 'dev';
}

/**
 * F420: the BullMQ/Redis key-namespace prefix, ONE derivation. Before this,
 * `configuration.ts` and the root-level `job-control.ts` operational tool
 * each hand-rolled `crave:${appEnv}` independently — a drift between them
 * means the tool inspects/CLEARS the wrong environment's queues (its own
 * help text advertises a `clear` command). `BULL_PREFIX` still wins when set
 * explicitly, same as before.
 */
export function bullPrefixFor(
  appEnv: AppEnv,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.BULL_PREFIX;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  return `crave:${appEnv}`;
}
