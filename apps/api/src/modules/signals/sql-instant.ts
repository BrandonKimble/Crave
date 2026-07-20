import { Prisma } from '@prisma/client';

/**
 * THE naive-UTC instant coercion for signals-ledger reads (wave-5, live-
 * proven). signals.occurred_at is a NAIVE-UTC timestamp (aggregate red-team
 * 1a); Prisma binds a JS Date as TIMESTAMPTZ, and a naive-vs-timestamptz
 * comparison coerces through the SESSION time zone (America/Chicago on dev)
 * — silently shifting every window boundary by the UTC offset (the last ~6h
 * of signals vanished from "now"-anchored reads; yesterday's evening
 * double-counted into "today" fresh lanes). The aggregate rebuild fixes this
 * with SET LOCAL TIME ZONE 'UTC' inside its transaction; plain reads run
 * outside transactions, so every bound instant compared against occurred_at
 * MUST pass through this helper: timestamptz AT TIME ZONE 'UTC' = the naive
 * UTC wall-clock, making every comparison naive-vs-naive in any session TZ.
 */
export function utcInstantSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant} AT TIME ZONE 'UTC')`;
}
