import { Prisma } from '@prisma/client';

/**
 * THE naive-UTC instant coercion. One helper, app-wide.
 *
 * WHY IT EXISTS. 162 of this schema's timestamp columns are `timestamp
 * WITHOUT time zone` holding UTC wall-clock (31 are `WITH`). Prisma binds a
 * JS Date as `timestamptz`. A naive-vs-timestamptz comparison coerces the
 * column through the SESSION's TimeZone, so a hand-written query means
 * something different depending on where the server thinks it is. Prisma's
 * own query builder knows each column's type and is unaffected; only raw SQL
 * is exposed.
 *
 * WHY IT IS BELT-AND-BRACES, NOT THE FIX. The real fix is at the connection:
 * every pooled connection now pins `timezone=UTC` (see prisma.service.ts), so
 * the coercion is a no-op and the whole class is gone regardless of what any
 * individual query says. This helper keeps each raw comparison correct on its
 * own terms, so a query stays right even if it is ever run on a connection
 * that was not pinned — a script, a psql session, a future pool.
 *
 * WHY ONE HELPER. There were two identical ones (`utcInstantSql` in signals,
 * `naiveUtc` in polls) plus a third mechanism (`SET LOCAL TIME ZONE 'UTC'`
 * inside the aggregate rebuild's transaction). Three authorities for one
 * fact is how the polls feed ended up unpageable while signals was already
 * fixed: the lesson had been learned in one module and could not travel.
 */
export function utcInstant(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant} AT TIME ZONE 'UTC')`;
}
