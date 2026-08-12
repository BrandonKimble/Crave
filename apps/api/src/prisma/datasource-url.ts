/**
 * Datasource-URL pinning — the parameters Prisma reads ONLY from the URL.
 *
 * Extracted from prisma.service.ts (2026-08-11) so a consumer can build a
 * correctly-pinned client WITHOUT importing PrismaService: the advisory-lock
 * helper in shared/ needs these, and shared/ is what prisma.service.ts
 * imports from, so a shared-side import of prisma.service.ts would close an
 * import cycle. These are pure string functions with no Nest dependencies —
 * they belong in a leaf module.
 */

/**
 * Pin every pooled connection's session TimeZone to UTC.
 *
 * NO LONGER LOAD-BEARING FOR CORRECTNESS (2026-08-02). This was introduced to
 * neutralise a real bug: 162 columns were `timestamp WITHOUT time zone` while
 * Prisma binds a JS Date as `timestamptz`, so every hand-written comparison
 * coerced through the session timezone and meant something different depending
 * on where the server thought it was.
 *
 * Those columns are `timestamptz` now, which fixes the cause rather than
 * masking it — a timestamptz comparison is timezone-independent by
 * construction. The pin stays for the things that genuinely still read the
 * session zone: `now()::date`, `CURRENT_DATE`, `date_trunc` on a timestamptz,
 * and `signals.occurred_at`, the one naive column left (it is a partition key,
 * which Postgres will not let us alter). It also keeps dev matching prod
 * instead of inheriting whatever a laptop is set to.
 */
export function pinSessionTimeZoneUtc(url: string): string {
  if (!url) return url;
  // Already pinned (or explicitly overridden) — never fight an explicit choice.
  if (/[?&]options=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}options=-c%20timezone%3DUTC`;
}

/**
 * Pin the POOL SIZE onto the datasource URL — the only place Prisma reads it.
 *
 * THE 73-CONNECTION INCIDENT (diagnosed live, 2026-08-08 03:00 UTC). Prod
 * Postgres hit its 100-connection ceiling and stayed there: deploys failed
 * at `prisma migrate deploy`, the API could not have survived a restart, and
 * a DB restart only cleared it until the next busy cron. The config block
 * (configuration.ts `database.connectionPool`) parsed
 * DATABASE_CONNECTION_POOL_MAX=10 faithfully — and NOTHING consumed it: this
 * service passed only the URL, and Prisma sizes its pool exclusively from a
 * `connection_limit` URL parameter. So both prod services ran Prisma's
 * DEFAULT pool of num_cpus × 2 + 1, which on Railway's shared 36-vCPU hosts
 * is exactly 73 — the fingerprint observed live: 73 idle worker connections,
 * all opened in one 03:00 cron burst, held forever (Prisma never shrinks its
 * pool, and every server-side idle timeout is 0). Two services × 73
 * potential + a handful of operator sessions > 100 = the lockup.
 *
 * `pool_timeout` rides along: the config has promised acquire=60s since the
 * Sequelize era; Prisma's default is 10s, and this makes the promise true.
 */
export function pinConnectionLimit(url: string, max: number): string {
  if (!url) return url;
  // An explicit connection_limit in the URL is an operator's choice — keep it.
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${max}&pool_timeout=60`;
}
