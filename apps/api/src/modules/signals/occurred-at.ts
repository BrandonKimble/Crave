import { Prisma } from '@prisma/client';

/**
 * HOW TO NAME AN INSTANT WHEN COMPARING AGAINST `signals.occurred_at`.
 *
 * WHAT THIS REPLACED, AND WHY IT DID NOT SIMPLY GET DELETED (2026-08-03).
 *
 * `sql-instant.ts` existed because `occurred_at` was the one column still
 * `timestamp WITHOUT time zone` — the RANGE partition key, which Postgres
 * refuses to alter — so a bound JS Date (which Prisma sends as timestamptz)
 * had to be coerced back down with `AT TIME ZONE 'UTC'`. The table has since
 * been rebuilt on a timestamptz key, so that coercion is gone: a bound Date
 * now compares correctly under any session timezone, with no helper at all.
 *
 * The conversion did not remove the hazard, though. It MOVED it. Against a
 * naive column, `occurred_at >= '2026-07-15'::date` was timezone-free —
 * Postgres promoted the date to a naive timestamp and no zone entered the
 * comparison. Against a timestamptz column, that same literal is resolved in
 * the SESSION TimeZone. Measured on the real corpus immediately after the
 * rebuild, one day-slice of the aggregate returned:
 *
 *     UTC 9 rows · America/Chicago 0 rows · Asia/Tokyo 12 rows
 *
 * So the rule flipped: binding an instant is now the safe act and writing a
 * DAY is the dangerous one. This module owns the dangerous one.
 *
 * There is deliberately no `instantAtLeast(date)` helper. Passing a Date
 * directly is correct now, and a wrapper that only forwards its argument
 * teaches the next reader that something subtle is happening where nothing is.
 */

/**
 * The instant a UTC calendar day begins, as an explicit offset literal.
 *
 * `dayKey` is a `YYYY-MM-DD` string — the same grain `signal_demand_daily.day`
 * is keyed by, which is a real `date` column and therefore genuinely
 * zone-free. This turns that day into the unambiguous instant it denotes.
 */
export function utcDayStart(dayKey: string): Prisma.Sql {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error(
      `Not a YYYY-MM-DD day key: ${JSON.stringify(dayKey)} — a day boundary ` +
        `against a timestamptz column must be an explicit UTC instant.`,
    );
  }
  return Prisma.sql`${`${dayKey} 00:00:00+00`}::timestamptz`;
}
